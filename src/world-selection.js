import { buildMountainWorld } from './mountain-world.js';
import { buildCityWorld } from './city-world.js';
import { applyCelShading, registerCelPalette } from './cel-shading.js';
import { orientGroundSurfaces } from './surface-geometry.js';
import { MOUNTAIN_TRACK, trackInfo } from './tracks.js';

export function applyDaytimeCel(view) {
 registerCelPalette('mountain-day', { shadowColor: '#b3b5cc', rimColor: '#fff0d8' });
 view.celShading = applyCelShading(view, {
  palette: 'mountain-day', ambientStrength: .52, sunStrength: .4,
  grade: { exposure: 1, contrast: 1.04, saturation: 14 },
  bloom: { enabled: view.quality === 'high', threshold: 1.05, weight: .08, kernel: 24 }
 });
 return view.celShading;
}

export function buildSelectedWorld(view) {
 if (view.scenery) throw new Error('A scene can contain only one world. Replace the view to switch tracks.');
 const track = trackInfo(view.trackId);
 const builder = track.id === MOUNTAIN_TRACK ? buildMountainWorld : buildCityWorld;
 // Preserve the sync builder API, but route sync failures through the same
 // loading promise as texture/asset failures. Never resolve a failed world.
 try {
  builder(view);
  const original = view.scenery.ready;
  view.scenery.ready = Promise.resolve(original).then(result => {
   if (view.scene.isDisposed) throw new Error('World loaded after scene disposal');
   orientGroundSurfaces(view.scene);
   if (track.id === MOUNTAIN_TRACK) applyDaytimeCel(view);
   view.scene.metadata = { ...view.scene.metadata, selectedTrack: { id: track.id, name: track.name } };
   return result;
  });
 } catch (error) {
  view.scenery = { ready: Promise.reject(error), update() {} };
 }
 view.ready = view.scenery.ready;
 return view.scenery;
}
