# Architecture

## Runtime model

SCRAP & GUN is a client-side Canvas 2D game. There is no server, account system, telemetry service, or build-time dependency.

- `index.html` — document shell, canvas, manifest and stylesheet links.
- `styles.css` — viewport layout and CRT overlays.
- `game.js` — readable source of truth for simulation, input, rendering, audio, settings and persistence.
- `game.min.js` — generated production script loaded by the page.
- `sw.js` — optional service worker for same-origin application-shell caching on HTTPS or localhost.
- `manifest.webmanifest` and `icon.svg` — install metadata and scalable app icon.

## Game loop

The game uses a fixed 1/60-second simulation step with bounded catch-up. Rendering remains frame-based; it does not currently interpolate all moving entities between simulation steps. Canvas rendering uses an offscreen buffer and pixel-art-oriented scaling. Enemy pathfinding uses bounded A* work with a flow-field fallback; a spatial grid supports local enemy separation.

## State and persistence

Settings, records, achievements, tech progression, codex unlocks and resumable run checkpoints are stored in browser `localStorage`. Storage access is guarded so denied or malformed storage does not prevent startup. Checkpoints are versioned and validated before restoration. No data is sent to a remote service.

## Randomness

Daily mode seeds gameplay-affecting randomness from the selected date seed. Cosmetic particles and sound variation remain intentionally unseeded. Equivalent seeds do not guarantee equivalent outcomes if the player makes different gameplay choices.

## Accessibility and inputs

The game includes keyboard remapping, visual palettes, reduced-motion options, touch controls and standard browser gamepad support. Browser/device support varies; verify these paths on target devices.

## Build and minification

Run `node tools/minify.js` from the package root to regenerate `game.min.js` from `game.js`. This project-local minifier removes comments and redundant horizontal whitespace while preserving literals and source newlines; it is conservative rather than an optimizing compiler. Keep source edits in `game.js`, regenerate the production file, then run all tests against both files.
