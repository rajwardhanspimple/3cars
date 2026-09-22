import { trackInfo } from './tracks.js';
// A mode/population change also recreates the scene, so instance pools and
// collision manifests always match the worker's configuration.
export function prepareRaceView(previous, View, canvas, race, config) {
 const trackId = trackInfo(config.trackId).id;
 if (!previous || previous.trackId !== trackId || previous.quality !== config.quality || previous.race?.mode !== race.mode || previous.race?.density !== race.density) {
  previous?.dispose();
  const view = new View(canvas, race, { ...config, trackId });
  return { view, ready: view.ready };
 }
 return { view: previous, ready: previous.setRace(race) };
}
