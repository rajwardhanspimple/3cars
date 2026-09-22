import { buildMountainWorld } from './mountain-world.js';
import { buildCityWorld } from './city-world.js';
import { expandCityDistrict, auditCityDistrict } from './city-district.js';
import { installCityLife } from './city-life-view.js';
import { applyCelShading, registerCelPalette } from './cel-shading.js';
import { installCelSurfaceDetails } from './cel-surface-details.js';
import { installNightSkyline, NIGHT_SKYLINE } from './night-skyline.js';
import { installNightGroundLighting, NIGHT_GROUND_LIGHTING } from './night-ground-lighting.js';
import { orientGroundSurfaces } from './surface-geometry.js';
import { MOUNTAIN_TRACK, trackInfo } from './tracks.js';

export function applyDaytimeCel(view) {
 registerCelPalette('mountain-day', { shadowColor: '#777ab3', rimColor: '#fff0d8' });
 view.celShading = applyCelShading(view, {
  palette: 'mountain-day', bandCount:3, terminator:.28, ambientStrength:.22, sunStrength:.8,
  textureStrength:.12, textureLevels:4,
  grade: { exposure: 1, contrast: 1.18, saturation: 38 },
  bloom: { enabled: view.quality === 'high', threshold: 1.05, weight: .08, kernel: 24 }
 });
 installCelSurfaceDetails(view);
 return view.celShading;
}
export function applyNighttimeCel(view) {
 registerCelPalette('city-night', {
  shadowColor:'#6865a8', rimColor:'#8cdfff', fogColor:'#151b50',
  materialColors:{asphalt:'#35436a','city-ground':'#252b50',
   'city-building-0':'#3a497b','city-building-1':'#513a73',
   'city-building-2':'#285b70','city-building-3':'#613b67'},
  materialTextureStrengths:{asphalt:0,'city-ground':0,'district-road':.7,'district-pavement':.55}
 });
 view.celShading = applyCelShading(view, {
  palette:'city-night', bandCount:3, terminator:.28,
  ambientStrength:NIGHT_GROUND_LIGHTING.ambientStrength,
  sunStrength:NIGHT_GROUND_LIGHTING.sunStrength,
  specularStrength:NIGHT_GROUND_LIGHTING.specularStrength,
  shadowStrength:.55, textureStrength:.12, textureLevels:4,
  grade:{toneMappingEnabled:false, exposure:1.08, contrast:1.18, saturation:42},
  bloom:{enabled:view.quality==='high', threshold:NIGHT_SKYLINE.bloomThreshold,
   weight:NIGHT_SKYLINE.bloomWeight, kernel:NIGHT_SKYLINE.bloomKernel},
  outlines:{color:'#050611',pixels:view.quality==='high'?3:2.5,
   cutoff:view.quality==='high'?110:80,maxWidth:.12,nearBoost:.5,nearDistance:24,carBoost:1.3}
 });
 installCelSurfaceDetails(view);
 installNightGroundLighting(view);
 installNightSkyline(view);
 return view.celShading;
}
export function buildSelectedWorld(view) {
 if (view.scenery) throw new Error('A scene can contain only one world. Replace the view to switch tracks.');
 const track = trackInfo(view.trackId);
 const builder = track.id === MOUNTAIN_TRACK ? buildMountainWorld : buildCityWorld;
 try {
  builder(view);
  const original = view.scenery.ready;
  view.scenery.ready = Promise.resolve(original).then(result => {
   if (view.scene.isDisposed) throw new Error('World loaded after scene disposal');
   const city = track.id !== MOUNTAIN_TRACK;
   if (city) view.scene.metadata.scenery.ready = false;
   const district = city ? expandCityDistrict(view) : null;
   orientGroundSurfaces(view.scene);
   if (!city) applyDaytimeCel(view);
   else { applyNighttimeCel(view); district.finish(); auditCityDistrict(view); installCityLife(view); view.scene.metadata.scenery.ready = true; }
   view.scene.metadata = { ...view.scene.metadata, selectedTrack: { id: track.id, name: track.name } };
   return result;
  }).catch(error => {
   if (view.scene.metadata?.scenery) view.scene.metadata.scenery.ready = false;
   throw error;
  });
 } catch (error) {
  view.scenery = { ready: Promise.reject(error), update() {} };
 }
 view.ready = view.scenery.ready;
 return view.scenery;
}
