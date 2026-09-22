// Presentation only. Never write interpolated values back into the simulation.
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const TAU=Math.PI*2;
export const shortestAngle=(a,b)=>((b-a+Math.PI)%TAU+TAU)%TAU-Math.PI;
const scalarFields=['x','y','z','yaw','pitch','roll','vx','vz','speed','steer','throttle','brake','steeringAngle','driftAngle','slip','yawRate','bodyHeave','bodyPitch','bodyRoll','verticalG','roughness'];
const wheelFields=['wheelLoad','wheelSlip','wheelSpin','suspension'];
const wheelCount=4;
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const wheelArray=(car,key,fallback=0)=>Array.from({length:wheelCount},(_,i)=>finite(Array.isArray(car?.[key])?car[key][i]:undefined,fallback));
const contactArray=car=>Array.from({length:wheelCount},(_,i)=>['asphalt','curb','grass','dirt'].includes(car?.wheelContact?.[i])?car.wheelContact[i]:'asphalt');
const copyPose=car=>{
 const pose=Object.fromEntries(scalarFields.map(key=>[key,finite(car?.[key],key==='verticalG'?1:0)]));
 for(const key of wheelFields)pose[key]=wheelArray(car,key,key==='wheelLoad'?1:0);
 pose.wheelContact=contactArray(car);return pose;
};
const capture=car=>({...copyPose(car),repairCooldown:car.repairCooldown||0});
const poses=cars=>cars.map(capture);

export class RenderMotion {
 constructor(delay=.05){this.delay=delay;this.clear();}
 clear(){this.race=null;this.phase=null;this.frames=[];this.display=null;this.lastWall=null;this.received=0;this.cursor=0;this.resetCamera=true;}
 reset(race,now){
  this.race=race;this.phase=race.phase;this.lastWall=this.received=now;
  this.frames=[{time:race.time,cars:poses(race.cars)}];this.cursor=race.time-this.delay;
  this.display=race.cars.map(car=>({...car,...copyPose(car)}));this.resetCamera=true;return this.display;
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
   this.frames=[{time:race.time,cars:poses(race.cars)}];this.display=race.cars.map(car=>({...car,...copyPose(car)}));return this.display;
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
   for(const key of scalarFields)result[key]=key==='yaw'?a.yaw+shortestAngle(a.yaw,b.yaw)*alpha:a[key]+(b[key]-a[key])*alpha;
   for(const key of wheelFields)result[key]=Array.from({length:wheelCount},(_,j)=>a[key][j]+(b[key][j]-a[key][j])*alpha);
   result.wheelContact=Array.from({length:wheelCount},(_,j)=>alpha<.5?a.wheelContact[j]:b.wheelContact[j]);
   return result;
  });
  return this.display;
 }
}

// Smooth the camera's relative offsets, not its world-space position. Both the
// camera and its target follow the same interpolated anchor on every frame.
export class FollowCamera {
 constructor(){this.offset=null;this.look=null;this.body={heave:0,heaveV:0,pitch:0,pitchV:0,roll:0,rollV:0,phase:0,shakeX:0,shakeY:0};}
 spring(key,velocityKey,target,dt,stiffness=34,damping=10){
  const body=this.body;body[velocityKey]+=(target-body[key])*stiffness*dt;body[velocityKey]*=Math.exp(-damping*dt);body[key]+=body[velocityKey]*dt;
 }
 update(anchor,offset,look,dt,snap=false,options={}){
  if(!this.offset||snap){this.offset={...offset};this.look={...look};}
  else{
   const blend=1-Math.exp(-10*clamp(dt,0,.25));
   for(const key of ['x','y','z']){this.offset[key]+=(offset[key]-this.offset[key])*blend;this.look[key]+=(look[key]-this.look[key])*blend;}
  }
  const reduced=!!options.reducedMotion,body=this.body,speed=Math.max(0,anchor?.speed||0),verticalG=finite(anchor?.verticalG,1),roughness=clamp(finite(anchor?.roughness,0),0,1);
  const lateral=clamp((anchor?.yawRate||0)*clamp(speed/110,0,1),-.18,.18),targetHeave=finite(anchor?.bodyHeave,0)*.55+clamp(verticalG-1,-1.4,2.2)*(reduced?.035:.16),targetPitch=finite(anchor?.bodyPitch,0)*.55,targetRoll=finite(anchor?.bodyRoll,0)*.6+lateral*.45;
  if(snap){Object.assign(body,{heave:targetHeave,heaveV:0,pitch:targetPitch,pitchV:0,roll:targetRoll,rollV:0,shakeX:0,shakeY:0});}
  else if(dt>0){this.spring('heave','heaveV',targetHeave,dt);this.spring('pitch','pitchV',targetPitch,dt);this.spring('roll','rollV',targetRoll,dt);}
  if(dt>0){const amp=roughness*clamp(speed/120,0,1)*(reduced?.018:.08);body.phase+=dt*(22+speed*.07);body.shakeX=Math.sin(body.phase*1.7)*amp*.45;body.shakeY=Math.cos(body.phase*2.3)*amp;}
  const anchorY=Number.isFinite(anchor?.y)?anchor.y:0,yaw=anchor?.yaw||0,sideX=Math.cos(yaw),sideZ=-Math.sin(yaw),horizontal=Math.hypot(this.offset.x,this.offset.z)||1,pullBack=clamp((finite(anchor?.throttle,0)-finite(anchor?.brake,0))*.22*clamp(speed/80,0,1),-.08,.22);
  const physicalOffset={...this.offset},physicalLook={...this.look};
  physicalOffset.x+=this.offset.x/horizontal*pullBack+sideX*(-body.roll+body.shakeX);
  physicalOffset.y+=body.heave+body.shakeY;
  physicalOffset.z+=this.offset.z/horizontal*pullBack+sideZ*(-body.roll+body.shakeX);
  physicalLook.x+=sideX*body.roll*.28;
  physicalLook.y+=body.heave*.25-body.pitch*.9;
  physicalLook.z+=sideZ*body.roll*.28;
  return{position:{x:anchor.x+physicalOffset.x,y:anchorY+physicalOffset.y,z:anchor.z+physicalOffset.z},target:{x:anchor.x+physicalLook.x,y:anchorY+physicalLook.y,z:anchor.z+physicalLook.z}};
 }
}
