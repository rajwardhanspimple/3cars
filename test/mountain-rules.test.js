import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,LAPS,PENALTIES} from '../src/sim.js';
import {mountainLayout,roadPose} from '../src/mountain-layout.js';

const place=(r,car,s,offset=0,speed=0)=>{const p=r.track.at(s,offset);car.x=p.x;car.z=p.z;car.yaw=p.heading;car.hint=p.index;car.progress=s;car.previousS=p.s;car.vx=Math.sin(p.heading)*speed;car.vz=Math.cos(p.heading)*speed;car.speed=speed;return car;};
const cross=(r,gate,valid=true)=>{const c=r.player,s=gate*r.track.gateSize;c.progress=s-.1;c.previousS=r.track.at(s-.1).s;c.hint=r.track.at(s).index;c.lapValid=valid;const p=r.track.at(s+.1);c.x=p.x;c.z=p.z;r.time=gate+10;r.advance(c,1/120);};

test('skipping a checkpoint while moving keeps position and invalidates only',()=>{
 const r=new Race();r.phase='racing';const c=r.player;place(r,c,5,0,30);const p=r.track.at(r.track.gateSize*3.5);c.x=p.x;c.z=p.z;r.step(1/120,{throttle:1});
 assert.equal(c.penalty,0);assert.equal(c.lapValid,false);assert.ok(c.progress>r.track.gateSize*2);assert.ok(c.nextGate>=3);assert.notEqual(Math.round(c.progress),-2);
});

test('missed first lap is invalid and the next clean lap can set best lap',()=>{
 const r=new Race();r.phase='racing';const c=r.player;
 cross(r,0,true);cross(r,3,false);cross(r,24,false);
 assert.equal(c.lapTimes.length,1);assert.equal(c.lapTimes[0].valid,false);assert.equal(c.bestLap,null);
 for(let g=25;g<=48;g++)cross(r,g,true);
 assert.equal(c.lapTimes.length,2);assert.equal(c.lapTimes[1].valid,true);assert.equal(c.bestLap,c.lapTimes[1].time);
});

test('duplicate finish and reverse oscillation do not create free lap records',()=>{
 const r=new Race();r.phase='racing';const c=r.player;cross(r,0,true);cross(r,24,true);const laps=c.lapTimes.length,next=c.nextGate;
 c.progress=24*r.track.gateSize+.2;c.previousS=r.track.at(.2).s;let p=r.track.at(-.2);c.x=p.x;c.z=p.z;r.advance(c,1/120);
 p=r.track.at(.2);c.x=p.x;c.z=p.z;r.advance(c,1/120);
 assert.equal(c.lapTimes.length,laps);assert.equal(c.nextGate,next);
});

test('manual R recovery remains a relocation with repair penalty',()=>{
 const r=new Race();r.phase='racing';const c=r.player;place(r,c,100,0,20);c.damage.engine=.5;const before=c.x;assert.equal(r.repair(),true);assert.equal(c.penalty,PENALTIES.repair);assert.equal(c.damage.engine,0);assert.notEqual(c.x,before);assert.ok(Number.isFinite(c.y)&&Number.isFinite(c.pitch)&&Number.isFinite(c.roll));
});

test('props move when knocked and reset for each race',()=>{
 const r=new Race();r.phase='racing';const prop=r.props[0];r.player.x=prop.x-3;r.player.z=prop.z;r.player.yaw=Math.PI/2;r.player.vx=28;r.player.vz=0;r.player.speed=28;r.sceneryCollisions();
 assert.ok(Math.hypot(prop.vx,prop.vz)>1);const movedX=prop.x;for(let i=0;i<60;i++)r.updateProps(1/60);assert.notEqual(prop.x,movedX);
 const fresh=new Race();assert.equal(fresh.props[0].vx,0);assert.equal(fresh.props[0].x,mountainLayout(fresh.track).props[0].x);
});

test('tree and retaining wall collisions are physical contacts, not teleports',()=>{
 const r=new Race();r.phase='racing';const tree=r.layout.trees[0];const c=r.player;c.x=tree.x;c.z=tree.z;c.vx=20;c.vz=0;c.speed=20;const beforePenalty=c.penalty;r.sceneryCollisions();assert.ok(Math.hypot(c.x-tree.x,c.z-tree.z)>=1.8);assert.equal(c.penalty,beforePenalty);assert.ok(c.impact>0);
 const wall=r.layout.walls[0];c.x=wall.x;c.z=wall.z;c.vx=15*Math.sin(wall.yaw);c.vz=15*Math.cos(wall.yaw);r.sceneryCollisions();assert.ok(Number.isFinite(c.x)&&Number.isFinite(c.z));
});

test('road pose is applied after drive and collisions',()=>{
 const r=new Race();r.phase='racing';place(r,r.player,80,0,20);r.step(1/120,{throttle:1});let pose=roadPose(r.player.x,r.player.z,r.player.yaw);assert.equal(r.player.y,pose.y);assert.equal(r.player.pitch,pose.pitch);assert.equal(r.player.roll,pose.roll);
});

test('race finish remains five laps for AI race', {timeout:180000},()=>{
 const r=new Race();r.start();for(let i=0;i<120*900&&r.phase!=='finished';i++)r.step(1/120,r.ai(r.player,1/120));assert.equal(r.phase,'finished');assert.ok(r.cars.every(c=>c.lapTimes.length===LAPS&&c.finished));
});
