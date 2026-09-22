# City free-roam and population

This supersedes the presentational-only collision notes in `city-district.md` and the base rail notes in `night-city.md` for city free-roam. Mountain and city circuit-race mode keep the existing five-lap rules and rail confinement.

## Modes and rejoin

City defaults to Free-roam with Busy population. Setup adds Mode and City population controls. Mountain always uses race mode. Free-roam removes city race rails/posts, opens street connections through the old shoulder gap, and removes shared wall/bollard parts that block grid streets. Remaining scene solids have collision.

Outside the 9 m circuit half-width, the player's progress and required checkpoint remain unchanged. The lap start reference advances with simulation time, so elapsed lap time is paused. No off-course penalty or automatic invalidation is applied during the excursion. The global session clock and AI rivals continue.

Rejoin by driving onto the circuit segment immediately before the next required checkpoint. Returning farther ahead leaves the lap paused; the HUD tells you to return before that checkpoint. No position or velocity is changed by rejoin. Normal on-circuit checkpoint skips still invalidate a lap without moving the car. Manual R uses the last correctly passed checkpoint and the existing +20 second recovery penalty. AI rivals remain on the circuit using the inherited racing AI, including their normal recovery.

## Collision and simulation ownership

`city-gameplay.js` subclasses the live Race implementation. It does not edit or duplicate the drift, boost, tire, chassis, or collision impulse internals in `sim.js`. Only the city player's inherited drive call gets a temporary street-surface projection adapter; checkpoints and AI always use the true circuit projection.

After district rendering is ready, `city-life-view.js` extracts plain ground-level AABBs from visible solid meshes. Roof and overhead detail are excluded. This captures the actual procedural building footprints, furniture, parked cars, lamps, shared walls, and bollards without duplicating the district seed algorithm. The list is sent to the worker with a district command and must be accepted before Start. Same-world resets resend the cached list.

A 32 m spatial grid limits static candidates. Contacts use inherited mass-based staticContact and equal/opposite pairImpulse. Penetration correction is only overlap correction, not a travel or checkpoint teleport. Player, racers, civilians and pedestrians share those contacts. The city wrapper substeps 30 Hz calls to the same 120 Hz steps used by the worker. No new dependency or asset download is needed.

## Population

| Quality | Density | Traffic cap | Pedestrian cap |
| --- | --- | ---: | ---: |
| High | Busy | 48 | 120 |
| Balanced | Busy | 24 | 60 |
| High | Reduced | 24 | 60 |
| Balanced | Reduced | 12 | 30 |

These are pool capacities and spawn caps, not guaranteed live counts. Candidates are rejected if routes intersect colliders or the race corridor, or spawns overlap another actor. Conservative rejection can reduce actual population. Six box/material sources serve all actors; no Mustang geometry is used. Headlights are emissive geometry, not additional lights. Render updates reuse transform/instance pools.

Traffic follows deterministic block loops in the grid lanes at 6 to 8 m/s, braking for nearby actors and solids. Pedestrians follow pavement loops and wait/retreat when a vehicle approaches. Crossing corners are waiting areas: this first version deliberately does not let pedestrians cross active roads. They share collision impulses and do not produce injury effects. This is simple ambient behaviour, not traffic-law or crowd simulation. Collision displacement can require an actor to steer back to its route; no automatic actor teleport is used.

## Persistence

Existing setup storage and older record blobs are retained. Supplemental `{version:1,settings:{mode,density}}` lives at `3cars.settings.city-life-v1`. Stable values are `race` / `free-roam` and `busy` / `reduced`.

Existing circuit records retain `3cars.records.anime-night-city-v1`. Free-roam records use `3cars.records.anime-night-city-v1.free-roam-v1`. Mountain keeps its existing key. Selecting or saving free-roam never imports or overwrites circuit records.

## Verification limits

Added dependency-free gameplay tests and guarded NullEngine scene tests for pause/rejoin, manual recovery, mountain confinement, static solidity, impulse momentum, NPC reactions, 30/120 Hz equivalence, settings, mode-separated records, and pooled scenery.

Tests were authored but not run. No shell, browser session, CI, or deployment was used. Actual populated counts, street/collision alignment, route recovery after hard impacts, pedestrian avoidance, thin-object tunnelling at extreme speeds, frame cost, UI layout, visual appearance, and total VRAM require local validation. The existing district budget audit still covers the district before the separate NPC pools are installed; NPC costs are exposed separately. The full Mustang fleet remains unchanged.
