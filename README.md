# Dub Night

A browser-first prototype for a voice-based party game where players replace a scene's dialogue with their own recordings.

## Current prototype

- Upload a local video clip
- Write replacement lines and choose timestamps
- Record each line with the browser microphone
- Play the muted video with recorded takes triggered in sync
- Responsive UI suitable for GitHub Pages

No video or recording is uploaded anywhere. Refreshing the page clears the session.

## Run locally

Serve the folder with any static server. For example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. Microphone access requires localhost or HTTPS.

## Roadmap

1. Shared room codes and player names
2. Role assignment and recording-ready state
3. Synced group premiere and voting
4. Licensed/public-domain scene packs
5. Exportable final dubs
