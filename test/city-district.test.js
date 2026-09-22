import test from 'node:test';
import assert from 'node:assert/strict';
let B=null;
try { ({default:B}=await import('babylonjs')); } catch(error) {
 if(error.code!=='ERR_MODULE_NOT_FOUND'||!error.message.includes('babylonjs')) throw error;
}
if(!B) {
 test('city district suite skipped: babylonjs is not installed',{skip:'install dependencies for NullEngine coverage'},()=>{});
} else {
 globalThis.BABYLON=B;
 const {Race,BARRIER}=await import('../src/sim.js');
 const {roadPose}=await import('../src/mountain-layout.js');
 const {buildSelectedWorld}=await import('../src/world-selection.js');
 const {DISTRICT_BUDGET,DISTRICT_ARCHETYPES,auditCityDistrict}=await import('../src/city-district.js');
 const {DEFAULT_TRACK}=await import('../src/tracks.js');
 function fixture(quality='high') {
  const engine=new B.NullEngine(),scene=new B.Scene(engine),race=new Race();
  const camera=new B.FreeCamera('camera',new B.Vector3(0,2,-10),scene);
  const sun=new B.DirectionalLight('sun',new B.Vector3(-1,-1,0),scene);
  const hemi=new B.HemisphericLight('sky',B.Vector3.Up(),scene);
  return {engine,scene,race,camera,sun,hemi,quality,trackId:DEFAULT_TRACK,reducedMotion:false};
 }
 const close=(a,b,epsilon=1e-4)=>assert.ok(Math.abs(a-b)<epsilon,`${a} != ${b}`);
 function dispose(view) {view.scene.dispose();view.engine.dispose();}
 for(const quality of ['high','medium']) test(`district contracts and conservative budgets (${quality})`,async()=>{
  const view=fixture(quality),before=JSON.stringify(view.race);
  try {
   const world=buildSelectedWorld(view);assert.equal(await world.ready,world);assert.equal(view.ready,world.ready);
   const c=view.scene.metadata.scenery;
   assert.equal(c.ready,true);assert.equal(c.districtReady,true);
   assert.equal(c.buildingArchetypes,6);assert.equal(DISTRICT_ARCHETYPES.length,6);
   assert.ok(c.districtBuildings>100);assert.ok(c.archetypeCounts.every(n=>n>0));
   assert.equal(c.skylineRings,3);assert.ok(c.skylineRingCounts.every(n=>n>=36));
   assert.equal(c.buildings,c.districtBuildings+c.farTowers);
   assert.equal(c.farTowers,c.skylineRingCounts.reduce((a,b)=>a+b,0));
   assert.equal(c.storefronts,c.districtBuildings);assert.ok(c.rooftopStructures>=c.districtBuildings);
   assert.equal(Object.keys(c.streetFurniture).length,8);assert.ok(c.districtStreetlights>10);
   assert.ok(c.districtStreetTiles>1000);assert.ok(c.districtSidewalkTiles>1000);
   assert.equal(c.districtStreetAxes,22);assert.equal(c.districtFreeDriving,false);
   assert.ok(c.buildings<=DISTRICT_BUDGET.buildings);assert.ok(c.instances<=DISTRICT_BUDGET.instances);
   assert.ok(c.instanceSources<=DISTRICT_BUDGET.instanceSources);assert.ok(c.estimatedDrawCalls<=DISTRICT_BUDGET.drawCalls);
   assert.equal(c.proceduralTextureBytes,606208+256*256*4+128*128*4);
   assert.ok(c.proceduralTextureBytes<=DISTRICT_BUDGET.textureBytes);
   assert.ok(c.geometryBytes>0&&c.geometryBytes<=DISTRICT_BUDGET.geometryBytes);
   assert.ok(c.estimatedInstanceBufferBytes>0&&c.estimatedInstanceBufferBytes<=DISTRICT_BUDGET.instanceBufferBytes);
   assert.ok(c.estimatedResidentBytes<=DISTRICT_BUDGET.estimatedResidentBytes);
   assert.ok(c.estimatedRenderedTriangles<=DISTRICT_BUDGET.renderedTriangles);
   assert.equal(c.additionalRealLights,0);assert.equal(c.reflectionProbes,0);assert.equal(view.scene.lights.length,2);
   assert.equal(JSON.stringify(view.race),before,'district must not mutate race state');
   const meshes=view.scene.meshes.filter(m=>m.metadata?.cityWorld);
   assert.equal(c.instances,meshes.filter(m=>m instanceof B.InstancedMesh).length);
   const active=meshes.filter(m=>m.isVisible&&m.isEnabled()&&m.getTotalVertices());
   const draws=new Set(active.map(m=>m.sourceMesh||m));
   assert.equal(c.estimatedDrawCalls,[...draws].reduce((n,m)=>n+Math.max(1,m.subMeshes?.length||0),0));
   const {centerX:cx,centerZ:cz}=view.race.track.bounds;
   for(let z=-1000;z<=1000;z+=37) for(let x=-1000;x<=1000;x+=41) assert.ok(Number.isFinite(view.sceneryGroundHeight(cx+x,cz+z)));
   for(const name of ['city-district-streets','city-district-sidewalks']) {
    const mesh=view.scene.getMeshByName(name),positions=mesh.getVerticesData('position');
    assert.ok(positions.length>0);
    for(let i=0;i<positions.length;i+=12) {
     const x=positions[i]+1,z=positions[i+2]+1;
     close(view.sceneryGroundHeight(x,z),positions[i+1]*.5+positions[i+4]*.25+positions[i+7]*.25);
    }
    assert.match(mesh.material.shaderPath.fragmentSource,/vec3 shaded = base\*ambient/);
    assert.match(mesh.material.shaderPath.fragmentSource,/No camera-facing rim/);
   }
   for(const name of ['city-wet-reflection-film','city-warm-road-pools']) assert.equal(view.scene.getMeshByName(name).isVisible,false);
   for(const root of view.scene.transformNodes.filter(n=>n.metadata?.kind==='building-root')) {
    const {x,z}=root.position;
    assert.ok(view.race.track.project(x,z).distance-root.metadata.footprintRadius>=BARRIER+3-1e-5);
   }
   // Validate actual transformed geometry too, not just the placement metadata.
   for(const mesh of active.filter(m=>m.metadata?.district&&m.metadata.role==='solid')) {
    mesh.computeWorldMatrix(true);
    const box=mesh.getBoundingInfo().boundingBox,center=box.centerWorld;
    const radius=Math.max(...box.vectorsWorld.map(p=>Math.hypot(p.x-center.x,p.z-center.z)));
    assert.ok(view.race.track.project(center.x,center.z).distance-radius>BARRIER,
     `${mesh.name} intersects physics barrier corridor`);
   }
   for(const mesh of active.filter(m=>m.metadata?.kind==='guardrail')) {
    const {s,side}=mesh.metadata,p=view.race.track.at(s,side*(BARRIER-.05)),pose=roadPose(p.x,p.z,p.heading);
    close(mesh.position.x,p.x);close(mesh.position.z,p.z);close(mesh.position.y,pose.y+1.15);
    close(mesh.rotation.x,pose.pitch);close(mesh.rotation.z,pose.roll);close(mesh.scaling.z,7.7);
   }
   assert.equal(c.visibleBarrierRails,2*Math.ceil(view.race.track.length/7.5));
   for(let i=0;i<4;i++) {
    const source=view.scene.getMeshByName(`city-template-building-${i}`);
    assert.ok(source.instances.length>0);assert.ok(source.instances.every(m=>m.instancedBuffers.districtTint instanceof B.Color4));
    assert.ok(source.material.options.attributes.includes('districtTint'));
    assert.match(source.material.shaderPath.vertexSource,/vDistrictTint=districtTint/);
    assert.match(source.material.shaderPath.fragmentSource,/night|facadePeak/);
    assert.equal(source.material.metadata.nightFacadeInk,true);
   }
   const saved={...c};assert.deepEqual(auditCityDistrict(view),saved);
   view.scene.onBeforeRenderObservable.notifyObservers(view.scene);
   assert.equal(JSON.stringify(view.race),before);
  } finally {dispose(view);}
 });
 test('Balanced keeps the district but reduces roof geometry and skyline density; builds are deterministic',async()=>{
  const high=fixture(),medium=fixture('medium'),copy=fixture();
  try {
   await Promise.all([buildSelectedWorld(high).ready,buildSelectedWorld(medium).ready,buildSelectedWorld(copy).ready]);
   const h=high.scene.metadata.scenery,m=medium.scene.metadata.scenery;
   assert.equal(h.districtBuildings,m.districtBuildings);assert.ok(h.farTowers>m.farTowers);
   assert.ok(h.rooftopStructures>m.rooftopStructures);assert.ok(h.instances>m.instances);
   assert.deepEqual(h,copy.scene.metadata.scenery);
   const snapshot=v=>v.scene.meshes.filter(m=>m.metadata?.district&&m instanceof B.InstancedMesh).map(m=>
    [m.name,m.position.asArray(),m.scaling.asArray(),m.parent?.position.asArray(),m.instancedBuffers?.districtTint?.asArray()]);
   assert.deepEqual(snapshot(high),snapshot(copy));
  } finally {dispose(high);dispose(medium);dispose(copy);}
 });
 test('district-stage texture failure rejects selected-world readiness, not just the base builder',async()=>{
  const view=fixture(),original=B.RawTexture.CreateRGBATexture;let calls=0;
  try {
   B.RawTexture.CreateRGBATexture=function(...args) {
    if(++calls===10) throw new Error('injected district texture failure');
    return original.apply(this,args);
   };
   const world=buildSelectedWorld(view);
   await assert.rejects(world.ready,/injected district texture failure/);
   assert.equal(view.scene.metadata.scenery.ready,false);
  } finally {B.RawTexture.CreateRGBATexture=original;dispose(view);}
 });
 test('district budget failure cannot resolve ready',async()=>{
  const view=fixture(),original=view.scene;
  try {
   const world=buildSelectedWorld(view);
   // Base construction runs in a microtask. This continuation runs before selected-world expansion.
   await Promise.resolve();
   if(original.metadata?.scenery) original.metadata.scenery.proceduralTextureBytes=DISTRICT_BUDGET.textureBytes+1;
   await assert.rejects(world.ready,/budget exceeded/);
   assert.equal(original.metadata.scenery.ready,false);
  } finally {dispose(view);}
 });
}
