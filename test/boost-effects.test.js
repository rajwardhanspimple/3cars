import test from 'node:test';
import assert from 'node:assert/strict';
import {BoostState} from '../src/boost-state.js';
import {RaceAudio} from '../src/audio.js';
const car=Object.freeze({index:0,speed:70,throttle:1,boostActive:true,nitro:50,nitroCooldown:0});
// Exponential decay can leave -0, which is numerically zero but fails strictEqual(0).
const zero=v=>v===0?0:v;
test('surge attacks, ignites once, releases, and never changes simulation state',()=>{
 const s=new BoostState(),before=JSON.stringify(car);
 s.update(car,1/120,'racing');const first=s.intensity;assert.ok(s.ignition>0);assert.ok(Math.abs(s.shakeX)>0);
 for(let i=0;i<60;i++)s.update(car,1/120,'racing');
 assert.ok(s.intensity>first);assert.ok(s.intensity<=1);assert.equal(zero(s.ignition),0);assert.equal(zero(s.shakeX),0);assert.ok(s.lines>0);
 for(let i=0;i<60;i++)s.update({...car,boostActive:false,speed:20},1/120,'racing');
 assert.ok(s.intensity<.001);assert.equal(zero(s.lines),0);
 s.update(car,1/120,'racing');assert.ok(s.ignition>0);
 for(const phase of ['paused','finished','menu','countdown']){s.update(car,0,phase);assert.equal(zero(s.intensity),0);assert.equal(zero(s.lines),0);assert.equal(zero(s.shakeY),0);}
 s.update(car,1/120,'racing',true);assert.equal(zero(s.ignition),0,'camera reset must not fake ignition');
 assert.equal(JSON.stringify(car),before);
});
test('lines require high speed or hard boost; reduced motion keeps flames but no shake/lines',()=>{
 for(const boostActive of [false,true]){const s=new BoostState();for(let i=0;i<60;i++)s.update({...car,boostActive,speed:30},1/60,'racing');assert.equal(zero(s.lines),0);}
 const s=new BoostState();s.update({...car,boostActive:false,speed:80},.1,'racing');assert.ok(s.lines>0);
 const reduced=new BoostState({reducedMotion:true});reduced.update(car,.1,'racing');assert.ok(reduced.intensity>0);assert.equal(zero(reduced.lines),0);assert.equal(zero(reduced.shakeX),0);assert.equal(zero(reduced.shakeY),0);
 s.update({...car,speed:NaN,throttle:NaN},NaN,'racing');assert.ok(Number.isFinite(s.intensity));
});
test('boost envelope agrees at 30 and 120Hz',()=>{
 const values=[30,120].map(hz=>{const s=new BoostState();for(let i=0;i<hz;i++)s.update(car,1/hz,'racing');return s.intensity;});assert.ok(Math.abs(values[0]-values[1])<1e-12);
});
test('audio low whoosh is ramped, muted and cleared on pause/dispose',()=>{
 const audio=new RaceAudio(),param=()=>({value:0,setTargetAtTime(v){this.value=v;}}),gain=()=>({gain:param()});
 audio.ctx={state:'running',currentTime:0,close:()=>Promise.resolve()};
 for(const key of ['master','engineGain','tireGain','driftGain','rainGain','boostGain','whooshGain','musicGain','fxGain'])audio[key]=gain();
 for(const key of ['motor','harmonic','music','boostFilter','whooshFilter','driftFilter'])audio[key]={frequency:param()};
 audio.update({...car,phase:'racing'},1/120);const first=audio.whooshGain.gain.value;
 for(let i=0;i<60;i++)audio.update(car,1/120);
 assert.ok(first>0);assert.ok(audio.whooshGain.gain.value>first);assert.ok(audio.whooshFilter.frequency.value<1000);
 audio.setMuted(true);assert.equal(audio.whooshGain.gain.value,0);assert.equal(audio.boostGain.gain.value,0);
 audio.update({phase:'paused'},0);assert.equal(audio.boostEnvelope.intensity,0);audio.setMuted(false);assert.equal(audio.whooshGain.gain.value,0);
 audio.dispose();assert.equal(audio.ctx,null);assert.equal(audio.boostEnvelope.intensity,0);
});
// Preserve simulation-only installations: Babylon-specific tests are guarded.
let B=null;try{({default:B}=await import('babylonjs'));}catch{}
if(!B){test('boost meshes skipped: babylonjs is not installed',{skip:'run npm install to exercise graphics'},()=>{});}
else{
 globalThis.BABYLON=B;const {BoostEffects}=await import('../src/boost-effects.js');
 for(const quality of ['high','medium'])for(const reducedMotion of [false,true])test(`bounded boost pool, reset and disposal (${quality}, reduced=${reducedMotion})`,()=>{
  const engine=new B.NullEngine(),scene=new B.Scene(engine),camera=new B.FreeCamera('camera',B.Vector3.Zero(),scene);
  const nodes=Array.from({length:3},(_,i)=>({root:new B.TransformNode(`car-${i}`,scene)}));
  const effects=new BoostEffects(scene,camera,{quality,reducedMotion});
  try{
   effects.setCarNodes(nodes);const count=scene.meshes.length;
   assert.equal(effects.flames.flat().length,18);assert.equal(effects.lines.length,reducedMotion?0:quality==='high'?24:12);
   const cars=[car,{...car,index:1,boostActive:false},{...car,index:2,boostActive:false}];
   for(let i=0;i<300;i++)effects.update(cars,1/60,'racing');
   assert.equal(scene.meshes.length,count);assert.ok(effects.flames[0].every(m=>m.isEnabled()));assert.ok(effects.flames[1].every(m=>!m.isEnabled()));
   assert.ok(effects.flames[0][0].scaling.y>1);assert.ok(effects.materials.every(m=>m.metadata.celShading===false));
   effects.update(cars,0,'paused');assert.ok([...effects.flames.flat(),...effects.lines].every(m=>!m.isEnabled()));
   effects.setCarNodes(nodes);assert.equal(scene.meshes.length,count);
   effects.dispose();effects.dispose();assert.equal(scene.meshes.length,0);assert.ok(nodes.every(n=>!n.root.isDisposed()));
  }finally{effects.dispose();scene.dispose();engine.dispose();}
 });
}
