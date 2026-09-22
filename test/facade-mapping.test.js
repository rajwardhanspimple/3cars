import test from 'node:test';
import assert from 'node:assert/strict';
import {FACADE_MAPPING,facadeCoordinates,facadeAtlasUV,installFacadeMapping} from '../src/facade-mapping.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);

test('facade reference maps every face in metres, with constant square-ish window size',()=>{
 for(const scale of [[8,12,16],[20,64,12],[34,155,28],[100,16,4]]){
  for(const normal of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0],[0,-1,0]]){
   const axis=Math.abs(normal[0])?2:0,vertical=Math.abs(normal[1])?2:1;
   const a=[-.5,-.5,-.5],b=[...a],c=[...a];
   b[axis]=.5;c[vertical]=.5;
   const uv0=facadeAtlasUV(a,normal,scale),uv1=facadeAtlasUV(b,normal,scale),uv2=facadeAtlasUV(c,normal,scale);
   close((uv1[0]-uv0[0])*16,scale[axis]/3.2);
   close((uv2[1]-uv0[1])*16,scale[vertical]/3.2);
   close(scale[axis]/((uv1[0]-uv0[0])*16),3.2);
   close(scale[vertical]/((uv2[1]-uv0[1])*16),3.2);
  }
 }
 assert.equal(FACADE_MAPPING.windowMetres,1.6);
 // 64m tower now has 20 floors, not 16 rows stretched over any height.
 close(facadeAtlasUV([.5,.5,.5],[0,0,1],[20,64,12])[1]*16,20);
});

let B=null;
try{({default:B}=await import('babylonjs'));}catch(error){
 if(error.code!=='ERR_MODULE_NOT_FOUND'||!error.message.includes('babylonjs'))throw error;
}
if(!B)test('facade integration skipped: babylonjs is not installed',{skip:'install dependencies for NullEngine coverage'},()=>{});
else{
 globalThis.BABYLON=B;
 const {Race}=await import('../src/sim.js');
 const {buildSelectedWorld}=await import('../src/world-selection.js');
 const {DEFAULT_TRACK}=await import('../src/tracks.js');
 const {districtColliders}=await import('../src/city-life-view.js');
 const {applyCelShading}=await import('../src/cel-shading.js');
 function fixture(quality){
  const engine=new B.NullEngine(),scene=new B.Scene(engine);
  return {engine,scene,quality,trackId:DEFAULT_TRACK,race:new Race(),
   camera:new B.FreeCamera('camera',new B.Vector3(0,2,-10),scene),
   sun:new B.DirectionalLight('sun',new B.Vector3(-1,-1,0),scene),
   hemi:new B.HemisphericLight('sky',B.Vector3.Up(),scene)};
 }
 for(const quality of ['high','medium'])test(`all district facades use instance-scale UVs with tint/ink intact (${quality})`,async()=>{
  const view=fixture(quality),{scene}=view;
  try{
   await buildSelectedWorld(view).ready;
   const shaders=Array.from({length:4},(_,i)=>scene.getMeshByName(`city-template-building-${i}`).material);
   assert.equal(new Set(shaders).size,4);
   for(const mat of shaders){
    assert.equal(mat.metadata.facadeMapping,'instance-face-metres');
    assert.equal(mat.metadata.nightFacadeInk,true);assert.equal(mat.metadata.districtTint,true);
    assert.ok(mat.options.attributes.includes('districtTint'));
    assert.match(mat.shaderPath.vertexSource,/vAxisScale = vec3\(length\(a\),length\(b\),length\(c\)\)/);
    const f=mat.shaderPath.fragmentSource;
    assert.match(f,/texture2D\(emissiveSampler,facadeAtlasUV\(\)\)/);
    assert.match(f,/return facadeMetres\(\)\/51\.2/);
    assert.doesNotMatch(f,/vUV1\.y\*32\.0|vUV1\.y\*48\.0|step\(\.87,vUV1\.x\)/);
    assert.match(f,/detailMetres\.y\/\.4/);assert.match(f,/detailMetres\.y\/\.32/);
    assert.match(f,/vDistrictTint\.rgb/);assert.match(f,/floorPhase/);assert.match(f,/facadePeak/);
    assert.equal(mat.emissiveTexture.wrapU,B.Texture.WRAP_ADDRESSMODE);
    assert.equal(mat.emissiveTexture.wrapV,B.Texture.WRAP_ADDRESSMODE);
   }
   const buildings=scene.meshes.filter(m=>m instanceof B.InstancedMesh&&m.metadata?.district&&m.metadata.kind==='building');
   assert.ok(buildings.length>100);
   for(const mesh of buildings){
    mesh.computeWorldMatrix(true);const m=mesh.getWorldMatrix().m;
    const scales=[Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10])];
    for(const normal of [[1,0,0],[0,0,1]]){
     const width=normal[0]?scales[2]:scales[0];
     const metric=facadeCoordinates([.5,.5,.5],normal,scales);
     close(metric[0],width);close(metric[1],scales[1]);
     const uv=facadeAtlasUV([.5,.5,.5],normal,scales);
     close(width/(uv[0]*16),3.2);close(scales[1]/(uv[1]*16),3.2);
    }
    assert.ok(mesh.instancedBuffers.districtTint instanceof B.Color4);
   }
   // Re-running the repair is allocation-free and does not alter any collider,
   // source geometry, instance transform, or non-facade shader/texture mapping.
   const geometry=buildings.map(m=>m.sourceMesh.geometry),world=buildings.map(m=>Array.from(m.getWorldMatrix().m));
   const colliders=districtColliders(scene);
   const nonFacade=scene.materials.filter(m=>!shaders.includes(m)).map(m=>[m,m.shaderPath]);
   const surfaceNames=['city-district-streets','city-district-sidewalks','city-district-horizon-ground'];
   const surfaceUV=surfaceNames.map(n=>Array.from(scene.getMeshByName(n).getVerticesData('uv')));
   const resources=[scene.meshes.length,scene.materials.length,scene.textures.length];
   const fragments=shaders.map(m=>m.shaderPath.fragmentSource);
   installFacadeMapping(scene);applyCelShading(view,{});scene.onBeforeRenderObservable.notifyObservers(scene);
   assert.deepEqual([scene.meshes.length,scene.materials.length,scene.textures.length],resources);
   assert.deepEqual(shaders.map(m=>m.shaderPath.fragmentSource),fragments);
   assert.deepEqual(districtColliders(scene),colliders);
   buildings.forEach((m,i)=>{assert.equal(m.sourceMesh.geometry,geometry[i]);assert.deepEqual(Array.from(m.getWorldMatrix().m),world[i]);});
   surfaceNames.forEach((n,i)=>assert.deepEqual(Array.from(scene.getMeshByName(n).getVerticesData('uv')),surfaceUV[i]));
   for(const [mat,path] of nonFacade)assert.equal(mat.shaderPath,path);
  }finally{scene.dispose();view.engine.dispose();}
 });
 test('face mapping measures nonuniform parent scale and ignores rotation/translation',()=>{
  const view=fixture('medium');
  try{
   const source=B.MeshBuilder.CreateBox('reference',{},view.scene),parent=new B.TransformNode('parent',view.scene);
   parent.rotation.y=1.1;parent.position.set(100,30,-80);parent.scaling.set(2,1.5,3);
   const instance=source.createInstance('scaled');instance.parent=parent;instance.scaling.set(10,40,4);instance.computeWorldMatrix(true);
   const m=instance.getWorldMatrix().m,scale=[Math.hypot(m[0],m[1],m[2]),Math.hypot(m[4],m[5],m[6]),Math.hypot(m[8],m[9],m[10])];
   const front=facadeCoordinates([.5,.5,.5],[0,0,1],scale),side=facadeCoordinates([.5,.5,.5],[1,0,0],scale);
   close(front[0],20);close(front[1],60);close(side[0],12);close(side[1],60);
  }finally{view.scene.dispose();view.engine.dispose();}
 });
}
