import {CIRCUIT, trackBounds as computeTrackBounds} from './circuit.js';
import {mountainLayout,roadPose} from './mountain-layout.js';

export const TAU = Math.PI * 2;
export const LAPS = 5;
export const HALF_WIDTH = 9;
export const BARRIER = 17;
export const PENALTIES = Object.freeze({ cut: 5, repair: 20 });
export const ARCADE = Object.freeze({
  gripBoost: 2.75,
  steerTurnInRate: 20,
  steerReverseRate: 28,
  yawRateResponse: 20,
  nitroDrain: 25,
  nitroRefill: 18,
  nitroCooldown: 2,
  nitroAccel: 10,
  nitroTopSpeed: 1.18,
  driftMinSpeed: 8,
  maxDriftAngle: 0.55
});
export const CARS = Object.freeze([
  { id: 'vortex', name: 'Vortex R', color: '#267dcc', accent: '#e5f3fa', mass: 1280, acceleration: 12.2, grip: 1.32, topSpeed: 78, wheelbase: 2.75, description: 'Balanced chassis. Predictable through fast corners.' },
  { id: 'apex', name: 'Apex S', color: '#f0ece0', accent: '#d55031', mass: 1190, acceleration: 11.3, grip: 1.46, topSpeed: 73, wheelbase: 2.62, description: 'Light and agile. More grip in the technical sector.' },
  { id: 'titan', name: 'Titan GT', color: '#d76537', accent: '#172f43', mass: 1430, acceleration: 13.4, grip: 1.21, topSpeed: 83, wheelbase: 2.94, description: 'Strong acceleration. Brake early for tight turns.' }
]);
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export const mod = (n, d) => ((n % d) + d) % d;
export const angle = n => mod(n + Math.PI, TAU) - Math.PI;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));
const ramp = (lo,hi,value) => {const t=clamp((value-lo)/(hi-lo),0,1);return t*t*(3-2*t);};
const maxSteerFor = speed => 0.52 / (1 + Math.max(0, speed) * 0.012);
const carRadius = 1.9;
const inertiaPerMass = car => car.model.wheelbase ** 2 * .55;

export function makeTrack() {
  const controls = CIRCUIT.controls;
  const samplesPerSegment = CIRCUIT.samplesPerSegment;
  const points = [];
  for (let k = 0; k < controls.length; k++) {
    const p0 = controls[mod(k - 1, controls.length)], p1 = controls[k], p2 = controls[(k + 1) % controls.length], p3 = controls[(k + 2) % controls.length];
    for (let j = 0; j < samplesPerSegment; j++) {
      const t = j / samplesPerSegment, t2 = t * t, t3 = t2 * t;
      const value = n => 0.5 * ((2*p1[n]) + (-p0[n]+p2[n])*t + (2*p0[n]-5*p1[n]+4*p2[n]-p3[n])*t2 + (-p0[n]+3*p1[n]-3*p2[n]+p3[n])*t3);
      points.push({ x: value(0), z: value(1), s: 0 });
    }
  }
  let length = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i+1)%points.length];
    a.s = length; a.len = Math.hypot(b.x-a.x, b.z-a.z); a.tx=(b.x-a.x)/a.len; a.tz=(b.z-a.z)/a.len;
    a.heading = Math.atan2(a.tx, a.tz); length += a.len;
  }
  function at(distance, offset = 0) {
    const s = mod(distance, length);
    let lo=0, hi=points.length-1;
    while (lo<hi) { const mid=Math.ceil((lo+hi)/2); if(points[mid].s<=s) lo=mid; else hi=mid-1; }
    const a=points[lo], b=points[(lo+1)%points.length], t=(s-a.s)/a.len;
    const heading=a.heading+angle(b.heading-a.heading)*t;
    return {x:lerp(a.x,b.x,t)+Math.cos(heading)*offset,z:lerp(a.z,b.z,t)-Math.sin(heading)*offset,heading, s, index:lo};
  }
  function curvature(s) { return angle(at(s+5).heading-at(s-5).heading)/10; }
  function project(x,z,hint) {
    let best=null;
    const scan = indices => {
      for (const i of indices) {
        const a=points[i], along=clamp((x-a.x)*a.tx+(z-a.z)*a.tz,0,a.len), px=a.x+a.tx*along,pz=a.z+a.tz*along;
        const distance=Math.hypot(x-px,z-pz);
        if(!best || distance<best.distance) best={ x:px,z:pz,s:a.s+along,index:i,distance,lateral:(x-px)*a.tz-(z-pz)*a.tx,heading:a.heading };
      }
    };
    if(Number.isInteger(hint)) scan(Array.from({length:31},(_,i)=>mod(hint+i-15,points.length)));
    if(!best || best.distance>28) scan(points.map((_,i)=>i));
    best.s=mod(best.s,length); return best;
  }
  return {id:CIRCUIT.id,name:CIRCUIT.name,bounds:computeTrackBounds(points),points,length,at,curvature,project, gates:24, gateSize:length/24};
}

function applyRoadPose(car){const pose=roadPose(car.x,car.z,car.yaw);car.y=pose.y;car.pitch=pose.pitch;car.roll=pose.roll;return car;}
function measureVelocity(car) {
  const s=Math.sin(car.yaw),c=Math.cos(car.yaw);
  car.forwardSpeed=car.vx*s+car.vz*c;
  car.lateralSpeed=car.vx*c-car.vz*s;
  car.speed=Math.hypot(car.vx,car.vz);
  car.driftAngle=Math.atan2(car.lateralSpeed,Math.max(Math.abs(car.forwardSpeed),1));
  car.drifting=car.speed>ARCADE.driftMinSpeed&&Math.abs(car.driftAngle)>.14;
}
function createCar(model,index,track) {
  const progress=-10-index*7, p=track.at(progress,(index%2 ? -1 : 1)*2.2);
  return applyRoadPose({model,index,name:index===0?'You':index===1?'Mara':'Ellis',x:p.x,z:p.z,yaw:p.heading,vx:0,vz:0,speed:0,forwardSpeed:0,lateralSpeed:0,reversing:false,steer:0,steerTarget:0,steerReversing:false,throttle:0,brake:0,yawRate:0,gear:1,rpm:900,slip:0,tc:false,abs:false,
    nitro:100,nitroCooldown:0,boostActive:false,drifting:false,driftAngle:0,handbrake:false,steeringAngle:0,surface:'asphalt',frontSlipAngle:0,rearSlipAngle:0,
    progress,previousS:p.s,hint:p.index,nextGate:0,lap:1,lapStart:null,lapTimes:[],lapValid:true,bestLap:null,finished:false,finishTime:null,penalty:0,damage:{engine:0,steering:0,tires:0},offTime:0,offStart:0,offPenalized:false,impact:0,impactCooldown:0,stuckTime:0,repairCooldown:0,notification:'',noticeUntil:0,
    aiDrift:{active:false,hold:0,cooldown:index===1?.35:.95,recover:0,side:0}});
}

export class Race {
  constructor({carId='vortex',weather='dry'}={}) {
    this.track=makeTrack(); this.layout=mountainLayout(this.track); this.props=this.layout.props.map(p=>({...p})); this.weather=weather==='wet'?'wet':'dry'; this.time=0; this.phase='menu'; this.countdown=3; this.firstFinish=null; this.pausedPhase=null;
    const selected=CARS.find(c=>c.id===carId)||CARS[0];
    this.cars=[selected,...CARS.filter(c=>c!==selected)].map((c,i)=>createCar(c,i,this.track)); this.player=this.cars[0];
  }
  start() { if(this.phase==='menu') this.phase='countdown'; }
  stopTransient(car, cooldown=false) {
    if(cooldown&&car.boostActive) car.nitroCooldown=ARCADE.nitroCooldown;
    car.boostActive=false;car.handbrake=false;measureVelocity(car);
    if(car.aiDrift) {car.aiDrift.active=false;car.aiDrift.hold=0;car.aiDrift.recover=Math.max(car.aiDrift.recover,.4);}
  }
  pause() {
    if(['countdown','racing'].includes(this.phase)) {this.pausedPhase=this.phase;this.phase='paused';this.cars.forEach(c=>this.stopTransient(c,true));}
    else if(this.phase==='paused') {this.phase=this.pausedPhase;this.pausedPhase=null;}
  }
  tell(car,text) { car.notification=text;car.noticeUntil=this.time+4; }
  penalty(car,seconds,text) { car.penalty+=seconds;car.lapValid=false;this.tell(car,`${text} +${seconds}s`); }
  invalidate(car,text='Checkpoint skipped. Lap invalid.') { if(car.lapValid)this.tell(car,text); car.lapValid=false; }
  repair(car=this.player, kind='repair') {
    if(this.phase!=='racing'||car.finished||car.repairCooldown>0) return false;
    const safe=car.nextGate===0?-2:(car.nextGate-1)*this.track.gateSize+2;
    const p=this.track.at(safe,car.index===0?0:2.8*(car.index===1?1:-1));
    const interruptedBoost=car.boostActive;
    car.x=p.x;car.z=p.z;car.yaw=p.heading;car.vx=0;car.vz=0;car.speed=0;car.forwardSpeed=0;car.lateralSpeed=0;car.reversing=false;car.steer=0;car.steerTarget=0;car.steerReversing=false;car.yawRate=0;car.progress=safe;car.previousS=p.s;car.hint=p.index;car.offTime=0;car.offPenalized=false;car.stuckTime=0;car.repairCooldown=3;
    car.boostActive=false;car.drifting=false;car.driftAngle=0;car.handbrake=false;car.steeringAngle=0;car.frontSlipAngle=0;car.rearSlipAngle=0;if(car.aiDrift){car.aiDrift.active=false;car.aiDrift.hold=0;car.aiDrift.cooldown=Math.max(car.aiDrift.cooldown,2);car.aiDrift.recover=1;}if(interruptedBoost) car.nitroCooldown=ARCADE.nitroCooldown;
    if(kind==='repair') car.damage={engine:0,steering:0,tires:0};
    applyRoadPose(car);this.penalty(car,PENALTIES.repair,'Repaired and returned'); return true;
  }

  ai(car,dt=1/30) {
    const speed=Math.max(0,car.speed), look=8+speed*0.42;
    let lane=Math.sin(car.progress*0.009+car.index)*1.3;
    for(const other of this.cars) if(other!==car&&!other.finished) {
      const gap=other.progress-car.progress;
      if(gap>0&&gap<26&&Math.abs(other.speed-car.speed)<12) lane=car.index===1?-3.0:3.0;
    }
    const target=this.track.at(car.progress+look,lane), error=angle(Math.atan2(target.x-car.x,target.z-car.z)-car.yaw);
    const rawSteer=Math.atan2(2*car.model.wheelbase*Math.sin(error),look);
    // Compensate mild tire understeer; measured sideslip supplies counter-steer.
    let steer=clamp(rawSteer*(1+speed*speed*.0002)/(maxSteerFor(speed)*(1-car.damage.steering*.4))+car.driftAngle*.65, -1, 1);
    const longitudinalMu=car.model.grip*(this.weather==='wet'?0.66:1)*(1-car.damage.tires*.35);
    const cornerMu=longitudinalMu*ARCADE.gripBoost;
    let targetSpeed=car.model.topSpeed*.94;
    let strongestCurvature=0;
    for(const d of [3,12,24,40,65,95]) {
      const sample=this.track.curvature(car.progress+d);
      if(Math.abs(sample)>Math.abs(strongestCurvature)) strongestCurvature=sample;
      const cur=Math.max(Math.abs(sample),0.0003);
      const corner=Math.sqrt(cornerMu*9.81/cur)*.78;
      targetSpeed=Math.min(targetSpeed,Math.sqrt(corner*corner+2*longitudinalMu*9.81*Math.max(0,d-10)*.74));
    }
    if(Math.abs(error)>0.75) targetSpeed=Math.min(targetSpeed,18);
    const input={throttle:clamp((targetSpeed-speed)*.7,0,1),brake:clamp((speed-targetSpeed)*.32,0,1),steer,boost:false,handbrake:false,reverse:false};
    const drift=car.aiDrift;
    if(!drift || car.index===0) return input;
    drift.cooldown=Math.max(0,drift.cooldown-dt);
    drift.recover=Math.max(0,drift.recover-dt);
    const contact=this.track.project(car.x,car.z,car.hint);
    const future=this.track.project(target.x,target.z);
    const cornerSide=Math.sign(strongestCurvature)||Math.sign(error)||Math.sign(steer);
    const speedCap=this.weather==='wet'?32:38;
    const minSpeed=this.weather==='wet'?13:16;
    const nearCars=this.cars.some(other=>{
      if(other===car||other.finished) return false;
      const gap=mod(other.progress-car.progress+this.track.length/2,this.track.length)-this.track.length/2;
      if(Math.abs(gap)>22) return false;
      const otherContact=this.track.project(other.x,other.z,other.hint);
      return Math.abs(otherContact.lateral-contact.lateral)<5.5;
    });
    const nearSolid=this.nearSolid(car.x,car.z,6.5);
    const scheduled=(Math.floor((car.progress+look)/this.track.gateSize)+car.index)%2===0;
    const stable=Number.isFinite(speed)&&contact.distance<=HALF_WIDTH-1.1&&future.distance<=HALF_WIDTH-1.1&&BARRIER-contact.distance>7&&!nearCars&&!nearSolid&&car.offTime===0&&car.impactCooldown===0&&Math.abs(car.driftAngle)<.32&&car.slip<.95;
    const cornerReady=Math.abs(strongestCurvature)>(this.weather==='wet'?.010:.012)&&Math.abs(strongestCurvature)<.085&&Math.abs(error)>.045&&Math.abs(error)<.68&&Math.abs(steer)>.18&&Math.sign(steer)===cornerSide;
    const speedReady=speed>=minSpeed&&speed<=speedCap&&targetSpeed<=speed+4;
    if(drift.active&&(!stable||speed>speedCap+3||Math.sign(steer)!==drift.side)) {drift.active=false;drift.hold=0;drift.recover=.7;drift.cooldown=Math.max(drift.cooldown,2.4);}
    if(!drift.active&&drift.cooldown===0&&drift.recover===0&&scheduled&&stable&&cornerReady&&speedReady) {drift.active=true;drift.hold=this.weather==='wet'?.26:.34;drift.cooldown=(this.weather==='wet'?4.6:4.1)+car.index*.35;drift.side=cornerSide;}
    if(drift.active) {
      drift.hold-=dt; input.handbrake=drift.hold>0&&stable&&cornerReady&&speedReady; input.boost=false; input.steer=clamp(steer+drift.side*.04,-1,1); input.throttle=Math.min(input.throttle,this.weather==='wet'?.48:.58); input.brake=Math.max(input.brake,speed>targetSpeed+1.5?.12:0);
      if(!input.handbrake) {drift.active=false;drift.recover=.55;}
    }
    return input;
  }

  step(dt,input={}) {
    if(!Number.isFinite(dt)||dt<=0) return;
    dt=Math.min(dt,1/30);
    if(this.phase==='countdown') {this.cars.forEach(c=>this.stopTransient(c,false));this.countdown-=dt;if(this.countdown<=0)this.phase='racing';return;}
    if(this.phase!=='racing') {this.cars.forEach(c=>this.stopTransient(c,false));return;}
    this.time+=dt;this.updateProps(dt);
    for(const car of this.cars) {
      car.impactCooldown=Math.max(0,car.impactCooldown-dt);car.repairCooldown=Math.max(0,car.repairCooldown-dt);
      if(car.finished) {this.stopTransient(car,false);continue;}
      this.drive(car,car.index===0?input:this.ai(car,dt),dt);
      this.advance(car,dt);
      if(car.index>0) { car.stuckTime=car.speed<2?car.stuckTime+dt:0; if(car.stuckTime>5)this.repair(car); }
    }
    this.collisions();this.sceneryCollisions();
    if(this.cars.every(c=>c.finished)) {this.phase='finished';this.cars.forEach(c=>this.stopTransient(c,false));}
  }

  drive(car,input,dt) {
    if(!Number.isFinite(dt)||dt<=0)return;
    dt=Math.min(dt,1/30);
    // Integrate controls as well as tires at the same cadence. A 30 Hz call
    // must not apply a fully smoothed steering input to all eight microsteps.
    if(dt>1/120+1e-10){const steps=Math.ceil(dt*120);for(let i=0;i<steps;i++)this.drive(car,input,dt/steps);return;}
    const number=v=>Number.isFinite(v)?v:0;
    car.throttle=smooth(car.throttle,clamp(number(input.throttle),0,1),4.5,dt);
    car.brake=smooth(car.brake,clamp(number(input.brake),0,1),10,dt);
    const targetSteer=clamp(number(input.steer),-1,1);
    const priorTarget=Number.isFinite(car.steerTarget)?car.steerTarget:car.steer;
    if(targetSteer*priorTarget<-.01 || targetSteer*car.steer<-.01) car.steerReversing=true;
    car.steerTarget=targetSteer;
    if(Math.abs(targetSteer)<.05 || Math.abs(car.steer-targetSteer)<.08) car.steerReversing=false;
    const turnIn=Math.abs(targetSteer)>Math.abs(car.steer)+.001;
    car.steer=smooth(car.steer,targetSteer,car.steerReversing?ARCADE.steerReverseRate:(turnIn?ARCADE.steerTurnInRate:16),dt);
    car.handbrake=!!input.handbrake;
    const contact=this.track.project(car.x,car.z,car.hint),off=contact.distance>HALF_WIDTH;
    car.surface=off?(contact.distance>HALF_WIDTH+4?'dirt':'grass'):'asphalt';
    measureVelocity(car);
    const forwardSpeed=Math.max(0,car.forwardSpeed);
    const weatherGrip=this.weather==='wet'?.66:1;
    const surfaceGrip=car.surface==='asphalt'?1:(car.surface==='grass'?.47:.40);
    const baseGrip=car.model.grip*weatherGrip*surfaceGrip*(1-car.damage.tires*.4);
    const boostHeld=!!input.boost,wasBoost=car.boostActive;
    car.boostActive=this.phase==='racing'&&boostHeld&&car.throttle>.2&&forwardSpeed>=4&&car.brake<.1&&!car.handbrake&&car.nitro>0;
    if(car.boostActive) {car.nitro=clamp(car.nitro-ARCADE.nitroDrain*dt,0,100);if(car.nitro===0) {car.boostActive=false;car.nitroCooldown=ARCADE.nitroCooldown;}}
    else {if(wasBoost) car.nitroCooldown=Math.max(car.nitroCooldown,ARCADE.nitroCooldown);if(car.nitroCooldown>0) car.nitroCooldown=Math.max(0,car.nitroCooldown-dt);else if(!boostHeld&&car.nitro<100) car.nitro=clamp(car.nitro+ARCADE.nitroRefill*dt,0,100);}
    if(number(input.throttle)>.1||number(input.brake)<.1||input.reverse===false)car.reversing=false;
    else if(car.forwardSpeed<.6&&Math.abs(car.lateralSpeed)<.6)car.reversing=true;
    const a=car.model.wheelbase*.48,b=car.model.wheelbase*.52;
    // Tire accelerations are forces divided by total mass. Fixed microsteps
    // keep the low-speed tire/yaw damping stable at both 30 Hz and 120 Hz.
    const count=Math.ceil(dt*240),h=dt/count;
    for(let i=0;i<count;i++) {
      const sy=Math.sin(car.yaw),cy=Math.cos(car.yaw);
      let u=car.vx*sy+car.vz*cy,v=car.vx*cy-car.vz*sy;
      const speed=Math.abs(u),downforce=1+Math.min(.30,speed*speed*.00007);
      const traction=baseGrip*9.81*downforce,mu=baseGrip*ARCADE.gripBoost*downforce;
      const wheel=car.steer*maxSteerFor(speed)*(1-car.damage.steering*.4)+Math.sin(this.time*1.6)*car.damage.steering*.016;
      car.steeringAngle=wheel;
      const denominator=Math.max(speed,3),direction=clamp(u/3,-1,1);
      const frontSlip=Math.atan2(v+a*car.yawRate,denominator)-wheel*direction;
      const rearSlip=Math.atan2(v-b*car.yawRate,denominator);
      const bodySlip=Math.abs(Math.atan2(v,Math.max(speed,1)));
      // Rear lock gives breakaway; progressive rear force then supplies a
      // restoring axle moment. No authored angle or heading/velocity clamp.
      const rearRecovery=ramp(.30,.85,Math.abs(rearSlip));
      const rearGrip=car.handbrake?.02+.98*rearRecovery:1;
      // Loaded front tires retain their bite unless both handbrake and real
      // body sideslip are present. Counter-steer restores front tire adhesion.
      const sliding=car.handbrake?ramp(.18,.35,bodySlip):0;
      const frontGrip=1-.60*sliding*ramp(.50,.90,Math.abs(frontSlip));
      const frontLimit=mu*9.81*.52*frontGrip,rearLimit=mu*9.81*.48*rearGrip;
      // High-speed rear cornering stiffness resists transient oversteer without
      // reducing front steering authority or increasing the friction ceiling.
      const fastGrip=car.handbrake?0:ramp(40,60,speed);
      const front=-clamp(mu*65*.52*frontSlip,-frontLimit,frontLimit);
      const rear=-clamp(mu*70*(1+.45*fastGrip)*.48*rearSlip,-rearLimit,rearLimit);
      const frontLateral=front*Math.cos(wheel);
      car.frontSlipAngle=frontSlip;car.rearSlipAngle=rearSlip;
      const drive=car.model.acceleration*car.throttle*(1-car.damage.engine*.55)/(1+speed*.018);
      const braking=car.brake*18;
      car.tc=drive>traction*.90;car.abs=braking>traction*.95&&u>2;
      const normalTop=car.model.topSpeed*(1-car.damage.engine*.28);
      const top=normalTop*(car.boostActive?ARCADE.nitroTopSpeed:1);
      let motor=car.reversing?-Math.min(car.brake*6,traction*.9):Math.min(drive,traction*.90)+(car.boostActive?ARCADE.nitroAccel:0);
      if((u>=top&&motor>0)||(u<=-11&&motor<0))motor=0;
      const resist=.32+speed*speed*.00065+(off?speed*.38:0)+(car.handbrake?.15:0)+(car.reversing?0:Math.min(braking,traction*.95));
      // Resistive forces cannot reverse motion. Brake-to-reverse uses motor torque.
      const drag=Math.sign(u)*Math.min(resist,speed/h);
      const ax=motor-drag-front*Math.sin(wheel),ay=frontLateral+rear;
      // Lower initial handbrake damping quickens onset. At large slip the
      // previous 2.8/s damping ceiling remains, while release recovery is intact.
      const yawDamping=car.handbrake?.35+2.45*ramp(.18,.65,bodySlip):1.6+1.8*fastGrip+3*ramp(.12,.50,bodySlip);
      const yawAccel=(a*frontLateral-b*rear)/inertiaPerMass(car)-car.yawRate*yawDamping;
      car.yawRate+=yawAccel*h;
      u+=ax*h;v+=ay*h;
      // Exact rotating-frame transport integrates du/dt += r*v and
      // dv/dt -= r*u without creating energy or steering world momentum.
      const dy=car.yawRate*h,cos=Math.cos(dy),sin=Math.sin(dy);
      const nextU=u*cos+v*sin,nextV=v*cos-u*sin;
      car.yaw=angle(car.yaw+dy);
      car.vx=Math.sin(car.yaw)*nextU+Math.cos(car.yaw)*nextV;
      car.vz=Math.cos(car.yaw)*nextU-Math.sin(car.yaw)*nextV;
      car.x+=car.vx*h;car.z+=car.vz*h;
      const requested=Math.abs(u*u/car.model.wheelbase*Math.tan(wheel));
      car.slip=clamp(requested/(mu*9.81+.001)*.4+Math.max(Math.abs(frontSlip),Math.abs(rearSlip))*.8,0,1);
    }
    measureVelocity(car);
    const longitudinal=Math.max(0,car.forwardSpeed),limits=[0,14,25,38,52,67,90];
    if(car.gear<6&&longitudinal>limits[car.gear])car.gear++;
    if(car.gear>1&&longitudinal<limits[car.gear-1]-3)car.gear--;
    const low=limits[car.gear-1];car.rpm=clamp(2500+(longitudinal-low)/Math.max(1,limits[car.gear]-low)*5300,900,8500);if(longitudinal<2)car.rpm=900+Math.max(car.throttle,car.reversing?car.brake:0)*1800;
    applyRoadPose(car);
  }
  advance(car,dt) {
    const p=this.track.project(car.x,car.z,car.hint),L=this.track.length;
    const rawDelta=mod(p.s-car.previousS+L/2,L)-L/2;
    const jump=Math.abs(rawDelta)>Math.max(12,car.speed*dt*4+4);
    car.hint=p.index;car.previousS=p.s;
    const before=car.progress;car.progress+=rawDelta;
    if(jump) this.invalidate(car);
    this.guardrail(car,p);
    if(p.distance>HALF_WIDTH+1) {
      if(car.offTime===0)car.offStart=car.progress;
      car.offTime+=dt;
      if(!car.offPenalized&&car.offTime>.6&&car.progress-car.offStart>8) {this.penalty(car,PENALTIES.cut,'Track limits');car.offPenalized=true;}
    } else {car.offTime=0;car.offPenalized=false;}
    if(rawDelta<=0) return;
    const first=Math.floor(before/this.track.gateSize)+1;
    const last=Math.floor(car.progress/this.track.gateSize);
    for(let gate=first;gate<=last;gate++) this.crossGate(car,gate,p.distance>HALF_WIDTH+1.5||jump);
  }
  crossGate(car,gate,invalid) {
    if(gate<car.nextGate) return;
    if(gate>car.nextGate) invalid=true;
    if(invalid) this.invalidate(car);
    if(gate%this.track.gates===0) {
      if(car.lapStart!==null) {
        const lapTime=this.time-car.lapStart;
        car.lapTimes.push({time:lapTime,valid:car.lapValid});
        if(car.lapValid) car.bestLap=car.bestLap===null?lapTime:Math.min(car.bestLap,lapTime);
        if(car.lapTimes.length===LAPS) {car.finished=true;car.finishTime=this.time;car.vx=0;car.vz=0;car.speed=0;car.yawRate=0;this.stopTransient(car,false);this.firstFinish??=this.time;}
      }
      car.lapStart=this.time;car.lapValid=true;car.lap=Math.min(LAPS,car.lapTimes.length+1);
    }
    car.nextGate=gate+1;
  }

  hit(car,severity) {
    if(car.impactCooldown>0||severity<2) return;
    car.impactCooldown=.5;car.impact++;
    const amount=clamp(severity/75,.015,.4);
    for(const key of ['engine','steering','tires'])car.damage[key]=clamp(car.damage[key]+amount*(key==='engine'?.75:1),0,1);
    this.tell(car,'Contact. Check vehicle condition.');
  }
  // Normal points from a to b. Both impulses are equal and opposite.
  pairImpulse(a,b,ma,mb,nx,nz,depth,restitution,friction) {
    const ia=1/ma,ib=1/mb,sum=ia+ib;
    a.x-=nx*depth*ia/sum;a.z-=nz*depth*ia/sum;
    b.x+=nx*depth*ib/sum;b.z+=nz*depth*ib/sum;
    const closing=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
    if(closing<=0)return 0;
    const j=(1+restitution)*closing/sum,tx=-nz,tz=nx;
    const jt=clamp(((a.vx-b.vx)*tx+(a.vz-b.vz)*tz)/sum,-friction*j,friction*j);
    const jx=j*nx+jt*tx,jz=j*nz+jt*tz;
    a.vx-=jx*ia;a.vz-=jz*ia;b.vx+=jx*ib;b.vz+=jz*ib;
    return closing;
  }
  collisions() {
    for(let i=0;i<this.cars.length;i++)for(let j=i+1;j<this.cars.length;j++) {
      const a=this.cars[i],b=this.cars[j];if(a.finished||b.finished)continue;
      const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d>=2*carRadius)continue;
      const nx=d>.001?dx/d:1,nz=d>.001?dz/d:0;
      const closing=this.pairImpulse(a,b,a.model.mass,b.model.mass,nx,nz,2*carRadius-d,.25,.18);
      this.hit(a,closing);this.hit(b,closing);
      measureVelocity(a);measureVelocity(b);applyRoadPose(a);applyRoadPose(b);
    }
  }
  // Static contact normal points into free space. The offset contact arm
  // models a glancing bumper strike. Angular effective mass prevents energy gain.
  staticContact(car,nx,nz,depth) {
    car.x+=nx*depth;car.z+=nz*depth;
    const mass=car.model.mass,invMass=1/mass,invI=1/(mass*inertiaPerMass(car));
    const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),dot=fx*nx+fz*nz;
    const rx=-nx*carRadius+.6*(fx-dot*nx),rz=-nz*carRadius+.6*(fz-dot*nz);
    const lever=rz*nx-rx*nz;
    const vn=car.vx*nx+car.vz*nz+car.yawRate*lever;
    if(vn<0) {
      const j=-1.3*vn/(invMass+lever*lever*invI);
      car.vx+=j*nx*invMass;car.vz+=j*nz*invMass;car.yawRate+=j*lever*invI;
      const tx=-nz,tz=nx,tl=rz*tx-rx*tz;
      const vt=car.vx*tx+car.vz*tz+car.yawRate*tl;
      const jt=clamp(-vt/(invMass+tl*tl*invI),-.18*j,.18*j);
      car.vx+=jt*tx*invMass;car.vz+=jt*tz*invMass;car.yawRate+=jt*tl*invI;
      this.hit(car,-vn);
    }
    measureVelocity(car);applyRoadPose(car);
  }
  guardrail(car,p=this.track.project(car.x,car.z,car.hint)) {
    const depth=p.distance-(BARRIER-1.2);if(depth<=0)return false;
    const sign=p.lateral>=0?1:-1;
    this.staticContact(car,-Math.cos(p.heading)*sign,Math.sin(p.heading)*sign,depth);
    return true;
  }
  nearSolid(x,z,r=0){return this.layout.trees.some(t=>Math.hypot(x-t.x,z-t.z)<r+t.radius)||this.layout.walls.some(w=>Math.hypot(x-w.x,z-w.z)<r+w.length*.5);}
  updateProps(dt){
    const pad=80,b=this.track.bounds;
    for(const p of this.props){
      p.x=clamp(p.x+p.vx*dt,b.minX-pad,b.maxX+pad);p.z=clamp(p.z+p.vz*dt,b.minZ-pad,b.maxZ+pad);
      p.vx*=Math.exp(-4*dt);p.vz*=Math.exp(-4*dt);
      if(p.tilt>0)p.tilt=smooth(p.tilt,Math.PI/2,5,dt);
      p.y=roadPose(p.x,p.z,p.yaw).y;
      if(Math.hypot(p.vx,p.vz)<.03){p.vx=0;p.vz=0;}
    }
  }
  collideCircle(car,x,z,r) {
    const dx=car.x-x,dz=car.z-z,d=Math.hypot(dx,dz),min=carRadius+r;if(d>=min)return false;
    const speed=Math.hypot(car.vx,car.vz);
    const nx=d>.001?dx/d:(speed>.001?-car.vx/speed:1),nz=d>.001?dz/d:(speed>.001?-car.vz/speed:0);
    this.staticContact(car,nx,nz,min-d);return true;
  }
  collideWall(car,w) {
    const c=Math.cos(w.yaw),s=Math.sin(w.yaw),dx=car.x-w.x,dz=car.z-w.z;
    const lx=dx*s+dz*c,lz=dx*c-dz*s,hx=w.length/2,hz=w.width/2;
    const ex=lx-clamp(lx,-hx,hx),ez=lz-clamp(lz,-hz,hz),d=Math.hypot(ex,ez);
    if(d>=carRadius)return false;
    let nx,nz,depth=carRadius-d;
    if(d>.001){nx=ex/d;nz=ez/d;}
    else if(hx-Math.abs(lx)<hz-Math.abs(lz)){nx=Math.sign(lx)||1;nz=0;depth=carRadius+hx-Math.abs(lx);}
    else {nx=0;nz=Math.sign(lz)||1;depth=carRadius+hz-Math.abs(lz);}
    this.staticContact(car,nx*s+nz*c,nx*c-nz*s,depth);return true;
  }
  collideProp(car,p) {
    const dx=p.x-car.x,dz=p.z-car.z,d=Math.hypot(dx,dz),min=carRadius+p.radius;
    if(d>=min)return false;
    const nx=d>.001?dx/d:Math.sin(car.yaw),nz=d>.001?dz/d:Math.cos(car.yaw);
    const closing=this.pairImpulse(car,p,car.model.mass,p.mass,nx,nz,min-d,.3,.12);
    if(closing>3){p.tilt=Math.max(p.tilt,clamp(closing*.08,.2,1.2));p.yaw=Math.atan2(p.vx,p.vz);p.active=true;}
    p.y=roadPose(p.x,p.z,p.yaw).y;measureVelocity(car);applyRoadPose(car);return true;
  }
  sceneryCollisions() {
    for(const car of this.cars){if(car.finished)continue;
      for(const t of this.layout.trees)if(Math.hypot(car.x-t.x,car.z-t.z)<carRadius+t.radius)this.collideCircle(car,t.x,t.z,t.radius);
      for(const w of this.layout.walls)if(Math.hypot(car.x-w.x,car.z-w.z)<carRadius+Math.hypot(w.length,w.width)/2)this.collideWall(car,w);
      for(const p of this.props)this.collideProp(car,p);
      this.guardrail(car);applyRoadPose(car);
    }
  }
  standings() {
    return [...this.cars].sort((a,b)=>{
      if(a.finished&&b.finished)return a.finishTime+a.penalty-b.finishTime-b.penalty;
      if(a.finished!==b.finished)return a.finished?-1:1;
      return b.progress-a.progress;
    });
  }
}
