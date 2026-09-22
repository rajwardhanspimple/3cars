import test from 'node:test';
import assert from 'node:assert/strict';
// Preserve dependency-free simulation CI, as in b31a5544.
let B=null;
try {({default:B}=await import('babylonjs'));} catch {}
if(!B) {
 test('cel surface suite skipped: babylonjs is not installed',{skip:'run npm install to exercise cel surfaces'},()=>{});
} else {
 globalThis.BABYLON=B;
 const {applyCelShading}=await import('../src/cel-shading.js');
 const {installCelSurfaceDetails,paintBandColor,windowPixels,FACADE_COLORS,DISABLED_ROAD_OVERLAYS}=await import('../src/cel-surface-details.js');
 const fixture=quality=>{
  const engine=new B.NullEngine(),scene=new B.Scene(engine);
  const camera=new B.FreeCamera('camera',new B.Vector3(0,2,-10),scene);
  const sun=new B.DirectionalLight('sun',new B.Vector3(-1,-1,0),scene);
  const hemi=new B.HemisphericLight('sky',B.Vector3.Up(),scene);
  return {engine,scene,camera,sun,hemi,quality,carNodes:[]};
 };
 for(const quality of ['high','medium']) test(`paint hue, live materials and three contact shadows (${quality})`,()=>{
  const view=fixture(quality),{scene}=view;
  try {
   const colors=['#ee263f','#2b72f4','#f5bf32'];
   for(let i=0;i<3;i++) {
    const root=new B.TransformNode(`car-${i}`,scene);root.position.set(i*4,.04,i*2);root.rotation.y=.2*i;
    const mesh=B.MeshBuilder.CreateBox(`car-${i}-body`,{},scene);mesh.parent=root;
    const paint=new B.PBRMaterial(`car-${i}-CARPAINT`,scene);paint.albedoColor=B.Color3.FromHexString(colors[i]).toLinearSpace();mesh.material=paint;
    view.carNodes.push({root,meshes:[mesh],paint});
   }
   const before=view.carNodes.map(r=>({geometry:r.meshes[0].geometry,parent:r.meshes[0].parent,indices:Array.from(r.meshes[0].getIndices())}));
   const road=B.MeshBuilder.CreateGround('city-asphalt',{width:30,height:30},scene);road.metadata={role:'surface'};road.material=new B.PBRMaterial('city-asphalt',scene);
   const meshCount=scene.meshes.length;
   applyCelShading(view);const details=installCelSurfaceDetails(view);details.refresh();
   assert.equal(scene.meshes.length,meshCount,'contact shadows add no meshes');
   assert.equal(scene.metadata.celSurfaceDetails.contactShadowCount,3);
   assert.equal(scene.metadata.celSurfaceDetails.contactShadowTechnique,'analytic-road-footprint');
   for(let i=0;i<3;i++) {
    const rig=view.carNodes[i],mat=rig.meshes[0].material;
    assert.equal(mat.metadata.celPaintHuePreserved,true);
    assert.equal(mat.albedoColor,rig.paint.albedoColor);
    for(const band of [0,.5,1]) {
     const lit=paintBandColor(mat.albedoColor,band,1),base=mat.albedoColor;
     assert.ok(Math.abs(lit.r/base.r-lit.g/base.g)<1e-6);
     assert.ok(Math.abs(lit.r/base.r-lit.b/base.b)<1e-6);
    }
    assert.equal(rig.meshes[0].geometry,before[i].geometry);assert.equal(rig.meshes[0].parent,before[i].parent);
    assert.deepEqual(Array.from(rig.meshes[0].getIndices()),before[i].indices);
   }
   const first=view.carNodes[0],second=view.carNodes[1];
   first.paint.albedoColor=B.Color3.FromHexString('#ff1530').toLinearSpace();
   assert.equal(first.meshes[0].material.albedoColor,first.paint.albedoColor);
   assert.notEqual(first.meshes[0].material.albedoColor,second.meshes[0].material.albedoColor);
   // Exercise actual converter + repair bind callbacks without a GPU compiler.
   const values={},fake=new Proxy({}, {get:(_,method)=>(name,...args)=>{values[name]=args;}});
   const mat=first.meshes[0].material,originalGet=mat.getEffect;mat.getEffect=()=>fake;
   mat.onBindObservable.notifyObservers(first.meshes[0]);mat.getEffect=originalGet;
   assert.equal(values.baseColor[0],first.paint.albedoColor);assert.equal(values.contactReceiver[0],0);
   const roadMat=road.material,get=roadMat.getEffect;roadMat.getEffect=()=>fake;
   roadMat.onBindObservable.notifyObservers(road);roadMat.getEffect=get;
   assert.equal(values.contactReceiver[0],1);assert.deepEqual(values.contact0,[0,.04,0,1]);
   first.root.position.x=15;details.refresh();assert.equal(scene.metadata.celSurfaceDetails.contactCenters[0].x,15);
   details.dispose();
  } finally {scene.dispose();view.engine.dispose();}
 });
 test('oversized overlays are not drawn and facade texture contains gaps and multiple hues',()=>{
  const view=fixture('high'),{scene}=view;
  try {
   for(const name of DISABLED_ROAD_OVERLAYS) B.MeshBuilder.CreateGround(name,{width:18,height:200},scene);
   const texture=B.RawTexture.CreateRGBATexture(new Uint8Array(128*128*4),128,128,scene);texture.name='city-window-grid-0';
   const count=scene.meshes.length,details=installCelSurfaceDetails(view);
   for(const name of DISABLED_ROAD_OVERLAYS) assert.equal(scene.getMeshByName(name).isVisible,false);
   assert.equal(scene.meshes.length,count);assert.equal(new Set(FACADE_COLORS).size,4);
   assert.equal(texture.metadata.celWindowGaps,true);assert.equal(texture.metadata.celWindowColors.length,4);
   for(let variant=0;variant<4;variant++) {
    const pixels=windowPixels(variant),colors=new Set();let dark=0,lit=0;
    for(let i=0;i<pixels.length;i+=4) {
     assert.equal(pixels[i+3],255);
     if(pixels[i]+pixels[i+1]+pixels[i+2]===0) dark++;
     else {lit++;colors.add(pixels.slice(i,i+3).join(','));}
    }
    assert.ok(dark>lit);assert.ok(lit>0);assert.ok(colors.size>=4);
   }
   assert.equal(scene.metadata.celSurfaceDetails.railInkMaxFaceFraction,.12);
   details.dispose();for(const name of DISABLED_ROAD_OVERLAYS) assert.equal(scene.getMeshByName(name).isVisible,true);
  } finally {scene.dispose();view.engine.dispose();}
 });
 test('late fleet shaders are repaired before rendering and keep cutout shaders intact',()=>{
  const view=fixture('medium'),{scene}=view;
  try {
   const api=applyCelShading(view);installCelSurfaceDetails(view);
   const mesh=B.MeshBuilder.CreateBox('car-0-body',{},scene);mesh.material=new B.PBRMaterial('car-0-CARPAINT',scene);api.refresh();
   scene.onBeforeRenderObservable.notifyObservers(scene);assert.equal(mesh.material.metadata.celPaintHuePreserved,true);
   const leaf=B.MeshBuilder.CreatePlane('leaf',{},scene),source=new B.PBRMaterial('leaf',scene);
   source.transparencyMode=B.Material.MATERIAL_ALPHATEST;source.alphaCutOff=.35;source.backFaceCulling=false;leaf.material=source;api.refresh();
   scene.onBeforeRenderObservable.notifyObservers(scene);
   assert.equal(leaf.material.needAlphaTesting(),true);assert.equal(leaf.material.alphaCutOff,.35);
   assert.match(leaf.material.shaderPath.fragmentSource,/if \(alpha < alphaCutoff\) discard/);
  } finally {scene.dispose();view.engine.dispose();}
 });
}
