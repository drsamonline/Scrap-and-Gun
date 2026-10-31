# Testing and Release Validation

## Automated checks

From the package root:

```sh
node --check game.js
node --check game.min.js
node --check sw.js
node tests/sw.test.js
node tests/smoke.test.js
node tests/touch.test.js
node tests/runtime-smoke.test.js game.js
node tests/runtime-smoke.test.js game.min.js
```

The touch suite runs the game in a simulated touch-capable DOM and asserts build-slot selection, tap-to-place, occupied-tile rejection, relative aiming, weapon cycling, tap-to-upgrade and the pause button. The static suite checks expected feature markers in readable source and app-shell wiring. The runtime suite runs the game in a lightweight simulated DOM/canvas, advances 1,400 frames, exercises co-op input, and verifies save/restore and time-loop accounting. These are regression smoke tests, not full end-to-end browser automation.

## Manual browser release checklist

- [ ] Open title screen at desktop and narrow/mobile viewport sizes.
- [ ] Start a run on Arena, Cross and Maze.
- [ ] Test normal, daily-seed and endless modes; repeat daily runs with equivalent inputs.
- [ ] Test each mutator alone and in valid combinations.
- [ ] Purchase, reset and reload tech-tree progression.
- [ ] Exercise every building and weapon; verify collisions, enemy targeting and boss variants.
- [ ] Clear waves and select all roguelite draft cards across repeated runs.
- [ ] Trigger free rewind and paid rewind; verify core accounting after Continue and reload.
- [ ] Test keyboard remapping, reduced motion, color palettes, touch and a physical gamepad.
- [ ] Serve from HTTPS/localhost, install the PWA where supported, then verify offline reload.
- [ ] Check console errors and frame-time/FPS overlay on low-end hardware.

## Screenshot provenance

The screenshots under `docs/screenshots/` were captured from the current build in a headless Chromium at a 1440×900 desktop viewport and an 844×390 phone-landscape viewport. They show the title screen, the build phase, combat and the mobile touch layout. Appearance can still vary slightly by browser and font implementation.
