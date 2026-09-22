// Direct Node diagnostic. Logs measured trajectories; does not run CI.
import {Race,angle} from '../src/sim.js';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
console.log('sim.js SHA256',createHash('sha256').update(readFileSync(new URL('../src/sim.js',import.meta.url))).digest('hex'));
const deg=r=>(r*180/Math.PI).toFixed(2);
function pinned(race,speed,s=50){const c=race.player,p=race.track.at(s);c.x=p.x;c.z=p.z;c.yaw=p.heading;c.hint=p.index;c.vx=Math.sin(p.heading)*speed;c.vz=Math.cos(p.heading)*speed;c.speed=speed;c.progress=s;c.previousS=p.s;return c;}
function run(label,{speed,input,seconds,hz=120,s=50,follow=null}){
 const race=new Race();race.phase='racing';const car=pinned(race,speed,s);let turned=0,prev=car.yaw,maxSlip=0,maxTravelSlip=0,maxYawRate=0,minSpeed=speed;
 const samples=[],late=[],steps=Math.round(seconds*hz);
 for(let i=0;i<steps;i++){
  const p=race.track.at(s);car.x=p.x;car.z=p.z;car.hint=p.index;
  const t=i/hz;race.drive(car,follow?follow(t,car):input,1/hz);
  turned+=angle(car.yaw-prev);prev=car.yaw;
  const travelSlip=Math.abs(angle(Math.atan2(car.vx,car.vz)-car.yaw));
  maxSlip=Math.max(maxSlip,Math.abs(car.driftAngle));maxTravelSlip=Math.max(maxTravelSlip,travelSlip);maxYawRate=Math.max(maxYawRate,Math.abs(car.yawRate));minSpeed=Math.min(minSpeed,car.speed);
  if((i+1)/hz>=seconds-.4)late.push(Math.abs(car.driftAngle));
  if(i%Math.round(hz/10)===0||i===steps-1)samples.push(`t=${((i+1)/hz).toFixed(3)} slip=${deg(car.driftAngle)} yawTurned=${deg(turned)} yawRate=${car.yawRate.toFixed(3)} spd=${car.speed.toFixed(3)} fwd=${car.forwardSpeed.toFixed(3)} frontSlip=${deg(car.frontSlipAngle)} rearSlip=${deg(car.rearSlipAngle)} handbrake=${car.handbrake} drifting=${car.drifting} surface=${car.surface}`);
 }
 console.log(`\n== ${label} (${hz}Hz) ==`);
 console.log(samples.join('\n'));
 // Heading can turn through 90 degrees on a gripped corner. Report it separately
 // from velocity pointing sideways/backwards relative to the nose.
 console.log(`RESULT slipDeg=${deg(car.driftAngle)} maxSlipDeg=${deg(maxSlip)} totalYawDeg=${deg(turned)} maxYawRate=${maxYawRate.toFixed(3)} speed=${car.speed.toFixed(3)} minSpeed=${minSpeed.toFixed(3)} lateSlipRange=${deg(Math.min(...late))}..${deg(Math.max(...late))} drifting=${car.drifting} headingOver90=${Math.abs(turned)>Math.PI/2} velocityOver90=${maxTravelSlip>Math.PI/2}`);
 return car;
}
for(const hz of [120,30]){
 run('A high-speed cornering, no handbrake',{hz,speed:60,input:{throttle:1,steer:.9},seconds:1});
 run('B handbrake drift 0.5s',{hz,speed:26,input:{throttle:.6,steer:1,handbrake:true},seconds:.5});
 run('C handbrake held 1.5s',{hz,speed:26,input:{throttle:.6,steer:1,handbrake:true},seconds:1.5});
 run('D drift then release and centre wheel',{hz,speed:26,seconds:2,follow:t=>t<.5?{throttle:.6,steer:1,handbrake:true}:{throttle:.4,steer:0,handbrake:false}});
 run('E drift then counter-steer',{hz,speed:26,seconds:2,follow:t=>t<.5?{throttle:.6,steer:1,handbrake:true}:{throttle:.4,steer:-.6,handbrake:false}});
 run('F moderate corner, no handbrake',{hz,speed:30,input:{throttle:.5,steer:.45},seconds:1.5});
 run('G long hold then release, centre and lift (arcade assertion)',{hz,speed:26,seconds:2.5,follow:t=>t<1.5?{throttle:.6,steer:1,handbrake:true}:{throttle:0,steer:0,handbrake:false}});
}
