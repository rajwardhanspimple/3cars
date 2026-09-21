# 3cars

A desktop-browser GT racing game built with Babylon.js. Race two AI drivers over five laps of Meridian circuit. Choose one of three fictional GT cars and dry or rainy daylight conditions.

## Run locally

Install Node.js 22 or newer. Then:

```sh
git clone https://github.com/rajwardhanspimple/3cars.git
cd 3cars
npm install
npm run dev
```

Open **http://127.0.0.1:5173** in a current desktop browser with hardware acceleration enabled. Use a keyboard. The repository is private, so cloning requires access to it.

The game uses the locally installed Babylon.js package. It does not fetch fonts, car models, textures, or sounds from a CDN. Internet access is required for the initial dependency installation, not for normal gameplay from the local server.

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

- Five-lap races with two AI rivals using the same driving and damage model as the player.
- Vortex R (balanced), Apex S (more grip), and Titan GT (more power).
- Fixed 120 Hz vehicle simulation, smoothed keyboard input, speed-sensitive steering, lateral grip limits, drag, downforce approximation, automatic gears, traction control, and ABS.
- Procedural GT bodywork, wheels, cockpit glazing, mirrors, wings, track kerbs, barriers, garages, grandstands, trees, distant hills, lighting, and shadows.
- Wet-weather grip reduction, rain streaks, fog, and wet-road material changes.
- Car and barrier contact, with steering, tire, and engine damage.
- Ordered checkpoints: sustained track cutting adds 5 seconds; skipped checkpoints trigger a reset and 10 seconds. Repairs add 20 seconds. Affected laps cannot set clean-lap records.
- Live position, approximate time gaps, lap and race timing, minimap, RPM, gear, damage, and assist indicators.
- Final classification after all three cars finish, with time penalties included.
- Original synthesized engine, shift, tire, rain, impact, and menu audio. No copyrighted music or real car branding.
- Browser-local settings, best clean laps per car and weather, and the last 20 race results. Play remains possible if storage is blocked.

## Scope and limitations

This is a playable first implementation with **simplified simulation-style physics and procedural graphics**. It is not a validated motorsport simulator or a photorealistic asset pack. Tire temperature, suspension geometry, full drivetrain dynamics, deformation, multiplayer, mobile controls, and pit stops are not included. The high-detail setting targets stronger desktop GPUs, but no specific frame rate is guaranteed. Select Balanced if rendering is slow.

AI time gaps during racing are estimates based on track distance. Final times and penalties determine the result. The first timed lap begins when a car crosses the start line; total race time starts at the green light. Best laps are recorded when the race completes. Browser records are not account-synced and can be edited by the browser owner. Clearing site data removes them.

## Tests

```sh
npm test
npx playwright install chromium
npm run test:browser
```

Native Node.js tests cover circuit geometry, driving, assists, ordered checkpoints, penalties, repairs, final classification, five-lap dry/wet AI races, and storage validation. Playwright checks real Babylon.js rendering and keyboard play in Chromium using software WebGL in CI. Screenshots and traces are attached to workflow runs. These checks do not replace manual handling and visual review on a gaming PC.

## Build

```sh
npm run build
```

The `dist/` folder contains a static site, including Babylon.js. Serve it over HTTP, not by opening `index.html` as a local file. Paths are relative so it can be hosted under a subdirectory. No public deployment or repository visibility change is performed by this project.

## Structure

- `src/sim.js`: pure simulation, track geometry, AI, rules, and classification.
- `src/view.js`: Babylon.js scene, original procedural models, weather, and chase camera.
- `src/main.js`: game loop, keyboard input, accessible interface, and lifecycle.
- `src/audio.js`: original Web Audio synthesis.
- `src/storage.js`: validated browser-local records.
- `scripts/`: local server and static build.
- `test/`: simulation, storage, and browser checks.

Dependency versions are pinned in `package.json`. `npm install` creates a local lockfile. Review dependency updates before adopting newer versions. Babylon.js and Playwright retain their respective upstream licenses.
