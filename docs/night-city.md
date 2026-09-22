# Optional night city world

`src/city-world.js` exports `buildCityWorld(view)`. It is an alternative to the mountain builder, not an additional layer to run on top of it. The parent workstream must select it in `createWorld()` on a fresh scene. This change does not change the released default world or track selection.

## Integration contract

- Call `buildCityWorld(this)` where the current world is built, then include `this.scenery.ready` in the existing loading promise. It resolves to the scenery controller and rejects on construction or procedural texture failure. There are no external city assets to download.
- `view.scenery.update(dt, player, phase)` and `view.updateScenery(dt, player, phase)` share the existing signature. The update synchronizes movable props with `view.race.props` even while paused. Reflection scrolling stops while paused, finished, or reduced motion is enabled.
- `view.scenery.setWeather(weather)` retains night lighting for both weather modes. The wet appearance is art direction; this renderer never changes weather, grip, collision data, or any car field. The inherited view can overwrite PBR roughness after this hook; the cel layer's visible wet effect is the independent painted reflection texture.
- `view.sceneryGroundHeight(x,z)` samples the actual background ground grid using triangle interpolation. The road is above that grid and uses `roadHeight + surfaceRoughness.height` at each road vertex. Surface bands remain asphalt, curb, planted grass verge, and dirt at the simulation's thresholds. Roughness between vertices is an approximation, as for any triangulated render surface.
- `scene.metadata.scenery` exposes counts, readiness, surface contracts, source/instance counts, texture bytes, and barrier placement. `scene.metadata.celShading.palette` is `city-night`.
- The builder calls `registerCelPalette` and `applyCelShading` from the inherited cel layer. It assigns `view.celShading` before readiness. The existing Mustang readiness call can refresh that controller after fleet loading without replacing its palette. No car geometry or loader changes are included.
- Shared walls use their original dimensions and slope pose. Rails retain mountain-world's `BARRIER - 0.05` centre offset and 7.7 m segments. Tree colliders remain in physics, so matching-radius city bollards make them visible. Movable signs and cones retain IDs and follow the live race state.
- New buildings are beyond the barrier, with a conservative bounding-circle check against the entire track polyline. Streetlight poles are also outside the barrier. Decorative objects add no collision geometry.
- Scene disposal owns mesh, material, texture, and cel cleanup. `scenery.dispose()` only stops updates. This module is not a hot-swap teardown API.

## Rendering budget (estimates, not a profile)

- Sixteen source pools: dark metal, guardrail, concrete, cylindrical bollard, warm emitter, cone, three neon colours, three sign materials, and four windowed building variants. Repeated solids use `InstancedMesh`; per-frame updates reuse existing nodes.
- Nine non-mipmapped RGBA8 procedural textures: four 128x128 window grids, two 128x64 signs, one 128x256 road-reflection film, one 64x64 light pool, and one 256x128 sky. Total base pixel storage is 606,208 bytes (0.578 MiB), before driver overhead. No HDRI, reflection probe, shadow-map allocation, or additional real light is created.
- Four building textures encode deterministic lit window grids directly on shared box geometry. Windows add no separate mesh or draw. Flat graphic sky, stars, and moon share one sphere and one texture.
- Sixteen solid source/material batches plus fourteen static ground/surface/sky meshes give an estimated 30 city draw submissions per base pass with hardware instancing and all sources visible. Existing rain, fleet, post-processing, and optional outlines are additional. Emissive effects use the existing pipeline. Low quality disables bloom and reduces the ground grid. No city meshes are added to the car shadow caster list.
- The road film and warm light pools each form one additive, road-conforming batch. They use no screen-sized reflection render target. Film scrolling is slow and independent of vehicle speed; this is painted neon colour, not an accurate reflection of passing objects.
- Instancing bounds scenery GPU geometry, but scene nodes and per-instance transforms still cost CPU memory and update/culling work. Exact draw calls, frame time, total VRAM, and appearance need browser profiling on the target GPU. The existing 4,479,357 fleet triangles are unchanged.

## Verification

Added `test/city-world.test.js`, using Babylon NullEngine and Node's test runner. It covers both quality levels, metadata/resource counts, the ground sampler, shared roughness at road vertices, rail offsets and slope poses, wall/tree collider representation, conservative road-corridor clearance, prop movement/reset, weather, reduced motion, deterministic layout, and readiness rejection.

Suggested local command: `node --test test/city-world.test.js`. Tests were not executed in the tool-only authoring environment. NullEngine does not establish WebGL shader correctness, appearance, bloom quality, actual draw calls, or VRAM use. No browser session, CI run, or deployment was performed.
