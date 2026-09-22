# Driving feel contract

Phase 1 goal: the car should feel like a mass on springs driving over a real road,
not a camera gliding along a line. The simulation owns the physical truth; renderers,
effects and audio only read it.

## Wheel order

All per-wheel arrays are `[frontLeft, frontRight, rearLeft, rearRight]`.

## Fields `src/sim.js` must publish on every car

| Field | Meaning |
| --- | --- |
| `wheelLoad[4]` | Vertical tire load, normalised so 1 means its static share. 0 means the wheel is unloaded or airborne. |
| `wheelSlip[4]` | Combined slip magnitude per tire, 0 gripping, 1 at the friction limit, above 1 sliding. |
| `wheelSpin[4]` | Wheel angular speed in rad/s, so wheels can lock under braking and spin under power. |
| `wheelContact[4]` | Surface under each tire: `asphalt`, `curb`, `grass`, `dirt`. |
| `suspension[4]` | Spring compression in metres from rest. Positive is compressed. |
| `bodyHeave` | Chassis vertical offset in metres from rest, for camera and body motion. |
| `bodyPitch` | Chassis pitch from load transfer in radians, separate from road slope. |
| `bodyRoll` | Chassis roll from load transfer in radians, separate from road camber. |
| `verticalG` | Instantaneous vertical acceleration in g, used for landing thumps and camera jolts. |
| `roughness` | Local surface roughness 0 to 1 under the car, driving rumble and dust. |

`pitch` and `roll` stay the road-surface pose. Chassis attitude is `bodyPitch` and
`bodyRoll` on top, so renderers add them and never double-apply the road.

## Rules

- Load transfer comes from acceleration through the centre of mass, not authored curves.
- Per-tire grip scales with its own `wheelLoad`, so an unloaded inside wheel gives up first.
- Road surface has small-scale height variation, so the car is never perfectly still.
- Everything stays identical at 30 Hz and 120 Hz.
- All 1,493,119 triangles per Mustang remain untouched.
- Skipping a checkpoint never moves the car.
