const PODCASTS = {
  "278981407": {
    id: "278981407",
    name: "Stuff You Should Know",
    showUrl: "https://podcasts.apple.com/us/podcast/stuff-you-should-know/id278981407",
    feedUrl: "",
  },
  "394775318": {
    id: "394775318",
    name: "99% Invisible",
    showUrl: "https://podcasts.apple.com/us/podcast/99-invisible/id394775318",
    feedUrl: "",
  },
};

const state = {
  episodes: [],
  current: null,
  source: "Apple Podcasts recent episodes",
};

const statusEl = document.querySelector("#status");
const episodeEl = document.querySelector("#episode");
const collectionEl = document.querySelector("#collection");
const titleEl = document.querySelector("#title");
const dateEl = document.querySelector("#date");
const durationEl = document.querySelector("#duration");
const summaryEl = document.querySelector("#summary");
const artworkEl = document.querySelector("#artwork");
const openLinkEl = document.querySelector("#open-link");
const rerollButton = document.querySelector("#reroll");

const podcastInputs = [...document.querySelectorAll("input[name='podcast']")];
const ageInputs = [...document.querySelectorAll("input[name='age']")];
const appleUrlCache = new Map();

init();

async function init() {
  wireControls();

  try {
    state.episodes = await loadEpisodes();
    chooseEpisode();
  } catch (error) {
    console.error(error);
    showStatus("Could not load episodes. Check your connection and try again.");
  }
}

function wireControls() {
  rerollButton.addEventListener("click", chooseEpisode);

  for (const input of [...podcastInputs, ...ageInputs]) {
    input.addEventListener("change", chooseEpisode);
  }
}

async function loadEpisodes() {
  const allEpisodes = await Promise.all(
    Object.values(PODCASTS).map(async (podcast) => {
      const metadata = await loadPodcastMetadata(podcast);
      const enrichedPodcast = { ...podcast, ...metadata };

      if (enrichedPodcast.feedUrl) {
        try {
          const rssEpisodes = await loadRssEpisodes(enrichedPodcast);

          if (rssEpisodes.length) {
            return rssEpisodes;
          }
        } catch (error) {
          console.warn(`RSS failed for ${podcast.name}; using Apple lookup.`, error);
        }
      }

      return loadAppleEpisodes(enrichedPodcast);
    }),
  );

  const episodes = allEpisodes
    .flat()
    .filter((episode) => episode.title && episode.url && Number.isFinite(episode.releaseDate.getTime()))
    .sort((a, b) => b.releaseDate - a.releaseDate);

  state.source = episodes.some((episode) => episode.source === "RSS")
    ? "full RSS archive"
    : "Apple Podcasts recent episodes";

  return episodes;
}

async function loadPodcastMetadata(podcast) {
  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", podcast.id);
  url.searchParams.set("country", "US");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Apple Podcasts lookup failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data.results?.[0] || {};

  return {
    feedUrl: result.feedUrl || podcast.feedUrl,
    artwork: result.artworkUrl600 || result.artworkUrl100 || "",
    name: result.collectionName || podcast.name,
  };
}

async function loadAppleEpisodes(podcast) {
  const url = new URL("https://itunes.apple.com/lookup");
  url.searchParams.set("id", podcast.id);
  url.searchParams.set("entity", "podcastEpisode");
  url.searchParams.set("limit", "200");
  url.searchParams.set("country", "US");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Apple Podcasts request failed: ${response.status}`);
  }

  const data = await response.json();

  return data.results
    .filter((item) => item.wrapperType === "podcastEpisode")
    .map((item) => normalizeAppleEpisode(item, podcast));
}

async function loadRssEpisodes(podcast) {
  const response = await fetch(podcast.feedUrl);

  if (!response.ok) {
    throw new Error(`RSS request failed: ${response.status}`);
  }

  const xml = await response.text();
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const parseError = doc.querySelector("parsererror");

  if (parseError) {
    throw new Error("RSS response was not valid XML");
  }

  return [...doc.querySelectorAll("item")].map((item) => normalizeRssEpisode(item, podcast));
}

function normalizeAppleEpisode(item, podcast) {
  return {
    podcastId: podcast.id,
    podcastName: item.collectionName || podcast.name,
    title: item.trackName,
    url: item.trackViewUrl || podcast.showUrl,
    releaseDate: new Date(item.releaseDate),
    durationMs: item.trackTimeMillis || 0,
    summary: stripHtml(item.description || item.shortDescription || ""),
    artwork: item.artworkUrl600 || item.artworkUrl100 || podcast.artwork || "",
    source: "Apple",
  };
}

function normalizeRssEpisode(item, podcast) {
  const guid = textFrom(item, "guid");
  const link = textFrom(item, "link");
  const enclosureUrl = item.querySelector("enclosure")?.getAttribute("url") || "";
  const title = textFrom(item, "title");
  const releaseDate = new Date(textFrom(item, "pubDate"));
  const appleUrl = buildAppleEpisodeUrl(podcast, guid);

  return {
    podcastId: podcast.id,
    podcastName: podcast.name,
    title,
    url: appleUrl || link || enclosureUrl || podcast.showUrl,
    releaseDate,
    durationMs: durationToMs(textFrom(item, "itunes\\:duration, duration")),
    summary: stripHtml(textFrom(item, "description, itunes\\:summary, summary")),
    artwork: item.querySelector("itunes\\:image, image")?.getAttribute("href") || podcast.artwork || "",
    source: "RSS",
  };
}

function chooseEpisode() {
  if (!state.episodes.length) {
    showStatus("Loading episodes...");
    return;
  }

  const pool = getEpisodePool();

  if (!pool.length) {
    showStatus("No episodes match those filters.");
    episodeEl.hidden = true;
    return;
  }

  let next = pool[Math.floor(Math.random() * pool.length)];

  if (pool.length > 1 && state.current) {
    while (next.url === state.current.url) {
      next = pool[Math.floor(Math.random() * pool.length)];
    }
  }

  state.current = next;
  renderEpisode(next, pool.length);
}

function getEpisodePool() {
  const selectedPodcasts = new Set(
    podcastInputs.filter((input) => input.checked).map((input) => input.value),
  );
  const minimumAgeDays = Number(ageInputs.find((input) => input.checked)?.value || 0);
  const newestAllowedDate = new Date();
  newestAllowedDate.setDate(newestAllowedDate.getDate() - minimumAgeDays);

  return state.episodes.filter((episode) => {
    return selectedPodcasts.has(episode.podcastId) && episode.releaseDate <= newestAllowedDate;
  });
}

function renderEpisode(episode, poolSize) {
  statusEl.textContent = `${poolSize} episodes in this pool from ${state.source}`;
  episodeEl.hidden = false;

  collectionEl.textContent = episode.podcastName;
  titleEl.textContent = episode.title;
  dateEl.textContent = formatDate(episode.releaseDate);
  durationEl.textContent = formatDuration(episode.durationMs);
  summaryEl.textContent = episode.summary || "No description available.";
  openLinkEl.href = episode.url;
  openLinkEl.textContent = episode.source === "RSS" ? "Finding Podcasts link..." : "Open in Podcasts";

  artworkEl.src = episode.artwork;
  artworkEl.alt = `${episode.podcastName} artwork`;
  updateAppleLink(episode);
}

async function updateAppleLink(episode) {
  if (episode.source !== "RSS") {
    openLinkEl.textContent = "Open in Podcasts";
    return;
  }

  const appleUrl = await resolveAppleEpisodeUrl(episode);

  if (state.current?.title !== episode.title || state.current?.podcastId !== episode.podcastId) {
    return;
  }

  openLinkEl.href = appleUrl || episode.url;
  openLinkEl.textContent = appleUrl ? "Open in Podcasts" : "Open episode page";
}

async function resolveAppleEpisodeUrl(episode) {
  const cacheKey = `${episode.podcastId}:${episode.title}`;

  if (appleUrlCache.has(cacheKey)) {
    return appleUrlCache.get(cacheKey);
  }

  const terms = [
    `${episode.title} ${episode.podcastName}`,
    episode.title,
    normalizeTitle(episode.title),
  ];

  for (const term of terms) {
    try {
      const searchUrl = new URL("https://itunes.apple.com/search");
      searchUrl.searchParams.set("term", term);
      searchUrl.searchParams.set("media", "podcast");
      searchUrl.searchParams.set("entity", "podcastEpisode");
      searchUrl.searchParams.set("limit", "50");
      searchUrl.searchParams.set("country", "US");

      const response = await fetch(searchUrl);

      if (!response.ok) {
        throw new Error(`Apple Podcasts search failed: ${response.status}`);
      }

      const data = await response.json();
      const match = findAppleEpisodeMatch(data.results || [], episode);

      if (match?.trackViewUrl) {
        appleUrlCache.set(cacheKey, match.trackViewUrl);
        return match.trackViewUrl;
      }
    } catch (error) {
      console.warn(`Could not search Apple Podcasts for ${episode.title}.`, error);
    }
  }

  appleUrlCache.set(cacheKey, "");
  return "";
}

function findAppleEpisodeMatch(results, episode) {
  const episodeTitle = normalizeTitle(episode.title);
  const showMatches = results.filter((item) => String(item.collectionId) === episode.podcastId);

  return showMatches.find((item) => normalizeTitle(item.trackName) === episodeTitle)
    || showMatches.find((item) => {
      const candidateTitle = normalizeTitle(item.trackName);
      return candidateTitle.includes(episodeTitle) || episodeTitle.includes(candidateTitle);
    })
    || showMatches.find((item) => sameReleaseDay(item.releaseDate, episode.releaseDate));
}

function sameReleaseDay(left, right) {
  const leftDate = new Date(left);

  if (!Number.isFinite(leftDate.getTime()) || !Number.isFinite(right.getTime())) {
    return false;
  }

  return leftDate.toDateString() === right.toDateString();
}

function showStatus(message) {
  statusEl.textContent = message;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDuration(durationMs) {
  if (!durationMs) {
    return "Unknown";
  }

  const totalMinutes = Math.round(durationMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (!hours) {
    return `${minutes} min`;
  }

  return `${hours} hr ${minutes} min`;
}

function stripHtml(value) {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return doc.body.textContent?.replace(/\s+/g, " ").trim() || "";
}

function textFrom(parent, selector) {
  return parent.querySelector(selector)?.textContent?.trim() || "";
}

function durationToMs(value) {
  if (!value) {
    return 0;
  }

  if (/^\d+$/.test(value)) {
    return Number(value) * 1000;
  }

  const parts = value.split(":").map(Number);

  if (parts.some(Number.isNaN)) {
    return 0;
  }

  const seconds = parts.reduce((total, part) => total * 60 + part, 0);
  return seconds * 1000;
}

function normalizeTitle(value) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildAppleEpisodeUrl(podcast, guid) {
  const match = guid.match(/(?:episodeId|id|i)[=/](\d{6,})/);

  if (!match) {
    return "";
  }

  return `${podcast.showUrl}?i=${match[1]}`;
}
