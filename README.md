# 3cars: Sakura Pass mountain preview

A desktop-browser racing game built with Babylon.js. This branch is the approved `feature/mountain-preview` preview only. Race two AI drivers over five laps of a Sakura Pass preview route with mountain scenery and three full-detail Mustang racers.

All three cars use the full-detail **2015 Ford Mustang** model. Each car retains **1,493,119 triangles**, for **4,479,357 on-track car triangles**. Geometry is shared in memory. Paint, brake lights, steering, and wheel animation are independent. There is no simplified car or LOD mesh in either quality setting.

## Run locally

Use Node.js 22 or newer and a desktop browser with hardware acceleration.

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. The first run downloads and verifies the pinned Mustang asset. Later runs use its local cache. Browser runtime assets are served locally.

## Controls

| Control | Action |
| --- | --- |
| W / Up | Accelerate |
| S / Down | Brake |
| A D / Left Right | Steer |
| Space + steering | Manual assisted drift |
| Shift | Rechargeable nitro |
| P / Escape | Pause or resume |
| R | Repair and return to checkpoint, +20 seconds |
| M | Mute |

The player does not drift automatically. AI rivals use brief, controlled handbrake drifts in suitable tight corners, and avoid them on straights, near traffic, and near track limits. Drift recovery, nitro, damage, rain grip, checkpoints, and five-lap classification remain active. Nitro lasts about four seconds from full charge and recharges after a two-second delay once Shift is released.

If you skip a checkpoint, the game still shows the 4-second notice and teleports you back. The current lap stays invalid and that lap cannot become a record. Keep driving and the next lap works normally. Manual recovery on `R` still adds 20 seconds. Existing cut penalties of 5 seconds remain active.

The simulation runs independently of rendering. Car poses and the chase camera use the existing interpolation fix to avoid stepping between simulation updates. Focus loss pauses play.

## Graphics

- Shared Mustang geometry with three independent cars.
- Mountain preview route presentation under Sakura Pass naming.
- Dry dusk and wet dusk options with preserved `dry` and `wet` stored values.
- Dynamic minimap display updated to Sakura Pass without changing route geometry.
- Shared tree geometry, batched static props, and capped scenery shadow casters.

This branch does not promise final art, final route geometry, final physics, or main publication. It awaits visual approval.

## Direct tests

```sh
npm test
npm run test:scene
```

`npm test` covers physics, AI race completion in both weather modes and all profiles, actual AI drift activity, track geometry, storage, and car/camera interpolation.

`npm run test:scene` decodes the real glTF/Draco source and constructs both scene quality modes with Babylon NullEngine. It checks normals, UVs, all three model counts, wheel hierarchies, independent paint/lights, shared geometry, and repeated resets. Canvas drawing is mocked. It does not test GPU pixels, reflections, post-processing, or frame rate.

Optional direct Chromium smoke test:

```sh
npx playwright install chromium
npm run test:smoke
```

On Linux, Chromium may also need system libraries (`npx playwright install --with-deps chromium`). The smoke test uses a reduced raster resolution with unchanged geometry and renders a bounded number of frames. It checks startup and controls. It is not a performance benchmark.

Manual checks still required: visual approval of `feature/mountain-preview`, drive a full race, confirm the persistent invalid-lap HUD after a skipped checkpoint, inspect Sakura Pass labels, compare Dry dusk and Wet dusk, check pause/restart, and confirm smooth camera movement on your GPU.

## Records

Mountain preview uses `3cars.records.mountain-preview-v1`. Existing settings migrate from `3cars.records.sakura-v1`, then `3cars.records.arcade-v1`, then `3cars.records` only when the newer keys are missing. If the new key exists but is malformed, storage falls back to empty defaults. Old results and best laps remain untouched in their original keys and are not mixed with this preview route. Records remain browser-local.

## Build and deployment

```sh
npm run build
```

Serve `dist/` over HTTP. Paths are relative. Main is not published from `feature/mountain-preview`. This preview awaits visual approval before any main release decision.

## Model source and license

Real asset source reference: **Ford Mustang 2015 EDITION** by **WARENTERTAINMENT**, attributed under **CC BY 4.0** on Sketchfab: <https://sketchfab.com/3d-models/ford-mustang-2015-edition-4b1a593df06042e29dce6049b466f932>.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for separate parent credit details.

The source listing is no longer available. License evidence is the embedded glTF metadata and pinned mirror attribution. Asset verification requires:

- SHA-256 `7bc4cd2e0e71730235b31cd5aa521e5511be81f61fa5b2da2bb62a9d478b7396`
- File size 4,562,323 bytes
- Original 1,493,119 triangles
- Embedded creator/license metadata and self-contained buffers

The asset bytes and notices are unchanged. Ford and Mustang names belong to their owners. This project does not claim Ford endorsement or trademark rights. Performance profiles and physics are fictional. Keep all third-party notices when redistributing.
