import test from 'node:test';
import assert from 'node:assert/strict';
import {CIRCUIT,trackBounds} from '../src/circuit.js';
import {Race,makeTrack,CARS,HALF_WIDTH,BARRIER} from '../src/sim.js';
import {mountainLayout,roadPose} from '../src/mountain-layout.js';

const orient=(a,b,c)=>Math.sign((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x));
const intersects=(a,b,c,d)=>{
 const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
 return o1!==0&&o2!==0&&o3!==0&&o4!==0&&o1!==o2&&o3!==o4;
};
const place=(r,car,s,offset=0,speed=0)=>{
 const p=r.track.at(s,offset);car.x=p.x;car.z=p.z;car.yaw=p.heading;car.hint=p.index;car.progress=s;car.previousS=p.s;car.vx=Math.sin(p.heading)*speed;car.vz=Math.cos(p.heading)*speed;car.speed=speed;car.steer=0;car.steerTarget=0;car.driftAngle=0;car.drifting=false;car.handbrake=false;if(car.aiDrift){car.aiDrift.active=false;car.aiDrift.cooldown=0;car.aiDrift.recover=0;}return car;
};

test('Sakura Valley track metadata and bounds come from the shared circuit',()=>{
 const t=makeTrack();
 assert.equal(t.id,CIRCUIT.id);assert.equal(t.name,CIRCUIT.name);assert.equal(t.points.length,CIRCUIT.controls.length*CIRCUIT.samplesPerSegment);
 assert.deepEqual(t.bounds,trackBounds(t.points));
 assert.ok(t.bounds.width>500&&t.bounds.width<700);assert.ok(t.bounds.depth>400&&t.bounds.depth<600);
 assert.equal(t.gates,24);assert.ok(t.gateSize>60&&t.gateSize<110);
});

test('Sakura Valley centerline has no self-crossing or degenerate corridor samples',()=>{
 const t=makeTrack();
 for(const p of t.points){assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.s)&&Number.isFinite(p.heading));assert.ok(p.len>.05&&p.len<8);}
 for(let i=0;i<t.points.length;i++)for(let j=i+2;j<t.points.length;j++){
  if(i===0&&j===t.points.length-1) continue;
  if(j===i+1) continue;
  assert.equal(intersects(t.points[i],t.points[(i+1)%t.points.length],t.points[j],t.points[(j+1)%t.points.length]),false,`segments ${i} and ${j} cross`);
 }
 for(let s=0;s<t.length;s+=11){
  const left=t.at(s,-HALF_WIDTH),center=t.at(s),right=t.at(s,HALF_WIDTH);
  assert.ok(Math.hypot(left.x-right.x,left.z-right.z)>HALF_WIDTH*1.8);
  assert.ok(t.project(center.x,center.z).distance<.1);
 }
});

test('mountain layout exposes deterministic render-matched scenery transforms',()=>{
 const t=makeTrack(),a=mountainLayout(t),b=mountainLayout(t);
 assert.deepEqual(a,b);assert.ok(a.trees.length>80);assert.ok(a.props.length>10);assert.ok(a.walls.length>10);
 for(const item of [...a.trees,...a.props,...a.walls]){const pose=roadPose(item.x,item.z,item.yaw);assert.equal(item.y,pose.y);assert.ok(Number.isFinite(item.yaw));}
});

test('manual player never gets automatic handbrake drift',()=>{
 const r=new Race();r.phase='racing';const c=place(r,r.player,r.track.length*.18,0,24);
 for(let i=0;i<180;i++){r.step(1/120,{throttle:.7,steer:.65,boost:false});assert.equal(c.handbrake,false);}
 assert.equal(c.drifting,false);
});

test('AI refuses handbrake drift on straights and near track limits',()=>{
 const r=new Race({weather:'dry'});r.phase='racing';const car=r.cars[1];
 let straight=0;
 for(let s=0;s<r.track.length;s+=5) if(Math.abs(r.track.curvature(s))<.002&&Math.abs(r.track.curvature(s+20))<.002){straight=s;break;}
 place(r,car,straight,0,30);assert.equal(r.ai(car,1/120).handbrake,false);
 const edge=place(r,car,r.track.length*.2,HALF_WIDTH-.2,24);assert.equal(r.ai(edge,1/120).handbrake,false);
 const barrier=place(r,car,r.track.length*.2,BARRIER-1,24);assert.equal(r.ai(barrier,1/120).handbrake,false);
 const tree=r.layout.trees[0];car.x=tree.x+2;car.z=tree.z;assert.equal(r.ai(car,1/120).handbrake,false);
});

test('race simulation keeps car state finite in dry and wet scenic races',()=>{
 for(const weather of ['dry','wet']){const r=new Race({weather});r.start();for(let i=0;i<120*90;i++){r.step(1/120,r.ai(r.player,1/120));for(const c of r.cars){assert.ok(Number.isFinite(c.x)&&Number.isFinite(c.z)&&Number.isFinite(c.yaw)&&Number.isFinite(c.speed)&&Number.isFinite(c.progress));assert.ok(r.track.project(c.x,c.z,c.hint).distance<=BARRIER+.5,`${weather} ${c.name} outside barrier`);assert.ok(Number.isFinite(c.y)&&Number.isFinite(c.pitch)&&Number.isFinite(c.roll));}}}
});

test('AI uses bounded handbrake drifts during full dry and wet races without stopping completion',{timeout:120000},()=>{
 for(const weather of ['dry','wet']){const r=new Race({weather});r.start();let driftSeconds=0,straightSeconds=0;
  for(let i=0;i<120*900&&r.phase!=='finished';i++){
   r.step(1/120,r.ai(r.player,1/120));
   for(const c of r.cars.slice(1)){
    if(c.handbrake){driftSeconds+=1/120;const k=Math.abs(r.track.curvature(c.progress+18));assert.ok(k>.006,`${weather} drift on straight ${k}`);assert.ok(c.speed<=(weather==='wet'?35:41));assert.ok(r.track.project(c.x,c.z,c.hint).distance<=HALF_WIDTH+.5);}
    if(Math.abs(r.track.curvature(c.progress+20))<.002&&c.handbrake) straightSeconds+=1/120;
   }
  }
  assert.equal(r.phase,'finished',`${weather}: laps ${r.cars.map(c=>c.lapTimes.length)}`);
  assert.ok(driftSeconds>.5,`${weather}: expected AI drift time`);
  assert.equal(straightSeconds,0);
 }
});

test('all three selectable profiles can load Sakura Valley',()=>{
 for(const carId of CARS.map(c=>c.id)){const r=new Race({carId});assert.equal(r.track.id,CIRCUIT.id);assert.equal(r.cars[0].model.id,carId);}
});
