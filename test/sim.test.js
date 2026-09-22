import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,makeTrack,CARS,LAPS,PENALTIES} from '../src/sim.js';
const stepFor=(r,seconds,input={})=>{for(let i=0;i<Math.ceil(seconds*120);i++)r.step(1/120,input);};
test('closed circuit sampling, projection, and length are consistent',()=>{
 const t=makeTrack();assert.equal(t.id,'sakura-valley-v1');assert.equal(t.name,'Sakura Valley');assert.ok(t.length>1600);assert.ok(t.length<2600);
 for(let s=0;s<t.length;s+=17){const p=t.at(s),q=t.project(p.x,p.z);assert.ok(q.distance<.1);assert.ok(Math.abs(q.s-s)<.2);}
 assert.ok(Math.hypot(t.at(0).x-t.at(t.length).x,t.at(0).z-t.at(t.length).z)<1e-8);
});
test('drive-based acceleration, braking to rest, then held brake reverse stay isolated from opponents',()=>{
 for(const weather of ['dry','wet']){
  const r=new Race({weather});r.phase='racing';
  for(let i=0;i<120;i++)r.drive(r.player,{throttle:1},1/120);
  assert.ok(r.player.forwardSpeed>2);
  let stopped=false;
  for(let i=0;i<240;i++){r.drive(r.player,{brake:1},1/120);if(Math.abs(r.player.forwardSpeed)<.6)stopped=true;}
  assert.ok(stopped,`${weather}: braking must pass through rest before reversing`);
  assert.ok(r.player.forwardSpeed<-1,`${weather}: held brake must engage reverse`);
  assert.ok(r.player.forwardSpeed>=-11.1);assert.equal(r.player.boostActive,false);
 }
});
test('countdown, pause and fixed-step safety',()=>{const r=new Race();r.start();stepFor(r,2);assert.equal(r.time,0);stepFor(r,1.1);assert.equal(r.phase,'racing');const time=r.time;r.pause();stepFor(r,1,{throttle:1,boost:true});assert.equal(r.time,time);assert.equal(r.player.boostActive,false);r.pause();r.step(NaN);assert.ok(Number.isFinite(r.time));});

test('three different models and traction and ABS flags respond to low grip',()=>{assert.equal(new Set(CARS.map(c=>c.topSpeed)).size,3);const r=new Race({weather:'wet'});r.phase='racing';r.player.damage.tires=.9;for(let i=0;i<100;i++)r.drive(r.player,{throttle:1},1/120);assert.equal(r.player.tc,true);const p=r.track.at(50);r.player.x=p.x;r.player.z=p.z;r.player.yaw=p.heading;r.player.vx=Math.sin(p.heading)*40;r.player.vz=Math.cos(p.heading)*40;r.player.speed=40;r.player.brake=1;r.drive(r.player,{brake:1},1/120);assert.equal(r.player.abs,true);});

test('repair returns to the validated gate, clears damage, and charges once',()=>{
 const r=new Race();r.phase='racing';r.player.damage.engine=.8;r.player.nitro=42;r.player.boostActive=true;r.player.drifting=true;r.player.driftAngle=.4;assert.equal(r.repair(),true);assert.equal(r.player.damage.engine,0);assert.equal(r.player.nitro,42);assert.equal(r.player.boostActive,false);assert.equal(r.player.drifting,false);assert.equal(r.player.driftAngle,0);assert.equal(r.player.penalty,PENALTIES.repair);assert.equal(r.player.nextGate,0);assert.equal(r.player.progress,-2);assert.equal(r.repair(),false);
 const later=new Race();later.phase='racing';later.player.nextGate=8;later.repair();assert.equal(later.player.nextGate,8);assert.equal(later.player.progress,7*later.track.gateSize+2);
});
test('skipped checkpoints invalidate the lap without penalty or relocation',()=>{const r=new Race();r.phase='racing';const p=r.track.at(r.track.length*.35);r.player.x=p.x;r.player.z=p.z;r.step(1/120);assert.equal(r.player.penalty,0);assert.equal(r.player.lapValid,false);assert.ok(r.player.progress>r.track.length*.2);assert.ok(r.player.nextGate>1);});

test('checkpoints count five complete laps, not the initial start crossing',()=>{
 const r=new Race();r.phase='racing';const c=r.player;
 for(let gate=0;gate<=r.track.gates*LAPS;gate++){const s=gate*r.track.gateSize;c.progress=s-.1;c.previousS=r.track.at(s-.1).s;c.hint=r.track.at(s).index;const p=r.track.at(s+.1);c.x=p.x;c.z=p.z;r.time=gate+1;r.advance(c,1/120);}
 assert.equal(c.finished,true);assert.equal(c.lapTimes.length,LAPS);assert.equal(c.nextGate,121);assert.equal(c.boostActive,false);
});
test('classification includes penalties and waits for all competitors',()=>{const r=new Race();r.phase='racing';r.player.finished=true;r.player.boostActive=true;r.firstFinish=0;r.time=100;r.step(1/120);assert.equal(r.phase,'racing');assert.equal(r.player.boostActive,false);r.cars.forEach((c,i)=>{c.finished=true;c.finishTime=100+i;c.penalty=0;});r.player.penalty=20;assert.equal(r.standings()[2],r.player);r.step(1/120);assert.equal(r.phase,'finished');});
function place(r,speed=0,steer=0,s=50){const c=r.player,p=r.track.at(s);c.x=p.x;c.z=p.z;c.yaw=p.heading;c.hint=p.index;c.vx=Math.sin(p.heading)*speed;c.vz=Math.cos(p.heading)*speed;c.speed=speed;c.steer=steer;c.steerTarget=steer;c.yawRate=0;return c;}

test('engine damage reduces acceleration on an identical surface',()=>{
 const clean=new Race(),damaged=new Race();place(clean);place(damaged);damaged.player.damage.engine=.8;clean.player.throttle=1;damaged.player.throttle=1;
 for(let i=0;i<120;i++)for(const r of [clean,damaged]){const p=r.track.at(50);r.player.x=p.x;r.player.z=p.z;r.drive(r.player,{throttle:1},1/120);}
 assert.ok(damaged.player.speed<clean.player.speed,`${damaged.player.speed} < ${clean.player.speed}`);
});

test('tire damage reduces cornering grip at equal speed and steering',()=>{
 const clean=new Race(),damaged=new Race();place(clean,30,.32);place(damaged,30,.32);damaged.player.damage.tires=.8;
 for(const r of [clean,damaged])r.drive(r.player,{steer:.32},1/120);
 assert.ok(damaged.player.slip>clean.player.slip,`slip ${damaged.player.slip} > ${clean.player.slip}`);
 assert.ok(damaged.player.slip<1&&clean.player.slip<1);
 assert.ok(Math.abs(damaged.player.yawRate)<Math.abs(clean.player.yawRate));
});
test('competitive AI finishes dry and wet five-lap races with all car profiles',{timeout:180000},()=>{
 for(const weather of ['dry','wet'])for(const carId of CARS.map(c=>c.id)){const r=new Race({weather,carId});r.start();for(let i=0;i<120*900&&r.phase!=='finished';i++)r.step(1/120,r.ai(r.player,1/120));assert.equal(r.phase,'finished',`${weather} ${carId}: laps ${r.cars.map(c=>c.lapTimes.length)}`);assert.ok(r.cars.every(c=>c.finished&&Number.isFinite(c.finishTime)));}
});
