// City gameplay extends the live Race implementation. Never copy drive(), boost,
// drift, chassis or checkpoint internals from the parallel workstream.
import { Race as CircuitRace, HALF_WIDTH, clamp, mod } from './sim.js';
import { roadPose } from './mountain-layout.js';
export const CITY_TRACK = 'anime-night-city-v1';
export const modeFor = (trackId, mode) => trackId === CITY_TRACK && mode === 'free-roam' ? 'free-roam' : 'race';
export function populationBudget(quality = 'high', density = 'busy') {
 const factor = density === 'reduced' ? .5 : 1;
 return { traffic: (quality === 'high' ? 48 : 24) * factor, pedestrians: (quality === 'high' ? 120 : 60) * factor };
}
export function streetDistance(track, x, z) {
 const b = track.bounds;
 if (Math.abs(x-b.centerX)>400 || Math.abs(z-b.centerZ)>400) return Infinity;
 const distance = n => Math.min(mod(n,80),80-mod(n,80));
 return Math.min(distance(x-b.centerX),distance(z-b.centerZ));
}
export class SpatialGrid {
 constructor(items = [], size = 32) { this.size=size;this.cells=new Map(); for(const item of items)this.insert(item); }
 insert(item) {
  const r=item.radius || Math.hypot(item.width,item.length)/2;
  for(let x=Math.floor((item.x-r)/this.size);x<=Math.floor((item.x+r)/this.size);x++)
   for(let z=Math.floor((item.z-r)/this.size);z<=Math.floor((item.z+r)/this.size);z++){
    const key=`${x},${z}`;if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(item);
   }
 }
 query(x,z,r=3) {
  const found=new Set();
  for(let ix=Math.floor((x-r)/this.size);ix<=Math.floor((x+r)/this.size);ix++)
   for(let iz=Math.floor((z-r)/this.size);iz<=Math.floor((z+r)/this.size);iz++)
    for(const item of this.cells.get(`${ix},${iz}`)||[])found.add(item);
  return [...found];
 }
}
export function boxContact(body, box, radius = 1.9) {
 const c=Math.cos(box.yaw||0),s=Math.sin(box.yaw||0),dx=body.x-box.x,dz=body.z-box.z;
 const x=dx*c-dz*s,z=dx*s+dz*c,hx=box.width/2,hz=box.length/2;
 const ex=x-clamp(x,-hx,hx),ez=z-clamp(z,-hz,hz),distance=Math.hypot(ex,ez);
 if(distance>=radius)return null;
 let nx,nz,depth=radius-distance;
 if(distance>1e-8){nx=ex/distance;nz=ez/distance;}
 else if(hx-Math.abs(x)<hz-Math.abs(z)){nx=Math.sign(x)||1;nz=0;depth=radius+hx-Math.abs(x);}
 else{nx=0;nz=Math.sign(z)||1;depth=radius+hz-Math.abs(z);}
 return {nx:nx*c+nz*s,nz:-nx*s+nz*c,depth};
}
function refresh(body) {
 const p=roadPose(body.x,body.z,body.yaw);Object.assign(body,{y:p.y,pitch:p.pitch,roll:p.roll});
 body.speed=Math.hypot(body.vx,body.vz);
 body.forwardSpeed=body.vx*Math.sin(body.yaw)+body.vz*Math.cos(body.yaw);
 body.lateralSpeed=body.vx*Math.cos(body.yaw)-body.vz*Math.sin(body.yaw);
}
function routePoint(route,distance) {
 for(let i=0;i<route.length;i++){
  const a=route[i],b=route[(i+1)%route.length],length=Math.hypot(b.x-a.x,b.z-a.z);
  if(distance<=length)return {x:a.x+(b.x-a.x)*distance/length,z:a.z+(b.z-a.z)*distance/length,next:(i+1)%route.length};
  distance-=length;
 }
 return {...route[0],next:1};
}
function routeLength(route){return route.reduce((n,a,i)=>n+Math.hypot(a.x-route[(i+1)%route.length].x,a.z-route[(i+1)%route.length].z),0);}

export class Race extends CircuitRace {
 constructor(config={}) {
  super(config);
  this.trackId=config.trackId;this.mode=modeFor(this.trackId,config.mode);
  this.quality=config.quality||'high';this.density=config.density==='reduced'?'reduced':'busy';
  this.cityEnabled=this.trackId===CITY_TRACK;this.freeRoam=this.cityEnabled&&this.mode==='free-roam';
  this.districtColliders=[];this.districtGrid=new SpatialGrid();this.traffic=[];this.pedestrians=[];this.districtConfigured=false;
  for(const car of this.cars){car.offCourse=false;car.rejoinPending=false;car.lapPausedSeconds=0;car.lastValidGate=-1;}
 }
 configureDistrict(colliders) {
  if(!this.cityEnabled)return;
  if(!Array.isArray(colliders)||colliders.length>12000)throw Error('Invalid district collision layout');
  this.districtColliders=colliders.map((c,i)=>{
   if(![c.x,c.z,c.width,c.length,c.yaw||0].every(Number.isFinite)||c.width<=0||c.length<=0)throw Error('Invalid district collider');
   return {id:c.id||`solid-${i}`,x:c.x,z:c.z,width:c.width,length:c.length,yaw:c.yaw||0};
  });
  this.districtGrid=new SpatialGrid(this.districtColliders);this.districtConfigured=true;
  // Scene-derived colliders include the visible shared walls and bollards.
  // The base pass must not resolve these a second time.
  this.layout={...this.layout,trees:[],walls:[]};
  this.createPopulation();
 }
 clearAt(x,z,radius){return !this.districtGrid.query(x,z,radius).some(box=>boxContact({x,z},box,radius));}
 createPopulation() {
  this.traffic=[];this.pedestrians=[];
  const budget=populationBudget(this.quality,this.density),{centerX:cx,centerZ:cz}=this.track.bounds;
  const routes={traffic:[],pedestrian:[]};
  for(let iz=-5;iz<5;iz++)for(let ix=-5;ix<5;ix++)for(const kind of ['traffic','pedestrian']){
   const inset=kind==='traffic'?3:9;
   const x=cx+ix*80,z=cz+iz*80;
   const route=[{x:x+inset,z:z+inset},{x:x+80-inset,z:z+inset},{x:x+80-inset,z:z+80-inset},{x:x+inset,z:z+80-inset}];
   const radius=kind==='traffic'?1.9:.38, length=routeLength(route);let valid=true;
   // Keep ambient actors away from the circuit so racers retain their line.
   // This also avoids the legacy shoulder gap in the presentational grid.
   for(let s=0;s<length;s+=3){const p=routePoint(route,s);if(!this.clearAt(p.x,p.z,radius+.6)||this.track.project(p.x,p.z).distance<25){valid=false;break;}}
   if(valid)routes[kind].push(route);
  }
  for(const kind of ['traffic','pedestrian']){
   const count=kind==='traffic'?budget.traffic:budget.pedestrians,available=routes[kind],list=kind==='traffic'?this.traffic:this.pedestrians;
   for(let i=0;i<count&&available.length;i++){
    const route=available[i%available.length],lap=Math.floor(i/available.length),length=routeLength(route);
    const p=routePoint(route,(i*31+lap*17)%length),radius=kind==='traffic'?1.9:.38;
    if([...this.cars,...list].some(a=>Math.hypot(a.x-p.x,a.z-p.z)<radius+(a.radius||1.9)+2))continue;
    const target=route[p.next],yaw=Math.atan2(target.x-p.x,target.z-p.z);
    const body={id:`${kind}-${i}`,kind,index:-1,x:p.x,z:p.z,yaw,vx:0,vz:0,yawRate:0,radius,
     model:{mass:kind==='traffic'?1000:75,wheelbase:kind==='traffic'?2.5:.5},damage:{engine:0,steering:0,tires:0},
     impact:0,impactCooldown:0,notification:'',noticeUntil:0,speed:0,route,next:p.next,braking:false,reacting:false,
     cruise:kind==='traffic'?6+i%3:1.1+(i%3)*.15};
    refresh(body);list.push(body);
   }
  }
 }
 // Street surface adapter only during inherited tire integration. advance(),
 // checkpoint tests and AI continue to see the true circuit projection. This
 // avoids editing or duplicating the parallel drive()/nitro/drift implementation.
 drive(car,input,dt) {
  if(!this.freeRoam||car!==this.player)return super.drive(car,input,dt);
  const original=this.track,project=original.project;
  this.track={...original,project:(x,z,hint)=>{
   const p=project(x,z,hint),d=streetDistance(original,x,z);
   return d<=6?{...p,distance:Math.min(p.distance,HALF_WIDTH-.01)}:p;
  }};
  try{return super.drive(car,input,dt);}finally{this.track=original;}
 }
 guardrail(car,p){if(this.freeRoam)return false;return super.guardrail(car,p);}
 advance(car,dt) {
  if(!this.freeRoam||car!==this.player)return super.advance(car,dt);
  const p=this.track.project(car.x,car.z),L=this.track.length;
  const delta=mod(p.s-car.previousS+L/2,L)-L/2;
  const outside=p.distance>HALF_WIDTH;
  if(outside||car.rejoinPending){
   car.offCourse=outside;car.rejoinPending=true;
   car.previousS=p.s;car.hint=p.index;car.offTime=0;car.offPenalized=false;
   if(car.lapStart!==null)car.lapStart+=dt;
   car.lapPausedSeconds+=dt;
   // Rejoin the segment leading to the next required checkpoint. Returning
   // farther ahead cannot grant progress or invalidate a paused excursion.
   const gateS=mod(car.nextGate*this.track.gateSize,L),behind=mod(gateS-p.s,L);
   if(!outside&&behind>0&&behind<=this.track.gateSize){
    car.progress=car.nextGate*this.track.gateSize-behind;
    car.rejoinPending=false;
   }
   return;
  }
  // Normal on-circuit skip/invalid-lap rules are inherited unchanged.
  car.offCourse=false;
  return super.advance(car,dt);
 }
 crossGate(car,gate,invalid) {
  if(this.freeRoam&&car===this.player&&(car.offCourse||car.rejoinPending))return;
  const required=car.nextGate;
  super.crossGate(car,gate,invalid);
  if(gate===required&&!invalid)car.lastValidGate=gate;
 }
 repair(car=this.player,kind='repair') {
  if(!this.freeRoam||car!==this.player)return super.repair(car,kind);
  const next=car.nextGate;
  car.nextGate=Math.max(0,(car.lastValidGate??-1)+1);
  const result=super.repair(car,kind);
  if(!result)car.nextGate=next;
  else{car.offCourse=false;car.rejoinPending=false;}
  return result;
 }
 step(dt,input={}) {
  if(!Number.isFinite(dt)||dt<=0)return;
  dt=Math.min(dt,1/30);
  if(dt>1/120+1e-10){const n=Math.ceil(dt*120);for(let i=0;i<n;i++)this.step(dt/n,input);return;}
  const active=this.phase==='racing';
  super.step(dt,input);
  if(active&&this.cityEnabled&&this.districtConfigured)this.stepPopulation(dt);
 }
 sceneryCollisions() {
  super.sceneryCollisions();
  if(this.cityEnabled&&this.districtConfigured)for(const car of this.cars)if(!car.finished)this.collideDistrict(car);
 }
 collideDistrict(body) {
  let collided=false;
  for(const box of this.districtGrid.query(body.x,body.z,body.radius||1.9)){
   const c=boxContact(body,box,body.radius||1.9);
   if(c){this.staticContact(body,c.nx,c.nz,c.depth);collided=true;}
  }
  return collided;
 }
 nearSolid(x,z,r=0){return super.nearSolid(x,z,r)||this.districtGrid?.query(x,z,r).some(b=>boxContact({x,z},b,r));}
 collideActors(a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,d=Math.hypot(dx,dz),r=(a.radius||1.9)+(b.radius||1.9);
  if(d>=r)return false;
  const severity=this.pairImpulse(a,b,a.model.mass,b.model.mass,d>1e-8?dx/d:1,d>1e-8?dz/d:0,r-d,.15,.18);
  this.hit(a,severity);this.hit(b,severity);refresh(a);refresh(b);return true;
 }
 stepPopulation(dt) {
  const actors=[...this.cars.filter(c=>!c.finished),...this.traffic,...this.pedestrians],grid=new SpatialGrid(actors);
  for(const body of [...this.traffic,...this.pedestrians]){
   body.impactCooldown=Math.max(0,body.impactCooldown-dt);
   let target=body.route[body.next],dx=target.x-body.x,dz=target.z-body.z,d=Math.hypot(dx,dz);
   if(d<1){body.next=(body.next+1)%body.route.length;target=body.route[body.next];dx=target.x-body.x;dz=target.z-body.z;d=Math.hypot(dx,dz);}
   const nx=dx/(d||1),nz=dz/(d||1),near=grid.query(body.x,body.z,35);
   let speed=body.cruise;body.braking=false;body.reacting=false;
   let fleeX=0,fleeZ=0;
   for(const other of near){
    if(other===body)continue;
    const ox=other.x-body.x,oz=other.z-body.z,distance=Math.hypot(ox,oz),along=ox*nx+oz*nz,lateral=Math.abs(ox*nz-oz*nx);
    if(body.kind==='traffic'&&along>0&&lateral<3.5&&distance<7+body.speed*2){speed=0;body.braking=true;}
    if(body.kind==='pedestrian'&&other.kind!=='pedestrian'){
     // Predict approach, then wait or retreat on the pavement. No pedestrian
     // ever starts a road crossing. Crossing corners are waiting areas only.
     const future=Math.hypot(ox+(other.vx||0)*.8,oz+(other.vz||0)*.8);
     if(distance<7||future<6){speed=0;body.reacting=true;fleeX-=ox/(distance||1);fleeZ-=oz/(distance||1);}
    }
   }
   let tx=nx*speed,tz=nz*speed;
   if(body.reacting){
    const norm=Math.hypot(fleeX,fleeZ)||1,px=body.x+fleeX/norm*.8,pz=body.z+fleeZ/norm*.8;
    const pavement=streetDistance(this.track,px,pz);
    if(pavement>=7&&pavement<=10&&this.clearAt(px,pz,.5)){tx=fleeX/norm*1.8;tz=fleeZ/norm*1.8;}
   }
   if(!this.clearAt(body.x+nx*(3+body.speed),body.z+nz*(3+body.speed),body.radius+.3)){tx=0;tz=0;body.braking=true;}
   const accel=body.kind==='traffic'?body.braking?9:3:4;
   body.vx+=clamp(tx-body.vx,-accel*dt,accel*dt);body.vz+=clamp(tz-body.vz,-accel*dt,accel*dt);
   body.x+=body.vx*dt;body.z+=body.vz*dt;
   if(Math.hypot(body.vx,body.vz)>.1)body.yaw=Math.atan2(body.vx,body.vz);
   this.collideDistrict(body);refresh(body);
  }
  // Rebuild after motion. Unique deterministic pairs share the production
  // equal/opposite mass impulse, including NPC/NPC and pedestrian contacts.
  const moved=new SpatialGrid(actors),order=new Map(actors.map((a,i)=>[a,i]));
  for(const a of actors)for(const b of moved.query(a.x,a.z,(a.radius||1.9)+2)){
   if(order.get(b)<=order.get(a)||this.cars.includes(a)&&this.cars.includes(b))continue;
   this.collideActors(a,b);
  }
 }
}
