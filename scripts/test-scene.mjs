// Actual glTF/Draco and Babylon CPU runtime tests. No synthetic car fallback.
// Canvas pixels, GPU cube-map uploads, post-processing and FPS need a browser.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
import vm from 'node:vm';
const require=createRequire(import.meta.url),B=require('babylonjs');globalThis.BABYLON=B;require('babylonjs-loaders');
process.on('uncaughtException',e=>{console.error(e.stack);process.exit(1);});
function canvas(width=512,height=512){
 const ctx={fillRect(){},clearRect(){},putImageData(){},drawImage(){},beginPath(){},closePath(){},ellipse(){},arc(){},fill(){},stroke(){},moveTo(){},lineTo(){},save(){},restore(){},translate(){},rotate(){},scale(){},fillText(){},strokeText(){},setTransform(){},createImageData(w,h){return{width:w,height:h,data:new Uint8ClampedArray(w*h*4)};},measureText(t){return{width:String(t).length*8};},createLinearGradient(){return{addColorStop(){}};},createRadialGradient(){return{addColorStop(){}};}};
 const result={width,height,style:{},getContext(type){return type==='2d'?ctx:null;},addEventListener(){},removeEventListener(){}};ctx.canvas=result;return result;
}
globalThis.OffscreenCanvas=class{constructor(w,h){return canvas(w,h);}};
const status={dataset:{},textContent:''};globalThis.document={addEventListener(){},removeEventListener(){},createElement:name=>name==='canvas'?canvas():{style:{}},getElementById:()=>status};
const {prepareAssets}=await import('./prepare-assets.mjs');await prepareAssets();
const source=await readFile(new URL('../assets/mustang-2015.gltf',import.meta.url),'utf8');
const decoderURL=new URL('../node_modules/three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js',import.meta.url),wasm=await readFile(new URL('../node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.wasm',import.meta.url));
const module={exports:{}};vm.runInNewContext(await readFile(decoderURL,'utf8'),{module,exports:module.exports,require,process,console,Buffer,WebAssembly,TextDecoder,TextEncoder,setTimeout,clearTimeout,__dirname:dirname(fileURLToPath(decoderURL)),__filename:fileURLToPath(decoderURL)});
assert.equal(typeof module.exports,'function');
const originalLoad=B.SceneLoader.LoadAssetContainerAsync;let loads=0;
B.SceneLoader.LoadAssetContainerAsync=async(_root,_file,scene)=>{
 loads++;B.DracoDecoder.ResetDefault();B.DracoCompression.ResetDefault();
 B.DracoDecoder.DefaultConfiguration={wasmUrl:'injected',wasmBinaryUrl:'injected',wasmBinary:wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength),jsModule:module.exports,numWorkers:0};
 return originalLoad.call(B.SceneLoader,'',`data:${source}`,scene,undefined,'.gltf');
};
const {Race}=await import('../src/sim.js'),{RaceView}=await import('../src/mustang-view.js'),{DrivingEffects}=await import('../src/driving-effects.js'),{RenderMotion,FollowCamera}=await import('../src/render-motion.js');
const summary=[];
try{for(const quality of ['medium','high']){
 const engine=new B.NullEngine({renderWidth:64,renderHeight:64,textureSize:64}),scene=new B.Scene(engine),race=new Race(),view=Object.create(RaceView.prototype),started=performance.now();
 Object.assign(view,{engine,scene,race,quality,materials:{},carNodes:[],elapsed:0,reducedMotion:true,cameraReady:false,disposed:false});
 view.camera=new B.FreeCamera('chase',new B.Vector3(0,5,-10),scene);view.hemi=new B.HemisphericLight('sky',new B.Vector3(0,1,0),scene);view.sun=new B.DirectionalLight('sun',new B.Vector3(-.48,-.84,.36),scene);view.shadow=new B.ShadowGenerator(128,view.sun);
 try{
  view.createWorld();console.log('Scene constructed',quality);const info=scene.metadata.scenery,counts=info.counts||info;
  assert.equal(info.circuitId,'sakura-valley-v1');assert.ok(counts.sakuraTrees>40);assert.ok(counts.terrainVertices>0);
  for(const mesh of scene.meshes){
   const n=mesh.getTotalVertices();if(!n)continue;const uv=mesh.getVerticesData(B.VertexBuffer.UVKind);if(uv)assert.equal(uv.length,n*2,`${mesh.name}: UV length`);
   assert.ok(mesh.getVerticesData(B.VertexBuffer.PositionKind).every(Number.isFinite),`${mesh.name}: finite vertices`);
   if(/sakura-asphalt|edge-line|outer-runoff|sculpted-sakura|azuma-river|rocky-.*bank/.test(mesh.name)){const normals=mesh.getVerticesData(B.VertexBuffer.NormalKind);let up=0;for(let i=1;i<normals.length;i+=3)up+=normals[i];assert.ok(up>0,`${mesh.name}: normals must point up`);}
  }
  view.effects=new DrivingEffects(scene,{reducedMotion:true});view.motion=new RenderMotion();view.followCamera=new FollowCamera();view._boostFov=0;view._lastFrameTime=performance.now()/1000;
  const initialLoads=loads;await view.setRace(race);console.log('Real fleet loaded',quality);assert.equal(loads-initialLoads,1);
  const rigs=view.carNodes;assert.equal(rigs.length,3);assert.equal(scene.metadata.fleet.totalTriangles,4479357);
  for(const [i,rig]of rigs.entries()){
   assert.equal(rig.root.name,`car-${i}`);assert.equal(rig.meshes.length,54);assert.equal(rig.meshes.reduce((n,m)=>n+m.getTotalIndices()/3,0),1493119);assert.equal(rig.wheels.length,4);assert.equal(rig.template.isEnabled(),false);
   for(const[j,mesh]of rig.meshes.entries()){assert.ok(mesh.isEnabled());assert.equal(mesh.getLODLevels().length,0);assert.equal(mesh.geometry,rigs[0].meshes[j].geometry);}
   for(const wheel of rig.wheels){assert.ok(wheel.spin.getChildMeshes().length>0);assert.ok(rig.meshes.some(mesh=>mesh.parent===wheel.pivot));}
  }
  assert.equal(new Set(rigs.map(r=>r.paint)).size,3);assert.equal(new Set(rigs.map(r=>r.tailMaterial)).size,3);
  const brake=rigs[1].tailMaterial.emissiveColor.r;rigs[0].tailMaterial.emissiveColor.r=.99;assert.equal(rigs[1].tailMaterial.emissiveColor.r,brake);
  const spin=rigs[1].wheels[0].spin.rotation.x;rigs[0].wheels[0].spin.rotation.x+=1;assert.equal(rigs[1].wheels[0].spin.rotation.x,spin);
  view.render(1/60);assert.ok(scene.getFrameId()>0);view.setWeather('wet');view.render(1/60);view.setWeather('dry');
  const meshes=scene.meshes.length,geometries=scene.geometries.length;
  for(let i=0;i<3;i++){await view.setRace(new Race({carId:i%2?'apex':'titan'}));view.render(0);assert.equal(loads-initialLoads,1);assert.equal(scene.meshes.length,meshes);assert.equal(scene.geometries.length,geometries);}
  summary.push({quality,realAsset:true,carCount:3,triangles:4479357,partsPerCar:54,geometryShared:true,sakuraTrees:counts.sakuraTrees,sceneMeshes:meshes,seconds:+((performance.now()-started)/1000).toFixed(2)});
 }catch(e){console.error('SCENE_RUNTIME_FAILURE',quality,e.stack);throw e;}finally{try{view.effects?.dispose();scene.dispose();engine.dispose();}catch(e){console.error('Cleanup',e.message);}}
}
 console.log('SCENE_RUNTIME_PASS',JSON.stringify(summary));console.log('Actual glTF/Draco, CPU scene construction, wheel hierarchy and resets passed. Canvas pixels, GPU effects and FPS are not tested.');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{B.SceneLoader.LoadAssetContainerAsync=originalLoad;B.DracoDecoder.ResetDefault();B.DracoCompression.ResetDefault();}
