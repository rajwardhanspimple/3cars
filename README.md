# 3cars

A desktop-browser GT racing game built with Babylon.js. Race two AI drivers over five laps of Meridian circuit in dry or rainy daylight conditions. The player car is a full-resolution Ford Mustang 2015 visual model, while the game keeps the existing fictional tuning profiles, simplified simulation physics, and procedural AI rivals.

## Run locally

Install Node.js 22 or newer.

For an existing checkout:

```sh
git pull
npm install
npm run dev
```

For a new checkout:

```sh
git clone https://github.com/rajwardhanspimple/3cars.git
cd 3cars
npm install
npm run dev
```

Open **http://127.0.0.1:5173** in a current desktop browser with hardware acceleration enabled. Use a keyboard. The repository is private, so cloning or pulling requires access to it.

`npm run dev`, `npm start`, and `npm run build` run the asset preparation step first. On the first run, the Mustang source asset is downloaded from the pinned GitHub mirror and verified before play starts. After the asset is cached locally, normal local-server play works offline. Dependency installation still needs network access if packages are not already installed.

The game uses locally installed packages and local browser runtime assets. Babylon.js, Babylon.js loaders, the Draco decoder, the Mustang asset, textures, sounds, and generated scenery are served locally. Runtime play does not fetch fonts, models, textures, sounds, or decoders from a CDN.

## Controls

| Control | Action |
| --- | --- |
| W / Up arrow | Accelerate |
| S / Down arrow / Space | Brake |
| A D / Left Right arrows | Steer |
| P / Escape | Pause or resume |
| R | Repair and return to the last validated checkpoint, with a 20-second penalty |
| M | Mute or unmute |

The race automatically pauses when the window loses focus or the tab is hidden. Audio starts after a click. Music plays only in the setup menu. Pause controls offer restart and return to setup.

## Included

- Five-lap races with two procedural AI rivals using the same driving and damage model as the player.
- Vortex R (balanced), Apex S (more grip), and Titan GT (more power). These fictional tuning profiles and physics remain the gameplay model.
- Player visual model: **Ford Mustang 2015 EDITION**, loaded from the original Sketchfab-exported glTF by WARENTERTAINMENT and attributed under CC BY 4.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- Full-resolution Mustang geometry at exactly **1,493,119 triangles**. The source download is byte-identical to the pinned checksum. No decimation, simplification, replacement mesh, or LOD is used, including in Balanced graphics.
- Wheel grouping and wheel animation preserve every source triangle. Each source triangle is assigned to one runtime wheel or body group.
- Fixed 120 Hz vehicle simulation, smoothed keyboard input, speed-sensitive steering, lateral grip limits, drag, downforce approximation, automatic gears, traction control, and ABS.
- Procedural track kerbs, barriers, garages, grandstands, trees, distant hills, lighting, shadows, wet-weather effects, and AI rival car visuals.
- Generated cube-map environment reflections for paint and glass. These are local generated reflections, not ray tracing or a photorealism guarantee.
- Wet-weather grip reduction, rain streaks, fog, and wet-road material changes.
- Car and barrier contact, with steering, tire, and engine damage.
- Ordered checkpoints: sustained track cutting adds 5 seconds; skipped checkpoints trigger a reset and 10 seconds. Repairs add 20 seconds. Affected laps cannot set clean-lap records.
- Live position, approximate time gaps, lap and race timing, minimap, RPM, gear, damage, and assist indicators.
- Final classification after all three cars finish, with time penalties included.
- Original synthesized engine, shift, tire, rain, impact, and menu audio. No copyrighted music is included.
- Browser-local settings, best clean laps per car and weather, and the last 20 race results. Play remains possible if storage is blocked.

## Mustang asset and license

The Mustang asset is not stored in GitHub with the source tree. The preparation script downloads `assets/mustang-2015.gltf` from a pinned GitHub mirror when the local cache is missing. It verifies:

- SHA-256: `7bc4cd2e0e71730235b31cd5aa521e5511be81f61fa5b2da2bb62a9d478b7396`
- Size: `4,562,323` bytes
- Triangle count: `1,493,119`
- Embedded title, creator, creator profile URL, and `CC-BY-4.0` license metadata
- Embedded buffers and images only, with no unapproved external asset URIs

The original listing URL is recorded in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), but the listing is no longer available. The available license evidence is the metadata embedded in the exported glTF and the pinned mirror attribution.

Ford and Mustang names and marks belong to their respective owners. This project does not claim real Ford specifications, Ford endorsement, or trademark rights. The vehicle behavior uses the existing fictional game tuning and simplified physics.

Redistributed builds must keep the third-party notices. The build output includes the prepared Mustang asset, local Babylon.js files, local Babylon.js loaders, local Draco decoder files, and `THIRD_PARTY_NOTICES.md` when present.

## Scope and limitations

This is a playable first implementation with **simplified simulation-style physics**. It is not a validated motorsport simulator, a source of real Mustang performance specifications, or a photorealistic asset pack. Tire temperature, suspension geometry, full drivetrain dynamics, deformation, multiplayer, mobile controls, and pit stops are not included. The high-detail setting targets stronger desktop GPUs, but no specific frame rate is guaranteed. Select Balanced if rendering is slow. Balanced does not reduce the Mustang triangle count.

AI time gaps during racing are estimates based on track distance. Final times and penalties determine the result. The first timed lap begins when a car crosses the start line; total race time starts at the green light. Best laps are recorded when the race completes. Browser records are not account-synced and can be edited by the browser owner. Clearing site data removes them.

## Tests

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Native Node.js tests cover circuit geometry, driving, assists, ordered checkpoints, penalties, repairs, final classification, five-lap dry/wet AI races, and storage validation. Browser tests cover Babylon.js rendering, Mustang triangle preservation, absence of LOD, local runtime asset loading, missing-asset recovery, and keyboard play. These checks do not replace manual handling and visual review on a gaming PC.

## Build

```sh
npm run build
```

The `dist/` folder contains a static site, including local Babylon.js, local Babylon.js loaders, local Draco decoder files, the prepared Mustang asset, and third-party notices when present. Serve it over HTTP, not by opening `index.html` as a local file. Paths are relative so it can be hosted under a subdirectory. No public deployment or repository visibility change is performed by this project.

## Structure

- `src/sim.js`: pure simulation, track geometry, AI, rules, and classification.
- `src/view.js`: Babylon.js scene, procedural track, weather, AI rival visuals, and chase camera base.
- `src/mustang.js`: full-resolution Mustang import, checksum-grounded triangle verification, local Draco configuration, material tuning, environment reflections, and wheel grouping.
- `src/mustang-view.js`: Mustang-backed race view, player model loading, wheel animation, camera behavior, and wet-weather rendering.
- `src/main.js`: game loop, keyboard input, accessible interface, asset-loading lifecycle, and local records.
- `src/audio.js`: original Web Audio synthesis.
- `src/storage.js`: validated browser-local records.
- `scripts/prepare-assets.mjs`: pinned Mustang download, metadata validation, checksum validation, and triangle-count validation.
- `scripts/build.mjs`: static build and local runtime asset copy.
- `test/`: simulation, storage, and browser checks.

Dependency versions are pinned in `package.json`. `npm install` creates a local lockfile. Review dependency updates before adopting newer versions. Babylon.js, Babylon.js loaders, Draco, Three.js packaging, and the Mustang asset retain their respective upstream licenses.