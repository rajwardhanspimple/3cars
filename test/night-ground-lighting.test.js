import test from 'node:test';
import assert from 'node:assert/strict';
let B=null;
try {({default:B}=await import('babylonjs'));} catch(error) {
 if(error.code!=='ERR_MODULE_NOT_FOUND'||!error.message.includes('babylonjs')) throw error;
}
if(!B) {
 test('night ground suite skipped: babylonjs is not installed',{skip:'install dependencies to exercise lighting'},()=>{});
} else {
 globalThis.BABYLON=B;
 const {applyDaytimeCel,applyNighttimeCel}=await import('../src/world-selection.js');
 const {NIGHT_GROUND_LIGHTING}=await import('../src/night-ground-lighting.js');
 function bind(mesh) {
  const values={},mat=mesh.material,original=mat.getEffect;
  mat.getEffect=()=>new Proxy({}, {get:()=> (name,...args)=>{values[name]=args.map(v=>v?.clone?.()||v);}});
  try {mat.onBindObservable.notifyObservers(mesh);} finally {mat.getEffect=original;}
  return values;
 }
 for(const quality of ['high','medium']) for(const night of [false,true]) test(`${night?'night':'day'} ground bindings (${quality})`,()=>{
  const engine=new B.NullEngine(),scene=new B.Scene(engine);
  try {
   const camera=new B.FreeCamera('camera',new B.Vector3(0,2,-10),scene);
   const sun=new B.DirectionalLight('sun',new B.Vector3(-.48,-.84,.36),scene);sun.intensity=.72;
   const hemi=new B.HemisphericLight('sky',B.Vector3.Up(),scene);hemi.intensity=.75;
   const view={engine,scene,camera,sun,hemi,quality,carNodes:[]};
   const ground=['city-asphalt','city-ground','city-lane-paint'].map(name=>{
    const mesh=B.MeshBuilder.CreateGround(name,{width:30,height:30},scene);
    mesh.metadata={role:'surface'};mesh.material=new B.PBRMaterial(name,scene);return mesh;
   });
   const overlays=['city-wet-reflection-film','city-warm-road-pools'].map(name=>B.MeshBuilder.CreateGround(name,{},scene));
   const emitter=B.MeshBuilder.CreateBox('city-lamp-emitter-12-1',{},scene);emitter.position.set(5,7.32,3);
   const leaf=B.MeshBuilder.CreatePlane('leaf',{},scene);leaf.material=new B.PBRMaterial('leaf',scene);
   leaf.material.transparencyMode=B.Material.MATERIAL_ALPHATEST;leaf.material.alphaCutOff=.35;
   const car=B.MeshBuilder.CreateBox('car-0-body',{},scene);car.material=new B.PBRMaterial('car-0-CARPAINT',scene);
   const paint=car.material;paint.albedoColor=new B.Color3(.8,.04,.01);
   const geometry=ground.map(m=>m.geometry),count=scene.meshes.length,lights=scene.lights.length;
   (night?applyNighttimeCel:applyDaytimeCel)(view);
   assert.equal(scene.metadata.celShading.palette,night?'city-night':'mountain-day');
   assert.equal(view.celShading.options.sunStrength,night?NIGHT_GROUND_LIGHTING.sunStrength:.8);
   for(let i=0;i<ground.length;i++) {
    const mesh=ground[i],values=bind(mesh);
    assert.equal(values.sunStrength[0],night?NIGHT_GROUND_LIGHTING.sunStrength:.8);
    assert.equal(mesh.geometry,geometry[i]);
    if(night) {
     assert.equal(values.specularStrength[0],0);assert.equal(values.rimStrength[0],0);
     assert.deepEqual(values.nightLamp0,[5,7.32,3,1]);
     assert.match(mesh.material.shaderPath.fragmentSource,/vec3 shaded = base\*ambient;/);
     assert.doesNotMatch(mesh.material.shaderPath.fragmentSource,/shaded \+= (rimColor|sunColor)/);
     assert.match(mesh.material.shaderPath.fragmentSource,/contactReceiver\*step/);
    } else assert.match(mesh.material.shaderPath.fragmentSource,/sunColor\*sunStrength\*diffuse/);
   }
   // Weather may change the real sun; it cannot restore night ground lighting.
   sun.intensity=2.25;
   assert.equal(bind(ground[0]).sunStrength[0],night?0:.8);
   assert.equal(scene.meshes.length,count);assert.equal(scene.lights.length,lights);
   for(const overlay of overlays) assert.equal(overlay.isVisible,false);
   assert.equal(leaf.material.needAlphaTesting(),true);assert.equal(leaf.material.alphaCutOff,.35);
   paint.albedoColor=new B.Color3(.01,.08,.9);
   assert.deepEqual(bind(car).baseColor[0].asArray(),[.01,.08,.9]);
   if(night) {
    emitter.isVisible=false;scene.onBeforeRenderObservable.notifyObservers(scene);
    assert.deepEqual(bind(ground[0]).nightLamp0,[0,0,0,0],'hidden lamps produce no pool');
   }
  } finally {scene.dispose();engine.dispose();}
 });
}
