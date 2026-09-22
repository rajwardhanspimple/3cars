import test from 'node:test';
import assert from 'node:assert/strict';
let B=null;
try {({default:B}=await import('babylonjs'));} catch {}
if(!B) {
 test('night skyline suite skipped: babylonjs is not installed',{skip:'run npm install to exercise skyline rendering'},()=>{});
} else {
 globalThis.BABYLON=B;
 const {NIGHT_SKYLINE,installNightSkyline,NIGHT_EMISSION_FRAGMENT,FACADE_INK}=await import('../src/night-skyline.js');
 const {applyNighttimeCel}=await import('../src/world-selection.js');
 const {FACADE_COLORS}=await import('../src/cel-surface-details.js');
 const fixture=quality=>{
  const engine=new B.NullEngine(),scene=new B.Scene(engine);
  const camera=new B.FreeCamera('camera',new B.Vector3(0,2,-10),scene);
  const sun=new B.DirectionalLight('sun',new B.Vector3(-1,-1,0),scene);
  const hemi=new B.HemisphericLight('sky',B.Vector3.Up(),scene);
  return {engine,scene,camera,sun,hemi,quality};
 };
 const luminance=c=>.2126*c.r+.7152*c.g+.0722*c.b;
 test('night palette and shader pre-grade peaks stay below white',()=>{
  for(const hex of [NIGHT_SKYLINE.horizon,NIGHT_SKYLINE.housing,NIGHT_SKYLINE.ink,...FACADE_COLORS]) {
   assert.ok(luminance(B.Color3.FromHexString(hex).toLinearSpace())<.12,hex);
  }
  assert.equal(NIGHT_SKYLINE.skyPeak,.16);assert.equal(NIGHT_SKYLINE.emissionPeak,.5);assert.equal(NIGHT_SKYLINE.facadePeak,.45);
  assert.match(NIGHT_EMISSION_FRAGMENT,/skyPeak\/max/);assert.match(NIGHT_EMISSION_FRAGMENT,/emissionPeak\/max/);
  assert.match(FACADE_INK,/\.45\/max/);
  // These are linear-input contracts, not a rendered-image assertion.
 });
 for(const quality of ['high','medium']) test(`bounded sign masks, facade ink and unchanged instancing (${quality})`,()=>{
  const view=fixture(quality),{scene}=view;
  try {
   const building=B.MeshBuilder.CreateBox('city-template-building-0',{},scene);
   building.metadata={cityWorld:true,template:true};building.isVisible=false;
   building.material=new B.StandardMaterial('city-building-0',scene);building.material.diffuseColor=B.Color3.FromHexString(FACADE_COLORS[0]);
   const tower=building.createInstance('tower');tower.scaling.set(14,60,18);tower.metadata={kind:'building',cityWorld:true};
   const sign=B.MeshBuilder.CreateBox('city-template-sign-0',{},scene);sign.isVisible=false;
   const emission=new B.StandardMaterial('magenta-sign',scene);emission.disableLighting=true;emission.emissiveColor=B.Color3.FromHexString('#ff409e');sign.material=emission;
   const panel=sign.createInstance('panel');panel.scaling.set(.12,9,8);panel.metadata={kind:'neon-panel'};
   const sky=B.MeshBuilder.CreateSphere('city-night-sky',{diameter:1400,sideOrientation:B.Mesh.BACKSIDE},scene);
   sky.material=new B.StandardMaterial('sky',scene);sky.material.disableLighting=true;sky.material.emissiveColor=B.Color3.White();sky.infiniteDistance=true;
   const before={meshes:scene.meshes.length,building:building.geometry,sign:sign.geometry,scale:panel.scaling.asArray(),parent:panel.parent,lights:scene.lights.length};
   applyNighttimeCel(view);
   const api=installNightSkyline(view);scene.onBeforeRenderObservable.notifyObservers(scene);
   assert.equal(scene.meshes.length,before.meshes);assert.equal(scene.lights.length,before.lights);
   assert.equal(building.geometry,before.building);assert.equal(sign.geometry,before.sign);
   assert.equal(panel.sourceMesh,sign);assert.equal(tower.sourceMesh,building);assert.equal(panel.parent,before.parent);
   assert.deepEqual(panel.scaling.asArray(),before.scale);
   assert.equal(sign.material.metadata.nightBoundedEmission,true);
   assert.equal(sign.material.metadata.maxEmittingWidth,2.4);assert.equal(sign.material.metadata.maxEmittingHeight,3.2);
   assert.ok(sign.material.metadata.maxEmittingWidth*sign.material.metadata.maxEmittingHeight<8);
   assert.equal(sign.material.needAlphaBlending(),false);
   assert.equal(building.material.metadata.nightFacadeInk,true);
   assert.match(building.material.shaderPath.fragmentSource,/floorPhase/);
   assert.match(building.material.shaderPath.fragmentSource,/contactReceiver/,'existing contact support survives');
   assert.equal(view.celShading.options.bloom.enabled,quality==='high');
   assert.equal(view.celShading.options.bloom.kernel,8);assert.equal(view.celShading.options.bloom.weight,.035);
   assert.equal(view.celShading.options.bloom.threshold,1.2);
   scene.clearColor.set(1,1,1,1);scene.onBeforeRenderObservable.notifyObservers(scene);
   assert.ok(scene.clearColor.b>scene.clearColor.r);assert.ok(scene.clearColor.b<.3);
   assert.equal(sky.material.metadata.nightBoundedEmission,true);
   const count=scene.materials.length;api.refresh();assert.equal(scene.materials.length,count);
   api.dispose();assert.equal(sign.material,emission);
  } finally {scene.dispose();view.engine.dispose();}
 });
}
