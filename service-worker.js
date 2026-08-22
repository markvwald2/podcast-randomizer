const LOCAL_AUDIO_CACHE_NAME = "pod-roll-local-audio-v1";
const LOCAL_AUDIO_ROUTE_MARKER = "/local-audio/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (!url.pathname.includes(LOCAL_AUDIO_ROUTE_MARKER)) {
    return;
  }

  event.respondWith(serveLocalAudio(event.request));
});

async function serveLocalAudio(request) {
  const cache = await caches.open(LOCAL_AUDIO_CACHE_NAME);
  const response = await cache.match(request.url, { ignoreSearch: true });

  if (!response) {
    return new Response("Local audio is not imported.", {
      status: 404,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  const rangeHeader = request.headers.get("Range");

  if (!rangeHeader) {
    return response;
  }

  return createRangeResponse(response, rangeHeader);
}

async function createRangeResponse(response, rangeHeader) {
  const blob = await response.blob();
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);

  if (!match) {
    return response;
  }

  const size = blob.size;
  const start = match[1] ? Number(match[1]) : 0;
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  const end = Math.min(requestedEnd, size - 1);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new Response(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${size}`,
      },
    });
  }

  const sliced = blob.slice(start, end + 1, response.headers.get("Content-Type") || "audio/mpeg");

  return new Response(sliced, {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(sliced.size),
      "Content-Type": response.headers.get("Content-Type") || "audio/mpeg",
      "Cache-Control": "private, max-age=31536000",
    },
  });
}
