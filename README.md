# Podcast Randomizer

A tiny iPhone-friendly web app that picks a random Apple Podcasts episode from a selected set of shows.

The app is static and tries to load the full podcast RSS archives first. For each selected RSS episode, it attempts to resolve a matching Apple Podcasts episode URL so iOS can hand off playback to the Podcasts app where sleep timer and native controls are available. If Apple search cannot resolve a specific backlog episode, the button falls back to the publisher episode page.

## GitHub Pages

This project is designed to be served as a static personal GitHub Pages site from the `podcast-randomizer` repo.

No build step is required. The page can be hosted directly from:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `.nojekyll`

## Use locally

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Current defaults

- Stuff You Should Know
- 99% Invisible
- Ologies with Alie Ward
- You're Wrong About

The app currently loads full RSS archives directly in the browser for the default shows. It keeps Apple's recent-episode lookup as a fallback if a feed fails.

## Local audio

The quick-play audio buttons store imported MP3 files privately in the browser with IndexedDB. Audio files are not uploaded or committed to the repo. If browser website data is cleared or the app is opened on another device/browser, the files need to be imported again.

For more reliable iOS lock-screen playback, each quick-play button can also use a private hosted HTTPS URL. Add those URLs in Settings under Private audio. The URLs are stored only in that browser with localStorage and are not committed to the repo. When a private URL is saved for a track, its quick-play button opens that URL instead of playing the browser-imported MP3. Use Clear imported files to remove browser-stored MP3 copies while keeping private URLs.
