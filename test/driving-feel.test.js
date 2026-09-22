import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,CHASSIS,wheelLoads,tireLateralAcceleration,PENALTIES} from '../src/sim.js';
import {surfaceRoughness,roadPose} from '../src/mountain-layout.js';
const share=[.26,.26,.24,.24];
const near=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const place=(r,s=50,speed=25,offset=0)=>{const c=r.player,p=r.track.at(s,offset);Object.assign(c,{x:p.x,z:p.z,yaw:p.heading,hint:p.index,progress:s,previousS:p.s,vx:Math.sin(p.heading)*speed,vz:Math.cos(p.heading)*speed,speed});return c;};
const fields=['wheelLoad','wheelSlip','wheelSpin','wheelContact','suspension'];

test('contract fields use independent four-wheel arrays and reset on manual R',()=>{
 const r=new Race();r.phase='racing';
 for(const c of r.cars){for(const field of fields)assert.equal(c[field].length,4);for(const key of ['bodyHeave','bodyPitch','bodyRoll','verticalG','roughness'])assert.ok(Number.isFinite(c[key]));}
 r.player.wheelSpin[0]=20;assert.equal(r.cars[1].wheelSpin[0],0);
 assert.equal(r.repair(),true);assert.equal(r.player.penalty,PENALTIES.repair);
 assert.deepEqual(r.player.wheelSpin,[0,0,0,0]);assert.deepEqual(r.player.suspension,[0,0,0,0]);assert.deepEqual(r.player.wheelLoad,[1,1,1,1]);
});

test('static shares and acceleration transfer conserve weight with correct direction',()=>{
 const c=new Race().player;assert.deepEqual(wheelLoads(c,0,0),[1,1,1,1]);
 const braking=wheelLoads(c,-8,0),accel=wheelLoads(c,8,0),right=wheelLoads(c,0,20),left=wheelLoads(c,0,-20);
 assert.ok(braking[0]>1&&braking[1]>1&&braking[2]<1&&braking[3]<1);
 assert.ok(accel[0]<1&&accel[2]>1);
 assert.ok(right[0]>right[1]&&right[2]>right[3]);assert.ok(left[0]<left[1]&&left[2]<left[3]);
 for(const loads of [braking,accel,right,left,wheelLoads(c,-100,100)]){near(loads.reduce((sum,l,i)=>sum+l*share[i],0),1);assert.ok(loads.every(n=>n>=0));}
});

test('unloaded inside tire reduces actual axle force even with weight on outside tire',()=>{
 const force=load=>Math.abs(tireLateralAcceleration(3,70,.4,1,load,.24));
 assert.equal(force(0),0);assert.ok(force(.2)<force(1));
 assert.ok(force(2)+force(0)<2*force(1),'load sensitivity must not recover all lost grip on outside tire');
 const balanced=2*force(1),outside=force(2);assert.ok(outside<balanced);
 // The production drive path calls this same per-tire function separately
 // for all four wheel loads and sums the front and rear forces for yaw torque.
});

test('max braking produces front compression and visibly locked wheels',()=>{
 const r=new Race();r.phase='racing';const c=place(r,50,30);c.brake=1;c.wheelSpin.fill(30/CHASSIS.wheelRadius);
 for(let i=0;i<72;i++){const p=r.track.at(50);c.x=p.x;c.z=p.z;r.drive(c,{brake:1,reverse:false},1/120);}
 assert.ok(c.forwardSpeed>2);assert.ok(c.wheelSpin.every(n=>Math.abs(n)<.05));assert.ok(c.wheelSlip.every(n=>n>.9));
 assert.ok(c.wheelLoad[0]>c.wheelLoad[2]);assert.ok(c.suspension[0]+c.suspension[1]>c.suspension[2]+c.suspension[3]);assert.ok(c.bodyPitch>0);
});

test('handbrake locks rear while front rolls and rear can spin under low-grip power',()=>{
 const r=new Race();r.phase='racing';const c=place(r);c.wheelSpin.fill(25/CHASSIS.wheelRadius);
 for(let i=0;i<60;i++)r.drive(c,{handbrake:true,throttle:.6},1/120);
 assert.ok(Math.abs(c.wheelSpin[0])>10);assert.equal(c.wheelSpin[2],0);assert.equal(c.wheelSpin[3],0);
 c.handbrake=false;c.brake=0;c.wheelContact.fill('dirt');c.wheelLoad.fill(.25);
 for(let i=0;i<120;i++)r.updateWheelSpin(c,1/120,10,0,12,0,1);
 assert.ok(c.wheelSpin[2]>10/CHASSIS.wheelRadius);assert.ok(c.wheelSlip[2]>c.wheelSlip[0]);
});

test('each wheel samples its own surface and grip including mixed shoulder contact',()=>{
 const r=new Race(),c=place(r,50,0,9);r.sampleWheels(c);
 assert.equal(c.wheelContact[0],'asphalt');assert.equal(c.wheelContact[2],'asphalt');
 assert.equal(c.wheelContact[1],'grass');assert.equal(c.wheelContact[3],'grass');
 assert.ok(Math.abs(tireLateralAcceleration(1*.47,65,.2,1,1,.26))<Math.abs(tireLateralAcceleration(1,65,.2,1,1,.26)));
 place(r,50,0,9.2-CHASSIS.trackWidth/2);r.sampleWheels(c);assert.ok(c.wheelContact.includes('curb'));
});

test('shared roughness is deterministic, bounded and coarser off-road',()=>{
 let asphalt=0,dirt=0;
 for(let i=0;i<1000;i++)for(const surface of ['asphalt','curb','grass','dirt']){
  const x=i*.37,z=i*.19,p=surfaceRoughness(x,z,surface);assert.deepEqual(p,surfaceRoughness(x,z,surface));
  assert.ok(Math.abs(p.height)<.04);assert.ok(p.roughness>=0&&p.roughness<=1);
  if(surface==='asphalt')asphalt+=p.height*p.height;if(surface==='dirt')dirt+=p.height*p.height;
 }
 assert.ok(dirt>asphalt*3);
});

test('road forcing moves the sprung body and a stationary car settles without pose double-counting',()=>{
 const r=new Race(),c=place(r,50,25);const values=[];
 for(let i=0;i<360;i++){
  const p=r.track.at(50+i*.2);c.x=p.x;c.z=p.z;c.yaw=p.heading;c.hint=p.index;r.sampleWheels(c);r.updateSuspension(c,1/120,0,0);values.push(c.bodyHeave);
  assert.ok(Math.abs(c.bodyHeave)<.05);assert.ok(c.suspension.every(n=>Math.abs(n)<=CHASSIS.travel+1e-9));
 }
 assert.ok(Math.max(...values)-Math.min(...values)>.0001);
 const road=[...c.chassis.road];for(let i=0;i<600;i++)r.updateSuspension(c,1/120,0,0);
 assert.ok(c.chassis.velocity.every(n=>Math.abs(n)<1e-6));c.chassis.height.forEach((n,i)=>near(n,road[i],1e-6));
 assert.ok(Math.abs(c.verticalG)<1e-5);
 c.vx=0;c.vz=0;r.drive(c,{},1/120);const pose=roadPose(c.x,c.z,c.yaw);near(c.pitch,pose.pitch);near(c.roll,pose.roll);near(c.y,pose.y);
});

test('suspension has bounded travel and remains finite under repeated mixed forcing',()=>{
 const r=new Race(),c=r.player;
 for(let i=0;i<7200;i++){
  c.chassis.road=c.chassis.road.map((_,j)=>surfaceRoughness(i*.19,j*3,'dirt').height);
  r.updateSuspension(c,1/120,Math.sin(i*.03)*18,Math.cos(i*.023)*45);
  for(const value of [...c.wheelLoad,...c.suspension,c.bodyHeave,c.bodyPitch,c.bodyRoll,c.verticalG])assert.ok(Number.isFinite(value));
  assert.ok(c.suspension.every(n=>Math.abs(n)<=CHASSIS.travel+1e-8));assert.ok(Math.abs(c.bodyPitch)<.2&&Math.abs(c.bodyRoll)<.3);
 }
});

test('30Hz and 120Hz drive and race stepping publish matching physical state',()=>{
 const slow=new Race(),fast=new Race();slow.phase=fast.phase='racing';place(slow);place(fast);
 for(let frame=0;frame<60;frame++){
  const input={throttle:.5,steer:.2,handbrake:frame>=12&&frame<21};slow.step(1/30,input);for(let j=0;j<4;j++)fast.step(1/120,input);
  for(let i=0;i<3;i++){
   const a=slow.cars[i],b=fast.cars[i];
   for(const field of ['x','z','yaw','vx','vz','bodyHeave','bodyPitch','bodyRoll','verticalG','roughness','driftAngle'])near(a[field],b[field],1e-7);
   for(const field of fields)if(field==='wheelContact')assert.deepEqual(a[field],b[field]);else a[field].forEach((n,k)=>near(n,b[field][k],1e-7));
  }
 }
});
