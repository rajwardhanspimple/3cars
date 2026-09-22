import test from 'node:test';
import assert from 'node:assert/strict';

// Same dependency guard as parent commit b31a5544: simulation CI has no npm dependencies.
let B=null;
try {({default:B}=await import('babylonjs'));} catch {}
if (!B) {
 test('cel shading suite skipped: babylonjs is not installed',{skip:'run npm install to exercise cel shading'},()=>{});
} else {
globalThis.BABYLON=B;
const {applyCelShading,registerCelPalette,CEL_FRAGMENT_SHADER,CEL_DEFAULTS,CEL_BALANCED_OUTLINES}=await import('../src/cel-shading.js');
function fixture(quality='high') {
 const engine=new B.NullEngine(),scene=new B.Scene(engine);
 const camera=new B.FreeCamera('camera',new B.Vector3(0,2,-10),scene);
 const sun=new B.DirectionalLight('sun',new B.Vector3(-1,-1,0),scene);
 const hemi=new B.HemisphericLight('sky',B.Vector3.Up(),scene);
 return {engine,scene,camera,sun,hemi,quality};
}

test('cel conversion preserves geometry, parenting and independent live car materials',()=>{
 const view=fixture(),{scene}=view;
 try {
  const parent=new B.TransformNode('rig',scene),a=B.MeshBuilder.CreateBox('car-0-part',{},scene);
  a.parent=parent;a.material=new B.PBRMaterial('car-0-CARPAINT',scene);
  a.material.albedoColor=new B.Color3(.2,.3,.5);a.material.emissiveColor=new B.Color3(.22,.002,.001);
  const b=a.clone('car-1-part',parent,true);b.material=a.material.clone('car-1-CARPAINT');
  const sourceA=a.material,sourceB=b.material,geometry=a.geometry,indices=Array.from(a.getIndices()),vertices=Array.from(a.getVerticesData('position'));
  const api=applyCelShading(view);
  assert.equal(a.geometry,geometry);assert.equal(b.geometry,geometry);assert.equal(a.parent,parent);assert.equal(b.parent,parent);
  assert.deepEqual(Array.from(a.getIndices()),indices);assert.deepEqual(Array.from(a.getVerticesData('position')),vertices);
  assert.ok(a.material instanceof B.ShaderMaterial);assert.notEqual(a.material,b.material);
  sourceA.emissiveColor.set(.77,.003,.002);assert.equal(a.material.emissiveColor.r,.77);assert.equal(b.material.emissiveColor.r,.22);
  sourceA.albedoColor=new B.Color3(.9,.1,.2);assert.equal(a.material.albedoColor,sourceA.albedoColor);
  const clone=a.material.clone('car-2-CARPAINT');clone.emissiveColor.set(.1,.2,.3);assert.equal(sourceA.emissiveColor.r,.77);
  assert.equal(applyCelShading(view),api);assert.equal(scene.metadata.celShading.bandCount,3);
  assert.equal(scene.metadata.celShading.materialsConverted,3);
  api.dispose();assert.equal(a.material,sourceA);assert.equal(b.material,sourceB);
 } finally {scene.dispose();view.engine.dispose();}
});

test('foliage retains alpha test, UV transform, culling and hardware instancing',()=>{
 const view=fixture(),{scene}=view;
 try {
  const source=B.MeshBuilder.CreatePlane('foliage',{},scene),mat=new B.PBRMaterial('leaf',scene);
  const texture=B.RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,0]),1,1,scene);
  texture.hasAlpha=true;texture.uScale=3;texture.vOffset=.2;texture.coordinatesIndex=1;
  mat.albedoTexture=texture;mat.transparencyMode=B.Material.MATERIAL_ALPHATEST;mat.alphaCutOff=.35;mat.backFaceCulling=false;source.material=mat;
  const instance=source.createInstance('tree-instance'),geometry=source.geometry,parent=instance.parent;
  const api=applyCelShading(view);
  assert.equal(source.geometry,geometry);assert.equal(instance.sourceMesh,source);assert.equal(instance.parent,parent);
  assert.equal(instance.material,source.material);assert.equal(source.material.albedoTexture,texture);
  assert.equal(source.material.getAlphaTestTexture(),texture);assert.equal(source.material.needAlphaTesting(),true);
  assert.equal(source.material.needAlphaBlending(),false);assert.equal(source.material.alphaCutOff,.35);assert.equal(source.material.backFaceCulling,false);
  assert.equal(texture.uScale,3);assert.equal(texture.vOffset,.2);assert.equal(texture.coordinatesIndex,1);
  scene.onBeforeRenderObservable.notifyObservers(scene);assert.equal(source.renderOutline,false);
  assert.match(CEL_FRAGMENT_SHADER,/if \(alpha < alphaCutoff\) discard/);
  assert.equal(source.material.metadata.celBoxInk,false);
  api.dispose();assert.equal(source.material,mat);
 } finally {scene.dispose();view.engine.dispose();}
});

test('blended glass stays blended; grade, palettes, quality and outline budget are configurable',()=>{
 for(const quality of ['high','low']) {
  const view=fixture(quality),{scene}=view;
  try {
   const mesh=B.MeshBuilder.CreateBox('solid',{},scene);mesh.material=new B.PBRMaterial('solid-paint',scene);
   const glass=B.MeshBuilder.CreateBox('glass',{},scene);glass.material=new B.PBRMaterial('glass-paint',scene);
   glass.material.alpha=.3;glass.material.transparencyMode=B.Material.MATERIAL_ALPHABLEND;
   const fx=B.MeshBuilder.CreatePlane('boost-flame-0',{},scene),fxMat=new B.StandardMaterial('boost-flame-material',scene);fx.material=fxMat;
   const api=applyCelShading(view);
   assert.equal(glass.material.needAlphaBlending(),true);assert.equal(glass.material.alpha,.3);assert.equal(fx.material,fxMat);
   assert.equal(scene.imageProcessingConfiguration.toneMappingEnabled,false);
   assert.equal(api.options.bloom.enabled,quality==='high');
   registerCelPalette('test-night',{rimColor:'#aaccee',materialColors:{'solid-paint':'#304050'}});
   api.setOptions({palette:'test-night',bandCount:4,grade:{exposure:.85},outlines:{triangleBudget:0}});
   scene.onBeforeRenderObservable.notifyObservers(scene);
   assert.equal(scene.metadata.celShading.bandCount,4);assert.equal(scene.metadata.celShading.outlineTechnique,'inverted-hull');
   assert.equal(scene.metadata.celShading.outlinedTriangles,0);assert.equal(mesh.renderOutline,false);
   assert.equal(scene.imageProcessingConfiguration.exposure,.85);assert.equal(scene.metadata.celShading.palette,'test-night');
   api.setOptions({outlines:{triangleBudget:1000,cutoff:100}});scene.onBeforeRenderObservable.notifyObservers(scene);
   assert.equal(mesh.renderOutline,true);assert.equal(glass.renderOutline,false);
   mesh.position.z=1000;scene.onBeforeRenderObservable.notifyObservers(scene);assert.equal(mesh.renderOutline,false);
   api.dispose();
  } finally {scene.dispose();view.engine.dispose();}
 }
});

test('graphic defaults stay bold at both quality settings',()=>{
 assert.equal(CEL_DEFAULTS.bandCount,3);assert.equal(CEL_DEFAULTS.terminator,.28);
 assert.equal(CEL_DEFAULTS.ambientStrength,.22);assert.equal(CEL_DEFAULTS.sunStrength,.8);
 assert.equal(CEL_DEFAULTS.shadowStrength,.55);assert.equal(CEL_DEFAULTS.textureStrength,.12);assert.equal(CEL_DEFAULTS.textureLevels,4);
 assert.equal(CEL_DEFAULTS.grade.saturation,38);assert.equal(CEL_DEFAULTS.grade.contrast,1.18);
 assert.equal(CEL_DEFAULTS.outlines.pixels,3);assert.equal(CEL_DEFAULTS.outlines.maxWidth,.12);
 assert.equal(CEL_DEFAULTS.outlines.cutoff,110);assert.equal(CEL_DEFAULTS.outlines.color,'#050611');
 assert.equal(CEL_DEFAULTS.outlines.carBoost,1.3);assert.equal(CEL_DEFAULTS.outlines.nearBoost,.5);
 assert.equal(CEL_DEFAULTS.outlines.triangleBudget,1600000);assert.equal(CEL_BALANCED_OUTLINES.triangleBudget,800000);
 for (const quality of ['high','medium']) {
  const view=fixture(quality);
  try {
   const api=applyCelShading(view);
   assert.equal(api.options.outlines.pixels,quality==='high'?3:2.5);
   assert.equal(api.options.outlines.cutoff,quality==='high'?110:80);
   assert.equal(view.scene.metadata.celShading.textureStrength,.12);
   assert.equal(view.scene.metadata.celShading.textureLevels,4);
   assert.equal(view.scene.imageProcessingConfiguration.contrast,1.18);
  } finally {view.scene.dispose();view.engine.dispose();}
 }
});

test('hero paint wins a limited hull budget and fog colours its ink',()=>{
 const view=fixture(),{scene}=view;
 try {
  const prop=B.MeshBuilder.CreateBox('prop',{},scene);prop.material=new B.PBRMaterial('prop',scene);prop.position.z=-5;
  const car=B.MeshBuilder.CreateBox('car-0-shell',{},scene);car.material=new B.PBRMaterial('car-0-CARPAINT',scene);
  const geometry=car.geometry,indices=Array.from(car.getIndices());
  const api=applyCelShading(view,{outlines:{triangleBudget:12}});
  scene.fogMode=B.Scene.FOGMODE_EXP2;scene.fogDensity=.03;scene.fogColor=B.Color3.FromHexString('#151b50');
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.equal(car.renderOutline,true);assert.equal(prop.renderOutline,false);
  assert.equal(scene.metadata.celShading.outlinedCarMeshes,1);assert.equal(scene.metadata.celShading.outlinedTriangles,12);
  assert.ok(car.outlineWidth>.035);assert.ok(car.outlineColor.b>B.Color3.FromHexString('#050611').b);
  assert.equal(car.geometry,geometry);assert.deepEqual(Array.from(car.getIndices()),indices);
  api.setOptions({outlines:{enabled:false}});scene.onBeforeRenderObservable.notifyObservers(scene);assert.equal(car.renderOutline,false);
 } finally {scene.dispose();view.engine.dispose();}
});

test('city boxes receive same-pass ink without losing instancing or geometry',()=>{
 const view=fixture(),{scene}=view;
 try {
  const source=B.MeshBuilder.CreateBox('city-template-building',{},scene);
  source.metadata={cityWorld:true,template:true};source.isVisible=false;source.material=new B.StandardMaterial('building',scene);
  const a=source.createInstance('city-building-a'),b=source.createInstance('city-building-b');a.scaling.set(12,30,16);b.scaling.set(.22,.34,7.7);
  const geometry=source.geometry,count=scene.meshes.length;
  applyCelShading(view);
  assert.equal(source.material.metadata.celBoxInk,true);assert.ok(source.material.options.defines.includes('#define CEL_BOX_INK'));
  assert.equal(a.sourceMesh,source);assert.equal(b.sourceMesh,source);assert.equal(source.geometry,geometry);assert.equal(scene.meshes.length,count);
  assert.equal(a.material,b.material);assert.deepEqual(a.scaling.asArray(),[12,30,16]);
  assert.equal(scene.metadata.celShading.boxInkMaterials,1);
 } finally {scene.dispose();view.engine.dispose();}
});

test('selected-world presets retain hard bands and saturated night fog after weather reset',async()=>{
 const {applyNighttimeCel,applyDaytimeCel}=await import('../src/world-selection.js');
 for (const quality of ['high','medium']) {
  const view=fixture(quality),{scene}=view;
  try {
   const night=applyNighttimeCel(view);
   assert.equal(night.options.sunStrength,.95);assert.equal(night.options.ambientStrength,.22);
   assert.equal(night.options.grade.saturation,42);assert.equal(night.options.grade.contrast,1.18);
   assert.equal(night.options.grade.exposure,1.08);assert.equal(night.options.textureStrength,.12);
   assert.equal(night.options.outlines.triangleBudget,quality==='high'?1600000:800000);
   assert.equal(night.options.bloom.enabled,quality==='high');
   scene.fogColor=B.Color3.FromHexString('#17172f');scene.fogDensity=.0025;
   scene.onBeforeRenderObservable.notifyObservers(scene);
   assert.equal(scene.fogColor.toHexString(),'#151B50');assert.equal(scene.fogDensity,.0025);
   const day=applyDaytimeCel(view);assert.equal(day.options.grade.saturation,38);assert.equal(day.options.ambientStrength,.22);
  } finally {scene.dispose();view.engine.dispose();}
 }
});
}
