import test from 'node:test';
import assert from 'node:assert/strict';

// Same dependency guard as parent commit b31a5544: simulation CI has no npm dependencies.
let B=null;
try {({default:B}=await import('babylonjs'));} catch {}
if (!B) {
 test('cel shading suite skipped: babylonjs is not installed',{skip:'run npm install to exercise cel shading'},()=>{});
} else {
globalThis.BABYLON=B;
const {applyCelShading,registerCelPalette,CEL_FRAGMENT_SHADER}=await import('../src/cel-shading.js');
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
}
