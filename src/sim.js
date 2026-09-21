export const TAU = Math.PI * 2;
export const LAPS = 5;
export const HALF_WIDTH = 9;
export const BARRIER = 17;
export const PENALTIES = Object.freeze({ cut: 5, skip: 10, repair: 20 });
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


export function makeTrack() {
  const controls = [[-90,-130],[65,-130],[138,-104],[163,-45],[102,-6],[145,62],[92,128],[7,127],[-37,55],[-118,91],[-165,38],[-126,-18],[-151,-80]];
  const points = [];
  for (let k = 0; k < controls.length; k++) {
    const p0 = controls[mod(k - 1, controls.length)], p1 = controls[k], p2 = controls[(k + 1) % controls.length], p3 = controls[(k + 2) % controls.length];
    for (let j = 0; j < 36; j++) {
      const t = j / 36, t2 = t * t, t3 = t2 * t;
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
  return {points,length,at,curvature,project, gates:24, gateSize:length/24};
}

function createCar(model,index,track) {
  const progress=-10-index*7, p=track.at(progress,(index%2 ? -1 : 1)*2.2);
  return {model,index,name:index===0?'You':index===1?'Mara':'Ellis',x:p.x,z:p.z,yaw:p.heading,vx:0,vz:0,speed:0,steer:0,throttle:0,brake:0,yawRate:0,gear:1,rpm:900,slip:0,tc:false,abs:false,
    progress,previousS:p.s,hint:p.index,nextGate:0,lap:1,lapStart:null,lapTimes:[],lapValid:true,bestLap:null,finished:false,finishTime:null,penalty:0,damage:{engine:0,steering:0,tires:0},offTime:0,offStart:0,offPenalized:false,impact:0,impactCooldown:0,stuckTime:0,repairCooldown:0,notification:'',noticeUntil:0};
}


export class Race {
  constructor({carId='vortex',weather='dry'}={}) {
    this.track=makeTrack(); this.weather=weather==='wet'?'wet':'dry'; this.time=0; this.phase='menu'; this.countdown=3; this.firstFinish=null; this.pausedPhase=null;
    const selected=CARS.find(c=>c.id===carId)||CARS[0];
    this.cars=[selected,...CARS.filter(c=>c!==selected)].map((c,i)=>createCar(c,i,this.track)); this.player=this.cars[0];
  }
  start() { if(this.phase==='menu') this.phase='countdown'; }
  pause() { if(['countdown','racing'].includes(this.phase)) {this.pausedPhase=this.phase;this.phase='paused';} else if(this.phase==='paused') {this.phase=this.pausedPhase;this.pausedPhase=null;} }
  tell(car,text) { car.notification=text;car.noticeUntil=this.time+4; }
  penalty(car,seconds,text) { car.penalty+=seconds;car.lapValid=false;this.tell(car,`${text} +${seconds}s`); }
  repair(car=this.player, kind='repair') {
    if(this.phase!=='racing'||car.finished||car.repairCooldown>0) return false;
    const safe=car.nextGate===0?-2:(car.nextGate-1)*this.track.gateSize+2;
    const p=this.track.at(safe,car.index===0?0:2.8*(car.index===1?1:-1));
    car.x=p.x;car.z=p.z;car.yaw=p.heading;car.vx=0;car.vz=0;car.speed=0;car.steer=0;car.yawRate=0;car.progress=safe;car.previousS=p.s;car.hint=p.index;car.offTime=0;car.offPenalized=false;car.stuckTime=0;car.repairCooldown=3;
    if(kind==='repair') car.damage={engine:0,steering:0,tires:0};
    this.penalty(car,PENALTIES[kind],kind==='repair'?'Repaired and returned':'Skipped checkpoint'); return true;
  }
  
ai(car) {
    const speed=Math.max(0,car.speed), look=8+speed*0.42;
    let lane=Math.sin(car.progress*0.009+car.index)*1.3;
    for(const other of this.cars) if(other!==car&&!other.finished) {
      const gap=other.progress-car.progress;
      if(gap>0&&gap<26&&Math.abs(other.speed-car.speed)<12) lane=car.index===1?-3.0:3.0;
    }
    const target=this.track.at(car.progress+look,lane), error=angle(Math.atan2(target.x-car.x,target.z-car.z)-car.yaw);
    const steer=clamp(Math.atan2(2*car.model.wheelbase*Math.sin(error),look)/0.48,-1,1);
    const mu=car.model.grip*(this.weather==='wet'?0.66:1)*(1-car.damage.tires*.35);
    let targetSpeed=car.model.topSpeed*.92;
    for(const d of [3,12,24,40,65,95]) {
      const cur=Math.max(Math.abs(this.track.curvature(car.progress+d)),0.0003);
      const corner=Math.sqrt(mu*9.81/cur)*.73;
      targetSpeed=Math.min(targetSpeed,Math.sqrt(corner*corner+2*mu*9.81*Math.max(0,d-10)*.68));
    }
    if(Math.abs(error)>0.65) targetSpeed=Math.min(targetSpeed,13);
    return {throttle:clamp((targetSpeed-speed)*.7,0,1),brake:clamp((speed-targetSpeed)*.32,0,1),steer};
  }
  
step(dt,input={}) {
    if(!Number.isFinite(dt)||dt<=0) return;
    dt=Math.min(dt,1/30);
    if(this.phase==='countdown') {this.countdown-=dt;if(this.countdown<=0)this.phase='racing';return;}
    if(this.phase!=='racing') return;
    this.time+=dt;
    for(const car of this.cars) {
      car.impactCooldown=Math.max(0,car.impactCooldown-dt);car.repairCooldown=Math.max(0,car.repairCooldown-dt);
      if(car.finished) continue;
      this.drive(car,car.index===0?input:this.ai(car),dt);
      this.advance(car,dt);
      if(car.index>0) { car.stuckTime=car.speed<2?car.stuckTime+dt:0; if(car.stuckTime>5)this.repair(car); }
    }
    this.collisions();
    if(this.cars.every(c=>c.finished)) this.phase='finished';
  }
  
drive(car,input,dt) {
    const number=v=>Number.isFinite(v)?v:0;
    car.throttle=smooth(car.throttle,clamp(number(input.throttle),0,1),4.5,dt);
    car.brake=smooth(car.brake,clamp(number(input.brake),0,1),9,dt);
    car.steer=smooth(car.steer,clamp(number(input.steer),-1,1),5.2,dt);
    const contact=this.track.project(car.x,car.z,car.hint),off=contact.distance>HALF_WIDTH;
    const fx=Math.sin(car.yaw),fz=Math.cos(car.yaw),rx=Math.cos(car.yaw),rz=-Math.sin(car.yaw);
    let longitudinal=Math.max(0,car.vx*fx+car.vz*fz),lateral=car.vx*rx+car.vz*rz;
    const grip=car.model.grip*(this.weather==='wet'?.66:1)*(off?.47:1)*(1-car.damage.tires*.4);
    const downforce=1+Math.min(.26,longitudinal*longitudinal*.00006),traction=grip*9.81*downforce;
    const driveForce=car.model.acceleration*car.throttle*(1-car.damage.engine*.55)/(1+longitudinal*.018);
    const braking=car.brake*18;
    car.tc=driveForce>traction*.86;car.abs=braking>traction*.95&&longitudinal>2;
    const acceleration=Math.min(driveForce,traction*.86)-Math.min(braking,traction*.95)-.32-longitudinal*longitudinal*.00065-(off?longitudinal*.38:0);
    longitudinal=clamp(longitudinal+acceleration*dt,0,car.model.topSpeed*(1-car.damage.engine*.28));
    const maxSteer=.48/(1+longitudinal*.018);
    const wheelAngle=car.steer*maxSteer*(1-car.damage.steering*.4)+Math.sin(this.time*1.6)*car.damage.steering*.016;
    const requested=longitudinal/car.model.wheelbase*Math.tan(wheelAngle);
    const yawLimit=traction/Math.max(longitudinal,5);
    car.yawRate=smooth(car.yawRate,clamp(requested,-yawLimit,yawLimit),6.5,dt);
    car.slip=clamp(Math.abs(requested)/(yawLimit+.001)-.75+Math.abs(lateral)*.05,0,1);
    lateral*=Math.exp(-grip*7*dt);
    car.vx=fx*longitudinal+rx*lateral;car.vz=fz*longitudinal+rz*lateral;
    car.yaw=angle(car.yaw+car.yawRate*dt);car.x+=car.vx*dt;car.z+=car.vz*dt;car.speed=longitudinal;
    const limits=[0,14,25,38,52,67,90];
    if(car.gear<6&&longitudinal>limits[car.gear])car.gear++;
    
if(car.gear>1&&longitudinal<limits[car.gear-1]-3)car.gear--;
    const low=limits[car.gear-1];car.rpm=clamp(2500+(longitudinal-low)/Math.max(1,limits[car.gear]-low)*5300,900,8500);if(longitudinal<2)car.rpm=900+car.throttle*1800;
  }
  advance(car,dt) {
    const p=this.track.project(car.x,car.z,car.hint),L=this.track.length;
    const delta=mod(p.s-car.previousS+L/2,L)-L/2;
    car.hint=p.index;car.previousS=p.s;
    if(Math.abs(delta)>Math.max(12,car.speed*dt*4+4)) {this.repair(car,'skip');return;}
    const before=car.progress;car.progress+=delta;
    if(p.distance>BARRIER-1.2) {
      const sign=p.lateral>=0?1:-1,nx=Math.cos(p.heading)*sign,nz=-Math.sin(p.heading)*sign;
      const outward=car.vx*nx+car.vz*nz;
      car.x=p.x+nx*(BARRIER-1.3);car.z=p.z+nz*(BARRIER-1.3);
      if(outward>0) {car.vx-=nx*outward*1.2;car.vz-=nz*outward*1.2;this.hit(car,outward);} 
    }
    if(p.distance>HALF_WIDTH+1) {
      if(car.offTime===0)car.offStart=car.progress;
      car.offTime+=dt;
      if(!car.offPenalized&&car.offTime>.6&&car.progress-car.offStart>8) {this.penalty(car,PENALTIES.cut,'Track limits');car.offPenalized=true;}
    } else {car.offTime=0;car.offPenalized=false;}
    const gate=car.nextGate*this.track.gateSize;
    
if(before<gate&&car.progress>=gate) {
      if(p.distance>HALF_WIDTH+1.5) {this.repair(car,'skip');return;}
      if(car.nextGate%this.track.gates===0) {
        if(car.lapStart!==null) {
          const lapTime=this.time-car.lapStart;
          car.lapTimes.push({time:lapTime,valid:car.lapValid});
          if(car.lapValid) car.bestLap=car.bestLap===null?lapTime:Math.min(car.bestLap,lapTime);
          if(car.lapTimes.length===LAPS) {car.finished=true;car.finishTime=this.time;car.vx=0;car.vz=0;car.speed=0;this.firstFinish??=this.time;}
        }
        car.lapStart=this.time;car.lapValid=true;car.lap=Math.min(LAPS,car.lapTimes.length+1);
      }
      car.nextGate++;
    }
    if(car.progress>car.nextGate*this.track.gateSize+4) this.repair(car,'skip');
  }
  
hit(car,severity) {
    if(car.impactCooldown>0||severity<2) return;
    car.impactCooldown=.5;car.impact++;
    const amount=clamp(severity/75,.015,.4);
    for(const key of ['engine','steering','tires'])car.damage[key]=clamp(car.damage[key]+amount*(key==='engine'?.75:1),0,1);
    this.tell(car,'Contact. Check vehicle condition.');
  }
  collisions() {
    for(let i=0;i<this.cars.length;i++)for(let j=i+1;j<this.cars.length;j++) {
      const a=this.cars[i],b=this.cars[j];if(a.finished||b.finished)continue;
      const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz);if(d>=3.8)continue;
      const nx=d>.001?dx/d:1,nz=d>.001?dz/d:0,overlap=(3.8-d)/2;
      a.x-=nx*overlap;a.z-=nz*overlap;b.x+=nx*overlap;b.z+=nz*overlap;
      const closing=(a.vx-b.vx)*nx+(a.vz-b.vz)*nz;
      if(closing>0) {const impulse=closing*.58;a.vx-=nx*impulse;a.vz-=nz*impulse;b.vx+=nx*impulse;b.vz+=nz*impulse;this.hit(a,closing);this.hit(b,closing);}
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
