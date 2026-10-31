# SCRAP & GUN — Release Audit Notes

## Responsive HUD and control pass

Audited the HUD and controls at seven real viewport sizes (1920×1080, 1440×900, 1366×768, 1024×768, 844×390, 667×375 and 390×844 portrait), driving the game with keyboard, mouse and synthesised multi-touch, and fixed the following:

- **Large screens wasted half the display.** Scaling was integer-only, so a 1080p monitor showed the game at 960×720 (50% of the width). Scaling now fills the viewport at 4:3 — 1440×1080 on a 1080p screen, 1024×768 on a 1366×768 laptop.
- **The HUD was unreadable on phones.** The whole 960×720 layout was scaled to ~0.52, so 12px HUD text rendered at ~6 CSS px. HUD sizes are now expressed in CSS pixels and multiplied by 1/scale, so they keep a readable physical size; a compact layout and a taller (64px) build bar switch in below ~0.9 scale.
- **The build bar was unusable on phones.** Six 98px slots with full names became illegible. On small screens it is now a two-row, three-column grid with larger text, plus a dedicated `NEXT` / combat-status column.
- **HUD collisions.** The scrap counter and weapon label crowded each other; the score line overlapped the core bar; the build-phase status overlapped the widened slots. All text is now laid out from measured widths with a max-width guard, and the status text shortens when space is tight.
- **Touch controls were too small and mis-aligned.** Buttons were 25px-radius circles with rectangular hit zones that did not match them, and the desktop ability box (DASH/BOMB/weapon) overlapped the movement stick. The ability box is now hidden on touch, buttons are larger (50px fire, 36px dash/bomb, 62px stick), and hit-testing uses the same circles that are drawn.
- **Two mechanics were unreachable on touch.** Weapon cycling and building upgrades had no touch input at all. Tapping the weapon chip cycles weapons, and tapping a placed building (with nothing selected) upgrades it.
- The pause menu now scales with the HUD and is centred in the play area.

### Verification
- `node --check game.js` / `game.min.js` / `sw.js` — passed.
- `node tests/sw.test.js` — passed (5 checks).
- `node tests/smoke.test.js` — passed (80 static feature checks).
- `node tests/touch.test.js` — passed (11 checks), now including weapon cycling and tap-to-upgrade.
- `node tests/runtime-smoke.test.js game.js` and `… game.min.js` — passed (1,400 simulated frames plus save/load and time-loop assertions).
- Live headless Chromium at 1920×1080, 1366×768, 1024×768, 844×390, 667×375 and 390×844 — HUD legible at every size, build → place → upgrade → next wave → pause verified with no console or page errors.

### Remaining limits
The title, settings, tech-tree and codex screens are still drawn at their original fixed sizes; they remain legible but do not scale like the in-game HUD. Touch input is verified with emulated events in Chromium, not on physical iOS/Android hardware.

## Mobile playability and rendering pass

Audited the game in a real headless Chromium at mobile portrait, mobile landscape and desktop viewports, driving it with keyboard and synthesised multi-touch input. Fixed the following real play defects:

- **Building was impossible on touch devices.** The bottom build bar was never wired to touch input, and because the in-game touch handler called `preventDefault()` on every touch, the compatibility mouse events that would have selected a building were suppressed. The build bar is now tappable, a selected building is placed by tapping a tile, and the same handler covers the bomb/dash buttons.
- **No pause, and no way to skip the build phase, on touch.** Added an on-screen pause button and a `NEXT >` button.
- **Portrait rendered a tiny letterboxed strip** with no guidance. Added a portrait gate that shows a rotate prompt (with a "Continue in portrait" option) on touch devices, and pauses an in-progress run when it appears.
- **Touch aiming was anchored to the fire button** rather than the touch point, so touching anywhere on the right half snapped the aim to an extreme. Aim is now relative to where the finger lands, matching the movement stick.
- **Missing pixel-font glyphs.** The ampersand (`&`) — the game's own name, the HUD and the settings title — the scrap diamond, the rapid-fire and damage indicators, and the multiplication sign had no glyphs and rendered as `?`. Added glyphs and removed the `×` substitution.

### Verification
- `node --check game.js` / `game.min.js` / `sw.js` — passed.
- `node tests/sw.test.js` — passed (5 checks).
- `node tests/smoke.test.js` — passed (80 static feature checks).
- `node tests/runtime-smoke.test.js game.js` and `… game.min.js` — passed (1,400 simulated frames plus save/load and time-loop assertions).
- Deterministic headless touch harness — passed: slot selection, tap-to-place (with correct scrap spend and no false error), occupied-tile rejection, relative aiming and the pause button.
- Live headless Chromium at 390×844, 844×390 and 1440×900 — build → place → advance wave → pause verified with no console or page errors.

### Remaining limits
Still an enhanced development build. Touch aiming and placement are now functional but have not been tested on physical phones across iOS Safari and Android Chrome; the portrait gate relies on `resize`/`orientationchange` events. Full device QA (PWA install, offline reopening, low-end performance, gamepad on hardware) remains outstanding.

## This pass

- Extended Daily-mode seeded randomness beyond wave composition and upgrade drafts.
- Daily-mode enemy spawn edges/positions, pickup drops and types, critical-hit rolls, weapon spread, boss target selection, and splitter direction now use the gameplay RNG.
- Cosmetic particles, screen shake, and audio variation remain on `Math.random()` so visual/audio noise does not consume the gameplay RNG sequence.
- Expanded static checks to cover the seeded gameplay paths.
- Kept guarded local-storage parsing and write handling from the previous audit.

## Verification run

- `node --check game.js` — passed.
- `node --check sw.js` — passed.
- `node tests/smoke.test.js` — passed after the new Daily-mode checks were added.
- `node tests/runtime-smoke.test.js` — passed; simulated 1,400 frames including co-op input.
- `unzip -t scrap_gun_enhanced.zip` — passed after packaging.

## Important limits

This remains an enhanced development build. The current checks are static and simulated-runtime tests; they do not replace real browser interaction. Daily runs should be repeatable for the same seed when the same gameplay inputs and decisions are made, but differences in player actions naturally change the RNG sequence. Full interactive checks for save/load, repeated rewinds, boss collisions, all maps/mutators, touch/gamepad controls, PWA install/offline reopening, and low-end hardware performance remain outstanding.


## Save/load and time-loop integrity pass

- Upgraded run checkpoints to schema version 2 and added shape/range validation before restoration. Malformed or incompatible checkpoints are rejected and cleared instead of being partially applied. Version 1 checkpoints remain loadable where their shape is valid.
- Persisted the wave-start time-loop snapshot, `timeLoopUsed`, `timeLoopDeclined`, and the daily seed alongside the current run. Continue can therefore retain the rewind eligibility/accounting state.
- Removed persistent boss-core restoration from wave snapshots. Rewinds restore run state, but persistent cores remain meta-progression; a paid rewind subtracts exactly one core after a successful restore.
- Added runtime regressions covering checkpoint save/load restoration, persistent-core preservation, free rewind usage, exactly-one-core paid rewind, and malformed checkpoint rejection/cleanup.

### Verification

- `node --check game.js` — passed.
- `node --check sw.js` — passed.
- `node tests/smoke.test.js` — passed (80 static feature checks).
- `node tests/runtime-smoke.test.js` — passed (1,400 simulated frames plus save/load and time-loop integrity assertions).
- ZIP integrity check — pending final packaging.

### Remaining limits

This audit uses a simulated DOM/canvas environment. Real browser QA is still required for full gameplay behavior, especially checkpoints across browser restarts, daily-run reproducibility, boss collisions, maps/mutators, PWA installation, touch/gamepad input, and low-end performance.


## Code audit, minified bundle and documentation pass

- Added `game.min.js` as the production script and kept `game.js` as readable source. Added a repeatable no-dependency conservative minifier at `tools/minify.js`; it removes comments and redundant horizontal whitespace while preserving literal contents and source newlines.
- Fixed title-screen status text colliding with the Run History / Continue buttons by moving the status and following labels into separate vertical rows.
- Hardened the service worker: it only intercepts same-origin GET requests and deletes only prior caches with the `scrap-gun-shell-` prefix, avoiding interference with unrelated apps hosted on the same origin.
- Removed the viewport settings that disabled browser zoom on touch devices.
- Added GitHub-oriented README badges, source-rendered screenshots, architecture, controls and testing documentation, plus the official PolyForm Noncommercial License 1.0.0 text with the project notice.
- Added service-worker scope checks. The production bundle is tested by the runtime smoke test as well as the readable source.

### Bundle size

The conservative minifier reduced `game.js` from 126,738 bytes to approximately 120,333 bytes (about 5.1%). This is whitespace/comment minification, not advanced dead-code elimination or aggressive syntax compression.

### Remaining release limits

Screenshots are rendered using a Canvas 2D-compatible shim, not captured from an interactive browser session. The browser executable available in this environment did not complete a headless screenshot session reliably. Full manual browser/device QA is still required before describing this as production-release validated.
