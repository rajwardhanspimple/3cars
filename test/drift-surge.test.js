import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,ARCADE,angle} from '../src/sim.js';
const deg=n=>n*180/Math.PI;
function fixture(){const r=new Race();r.phase='racing';const c=r.player,p=r.track.at(50);Object.assign(c,{x:p.x,z:p.z,yaw:p.heading,hint:p.index,vx:Math.sin(p.heading)*26,vz:Math.cos(p.heading)*26,speed:26});return r;}
function trace(r,seconds,input,hz){
 const c=r.player,p=r.track.at(50),samples=[];
 for(let i=0;i<Math.round(seconds*hz);i++){
  c.x=p.x;c.z=p.z;c.hint=p.index;const yaw=c.yaw;r.drive(c,input,1/hz);
  const u=c.vx*Math.sin(c.yaw)+c.vz*Math.cos(c.yaw),v=c.vx*Math.cos(c.yaw)-c.vz*Math.sin(c.yaw);
  assert.ok(Math.abs(c.driftAngle-Math.atan2(v,Math.max(Math.abs(u),1)))<1e-10);
  assert.ok([c.speed,c.yawRate,c.driftAngle].every(Number.isFinite));
  samples.push({slip:Math.abs(deg(c.driftAngle)),speed:c.speed,yawRate:c.yawRate,turn:angle(c.yaw-yaw),forward:u});
 }
 return samples;
}
test('nitro balance constants are unchanged',()=>{assert.deepEqual([ARCADE.nitroDrain,ARCADE.nitroRefill,ARCADE.nitroCooldown,ARCADE.nitroAccel,ARCADE.nitroTopSpeed],[25,18,2,10,1.18]);});
// These are target assertions, not measurements. Keep the existing arcade and
// six dry/wet/profile five-lap AI tests unchanged and run them before release.
for(const hz of [30,120])test(`drift target: prompt onset, bounded hold and clean release (${hz}Hz)`,()=>{
 const r=fixture(),c=r.player,onset=trace(r,.5,{throttle:.6,steer:1,handbrake:true},hz);
 assert.ok(onset.at(-1).slip>=18&&onset.at(-1).slip<=24,`onset ${onset.at(-1).slip}deg`);
 const held=trace(r,1,{throttle:.6,steer:1,handbrake:true},hz),all=[...onset,...held];
 assert.ok(all.every(s=>s.slip<45&&Math.abs(s.yawRate)<3&&s.speed>15&&s.forward>0));
 assert.ok(Math.abs(deg(all.reduce((n,s)=>n+s.turn,0)))<150);
 const plateau=held.slice(Math.round(.6*hz));assert.ok(plateau.every(s=>s.slip>=20&&s.slip<=35),`plateau ${plateau.map(s=>s.slip)}`);
 trace(r,1,{throttle:0,steer:0,handbrake:false},hz);assert.ok(Math.abs(deg(c.driftAngle))<5);assert.ok(Math.abs(c.yawRate)<.2);
 const counter=fixture();trace(counter,.5,{throttle:.6,steer:1,handbrake:true},hz);trace(counter,1,{throttle:.4,steer:-.6,handbrake:false},hz);assert.ok(Math.abs(deg(counter.player.driftAngle))<5);
});
test('free-running drift integration is identical at 30/120Hz',()=>{
 const a=fixture(),b=fixture();
 for(const input of [{throttle:.6,steer:1,handbrake:true},{throttle:.4,steer:-.6,handbrake:false}]){
  for(let i=0;i<30;i++){a.drive(a.player,input,1/30);for(let j=0;j<4;j++)b.drive(b.player,input,1/120);}
  for(const key of ['x','z','vx','vz','yaw','yawRate','driftAngle','speed','nitro'])assert.ok(Math.abs(a.player[key]-b.player[key])<1e-10,`${key}: ${a.player[key]} vs ${b.player[key]}`);
 }
});
