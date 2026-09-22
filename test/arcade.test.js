import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,ARCADE} from '../src/sim.js';

function place(r,speed=0,s=50){
  const c=r.player,p=r.track.at(s);
  c.x=p.x;c.z=p.z;c.yaw=p.heading;c.hint=p.index;c.vx=Math.sin(p.heading)*speed;c.vz=Math.cos(p.heading)*speed;c.speed=speed;c.progress=s;c.previousS=p.s;
  return c;
}
function driveOnSameSurface(r,seconds,input,s=50){
  for(let i=0;i<Math.ceil(seconds*120);i++){
    const p=r.track.at(s);
    r.player.x=p.x;r.player.z=p.z;r.player.hint=p.index;
    r.drive(r.player,input,1/120);
  }
}

test('steering reaches arcade turn-in response within 100ms',()=>{
  const r=new Race();r.phase='racing';const c=place(r,20);
  driveOnSameSurface(r,.1,{steer:1});
  assert.ok(c.steer>.82,`steer ${c.steer}`);
  assert.ok(c.steeringAngle>.3,`steeringAngle ${c.steeringAngle}`);
});

test('steering direction reversal is faster than normal turn-in',()=>{
  const r=new Race();r.phase='racing';const c=place(r,20);c.steer=1;
  driveOnSameSurface(r,.1,{steer:-1});
  assert.ok(c.steer<-.85,`steer ${c.steer}`);
  assert.ok(c.steeringAngle<-.3,`steeringAngle ${c.steeringAngle}`);
});

test('high speed steering remains bounded and nonnegative',()=>{
  const r=new Race();r.phase='racing';const c=place(r,60);
  driveOnSameSurface(r,1,{throttle:1,steer:.9});
  assert.ok(Number.isFinite(c.yawRate));
  assert.ok(Math.abs(c.yawRate)<1.2,`yawRate ${c.yawRate}`);
  assert.ok(c.speed>=0);
  assert.ok(Math.abs(c.driftAngle)<.02);
});

test('handbrake opens a bounded assisted drift and recovers after release',()=>{
  const r=new Race();r.phase='racing';const c=place(r,26);
  driveOnSameSurface(r,.5,{throttle:.6,steer:1,handbrake:true});
  assert.equal(c.handbrake,true);
  assert.equal(c.drifting,true);
  assert.ok(c.driftAngle>.15&&c.driftAngle<=ARCADE.maxDriftAngle,`driftAngle ${c.driftAngle}`);
  driveOnSameSurface(r,1.05,{throttle:.6,steer:1,handbrake:false});
  assert.equal(c.handbrake,false);
  assert.equal(c.drifting,false);
  assert.ok(Math.abs(c.driftAngle)<.03,`driftAngle ${c.driftAngle}`);
});

test('velocity scalar does not resurrect stale pre-collision speed',()=>{
  const r=new Race();r.phase='racing';const c=place(r,30);const p=r.track.at(50);
  c.speed=30;c.vx=Math.sin(p.heading)*8;c.vz=Math.cos(p.heading)*8;
  r.drive(c,{throttle:0},1/120);
  assert.ok(c.speed<9,`speed ${c.speed}`);
});

test('nitro boost is faster and allows the higher active speed cap',()=>{
  const boosted=new Race(),normal=new Race();boosted.phase='racing';normal.phase='racing';
  place(boosted,20);place(normal,20);
  driveOnSameSurface(boosted,2,{throttle:1,boost:true});
  driveOnSameSurface(normal,2,{throttle:1});
  assert.ok(boosted.player.speed>normal.player.speed+8,`${boosted.player.speed} > ${normal.player.speed}`);
  const capRace=new Race();capRace.phase='racing';const c=place(capRace,capRace.player.model.topSpeed*1.12);c.throttle=1;
  driveOnSameSurface(capRace,.05,{throttle:1,boost:true});
  assert.ok(c.speed>c.model.topSpeed,`speed ${c.speed}`);
});

test('released boost overspeed bleeds down without an instant normal cap cut',()=>{
  const r=new Race();r.phase='racing';const c=place(r,r.player.model.topSpeed*1.15);c.throttle=1;
  const start=c.speed;
  driveOnSameSurface(r,.05,{throttle:1,boost:false});
  assert.ok(c.speed>c.model.topSpeed,`speed ${c.speed}`);
  assert.ok(c.speed<start,`${c.speed} < ${start}`);
});

test('nitro drains, depletes, waits for cooldown, and refills only after boost is released',()=>{
  const r=new Race();r.phase='racing';const c=place(r,30);c.throttle=1;
  driveOnSameSurface(r,4.2,{throttle:1,boost:true});
  assert.equal(c.nitro,0);
  assert.equal(c.boostActive,false);
  assert.ok(c.nitroCooldown>0);
  driveOnSameSurface(r,3,{throttle:1,boost:true});
  assert.equal(c.nitro,0);
  assert.equal(c.boostActive,false);
  driveOnSameSurface(r,.2,{throttle:1,boost:false});
  assert.ok(c.nitro>0,`nitro ${c.nitro}`);
  driveOnSameSurface(r,6,{throttle:1,boost:false});
  assert.equal(c.nitro,100);
});

test('nitro cooldown delays recharge but does not block re-use of remaining charge',()=>{
  const r=new Race();r.phase='racing';const c=place(r,30);c.throttle=1;
  driveOnSameSurface(r,.5,{throttle:1,boost:true});
  const afterBurst=c.nitro;
  driveOnSameSurface(r,1/60,{throttle:1,boost:false});
  assert.ok(c.nitroCooldown>0);
  driveOnSameSurface(r,.2,{throttle:1,boost:true});
  assert.equal(c.boostActive,true);
  assert.ok(c.nitro<afterBurst,`${c.nitro} < ${afterBurst}`);
});

test('boost is blocked while stationary, paused, countdown, non-racing, or finished',()=>{
  const stationary=new Race();stationary.phase='racing';place(stationary,0);stationary.player.throttle=1;driveOnSameSurface(stationary,.2,{throttle:1,boost:true});assert.equal(stationary.player.boostActive,false);assert.equal(stationary.player.nitro,100);
  const menu=new Race();place(menu,30);menu.player.throttle=1;driveOnSameSurface(menu,.2,{throttle:1,boost:true});assert.equal(menu.player.boostActive,false);assert.equal(menu.player.nitro,100);
  const countdown=new Race();countdown.start();countdown.step(1/120,{throttle:1,boost:true});assert.equal(countdown.player.boostActive,false);assert.equal(countdown.player.nitro,100);
  const paused=new Race();paused.phase='racing';place(paused,30);paused.player.throttle=1;driveOnSameSurface(paused,.2,{throttle:1,boost:true});assert.equal(paused.player.boostActive,true);const nitro=paused.player.nitro;paused.pause();assert.equal(paused.player.nitroCooldown,ARCADE.nitroCooldown);paused.step(1,{throttle:1,boost:true});assert.equal(paused.player.boostActive,false);assert.equal(paused.player.nitro,nitro);assert.equal(paused.player.nitroCooldown,ARCADE.nitroCooldown);
  const finished=new Race();finished.phase='racing';finished.player.finished=true;finished.player.boostActive=true;finished.player.nitro=50;finished.step(1/120,{throttle:1,boost:true});assert.equal(finished.player.boostActive,false);assert.equal(finished.player.nitro,50);
});

test('repair stops boost and drift, starts cooldown, and does not replenish nitro',()=>{
  const r=new Race();r.phase='racing';const c=place(r,25);c.nitro=37;c.boostActive=true;c.drifting=true;c.driftAngle=.4;c.handbrake=true;
  assert.equal(r.repair(),true);
  assert.equal(c.nitro,37);
  assert.equal(c.nitroCooldown,ARCADE.nitroCooldown);
  assert.equal(c.boostActive,false);
  assert.equal(c.drifting,false);
  assert.equal(c.driftAngle,0);
  assert.equal(c.handbrake,false);
  assert.equal(new Race().player.nitro,100);
});

test('engine, steering, and tire damage retain separate effects',()=>{
  const clean=new Race(),engine=new Race();clean.phase='racing';engine.phase='racing';place(clean,10);place(engine,10);engine.player.damage.engine=.8;clean.player.throttle=1;engine.player.throttle=1;
  driveOnSameSurface(clean,1,{throttle:1});driveOnSameSurface(engine,1,{throttle:1});
  assert.ok(engine.player.speed<clean.player.speed);
  const steerClean=new Race(),steerDamaged=new Race();steerClean.phase='racing';steerDamaged.phase='racing';place(steerClean,30);place(steerDamaged,30);steerDamaged.player.damage.steering=.8;
  driveOnSameSurface(steerClean,.2,{steer:.8});driveOnSameSurface(steerDamaged,.2,{steer:.8});
  assert.ok(Math.abs(steerDamaged.player.steeringAngle)<Math.abs(steerClean.player.steeringAngle));
  const tireClean=new Race(),tireDamaged=new Race();tireClean.phase='racing';tireDamaged.phase='racing';place(tireClean,30);place(tireDamaged,30);tireDamaged.player.damage.tires=.8;
  driveOnSameSurface(tireClean,.2,{steer:.8});driveOnSameSurface(tireDamaged,.2,{steer:.8});
  assert.ok(tireDamaged.player.slip>tireClean.player.slip);
});
