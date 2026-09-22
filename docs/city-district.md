# Midnight City district extension

This extends the selected Midnight City world from `fc0281d649876f7d1182366d9a5abb46f4378891`. It preserves the approved night ground, bounded neon, facade ink, car material and contact-shadow fixes. It does not modify the Mustang meshes or simulation.

## Scope and collision truth

The district covers an 800 by 800 metre street grid with eleven streets on each axis, ten by ten blocks and four candidate building lots per block. The existing race route cuts through it. Conservative distance-to-the-entire-route tests remove lots and surface cells near the race corridor. The original continuous guardrails remain at `BARRIER - 0.05`, including at apparent junctions. Shared wall, bollard/tree and movable prop collision representations are retained.

Side streets are presentational beyond these rails. This does **not** add free-roam driving, building collisions or new checkpoint rules. The unchanged simulation confines driving to the existing corridor. Opening the side streets would require a separate physics change. `districtFreeDriving: false` exposes this limitation in metadata.

The old corridor building roots are replaced, rather than leaving buildings across the new grid. Candidate lots are rejected using an enclosing radius with 3 metres of extra space for architectural details. No new uncollided solid is placed inside the barrier corridor.

## Detail library

Six building assemblies share four facade box sources: courtyard L, stepped office, twin wing, terraced apartment, slender spire and corner shop. Instances vary width, depth, height, material and a hardware-instanced four-component facade tint. Parts share source geometry; there is no geometry allocation per building or window.

All near buildings have shop plinths, shop glazing, doors, projecting awnings, bounded neon signage and roof caps. High adds parapets, projecting ledges, AC units, antennas and selected water towers. Balanced retains the district and shops but removes parapets, antennas, water towers and ledges, retaining one roof AC unit per building. Fine floor lines, material joints and suggested fire-escape ladders stay in the facade shader. Deterministic 16 by 16 window grids use six colours and approximately 76 percent occupied cells. `litWindows` is an occupancy estimate, not a pixel visibility count.

Traffic lights, hydrants, dumpsters, planters, benches, bus shelters, procedural parked cars and vendor stalls use shared pools. Parked cars are simple boxes, not Mustang geometry. Extra visible lamp emitters feed the existing eight-nearest-emitter ground shader. They do not add Babylon lights.

Three simple tower rings use 72/96/120 candidates in High and 36/48/60 in Balanced. They use lit facades without rooftop or shop geometry. The existing blue-violet fog supplies depth. The sky sphere is enlarged to contain these rings. A ground skirt extends to 1024 metres from the district centre; fog is intended to hide its edge. Actual horizon visibility still needs browser review.

## Ground and approved lighting

Street and sidewalk tiles are merged into two surface meshes. A third mesh forms the outer skirt. A 256-square road atlas paints lane dashes, crosswalks, manhole rings, seams and low-contrast wet streaks. A 128-square paving atlas supplies sidewalk joints. There are no photographs or downloaded assets.

Road and pavement materials retain the approved ambient-only ground shader and lamp-bound pools. The old full-road reflection film and broad radial overlays remain hidden by the existing surface refinement. No new additive light quad, directional wedge, probe, shadow map or real light is introduced. The added wet streaks are painted surface detail, not bright source-free illumination.

The ground sampler preserves the original base sampler where appropriate and interpolates the actual district tile triangles on streets, sidewalks and the outer skirt. It remains finite outside the rendered extent through the original clamped fallback. Race surface height, friction thresholds, chassis pose and all physics fields are unchanged.

## Lifecycle

`buildSelectedWorld()` waits for the original city builder, expands the district, orients ground, applies the existing night material passes, then completes district facade bindings and audits budgets. The original `buildCityWorld()` remains a base-world builder, so its existing contract tests and 16-source budget still describe that base fixture. Selected-world tests cover the complete released path.

`scenery.ready` and `view.ready` reject if district generation, texture allocation, shader-contract patching or a budget check fails. Scenery readiness stays false on failure. Scene ownership handles cleanup, including partial construction. Existing update, weather, prop-reset and disposal interfaces are unchanged. There is no per-frame district mesh allocation. Per-frame existing material observers still scan the larger scene, so CPU frame time needs measurement.

## Budget and metadata

The earlier budget in `night-city.md` describes the base city only. The selected-world extension supersedes it with the following hard ceilings, checked during readiness and exported as `scene.metadata.scenery.budget`:

| Quantity | Ceiling |
| --- | ---: |
| Buildings, including far towers | 750 |
| Instances | 16,000 |
| Shared instance sources | 32 |
| Estimated city base-pass submissions | 80 |
| Procedural RGBA8 base pixels | 2 MiB |
| Unique geometry storage | 32 MiB |
| Estimated capacity-rounded instance buffers | 8 MiB |
| Conservative city resource estimate | 64 MiB |
| All-visible city triangles | 750,000 |

The district adds five geometry/material sources to the original sixteen, for 21 sources. It adds two non-mipmapped RGBA8 textures: 262,144 and 65,536 bytes. Total city procedural texture storage is **933,888 bytes (0.891 MiB)** across eleven textures, including the retained legacy reflection/pool textures. Updating the four existing window textures does not allocate new texture objects.

The runtime draw estimate counts unique visible mesh/source submissions and their submeshes. It assumes hardware instancing and the existing same-pass box-edge ink. It counts all city objects as visible, rather than subtracting frustum culling. Cars, rain, post-processing and any separate outline passes are excluded. This is not a GPU draw counter.

`geometryBytes` counts each unique geometry once, assumes four-byte vertex elements and conservatively assumes four-byte indices. `estimatedInstanceBufferBytes` rounds each source's capacity to a power of two with a minimum of 32, allows 80 bytes per instance (matrix plus tint), and doubles that allowance. `estimatedResidentBytes` is twice geometry bytes plus estimated instance buffers plus procedural texture bytes. These are estimates, not driver allocation measurements. CPU object/array storage, shader programs, render targets, cars and driver overhead are excluded.

This deliberately reserves nearly all of a 6 GB graphics budget for the existing full-detail fleet and rendering pipeline. It does not prove total VRAM is below 6 GB. Every Mustang remains at the existing 1,493,119 triangles, with its existing shared geometry untouched.

## Tests and verification limits

New `test/city-district.test.js` exercises the actual selected-world path with NullEngine: metadata ceilings and independently recounted submissions/instances, texture bytes, both quality settings, deterministic layout/tints, finite ground sampling, tile interpolation, actual transformed solid clearance, guardrail alignment, preserved lighting shader policy, and district-stage readiness failure. The Babylon-not-installed skip guard remains.

Suggested local command after dependencies are installed:

```text
node --test test/city-world.test.js test/city-district.test.js test/track-selection.test.js test/night-ground-lighting.test.js test/night-skyline.test.js
```

No shell, test execution, CI, deployment or browser session was used for this change. Tests are authored, not reported as passing. NullEngine cannot prove WebGL shader compilation, hardware instancing, frame rate, total VRAM, facade appearance, street-level readability, horizon coverage or camera clipping. Those need a browser/GPU check in both quality settings. No visual result is claimed.
