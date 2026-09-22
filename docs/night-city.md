# Selectable anime worlds

The setup panel now selects Midnight City (night) or Sakura Pass (daytime). Midnight City is the default when no valid track selection has been saved. The game still uses the existing circuit, physics, collision layout, and full-detail Mustang geometry.

## Settings and records

- Setup JSON lives at `3cars.settings.anime-v1`, as `{version:1, settings:{carId, weather, quality, muted, trackId}}`.
- Stable track values: `anime-night-city-v1` (default) and `mountain-preview-v1`.
- City records: `3cars.records.anime-night-city-v1`.
- Mountain records: the unchanged `3cars.records.mountain-preview-v1`.
- Results and all-time bests stay in their own record blob, retaining the existing car/weather subkeys and 20-result history limit. Switching tracks and saving settings do not rewrite mountain records.
- When the new settings key is absent, only settings migrate from the mountain blob, then the existing Sakura, arcade, and legacy precedence. Old results never migrate. A malformed present key blocks fallback, as before. Missing/invalid track selections default to night city.
- `LocalRecords` retains its mountain-only API for existing callers. The game uses `TrackRecords` and selects the record namespace explicitly when showing history and recording a race.

## World lifecycle

`RaceView.createWorld()` calls `buildSelectedWorld()`, which selects the city or mountain builder. Both expose `scenery.ready`, `scenery.update(dt,player,phase)`, `sceneryGroundHeight(x,z)` and `scene.metadata.scenery`. Synchronous construction errors and asynchronous asset errors reject the loading promise. The existing loading error UI reports failures.

`prepareRaceView()` reuses `setRace()` only for the same track and quality. A track or quality change disposes the entire old view before constructing the next one. The existing Mustang view disposal clears cel observers, effects and render motion, then the base view disposes scenery, scene and engine. Babylon owns scene mesh, material, texture, pipeline and observer cleanup. This avoids retaining two complete fleets or worlds while waiting for the new one to load. Switching requires a loading pause and recreates the fleet; its original shared geometry and triangle counts are unchanged.

Do not call a second world builder on a live scene. `buildSelectedWorld()` rejects that usage. `scenery.dispose()` alone is not a hot-swap cleanup API.

The city registers `city-night` using the existing cel layer. The selected mountain world registers `mountain-day` after its assets are ready. The existing Mustang readiness path refreshes the same controller once the fleet is ready. Camera interpolation, suspension, wheel posing, driving effects, rain, boost, checkpoints, and simulation logic are not changed.

## City rendering contract and budget

- Road vertices use the existing centreline and `roadHeight + surfaceRoughness.height`. Ground sampling uses triangle interpolation of the rendered background grid. Asphalt, curb, planted grass verge and dirt remain distinct at the physics thresholds.
- Rails keep the mountain builder's `BARRIER - 0.05` centre offset and 7.7 m segments. Shared walls retain their dimensions. Existing tree colliders appear as matching-radius city bollards. Props follow `race.props`, including resets and knocked-over state.
- Sixteen instanced geometry/material pools. Window grids are textures on shared building boxes, not separate window meshes.
- Nine non-mipmapped RGBA8 textures total 606,208 base pixel bytes (0.578 MiB), excluding driver overhead. No city reflection probe, additional real light or shadow map is created.
- Estimated 30 city base-pass submissions with hardware instancing, excluding cars, rain, outlines, and post-processing. This is an estimate, not a profile.
- Road-conforming additive texture batches fake neon reflections and warm streetlight pools. Reflection scrolling stops while paused, finished, or reduced motion is enabled. Balanced effects disables bloom and reduces the ground grid.

## Verification limits

The parent Babylon dependency guard from commit `b31a5544a9cd7b0b41a9fd67064e9dbeda05fb72` is replicated in the cel suite and applied to city and world-switch tests. Dependency-free storage and selection tests still run without Babylon. Install dependencies to exercise NullEngine tests.

Suggested local command: `node --test test/storage.test.js test/track-selection.test.js test/cel-shading.test.js test/city-world.test.js`.

Added tests cover setup round-trips, settings-only migration, per-track histories/bests, replacement ordering, real city disposal with no retained scene resources, palette selection, and readiness rejection. The headless switch test uses the real city and a small mountain resource fixture because the mountain builder needs downloaded assets and a canvas. It does not claim to load or visually validate the complete mountain scene.

Tests were not run in this tool-only environment. Browser rendering, actual asset loading, both quality settings, visual palette balance, UI layout, camera/effect regressions, repeated-switch VRAM use, and GPU draw calls still need local validation. No browser session, CI run, or deployment was performed.
