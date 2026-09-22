import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,CITY_TRACK,SpatialGrid,boxContact,populationBudget} from '../src/city-gameplay.js';
import {Race as BaseRace} from '../src/sim.js';
import {CityRecords,CITY_SETTINGS_KEY} from '../src/city-settings.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const city=()=>new Race({trackId:CITY_TRACK,mode:'free-roam',quality:'medium'});
function place(r,s,offset=0){const p=r.track.at(s,offset);Object.assign(r.player,{x:p.x,z:p.z,yaw:p.heading,hint:p.index});return p;}

test('off-circuit freezes lap and checkpoints; rejoin does not teleport or grant skipped gates',()=>{
 const r=city(),c=r.player;r.phase='racing';r.time=10;c.lapStart=2;c.nextGate=2;c.progress=r.track.gateSize+10;
 place(r,c.progress);c.previousS=r.track.at(c.progress).s;
 const progress=c.progress,gate=c.nextGate,lap=r.time-c.lapStart;
 place(r,r.track.gateSize*7,40);const pos=[c.x,c.z];
 for(let i=0;i<120;i++){r.time+=1/120;r.advance(c,1/120);}
 assert.deepEqual([c.x,c.z],pos);assert.equal(c.nextGate,gate);assert.equal(c.progress,progress);assert.equal(c.lapValid,true);close(r.time-c.lapStart,lap);assert.equal(c.offCourse,true);
 place(r,r.track.gateSize*6);r.time+=1/120;r.advance(c,1/120);assert.equal(c.rejoinPending,true);assert.equal(c.nextGate,gate);
 place(r,r.track.gateSize*2-2);const join=[c.x,c.z];r.time+=1/120;r.advance(c,1/120);
 assert.deepEqual([c.x,c.z],join);assert.equal(c.rejoinPending,false);assert.equal(c.nextGate,gate);
 place(r,r.track.gateSize*2+1);c.speed=20;r.time+=1/120;r.advance(c,1/120);
 assert.equal(c.nextGate,3);assert.equal(c.lapValid,true);
});
test('on-circuit skipping invalidates without moving the car and mountain retains barriers',()=>{
 const r=city(),c=r.player;c.progress=5;c.previousS=r.track.at(5).s;
 place(r,r.track.gateSize*4);const pos=[c.x,c.z];r.advance(c,1/120);
 assert.equal(c.lapValid,false);assert.deepEqual([c.x,c.z],pos);
 const mountain=new Race({trackId:'mountain-preview-v1',mode:'free-roam'});assert.equal(mountain.freeRoam,false);assert.equal(mountain.mode,'race');
 const p=mountain.track.at(60,20);Object.assign(mountain.player,{x:p.x,z:p.z});assert.equal(mountain.guardrail(mountain.player),true);
 assert.equal(r.guardrail(c),false);assert.equal(Race.prototype.crossGate.toString().includes('super.crossGate'),true);
});
test('manual recovery uses last valid checkpoint with existing penalty',()=>{
 const r=city(),c=r.player;r.phase='racing';c.lastValidGate=2;c.nextGate=6;place(r,700,50);
 assert.equal(r.repair(),true);const p=r.track.at(2*r.track.gateSize+2);
 close(c.x,p.x);close(c.z,p.z);assert.equal(c.nextGate,3);assert.equal(c.penalty,20);assert.equal(c.rejoinPending,false);
});
test('spatial static collision uses inherited contact impulse, stops penetration and dissipates energy',()=>{
 const r=city(),c=r.player,box={x:0,z:0,width:10,length:10,yaw:0};r.configureDistrict([box]);
 Object.assign(c,{x:6,z:0,vx:-20,vz:0,yaw:-Math.PI/2,yawRate:0});
 let calls=0;const contact=r.staticContact.bind(r);r.staticContact=(...args)=>{calls++;return contact(...args);};
 assert.equal(r.collideDistrict(c),true);assert.ok(calls>0);assert.ok(c.x>=6.9-1e-8);assert.ok(c.vx>0);assert.ok(Math.abs(c.vx)<20);
 assert.equal(boxContact(c,box),null);
 const grid=new SpatialGrid(Array.from({length:1000},(_,i)=>({x:i*100,z:0,width:10,length:10})));
 assert.ok(grid.query(0,0,3).length<5);
});
test('NPC collision calls equal/opposite mass impulse and conserves linear momentum',()=>{
 const r=city(),a=r.player,b={...r.cars[1],model:{...r.cars[1].model,mass:1000},radius:1.9};
 Object.assign(a,{x:0,z:0,vx:20,vz:0});Object.assign(b,{x:3,z:0,vx:0,vz:0});
 const momentum=a.model.mass*a.vx+b.model.mass*b.vx;let calls=0;const impulse=r.pairImpulse.bind(r);
 r.pairImpulse=(...args)=>{calls++;return impulse(...args);};assert.equal(r.collideActors(a,b),true);
 assert.equal(calls,1);close(a.model.mass*a.vx+b.model.mass*b.vx,momentum);assert.ok(b.vx>0);
});
test('civilian braking and pedestrian retreat respond to nearby cars',()=>{
 const r=city();r.configureDistrict([]);assert.ok(r.traffic.length>0);assert.ok(r.pedestrians.length>0);
 const t=r.traffic[0],target=t.route[t.next],d=Math.hypot(target.x-t.x,target.z-t.z),nx=(target.x-t.x)/d,nz=(target.z-t.z)/d;
 Object.assign(r.player,{x:t.x+nx*5,z:t.z+nz*5,vx:0,vz:0});r.stepPopulation(1/120);assert.equal(t.braking,true);
 const p=r.pedestrians[0];Object.assign(r.player,{x:p.x+3,z:p.z,vx:-12,vz:0});r.stepPopulation(1/120);assert.equal(p.reacting,true);
 for(const body of [...r.traffic,...r.pedestrians])assert.ok(Number.isFinite(body.x)&&Number.isFinite(body.vx));
});
test('city physics matches 30 and 120 Hz without replacing drive internals',()=>{
 const a=city(),b=city();for(const r of [a,b]){r.configureDistrict([]);r.phase='racing';}
 for(let i=0;i<30;i++)a.step(1/30,{throttle:1});for(let i=0;i<120;i++)b.step(1/120,{throttle:1});
 for(let i=0;i<3;i++){close(a.cars[i].x,b.cars[i].x);close(a.cars[i].z,b.cars[i].z);}
 for(let i=0;i<a.traffic.length;i++){close(a.traffic[i].x,b.traffic[i].x);close(a.traffic[i].z,b.traffic[i].z);}
 assert.ok(Race.prototype instanceof BaseRace);
});
test('population caps scale and records/settings stay per mode',()=>{
 assert.deepEqual(populationBudget('high','busy'),{traffic:48,pedestrians:120});assert.deepEqual(populationBudget('medium','reduced'),{traffic:12,pedestrians:30});
 const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)},r=new CityRecords(storage);
 assert.equal(r.loadSettings().mode,'free-roam');assert.equal(r.saveSettings({mode:'race',density:'reduced'}),true);assert.equal(new CityRecords(storage).loadSettings().density,'reduced');assert.ok(map.has(CITY_SETTINGS_KEY));
 const entry={carId:'vortex',weather:'dry',position:1,time:310,penalty:0,bestLap:60,finishedAt:'2026-09-21T10:00:00Z'};
 r.selectTrack(CITY_TRACK,'race');r.recordRace(entry);const old=map.get(r.key);
 r.selectTrack(CITY_TRACK,'free-roam');assert.equal(r.bestLap('vortex','dry'),null);r.recordRace({...entry,bestLap:45});
 r.selectTrack(CITY_TRACK,'race');assert.equal(r.bestLap('vortex','dry'),60);assert.equal(map.get(r.key),old);
});
let B=null;try{({default:B}=await import('babylonjs'));}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND'||!error.message.includes('babylonjs'))throw error;}
if(!B)test('city life render test skipped',{skip:'install Babylon for NullEngine'},()=>{});
else{
 globalThis.BABYLON=B;
 const {buildSelectedWorld}=await import('../src/world-selection.js');
 for(const quality of ['high','medium'])test(`free-roam scene has no rails and has pooled life (${quality})`,async()=>{
  const engine=new B.NullEngine(),scene=new B.Scene(engine),race=new Race({trackId:CITY_TRACK,mode:'free-roam',quality});
  const view={engine,scene,race,quality,trackId:CITY_TRACK,camera:new B.FreeCamera('camera',B.Vector3.Zero(),scene),sun:new B.DirectionalLight('sun',new B.Vector3(-1,-1,0),scene),hemi:new B.HemisphericLight('sky',B.Vector3.Up(),scene)};
  try{
   await buildSelectedWorld(view).ready;assert.equal(scene.metadata.scenery.districtFreeDriving,true);assert.ok(view.districtCollisionLayout.length>100);
   assert.equal(scene.meshes.filter(m=>['guardrail','rail-post'].includes(m.metadata?.kind)).length,0);
   assert.ok(scene.meshes.some(m=>m.metadata?.npc&&m instanceof B.InstancedMesh));
   const meshes=scene.meshes.length;view.updateScenery(1/30,race.player,'racing');assert.equal(scene.meshes.length,meshes);
  }finally{scene.dispose();engine.dispose();}
 });
}
