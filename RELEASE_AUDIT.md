# SCRAP & GUN — Release Audit Notes

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
