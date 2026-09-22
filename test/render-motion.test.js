import test from 'node:test';
import assert from 'node:assert/strict';
import {RenderMotion,FollowCamera,shortestAngle} from '../src/render-motion.js';
const near=(actual,expected,tolerance=1e-7)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
const makeRace=()=>({phase:'racing',time:0,cars:[0,1,2].map(index=>({index,x:0,y:0,z:index*4,yaw:0,pitch:0,roll:0,vx:30,vz:0,speed:30,steer:0,steeringAngle:0,driftAngle:0,throttle:1,brake:0,slip:0,yawRate:0,repairCooldown:0,boostActive:false,drifting:false}))});
function snapshot(race,time){race.time=time;for(const car of race.cars)car.x=time*30;}

for(const fps of [60,120])for(const tick of [1/30,1/25])test(`${Math.round(1/tick)} Hz snapshots interpolate at ${fps} FPS without stop-start motion`,()=>{
 const race=makeRace(),motion=new RenderMotion(),step=30/fps;let previous=0;
 motion.sample(race,0);
 for(let frame=1;frame<=fps*2;frame++){
  const wall=frame/fps,stateTime=Math.floor((wall+1e-9)/tick)*tick;snapshot(race,stateTime);
  const before=JSON.stringify(race),cars=motion.sample(race,wall*1000),x=cars[0].x;
  assert.equal(JSON.stringify(race),before,'renderer must not alter authoritative physics');
  if(wall>.2){const delta=x-previous;assert.ok(delta>step*.75&&delta<step*1.25,`frame ${frame}, delta ${delta}, expected near ${step}`);}
  for(const car of cars){near(car.x,x);near(car.z,car.index*4);}
  assert.ok(x<=race.cars[0].x+1e-7,'never predict beyond known physics');previous=x;
 }
 assert.ok(motion.frames.length<=12,'snapshot buffer stays bounded');
});

test('yaw crosses the angle wrap on the short path',()=>{
 const race=makeRace(),motion=new RenderMotion();race.cars[0].yaw=179*Math.PI/180;motion.sample(race,0);
 snapshot(race,.04);race.cars[0].yaw=-179*Math.PI/180;motion.sample(race,40);
 const yaw=motion.sample(race,60)[0].yaw;assert.ok(Math.abs(yaw)>3,'must not rotate through zero');near(shortestAngle(179*Math.PI/180,-179*Math.PI/180),2*Math.PI/180);
});

test('missing updates hold the latest pose without runaway extrapolation',()=>{
 const race=makeRace(),motion=new RenderMotion();motion.sample(race,0);snapshot(race,.04);motion.sample(race,40);
 for(let now=60;now<=1000;now+=20){const car=motion.sample(race,now)[0];assert.ok(car.x<=1.2+1e-7);}
 near(motion.display[0].x,1.2);
});

test('pause freezes the displayed pose across a long tab pause and resumes without a jump',()=>{
 const race=makeRace(),motion=new RenderMotion();motion.sample(race,0);snapshot(race,.04);motion.sample(race,40);
 const frozen=motion.sample(race,60)[0].x;race.phase='paused';snapshot(race,.06);
 near(motion.sample(race,60000)[0].x,frozen);near(motion.sample(race,60020)[0].x,frozen);
 race.phase='racing';near(motion.sample(race,60040)[0].x,frozen);assert.ok(motion.sample(race,60060)[0].x>=frozen);
});

test('repair snaps only the repaired car and resets the player camera',()=>{
 const race=makeRace(),motion=new RenderMotion();motion.sample(race,0);snapshot(race,.04);motion.sample(race,40);
 race.cars[0].x=-100;race.cars[0].speed=0;race.cars[0].repairCooldown=3;
 const cars=motion.sample(race,60);near(cars[0].x,-100);assert.equal(motion.resetCamera,true);assert.ok(cars[1].x>=0&&cars[1].x<=1.2);
});

test('nearby repair still snaps immediately and does not smooth through a checkpoint',()=>{
 const race=makeRace(),motion=new RenderMotion();motion.sample(race,0);snapshot(race,.04);motion.sample(race,40);
 race.cars[0].x=2;race.cars[0].repairCooldown=3;near(motion.sample(race,60)[0].x,2);assert.equal(motion.resetCamera,true);
});

test('restart, large time gaps, and finish discard stale interpolation',()=>{
 const race=makeRace(),motion=new RenderMotion();motion.sample(race,0);snapshot(race,.04);motion.sample(race,40);
 snapshot(race,2);near(motion.sample(race,2000)[0].x,60);assert.equal(motion.resetCamera,true);
 const restarted=makeRace();near(motion.sample(restarted,2020)[0].x,0);assert.equal(motion.resetCamera,true);
 restarted.phase='finished';snapshot(restarted,.1);near(motion.sample(restarted,2040)[0].x,3);
});

test('camera and look target translate with the same rendered car anchor',()=>{
 const camera=new FollowCamera(),offset={x:0,y:4,z:-10},look={x:0,y:1,z:8};
 for(let frame=0;frame<120;frame++){
  const anchor={x:frame*.25,z:frame*.5},result=camera.update(anchor,offset,look,1/60);
  near(result.position.x-anchor.x,0);near(result.position.z-anchor.z,-10);near(result.target.x-anchor.x,0);near(result.target.z-anchor.z,8);
 }
});

test('camera height follows the rendered anchor elevation',()=>{
 const camera=new FollowCamera(),result=camera.update({x:2,y:5,z:3},{x:1,y:4,z:-6},{x:2,y:1,z:7},1/60,true);
 near(result.position.x,3);near(result.position.y,9);near(result.position.z,-3);
 near(result.target.x,4);near(result.target.y,6);near(result.target.z,10);
});

test('camera smooths steering look changes, freezes at zero dt, and snaps after reset',()=>{
 const camera=new FollowCamera(),anchor={x:0,z:0},offset={x:0,y:4,z:-10};camera.update(anchor,offset,{x:0,y:1,z:8},0);
 const result=camera.update(anchor,offset,{x:3,y:1,z:8},1/60);assert.ok(result.target.x>0&&result.target.x<1);
 const frozen=camera.update(anchor,offset,{x:-3,y:1,z:8},0);near(frozen.target.x,result.target.x);
 near(camera.update(anchor,offset,{x:-3,y:1,z:8},0,true).target.x,-3);
});

test('camera damping is independent of render frame rate',()=>{
 const run=fps=>{const c=new FollowCamera(),a={x:0,z:0},o={x:0,y:4,z:-10};c.update(a,o,{x:0,y:1,z:8},0);let result;for(let i=0;i<fps;i++)result=c.update(a,o,{x:3,y:1,z:8},1/fps);return result;};
 near(run(30).target.x,run(120).target.x);
});

test('y, pitch, and roll interpolate uphill and freeze while paused',()=>{
 const race=makeRace(),motion=new RenderMotion();motion.sample(race,0);
 snapshot(race,.04);Object.assign(race.cars[0],{y:4,pitch:.4,roll:.2});motion.sample(race,40);
 const climbing=motion.sample(race,60)[0];near(climbing.y,1);near(climbing.pitch,.1);near(climbing.roll,.05);
 race.phase='paused';Object.assign(race.cars[0],{y:9,pitch:.9,roll:.45});
 const frozen=motion.sample(race,60000)[0];near(frozen.y,1);near(frozen.pitch,.1);near(frozen.roll,.05);
});
