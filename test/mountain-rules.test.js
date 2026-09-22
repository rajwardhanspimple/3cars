import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,LAPS,PENALTIES,BARRIER,angle} from '../src/sim.js';
import {mountainLayout,roadPose} from '../src/mountain-layout.js';

const place=(r,car,s,offset=0,speed=0)=>{const p=r.track.at(s,offset);car.x=p.x;car.z=p.z;car.yaw=p.heading;car.hint=p.index;car.progress=s;car.previousS=p.s;car.vx=Math.sin(p.heading)*speed;car.vz=Math.cos(p.heading)*speed;car.speed=speed;return car;};
const cross=(r,gate)=>{const c=r.player,s=gate*r.track.gateSize;c.progress=s-.1;c.previousS=r.track.at(s-.1).s;c.hint=r.track.at(s).index;const p=r.track.at(s+.1);c.x=p.x;c.z=p.z;r.time=gate+10;r.advance(c,1/120);};
const close=(actual,expected,tolerance=1e-8)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} differs from ${expected}`);
const planarEnergy=(body,mass)=>.5*mass*(body.vx**2+body.vz**2);
const carEnergy=c=>planarEnergy(c,c.model.mass)+.5*c.model.mass*c.model.wheelbase**2*.55*c.yawRate**2;
const measured=c=>Math.atan2(c.vx*Math.cos(c.yaw)-c.vz*Math.sin(c.yaw),Math.max(Math.abs(c.vx*Math.sin(c.yaw)+c.vz*Math.cos(c.yaw)),1));
const poseMatches=c=>{const p=roadPose(c.x,c.z,c.yaw);close(c.y,p.y);close(c.pitch,p.pitch);close(c.roll,p.roll);};

test('skipping a checkpoint while moving keeps position and invalidates only',()=>{
 const r=new Race();r.phase='racing';const c=r.player;place(r,c,5,0,30);const p=r.track.at(r.track.gateSize*3.5);c.x=p.x;c.z=p.z;r.step(1/120,{throttle:1});
 assert.equal(c.penalty,0);assert.equal(c.lapValid,false);assert.ok(c.progress>r.track.gateSize*2);assert.ok(c.nextGate>=3);assert.notEqual(Math.round(c.progress),-2);
});

test('missed first lap is invalid and the next clean lap can set best lap',()=>{
 const r=new Race();r.phase='racing';const c=r.player;
 cross(r,0);cross(r,3);
 assert.equal(c.lapValid,false);assert.equal(c.nextGate,4);
 for(let g=4;g<=24;g++)cross(r,g);
 assert.equal(c.lapTimes.length,1);assert.equal(c.lapTimes[0].valid,false);assert.equal(c.bestLap,null);assert.equal(c.lapValid,true);
 for(let g=25;g<=48;g++)cross(r,g);
 assert.equal(c.lapTimes.length,2);assert.equal(c.lapTimes[1].valid,true);assert.equal(c.bestLap,c.lapTimes[1].time);
});

test('duplicate finish and reverse oscillation do not create free lap records',()=>{
 const r=new Race();r.phase='racing';const c=r.player;cross(r,0);for(let g=1;g<=24;g++)cross(r,g);const laps=c.lapTimes.length,next=c.nextGate;
 c.progress=24*r.track.gateSize+.2;c.previousS=r.track.at(.2).s;let p=r.track.at(-.2);c.x=p.x;c.z=p.z;r.advance(c,1/120);
 p=r.track.at(.2);c.x=p.x;c.z=p.z;r.advance(c,1/120);
 assert.equal(c.lapTimes.length,laps);assert.equal(c.nextGate,next);
});

test('manual R recovery remains a relocation with repair penalty',()=>{
 const r=new Race();r.phase='racing';const c=r.player;place(r,c,100,0,20);c.damage.engine=.5;const before=c.x;assert.equal(r.repair(),true);assert.equal(c.penalty,PENALTIES.repair);assert.equal(c.damage.engine,0);assert.notEqual(c.x,before);assert.equal(c.forwardSpeed,0);assert.equal(c.lateralSpeed,0);assert.equal(c.yawRate,0);poseMatches(c);
});

test('props exchange mass-based momentum, stay knocked, settle, and reset per race',()=>{
 const r=new Race();r.phase='racing';const prop=r.props[0],c=r.player;
 c.x=prop.x-2.2;c.z=prop.z;c.yaw=Math.PI/2;c.vx=28;c.vz=0;c.speed=28;
 const x=prop.x,px=c.model.mass*c.vx+prop.mass*prop.vx,energy=planarEnergy(c,c.model.mass)+planarEnergy(prop,prop.mass);
 assert.equal(r.collideProp(c,prop),true);
 close(c.model.mass*c.vx+prop.mass*prop.vx,px,1e-7);
 assert.ok(planarEnergy(c,c.model.mass)+planarEnergy(prop,prop.mass)<=energy+1e-7);
 assert.ok(prop.vx>28);assert.ok(c.vx<28&&c.vx>27);assert.ok(prop.tilt>0);
 for(let i=0;i<600;i++)r.updateProps(1/60);
 assert.ok(prop.x>x);assert.equal(prop.vx,0);assert.equal(prop.vz,0);assert.ok(prop.tilt>1.4);assert.equal(prop.active,true);assert.ok(r.props.includes(prop));
 const fresh=new Race();assert.equal(fresh.props[0].vx,0);assert.equal(fresh.props[0].tilt,0);assert.equal(fresh.props[0].x,mountainLayout(fresh.track).props[0].x);
});

test('tree contact rebounds incoming momentum with only overlap correction',()=>{
 const r=new Race();r.phase='racing';const tree=r.layout.trees[0],c=r.player;
 c.x=tree.x-2.1;c.z=tree.z;c.yaw=Math.PI/2;c.vx=20;c.vz=0;c.speed=20;
 const x=c.x,energy=carEnergy(c),penalty=c.penalty;
 assert.equal(r.collideCircle(c,tree.x,tree.z,tree.radius),true);
 close(Math.hypot(c.x-tree.x,c.z-tree.z),1.9+tree.radius);
 close(Math.abs(c.x-x),1.9+tree.radius-2.1);assert.equal(c.penalty,penalty);
 assert.ok(c.impact>0);assert.ok(c.vx<0);assert.ok(carEnergy(c)<energy);poseMatches(c);
});

test('wall graze loses energy, scrubs tangential speed and imparts recoverable yaw',()=>{
 const r=new Race();r.phase='racing';const c=r.player,w=r.layout.walls[0],s=Math.sin(w.yaw),co=Math.cos(w.yaw);
 const nx=co,nz=-s,tx=s,tz=co,d=w.width/2+1.8;
 c.x=w.x+nx*d;c.z=w.z+nz*d;c.yaw=w.yaw;c.vx=tx*20-nx*6;c.vz=tz*20-nz*6;c.yawRate=0;
 const x=c.x,z=c.z,energy=carEnergy(c),speed=Math.hypot(c.vx,c.vz),yaw=c.yaw;
 assert.equal(r.collideWall(c,w),true);
 close(Math.hypot(c.x-x,c.z-z),.1);assert.ok(carEnergy(c)<energy);assert.ok(c.speed<speed);
 assert.ok(c.vx*tx+c.vz*tz<20);assert.ok(c.vx*nx+c.vz*nz>0);assert.ok(Math.abs(c.yawRate)>.01);
 assert.equal(c.yaw,yaw,'collision changes angular velocity, not heading instantaneously');poseMatches(c);
 r.drive(c,{},1/120);assert.ok(Math.abs(angle(c.yaw-yaw))>1e-6);assert.ok(Math.hypot(c.x-x,c.z-z)<.5);poseMatches(c);
});

test('wall containment uses the full nearest-face overlap even inside the OBB',()=>{
 const r=new Race(),c=r.player,w=r.layout.walls[0];c.x=w.x;c.z=w.z;c.vx=0;c.vz=0;c.yawRate=0;
 r.collideWall(c,w);
 close(Math.hypot(c.x-w.x,c.z-w.z),w.width/2+1.9);poseMatches(c);
});

test('guardrail contact uses the same dissipative static impulse without a checkpoint reset',()=>{
 const r=new Race();r.phase='racing';const c=place(r,r.player,80,BARRIER-1.1,0),p=r.track.project(c.x,c.z,c.hint);
 const nx=Math.cos(p.heading),nz=-Math.sin(p.heading),tx=Math.sin(p.heading),tz=Math.cos(p.heading);
 c.vx=nx*8+tx*20;c.vz=nz*8+tz*20;c.yawRate=0;
 const x=c.x,z=c.z,progress=c.progress,gate=c.nextGate,energy=carEnergy(c);
 assert.equal(r.guardrail(c,p),true);
 close(Math.hypot(c.x-x,c.z-z),p.distance-(BARRIER-1.2));assert.ok(carEnergy(c)<energy);
 assert.equal(c.progress,progress);assert.equal(c.nextGate,gate);assert.equal(c.penalty,0);poseMatches(c);
});

test('unequal-mass car contacts conserve both momentum components and dissipate energy',()=>{
 const r=new Race(),a=r.cars[0],b=r.cars[1];r.cars[2].finished=true;
 Object.assign(a,{x:0,z:0,vx:20,vz:4,yaw:Math.PI/2,yawRate:0});Object.assign(b,{x:3.6,z:0,vx:-2,vz:-3,yaw:Math.PI/2,yawRate:0});
 const ma=a.model.mass,mb=b.model.mass,px=ma*a.vx+mb*b.vx,pz=ma*a.vz+mb*b.vz,energy=carEnergy(a)+carEnergy(b);
 r.collisions();
 close(ma*a.vx+mb*b.vx,px,1e-7);close(ma*a.vz+mb*b.vz,pz,1e-7);
 close(b.vx-a.vx,.25*22);assert.ok(Math.abs(b.vz-a.vz)<7);assert.ok(carEnergy(a)+carEnergy(b)<energy);
 close(b.x-a.x,3.8);close(ma*a.x+mb*b.x,mb*3.6,1e-7);poseMatches(a);poseMatches(b);
 const ax=a.vx,bx=b.vx;r.collisions();close(a.vx,ax);close(b.vx,bx);
});

test('heading changes do not rewrite momentum and slip is measured rather than authored',()=>{
 const r=new Race();r.phase='racing';const c=place(r,r.player,50,0,25);
 c.yaw+=.35;const vx=c.vx,vz=c.vz;
 r.drive(c,{},1/120);
 close(c.driftAngle,measured(c));assert.ok(Math.abs(c.driftAngle)>.25);
 assert.ok(Math.hypot(c.vx-vx,c.vz-vz)<.6,'only finite tire forces may change world velocity');
 close(c.speed,Math.hypot(c.vx,c.vz));poseMatches(c);
});

test('handbrake rear saturation makes a forward-moving slide which counter-steering catches',()=>{
 for(const weather of ['dry','wet']){
  const r=new Race({weather});r.phase='racing';const c=place(r,r.player,50,0,25);
  const start={x:c.x,z:c.z,yaw:c.yaw};let peak=0,saturated=false;
  for(let i=0;i<90;i++){
   r.drive(c,{steer:.65,handbrake:true,throttle:.35},1/120);
   close(c.driftAngle,measured(c));peak=Math.max(peak,Math.abs(c.driftAngle));
   saturated ||= Math.abs(c.rearSlipAngle)>.45*9.81/70;
   assert.ok(Number.isFinite(c.yawRate)&&Number.isFinite(c.speed));
   if(c.drifting&&Math.abs(c.driftAngle)>.2)break;
  }
  assert.ok(peak>.14,`${weather}: measured slip ${peak}`);assert.ok(saturated);assert.equal(c.drifting,true);
  assert.ok(c.forwardSpeed>8);assert.ok((c.x-start.x)*Math.sin(start.yaw)+(c.z-start.z)*Math.cos(start.yaw)>2);
  assert.ok(Math.abs(angle(Math.atan2(c.vx,c.vz)-c.yaw))>.14);
  const slip=Math.abs(c.driftAngle);
  for(let i=0;i<240;i++){
   const steer=Math.max(-.7,Math.min(.7,c.driftAngle*1.3-c.yawRate*.18));
   r.drive(c,{steer,throttle:.25},1/120);close(c.driftAngle,measured(c));
  }
  assert.ok(Math.abs(c.driftAngle)<slip*.5,`${weather}: recovered slip ${c.driftAngle}`);
  assert.ok(Math.abs(c.yawRate)<.4);assert.ok(c.forwardSpeed>2);poseMatches(c);
 }
});

test('reverse comes from brake torque, inverts steering, and does not award a finish',()=>{
 const r=new Race();r.phase='racing';const c=place(r,r.player,2,0,0),startYaw=c.yaw;
 for(let i=0;i<360;i++){r.drive(c,{brake:1},1/120);r.advance(c,1/120);}
 assert.ok(c.forwardSpeed<-2&&c.forwardSpeed>=-11.1);assert.ok(c.progress<0);assert.equal(c.nextGate,0);assert.equal(c.lapTimes.length,0);
 assert.equal(c.boostActive,false);close(c.speed,Math.hypot(c.vx,c.vz));
 for(let i=0;i<30;i++)r.drive(c,{brake:1,steer:.5},1/120);
 assert.ok(angle(c.yaw-startYaw)<0);assert.ok(c.yawRate<0);poseMatches(c);
});

test('road pose is applied after drive and collisions',()=>{
 const r=new Race();r.phase='racing';place(r,r.player,80,0,20);r.step(1/120,{throttle:1});poseMatches(r.player);
});

test('race finish remains five laps for AI race', {timeout:180000},()=>{
 const r=new Race();r.start();for(let i=0;i<120*900&&r.phase!=='finished';i++)r.step(1/120,r.ai(r.player,1/120));assert.equal(r.phase,'finished');assert.ok(r.cars.every(c=>c.lapTimes.length===LAPS&&c.finished));
});
