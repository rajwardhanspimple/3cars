import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,ARCADE,angle} from '../src/sim.js';

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
const radians=degrees=>degrees*Math.PI/180;
function trace(r,seconds,input,hz=120){
  const c=r.player,p=r.track.at(50),samples=[];let turned=0,previous=c.yaw;
  for(let i=0;i<Math.round(seconds*hz);i++){
    c.x=p.x;c.z=p.z;c.hint=p.index;r.drive(c,input,1/hz);
    turned+=angle(c.yaw-previous);previous=c.yaw;
    const longitudinal=c.vx*Math.sin(c.yaw)+c.vz*Math.cos(c.yaw),lateral=c.vx*Math.cos(c.yaw)-c.vz*Math.sin(c.yaw);
    const measured=Math.atan2(lateral,Math.max(Math.abs(longitudinal),1));
    assert.ok(Math.abs(c.driftAngle-measured)<1e-10,'slip must be measured from momentum');
    assert.ok([c.driftAngle,c.yawRate,c.speed,longitudinal,lateral].every(Number.isFinite));
    samples.push({time:(i+1)/hz,slip:c.driftAngle,yawRate:c.yawRate,speed:c.speed,forward:longitudinal,lateral,turned,drifting:c.drifting});
  }
  return samples;
}
function assertNoWobble(samples,key,tolerance){
  let variation=0;for(let i=1;i<samples.length;i++)variation+=Math.abs(samples[i][key]-samples[i-1][key]);
  const net=Math.abs(samples.at(-1)[key]-samples[0][key]);
  assert.ok(variation-net<tolerance,`${key} oscillation: excess variation ${variation-net}`);
}

test('steering reaches arcade turn-in response within 100ms',()=>{
  const r=new Race();r.phase='racing';const c=place(r,20);
  driveOnSameSurface(r,.1,{steer:1});
  assert.ok(c.steer>.82,`steer ${c.steer}`);
  assert.ok(c.steeringAngle>.3,`steeringAngle ${c.steeringAngle}`);
});

test('steering direction reversal is faster than normal turn-in',()=>{
  const r=new Race();r.phase='racing';const c=place(r,20);c.steer=1;c.steerTarget=1;
  driveOnSameSurface(r,.1,{steer:-1});
  assert.ok(c.steer<-.85,`steer ${c.steer}`);
  assert.ok(c.steeringAngle<-.3,`steeringAngle ${c.steeringAngle}`);
});

test('high speed and moderate steering stay gripped, finite and free of yaw wobble',()=>{
  for(const hz of [30,120])for(const scenario of [
    {speed:60,seconds:1,input:{throttle:1,steer:.9},yawLimit:1.2},
    {speed:30,seconds:1.5,input:{throttle:.5,steer:.45},yawLimit:1.3}
  ]){
    const r=new Race();r.phase='racing';place(r,scenario.speed);
    const samples=trace(r,scenario.seconds,scenario.input,hz);
    for(const s of samples){
      assert.ok(Math.abs(s.slip)<radians(5),`${hz}Hz normal corner slip ${s.slip}`);
      assert.ok(Math.abs(s.yawRate)<scenario.yawLimit,`yawRate ${s.yawRate}`);
      assert.ok(s.yawRate>=0);assert.ok(s.speed>=0);assert.ok(s.forward>0);assert.equal(s.drifting,false);
    }
    assert.ok(Math.abs(samples.at(-1).slip)>radians(.2),'loaded tires should show nonzero steady slip');
    assertNoWobble(samples.filter(s=>s.time>=scenario.seconds-.3),'yawRate',.08);
  }
});

test('handbrake builds measured slip promptly, holds a plateau and recovers with centred steering',()=>{
  const results=[];
  for(const hz of [30,120]){
    const r=new Race();r.phase='racing';const c=place(r,26);
    const onset=trace(r,.5,{throttle:.6,steer:1,handbrake:true},hz);
    assert.equal(c.handbrake,true);assert.equal(c.drifting,true);
    assert.ok(Math.abs(c.driftAngle)>=radians(15)&&Math.abs(c.driftAngle)<=radians(40),`${hz}Hz onset ${c.driftAngle}`);
    assert.ok(onset.some(s=>s.time<=.35+1e-9&&Math.abs(s.slip)>=radians(8)),'Space tap must break rear grip within 350ms');
    assert.ok(c.forwardSpeed>Math.abs(c.lateralSpeed));assert.ok(c.forwardSpeed>0);
    const held=trace(r,1,{throttle:.6,steer:1,handbrake:true},hz),all=[...onset,...held];
    for(const s of all){
      assert.ok(Math.abs(s.slip)<radians(45),`${hz}Hz slide exceeds controllable window: ${s.slip}`);
      assert.ok(Math.abs(s.yawRate)<3,`yawRate ${s.yawRate}`);assert.ok(s.speed>15);assert.ok(s.forward>0);
    }
    const turned=onset.at(-1).turned+held.at(-1).turned;
    assert.ok(Math.abs(turned)<radians(150),`heading turned ${turned}`);
    const plateau=held.filter(s=>s.time>=.6),magnitudes=plateau.map(s=>Math.abs(s.slip));
    assert.ok(Math.min(...magnitudes)>=radians(20)&&Math.max(...magnitudes)<=radians(40),`plateau ${magnitudes}`);
    assert.ok(Math.max(...magnitudes)-Math.min(...magnitudes)<radians(8),'held slide must settle, not diverge');
    assert.ok(Math.abs(magnitudes.at(-1)-magnitudes[0])<radians(4),'late slide is still growing');
    results.push({hz,slip:c.driftAngle,speed:c.speed,yawRate:c.yawRate});
    const recovery=trace(r,1,{throttle:0,steer:0,handbrake:false},hz);
    assert.equal(c.handbrake,false);assert.equal(c.drifting,false);
    assert.ok(Math.abs(c.driftAngle)<radians(5),`released slip ${c.driftAngle}`);
    assert.ok(Math.abs(c.yawRate)<.2,`released yawRate ${c.yawRate}`);
    assertNoWobble(recovery.filter(s=>s.time>=.5),'slip',radians(2));
    assertNoWobble(recovery.filter(s=>s.time>=.5),'yawRate',.12);
  }
  assert.ok(Math.abs(results[0].slip-results[1].slip)<radians(.5),'30/120Hz slip differs');
  assert.ok(Math.abs(results[0].yawRate-results[1].yawRate)<.03,'30/120Hz yaw differs');
  assert.ok(Math.abs(results[0].speed-results[1].speed)<.1,'30/120Hz speed differs');
});

test('counter-steering retains authority after handbrake breakaway',()=>{
  for(const hz of [30,120]){
    const r=new Race();r.phase='racing';const c=place(r,26);
    trace(r,.5,{throttle:.6,steer:1,handbrake:true},hz);const slip=Math.abs(c.driftAngle);
    const samples=trace(r,1,{throttle:.4,steer:-.6,handbrake:false},hz);
    assert.ok(slip>=radians(15));assert.ok(Math.abs(c.driftAngle)<radians(5));assert.ok(Math.abs(c.driftAngle)<slip/2);
    assert.ok(samples.every(s=>Math.abs(s.slip)<radians(45)&&s.forward>0));
  }
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
  const tireClean=new Race(),tireDamaged=new Race();tireClean.phase='racing';tireDamaged.phase='racing';const cleanCar=place(tireClean,30),damagedCar=place(tireDamaged,30);cleanCar.steer=.32;cleanCar.steerTarget=.32;damagedCar.steer=.32;damagedCar.steerTarget=.32;tireDamaged.player.damage.tires=.8;
  driveOnSameSurface(tireClean,.2,{steer:.32});driveOnSameSurface(tireDamaged,.2,{steer:.32});
  assert.ok(tireDamaged.player.slip>tireClean.player.slip,`slip ${tireDamaged.player.slip} > ${tireClean.player.slip}`);
  assert.ok(tireDamaged.player.slip<1&&tireClean.player.slip<1);
  assert.ok(Math.abs(tireDamaged.player.yawRate)<Math.abs(tireClean.player.yawRate));
});
