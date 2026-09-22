// Presentation only. Never write interpolated values back into the simulation.
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const TAU=Math.PI*2;
export const shortestAngle=(a,b)=>((b-a+Math.PI)%TAU+TAU)%TAU-Math.PI;
const fields=['x','y','z','yaw','pitch','roll','vx','vz','speed','steer','throttle','brake','steeringAngle','driftAngle','slip','yawRate'];
const copyPose=car=>Object.fromEntries(fields.map(key=>[key,Number.isFinite(car[key])?car[key]:0]));
const capture=car=>({...copyPose(car),repairCooldown:car.repairCooldown||0});
const poses=cars=>cars.map(capture);

export class RenderMotion {
 constructor(delay=.05){this.delay=delay;this.clear();}
 clear(){this.race=null;this.phase=null;this.frames=[];this.display=null;this.lastWall=null;this.received=0;this.cursor=0;this.resetCamera=true;}
 reset(race,now){
  this.race=race;this.phase=race.phase;this.lastWall=this.received=now;
  this.frames=[{time:race.time,cars:poses(race.cars)}];this.cursor=race.time-this.delay;
  this.display=race.cars.map(car=>({...car}));this.resetCamera=true;return this.display;
 }
 sample(race,now){
  this.resetCamera=false;
  const newest=this.frames.at(-1),gap=this.lastWall===null?0:Math.max(0,(now-this.lastWall)/1000);
  if(this.race!==race||!newest||race.time<newest.time)return this.reset(race,now);
  this.lastWall=now;
  // Freeze exactly the last displayed pose, including after a hidden-tab pause.
  if(race.phase==='paused'){
   this.phase='paused';this.display=race.cars.map((car,i)=>({...car,...copyPose(this.display[i])}));return this.display;
  }
  if(race.phase!=='racing'){
   if(this.phase!==race.phase)this.resetCamera=true;
   this.phase=race.phase;this.received=now;this.cursor=race.time-this.delay;
   this.frames=[{time:race.time,cars:poses(race.cars)}];this.display=race.cars.map(car=>({...car}));return this.display;
  }
  if(this.phase!=='racing'){
   // Resume from the frozen visual pose and blend into fresh simulation snapshots.
   this.frames=[{time:race.time-this.delay,cars:poses(this.display)},{time:race.time,cars:poses(race.cars)}];
   this.cursor=race.time-this.delay;this.received=now;this.phase=race.phase;
   return this.display=race.cars.map((car,i)=>({...car,...copyPose(this.display[i])}));
  }
  let latest=this.frames.at(-1);
  const stateDt=Math.max(0,race.time-latest.time);
  if(gap>.25||stateDt>.25)return this.reset(race,now);
  let discontinuity=false;
  for(let i=0;i<race.cars.length;i++){
   const car=race.cars[i],previous=latest.cars[i];
   const distance=Math.hypot(car.x-previous.x,car.z-previous.z);
   const limit=Math.max(6,Math.max(car.speed||0,previous.speed)*stateDt*2+2);
   if((car.repairCooldown||0)>previous.repairCooldown+.01||distance>limit){
    // Repairs and checkpoint resets must not glide through the scenery.
    for(const frame of this.frames)frame.cars[i]=capture(car);
    discontinuity=true;if(i===0)this.resetCamera=true;
   }
  }
  if(race.time>latest.time){
   this.frames.push({time:race.time,cars:poses(race.cars)});
   if(this.frames.length>12)this.frames.shift();this.received=now;
  }else if(discontinuity){latest.cars=poses(race.cars);}
  latest=this.frames.at(-1);
  const target=latest.time-this.delay+Math.max(0,(now-this.received)/1000);
  const advanced=this.cursor+gap;
  // A bounded clock correction absorbs packet jitter without moving time backwards.
  this.cursor=Math.min(latest.time,Math.max(this.cursor,advanced+clamp(target-advanced,-gap*.1,gap*.1)));
  let before=this.frames[0],after=before;
  for(const frame of this.frames){after=frame;if(frame.time>=this.cursor)break;before=frame;}
  const span=after.time-before.time,alpha=span>0?clamp((this.cursor-before.time)/span,0,1):1;
  this.display=race.cars.map((car,i)=>{
   const result={...car},a=before.cars[i],b=after.cars[i];
   for(const key of fields)result[key]=key==='yaw'?a.yaw+shortestAngle(a.yaw,b.yaw)*alpha:a[key]+(b[key]-a[key])*alpha;
   return result;
  });
  return this.display;
 }
}

// Smooth the camera's relative offsets, not its world-space position. Both the
// camera and its target follow the same interpolated anchor on every frame.
export class FollowCamera {
 constructor(){this.offset=null;this.look=null;}
 update(anchor,offset,look,dt,snap=false){
  if(!this.offset||snap){this.offset={...offset};this.look={...look};}
  else{
   const blend=1-Math.exp(-10*clamp(dt,0,.25));
   for(const key of ['x','y','z']){this.offset[key]+=(offset[key]-this.offset[key])*blend;this.look[key]+=(look[key]-this.look[key])*blend;}
  }
  const anchorY=Number.isFinite(anchor?.y)?anchor.y:0;
  return{position:{x:anchor.x+this.offset.x,y:anchorY+this.offset.y,z:anchor.z+this.offset.z},target:{x:anchor.x+this.look.x,y:anchorY+this.look.y,z:anchor.z+this.look.z}};
 }
}
