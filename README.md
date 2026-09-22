# 3cars

Desktop browser racing prototype built with Babylon.js.

This branch targets **Sakura Valley**, a scenic sakura, river, and mountain circuit. The race uses three full-detail Ford Mustang 2015 visuals. Each car keeps the original **1,493,119** triangle geometry. Total shared on-track Mustang geometry is **4,479,357** triangles. No LOD mesh is used.

Player control is keyboard-only. **Space** is the manual drift control. Two AI rivals are intended to hold controlled drifts through tight corners.

## Status

This update changes UI copy, local storage, and project documentation for the Sakura Valley release target.

Circuit rendering and physics work for Sakura Valley are still being integrated elsewhere and need direct browser play testing. This README does not claim photorealism, validated vehicle dynamics, or a fixed frame rate.

## Run locally

Install Node.js 22 or newer.

```sh
git pull
npm install
npm run dev
```

Open **http://127.0.0.1:5173** in a current desktop browser with hardware acceleration enabled.

The first local run downloads the pinned Mustang source asset from the project mirror, verifies it, and caches it. After that, normal local play can run from the local cache.

## Direct checks

Run the Node test suite:

```sh
npm test
```

Do a manual playable check:

```sh
npm run dev
```

Then open the local build and drive a full race. Check the Sakura Valley menu copy, manual drift control on Space, and the new browser record namespace.

## Controls

| Control | Action |
| --- | --- |
| W / Up arrow | Accelerate |
| S / Down arrow | Brake |
| A D / Left Right arrows | Steer |
| Space | Manual drift |
| Shift | Boost |
| P / Escape | Pause or resume |
| R | Repair and return to the last validated checkpoint, with a 20-second penalty |
| M | Mute or unmute |

## Included target

- Sakura Valley scenic circuit setting with sakura, river, and mountain surroundings.
- Three full-detail Mustang visuals from shared source geometry, with no LOD reduction.
- Five-lap races against two AI rivals.
- Browser-local settings, best laps, and recent results under the Sakura Valley record namespace.
- Original synthesized engine, shift, tire, drift, rain, nitro, impact, and menu audio.

## Records and storage

Default Sakura Valley records use the browser-local key `3cars.records.sakura-v1`.

Migration rules:

- If the Sakura Valley key is missing, settings migrate from `3cars.records.arcade-v1` when that key contains valid version 1 data.
- If the arcade key is missing, settings migrate from `3cars.records` when that key contains valid version 1 data.
- Old best laps and old race results stay in their original keys.
- If the Sakura Valley key already exists but is invalid, the game falls back to safe empty Sakura Valley data and does not import legacy records.

Old Meridian lap times are not comparable to Sakura Valley runs, so they are not imported into the new record set.

Records stay local to the browser. They are not account-synced.

## Mustang asset and license

The Mustang asset is not stored in Git with the source tree. The preparation script downloads `assets/mustang-2015.gltf` from a pinned GitHub mirror when the local cache is missing. It verifies:

- SHA-256: `7bc4cd2e0e71730235b31cd5aa521e5511be81f61fa5b2da2bb62a9d478b7396`
- Size: `4,562,323` bytes
- Triangle count: `1,493,119`
- Embedded title, creator, creator profile URL, and `CC-BY-4.0` license metadata
- Embedded buffers and images only, with no unapproved external asset URIs

Player, AI, and shared scene use the same approved Mustang source geometry. License notices and the pinned source checksum stay unchanged.

Model credit: **Ford Mustang 2015 EDITION** by **WARENTERTAINMENT**, licensed under **CC BY 4.0**. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Ford and Mustang names and marks belong to their respective owners. This project does not claim real Ford specifications, Ford endorsement, or trademark rights. Vehicle behavior uses fictional game tuning and simplified physics.

Redistributed builds must keep the third-party notices.

## Scope and limitations

This is a playable prototype with simplified racing-game physics. It is not a validated motorsport simulator and it does not guarantee frame rate or hardware-specific performance.

Rendering speed depends on the browser, GPU, graphics quality, and scene load. Direct manual play on the target machine is required to judge handling and visuals.
