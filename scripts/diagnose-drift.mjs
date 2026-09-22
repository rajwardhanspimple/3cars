// Temporary diagnostic. Measures real trajectories so tuning is not guesswork.
import {Race} from '../src/sim.js';
const deg=r=>(r*180/Math.PI).toFixed(1);
function pinned(race,speed,s=50){const c=race.player,p=race.track.at(s);c.x=p.x;c.z=p.z;c.yaw=p.heading;c.hint=p.index;c.vx=Math.sin(p.heading)*speed;c.vz=Math.cos(p.heading)*speed;c.speed=speed;c.progress=s;c.previousS=p.s;return c;}
function run(label,{speed,input,seconds,hz=120,s=50,follow=null}){
 const race=new Race();race.phase='racing';const car=pinned(race,speed,s),start=car.yaw;let turned=0,prev=car.yaw,maxSlip=0,maxYawRate=0;
 const samples=[],steps=Math.ceil(seconds*hz);
 for(let i=0;i<steps;i++){
  const p=race.track.at(s);car.x=p.x;car.z=p.z;car.hint=p.index;
  const t=i/hz;race.drive(car,follow?follow(t,car):input,1/hz);
  let d=car.yaw-prev;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;turned+=d;prev=car.yaw;
  maxSlip=Math.max(maxSlip,Math.abs(car.driftAngle));maxYawRate=Math.max(maxYawRate,Math.abs(car.yawRate));
  if(i%Math.round(hz/10)===0||i===steps-1)samples.push(`t=${t.toFixed(2)} slip=${deg(car.driftAngle)} yawTurned=${deg(turned)} yawRate=${car.yawRate.toFixed(2)} spd=${car.speed.toFixed(1)} fwd=${car.forwardSpeed.toFixed(1)} drifting=${car.drifting}`);
 }
 console.log(`\n== ${label} (${hz}Hz) ==`);
 console.log(samples.join('\n'));
 console.log(`RESULT slipDeg=${deg(car.driftAngle)} maxSlipDeg=${deg(maxSlip)} totalYawDeg=${deg(turned)} maxYawRate=${maxYawRate.toFixed(2)} speed=${car.speed.toFixed(1)} drifting=${car.drifting} spun=${Math.abs(turned)>Math.PI/2}`);
 return car;
}
run('A high-speed cornering, no handbrake',{speed:60,input:{throttle:1,steer:.9},seconds:1});
run('B handbrake drift 0.5s',{speed:26,input:{throttle:.6,steer:1,handbrake:true},seconds:.5});
run('B handbrake drift 0.5s at 30Hz',{speed:26,input:{throttle:.6,steer:1,handbrake:true},seconds:.5,hz:30});
run('C handbrake held 1.5s',{speed:26,input:{throttle:.6,steer:1,handbrake:true},seconds:1.5});
run('D drift then release and centre wheel',{speed:26,seconds:2,follow:t=>t<.5?{throttle:.6,steer:1,handbrake:true}:{throttle:.4,steer:0,handbrake:false}});
run('E drift then counter-steer',{speed:26,seconds:2,follow:t=>t<.5?{throttle:.6,steer:1,handbrake:true}:{throttle:.4,steer:-.6,handbrake:false}});
run('F moderate corner, no handbrake',{speed:30,input:{throttle:.5,steer:.45},seconds:1.5});
