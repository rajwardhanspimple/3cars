import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,makeTrack,CARS,LAPS,PENALTIES} from '../src/sim.js';
const stepFor=(r,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds*120);i++)r.step(1/120,input);};
test('closed circuit sampling, projection, and length are consistent',()=>{
 const t=makeTrack();assert.ok(t.length>800);assert.ok(t.length<1800);
 for(let s=0;s<t.length;s+=17){const p=t.at(s),q=t.project(p.x,p.z);assert.ok(q.distance<.1);assert.ok(Math.abs(q.s-s)<.2);}
 assert.ok(Math.hypot(t.at(0).x-t.at(t.length).x,t.at(0).z-t.at(t.length).z)<1e-8);
});
test('countdown, throttle, braking, pause and fixed-step safety',()=>{
 const r=new Race();r.start();stepFor(r,2);assert.equal(r.time,0);stepFor(r,1.1);assert.equal(r.phase,'racing');
 stepFor(r,1,{throttle:1});assert.ok(r.player.speed>2);const time=r.time;r.pause();stepFor(r,1,{throttle:1});assert.equal(r.time,time);r.pause();
 stepFor(r,2,{brake:1});assert.ok(r.player.speed<.1);r.step(NaN);assert.ok(Number.isFinite(r.time));
});
test('three different models and always-on traction and ABS',()=>{
 assert.equal(new Set(CARS.map(c=>c.topSpeed)).size,3);
 const r=new Race({weather:'wet'});r.phase='racing';for(let i=0;i<100;i++)r.drive(r.player,{throttle:1},1/120);
 assert.equal(r.player.tc,true);r.drive(r.player,{brake:1},.3);assert.equal(r.player.abs,true);
});
test('repair charges time, clears damage, and prevents repeated key penalties',()=>{
 const r=new Race();r.phase='racing';r.player.damage.engine=.8;assert.equal(r.repair(),true);assert.equal(r.player.damage.engine,0);assert.equal(r.player.penalty,PENALTIES.repair);assert.equal(r.repair(),false);
});
test('skipped checkpoints reset progress and add a penalty',()=>{
 const r=new Race();r.phase='racing';const p=r.track.at(r.track.length*.35);r.player.x=p.x;r.player.z=p.z;r.step(1/120);
 assert.equal(r.player.penalty,PENALTIES.skip);assert.ok(r.player.progress<1);
});
test('checkpoints count five complete laps, not the initial start crossing',()=>{
 const r=new Race();r.phase='racing';const c=r.player;
 for(let gate=0;gate<=r.track.gates*LAPS;gate++){
   const s=gate*r.track.gateSize;c.progress=s-.1;c.previousS=r.track.at(s-.1).s;c.hint=r.track.at(s).index;
   const p=r.track.at(s+.1);c.x=p.x;c.z=p.z;r.time=gate+1;r.advance(c,1/120);
 }
 assert.equal(c.finished,true);assert.equal(c.lapTimes.length,LAPS);assert.equal(c.nextGate,121);
});
test('classification uses time penalties after the field finishes',()=>{
 const r=new Race();r.cars.forEach((c,i)=>{c.finished=true;c.finishTime=100+i;c.penalty=0;});r.player.penalty=20;assert.equal(r.standings()[2],r.player);
});
test('competitive AI can finish a dry and wet five-lap race', {timeout:120000},()=>{
 for(const weather of ['dry','wet']){
  const r=new Race({weather});r.start();
  for(let i=0;i<120*900&&r.phase!=='finished';i++)r.step(1/120,r.ai(r.player));
  assert.equal(r.phase,'finished',`${weather}: laps ${r.cars.map(c=>c.lapTimes.length)}, progress ${r.cars.map(c=>Math.round(c.progress))}`);
  assert.ok(r.cars.every(c=>c.finished),`${weather}: all competitors must finish`);
  assert.ok(r.cars.every(c=>Number.isFinite(c.finishTime)));
 }
});
