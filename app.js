const PODCASTS = {
  "278981407": {
    id: "278981407",
    name: "Stuff You Should Know",
    showUrl: "https://podcasts.apple.com/us/podcast/stuff-you-should-know/id278981407",
    feedUrl: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/a91018a4-ea4f-4130-bf55-ae270180c327/44710ecc-10bb-48d1-93c7-ae270180c33e/podcast.rss",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/aa/82/91/aa82912f-23ee-6f6a-583c-a4e993164d0e/mza_12111158076643383507.jpg/600x600bb.jpg",
  },
  "394775318": {
    id: "394775318",
    name: "99% Invisible",
    showUrl: "https://podcasts.apple.com/us/podcast/99-invisible/id394775318",
    feedUrl: "https://feeds.simplecast.com/BqbsxVfO",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/79/d0/35/79d035ea-9043-b43e-7380-33cd47bd968b/mza_2606971010425550919.jpg/600x600bb.jpg",
  },
  "1278815517": {
    id: "1278815517",
    name: "Ologies with Alie Ward",
    showUrl: "https://podcasts.apple.com/us/podcast/ologies-with-alie-ward/id1278815517",
    feedUrl: "https://feeds.simplecast.com/FO6kxYGj",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/44/4e/42/444e42f6-1ce8-1e7b-2d50-4ed506c27004/mza_18370866018545460916.jpg/600x600bb.jpg",
  },
  "1380008439": {
    id: "1380008439",
    name: "You're Wrong About",
    showUrl: "https://podcasts.apple.com/us/podcast/youre-wrong-about/id1380008439",
    feedUrl: "https://feeds.megaphone.fm/AIL6181579533",
    artwork: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/f1/d5/24/f1d52411-22be-29c9-f5be-492ac9c2c67f/mza_9404779933680119634.jpeg/600x600bb.jpg",
  },
};

const MINIMUM_EPISODE_DURATION_MS = 30 * 60 * 1000;
const AUDIO_DB_NAME = "pod-roll-audio";
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE_NAME = "tracks";
const LOCAL_AUDIO_ARTWORK = "assets/media/local-audio-artwork-1024.png";

const LOCAL_AUDIO_TRACKS = {
  anxietyUndo: {
    title: "Anxiety Undo",
    artist: "Pod Roll",
  },
  morningReset: {
    title: "The Morning Reset",
    artist: "Pod Roll",
  },
};

const state = {
  episodes: [],
  current: null,
  source: "Apple Podcasts search fallback",
  localAudio: new Map(),
  localAudioUrls: new Map(),
  activeLocalAudioKey: "",
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
const settingsToggle = document.querySelector("#settings-toggle");
const settingsPanel = document.querySelector("#settings-panel");
const localAudioPlayer = document.querySelector("#local-audio-player");
const localAudioStatus = document.querySelector("#local-audio-status");

const podcastInputs = [...document.querySelectorAll("input[name='podcast']")];
const ageInputs = [...document.querySelectorAll("input[name='age']")];
const audioButtons = [...document.querySelectorAll(".audio-button")];
const fileInputs = [...document.querySelectorAll("input[data-file-key]")];
const appleUrlCache = new Map();

init();

async function init() {
  wireOrientationFallback();
  wireControls();
  await loadStoredLocalAudio();

  try {
    state.episodes = await loadEpisodes();
    chooseEpisode();
  } catch (error) {
    console.error(error);
    showStatus("Could not load episodes. Check your connection and try again.");
  }
}

function wireOrientationFallback() {
  syncOrientationFallback();
  window.addEventListener("orientationchange", syncOrientationFallback);
  window.addEventListener("resize", syncOrientationFallback);
}

function syncOrientationFallback() {
  const angle = typeof window.orientation === "number"
    ? window.orientation
    : screen.orientation?.angle || 0;
  const rotation = angle === -90 || angle === 270 ? "90deg" : "-90deg";

  document.documentElement.style.setProperty("--landscape-portrait-rotation", rotation);
}

function wireControls() {
  rerollButton.addEventListener("click", chooseEpisode);
  settingsToggle.addEventListener("click", toggleSettings);

  for (const input of [...podcastInputs, ...ageInputs]) {
    input.addEventListener("change", chooseEpisode);
  }

  for (const button of audioButtons) {
    button.addEventListener("click", () => handleLocalAudioButton(button.dataset.audioKey));
  }

  for (const input of fileInputs) {
    input.addEventListener("change", () => importLocalAudio(input));
  }

  localAudioPlayer.addEventListener("play", () => {
    updateAudioButtons();
    updateMediaSessionPlaybackState("playing");
  });
  localAudioPlayer.addEventListener("pause", () => {
    updateAudioButtons();
    updateMediaSessionPlaybackState("paused");
  });
  localAudioPlayer.addEventListener("ended", () => stopLocalAudio());
  localAudioPlayer.addEventListener("loadedmetadata", updateMediaSessionPosition);
  localAudioPlayer.addEventListener("timeupdate", updateMediaSessionPosition);
  setupMediaSession();
}

function handleLocalAudioButton(audioKey) {
  if (state.activeLocalAudioKey === audioKey && !localAudioPlayer.paused) {
    stopLocalAudio();
    return;
  }

  if (state.localAudio.has(audioKey)) {
    playLocalAudio(audioKey);
    return;
  }

  promptLocalAudioImport(audioKey);
}

function promptLocalAudioImport(audioKey) {
  const track = LOCAL_AUDIO_TRACKS[audioKey];
  const input = fileInputs.find((fileInput) => fileInput.dataset.fileKey === audioKey);

  if (!track || !input) {
    return;
  }

  showLocalAudioStatus(`Choose the MP3 for ${track.title}.`);
  input.click();
}

async function playLocalAudio(audioKey, options = {}) {
  const track = LOCAL_AUDIO_TRACKS[audioKey];
  const storedTrack = state.localAudio.get(audioKey);

  if (!track || !storedTrack?.blob) {
    promptLocalAudioImport(audioKey);
    return;
  }

  const src = options.refreshSource
    ? refreshLocalAudioSource(audioKey, storedTrack.blob)
    : getLocalAudioUrl(audioKey, storedTrack.blob);

  try {
    state.activeLocalAudioKey = audioKey;
    updateMediaSessionMetadata(audioKey);
    if (localAudioPlayer.src !== src) {
      localAudioPlayer.src = src;
    }
    await seekLocalAudioWhenReady(options.startTime);
    await localAudioPlayer.play();
    updateAudioButtons();
    updateMediaSessionPosition();
    showLocalAudioStatus(`Playing ${track.title}.`);
  } catch (error) {
    console.error(error);
    showLocalAudioStatus(`Could not play ${track.title}.`);
  }
}

function refreshLocalAudioSource(audioKey, blob) {
  const oldUrl = state.localAudioUrls.get(audioKey);

  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
  }

  const freshUrl = URL.createObjectURL(blob);
  state.localAudioUrls.set(audioKey, freshUrl);
  localAudioPlayer.removeAttribute("src");
  localAudioPlayer.load();
  localAudioPlayer.src = freshUrl;
  localAudioPlayer.load();

  return freshUrl;
}

async function resumeLocalAudioFromMediaSession() {
  const audioKey = state.activeLocalAudioKey;

  if (!audioKey) {
    return;
  }

  const startTime = Number.isFinite(localAudioPlayer.currentTime)
    ? localAudioPlayer.currentTime
    : 0;

  await playLocalAudio(audioKey, {
    refreshSource: true,
    startTime,
  });
}

function seekLocalAudioWhenReady(time) {
  if (!Number.isFinite(time) || time <= 0) {
    return Promise.resolve();
  }

  if (localAudioPlayer.readyState >= 1) {
    setLocalAudioCurrentTime(time);
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      if (localAudioPlayer.readyState >= 1) {
        setLocalAudioCurrentTime(time);
      }
      resolve();
    }, 1500);

    localAudioPlayer.addEventListener("loadedmetadata", () => {
      window.clearTimeout(timeout);
      setLocalAudioCurrentTime(time);
      resolve();
    }, { once: true });
  });
}

function setLocalAudioCurrentTime(time) {
  const duration = localAudioPlayer.duration;
  const maxTime = Number.isFinite(duration) ? duration : time;
  localAudioPlayer.currentTime = Math.min(Math.max(time, 0), maxTime);
}

function stopLocalAudio() {
  if (!localAudioPlayer.paused) {
    localAudioPlayer.pause();
  }

  localAudioPlayer.currentTime = 0;
  const track = LOCAL_AUDIO_TRACKS[state.activeLocalAudioKey];
  state.activeLocalAudioKey = "";
  updateAudioButtons();
  updateMediaSessionPlaybackState("none");

  if (track) {
    showLocalAudioStatus(`Stopped ${track.title}.`);
  }
}

async function importLocalAudio(input) {
  const audioKey = input.dataset.fileKey;
  const track = LOCAL_AUDIO_TRACKS[audioKey];
  const file = input.files?.[0];

  input.value = "";

  if (!track || !file) {
    return;
  }

  if (!isMp3File(file)) {
    showLocalAudioStatus(`${track.title} needs an MP3 file.`);
    return;
  }

  try {
    const record = {
      key: audioKey,
      blob: file,
      name: file.name,
      size: file.size,
      type: file.type || "audio/mpeg",
      importedAt: new Date().toISOString(),
    };

    await saveLocalAudioRecord(record);
    replaceLocalAudioRecord(audioKey, record);
    updateTrackStatus(audioKey, record);
    showLocalAudioStatus(`${track.title} imported.`);
    playLocalAudio(audioKey);
  } catch (error) {
    console.error(error);
    showLocalAudioStatus(`Could not import ${track.title}.`);
  }
}

async function loadStoredLocalAudio() {
  try {
    const records = await getAllLocalAudioRecords();

    for (const record of records) {
      if (LOCAL_AUDIO_TRACKS[record.key]) {
        replaceLocalAudioRecord(record.key, record);
        updateTrackStatus(record.key, record);
      }
    }
  } catch (error) {
    console.warn("Could not load stored local audio.", error);
    showLocalAudioStatus("Stored audio could not be loaded.");
  }
}

function replaceLocalAudioRecord(audioKey, record) {
  const oldUrl = state.localAudioUrls.get(audioKey);

  if (oldUrl) {
    URL.revokeObjectURL(oldUrl);
    state.localAudioUrls.delete(audioKey);
  }

  state.localAudio.set(audioKey, record);
}

function getLocalAudioUrl(audioKey, blob) {
  if (!state.localAudioUrls.has(audioKey)) {
    state.localAudioUrls.set(audioKey, URL.createObjectURL(blob));
  }

  return state.localAudioUrls.get(audioKey);
}

function updateTrackStatus(audioKey, record) {
  const status = document.querySelector(`[data-track-status="${audioKey}"]`);

  if (!status) {
    return;
  }

  status.textContent = record
    ? `Imported ${formatFileSize(record.size)}`
    : "Not imported";
}

function updateAudioButtons() {
  for (const button of audioButtons) {
    const isActive = button.dataset.audioKey === state.activeLocalAudioKey && !localAudioPlayer.paused;
    const title = LOCAL_AUDIO_TRACKS[button.dataset.audioKey]?.title || button.textContent;

    button.textContent = isActive ? `Stop ${title}` : title;
    button.classList.toggle("is-playing", isActive);
  }
}

function setupMediaSession() {
  if (!("mediaSession" in navigator)) {
    return;
  }

  const actions = {
    play: resumeLocalAudioFromMediaSession,
    stop: stopLocalAudio,
    seekbackward: (details) => seekLocalAudioBy(-(details.seekOffset || 15)),
    seekforward: (details) => seekLocalAudioBy(details.seekOffset || 15),
    seekto: (details) => seekLocalAudioTo(details.seekTime),
  };

  for (const [action, handler] of Object.entries(actions)) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch (error) {
      console.warn(`Media Session action not supported: ${action}`, error);
    }
  }
}

function updateMediaSessionMetadata(audioKey) {
  if (!("mediaSession" in navigator) || !("MediaMetadata" in window)) {
    return;
  }

  const track = LOCAL_AUDIO_TRACKS[audioKey];

  if (!track) {
    return;
  }

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title,
    artist: track.artist,
    album: "Local audio",
    artwork: [
      {
        src: new URL(LOCAL_AUDIO_ARTWORK, window.location.href).href,
        sizes: "1024x1024",
        type: "image/png",
      },
    ],
  });
}

function updateMediaSessionPlaybackState(playbackState) {
  if (!("mediaSession" in navigator)) {
    return;
  }

  navigator.mediaSession.playbackState = playbackState;
}

function updateMediaSessionPosition() {
  if (!("mediaSession" in navigator) || typeof navigator.mediaSession.setPositionState !== "function") {
    return;
  }

  const duration = localAudioPlayer.duration;

  if (!Number.isFinite(duration) || duration <= 0) {
    return;
  }

  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate: localAudioPlayer.playbackRate,
      position: localAudioPlayer.currentTime,
    });
  } catch (error) {
    console.warn("Could not update Media Session position.", error);
  }
}

function seekLocalAudioBy(offsetSeconds) {
  seekLocalAudioTo(localAudioPlayer.currentTime + offsetSeconds);
}

function seekLocalAudioTo(time) {
  if (!Number.isFinite(time) || !Number.isFinite(localAudioPlayer.duration)) {
    return;
  }

  localAudioPlayer.currentTime = Math.min(Math.max(time, 0), localAudioPlayer.duration);
  updateMediaSessionPosition();
}

function isMp3File(file) {
  return file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3");
}

function toggleSettings() {
  const isOpen = settingsToggle.getAttribute("aria-expanded") === "true";
  settingsToggle.setAttribute("aria-expanded", String(!isOpen));
  settingsPanel.hidden = isOpen;
}

async function loadEpisodes() {
  const allEpisodes = await Promise.all(
    Object.values(PODCASTS).map(async (podcast) => {
      try {
        const rssEpisodes = await loadRssEpisodes(podcast);

        if (rssEpisodes.length) {
          return rssEpisodes;
        }
      } catch (error) {
        console.warn(`RSS failed for ${podcast.name}; using Apple search fallback.`, error);
      }

      return loadAppleEpisodes(podcast);
    }),
  );

  const episodes = allEpisodes
    .flat()
    .filter((episode) => episode.title && episode.url && Number.isFinite(episode.releaseDate.getTime()))
    .sort((a, b) => b.releaseDate - a.releaseDate);

  state.source = episodes.some((episode) => episode.source === "RSS")
    ? "full RSS archive"
    : "Apple Podcasts search fallback";

  return episodes;
}

async function loadAppleEpisodes(podcast) {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", podcast.name);
  url.searchParams.set("media", "podcast");
  url.searchParams.set("entity", "podcastEpisode");
  url.searchParams.set("limit", "200");
  url.searchParams.set("country", "US");

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Apple Podcasts search failed: ${response.status}`);
  }

  const data = await response.json();

  return data.results
    .filter((item) => String(item.collectionId) === podcast.id)
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
    return selectedPodcasts.has(episode.podcastId)
      && episode.releaseDate <= newestAllowedDate
      && episode.durationMs >= MINIMUM_EPISODE_DURATION_MS;
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
  openLinkEl.textContent = episode.source === "RSS" ? "Finding link..." : "Play";

  artworkEl.src = episode.artwork;
  artworkEl.alt = `${episode.podcastName} artwork`;
  updateAppleLink(episode);
}

async function updateAppleLink(episode) {
  if (episode.source !== "RSS") {
    openLinkEl.textContent = "Play";
    return;
  }

  const appleUrl = await resolveAppleEpisodeUrl(episode);

  if (state.current?.title !== episode.title || state.current?.podcastId !== episode.podcastId) {
    return;
  }

  openLinkEl.href = appleUrl || episode.url;
  openLinkEl.textContent = appleUrl ? "Play" : "Episode page";
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

function showLocalAudioStatus(message) {
  localAudioStatus.textContent = message;
}

function openAudioDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);

    request.addEventListener("upgradeneeded", () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME, { keyPath: "key" });
      }
    });

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function saveLocalAudioRecord(record) {
  const db = await openAudioDb();

  try {
    await runAudioStoreRequest(db, "readwrite", (store) => store.put(record));
  } finally {
    db.close();
  }
}

async function getAllLocalAudioRecords() {
  const db = await openAudioDb();

  try {
    return await runAudioStoreRequest(db, "readonly", (store) => store.getAll());
  } finally {
    db.close();
  }
}

function runAudioStoreRequest(db, mode, callback) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, mode);
    const request = callback(transaction.objectStore(AUDIO_STORE_NAME));

    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
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

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) {
    return "";
  }

  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(megabytes >= 10 ? 0 : 1)} MB`;
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
