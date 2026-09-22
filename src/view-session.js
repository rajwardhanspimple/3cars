import { trackInfo } from './tracks.js';

// A track/quality change owns a NEW scene and engine. Dispose before allocation,
// not after readiness, so two full Mustang fleets never overlap in GPU memory.
// Same-track resets retain the existing fleet and the view's normal reset path.
export function prepareRaceView(previous, View, canvas, race, config) {
 const trackId = trackInfo(config.trackId).id;
 if (!previous || previous.trackId !== trackId || previous.quality !== config.quality) {
  previous?.dispose();
  const view = new View(canvas, race, { ...config, trackId });
  return { view, ready: view.ready };
 }
 return { view: previous, ready: previous.setRace(race) };
}
