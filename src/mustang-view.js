import {RaceView as CircuitView} from './view.js';
import {createMustangFleet,createCarEnvironment,MUSTANG_TRIANGLES,MUSTANG_FLEET_TRIANGLES} from './mustang.js';
import {applyCelShading} from './cel-shading.js';
import {DrivingEffects} from './driving-effects.js';
import {BoostEffects} from './boost-effects.js';
import {RenderMotion,FollowCamera} from './render-motion.js';
import {roadHeight,roadPose} from './mountain-layout.js';
import {clamp} from './sim.js';
const B=globalThis.BABYLON;
const v=(x=0,y=0,z=0)=>new B.Vector3(x,y,z);
const nowSeconds=()=>((globalThis.performance?.now?.()??Date.now())*.001);
const baseMaterialName=name=>String(name||'').replace(/^car-\d+-/,'');
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const wheelContractIndex=wheel=>wheel.front?(wheel.pivot.position.x<0?0:1):(wheel.pivot.position.x<0?2:3);
export class RaceView extends CircuitView {
 constructor(canvas,race,options){
  super(canvas,race,options);
  this.environment=createCarEnvironment(this.scene);
  this.effects=new DrivingEffects(this.scene,{reducedMotion:this.reducedMotion});
  this.boostEffects=new BoostEffects(this.scene,this.camera,{quality:this.quality,reducedMotion:this.reducedMotion});
  if(this.carNodes?.length){this.effects.setCarNodes(this.carNodes);this.effects.disposeFlames();this.boostEffects.setCarNodes(this.carNodes);}
  this.motion=new RenderMotion();this.followCamera=new FollowCamera();
  this._lastFrameTime=nowSeconds();this._boostFov=0;
  this.celOptions=options?.celShading||{};
 }
 setRace(race){this.ready=this.refreshRace(race);return this.ready;}
 disposeCurrentCarNodes(){
  for(const item of this.carNodes||[]){
   for(const mesh of item?.root?.getChildMeshes?.()||[])this.shadow.removeShadowCaster(mesh);
   item?.root?.dispose?.();
  }
  this.carNodes=[];
 }
 async refreshRace(race){
  const revision=this.revision=(this.revision||0)+1;this.race=race;
  this.motion?.clear();this.followCamera=new FollowCamera();this._boostFov=0;this.boostEffects?.reset();
  const status=document.getElementById('model-status');if(status)status.textContent='Loading original Mustang geometry...';
  if(!this.carNodes?.every?.(node=>node?.imported))this.disposeCurrentCarNodes();
  if(!this.fleetPromise)this.fleetPromise=createMustangFleet(this,race.cars);
  try{
   const [fleet]=await Promise.all([this.fleetPromise,Promise.resolve(this.scenery?.ready)]);
   if(this.disposed||revision!==this.revision)return;
   this.carNodes=fleet;
   for(const car of race.cars){
    const node=this.carNodes[car.index]||this.carNodes.find(item=>item.root.name===`car-${car.index}`);if(!node)continue;
    node.model=car.model;
    node.wheelRestY=node.wheels.map(wheel=>wheel.pivot.position.y);
    if(node.paint)node.paint.albedoColor=B.Color3.FromHexString(car.model.color).toLinearSpace();
    for(const wheel of node.wheels){wheel.spin.rotation.setAll(0);wheel.pivot.rotation.setAll(0);}
    node.body.position.setAll(0);node.body.rotation.setAll(0);
   }
   this.cacheTailMaterials();this.effects?.setCarNodes(this.carNodes);this.effects?.disposeFlames();this.boostEffects?.setCarNodes(this.carNodes);this.cameraReady=false;this.setWeather(race.weather);
   // Convert only after async world textures, foliage instances and fleet clones exist.
   // Source paint/tail handles stay live; the renderer reads them on every bind.
   this.celShading=applyCelShading(this,this.celShading?{}:this.celOptions);
   if(status){
    status.textContent='Original Mustang fleet: 3 × 1,493,119 = 4,479,357 triangles. Shared geometry, no reduced-detail versions.';
    status.dataset.triangles=String(MUSTANG_TRIANGLES);
    status.dataset.totalTriangles=String(MUSTANG_FLEET_TRIANGLES);
    status.dataset.loaded='true';
    delete status.dataset.error;
   }
  }catch(error){
   if(status&&revision===this.revision&&!this.disposed){
    status.textContent=`Load error: ${error?.message||error}`;
    status.dataset.loaded='false';
    status.dataset.error='true';
   }
   throw error;
  }
 }
 cacheTailMaterials(){
  for(const node of this.carNodes||[])if(node?.imported&&!node.tailMaterial)node.tailMaterial=node.meshes?.find(mesh=>baseMaterialName(mesh.material?.name)==='RedGlass')?.material||null;
 }
 render(dt){
  if(this.disposed||this.carNodes.length!==3)return;
  const wall=nowSeconds(),wallDt=clamp(wall-(this._lastFrameTime||wall),0,.25);this._lastFrameTime=wall;
  const race=this.race,frameDt=Number.isFinite(dt)?Math.max(0,dt):wallDt;
  const stepDt=(race.phase==='paused'||race.phase==='finished')?0:clamp(frameDt,0,.1);
  const cars=this.motion.sample(race,wall*1000),p=cars[0],playerSurface=roadPose(p.x,p.z,p.yaw),renderPlayer={...p,y:Number.isFinite(p.y)?p.y:roadHeight(p.x,p.z),pitch:Number.isFinite(p.pitch)?p.pitch:playerSurface.pitch,roll:Number.isFinite(p.roll)?p.roll:playerSurface.roll};this.elapsed+=stepDt;
  for(const car of cars){const node=this.carNodes[car.index],surface=roadPose(car.x,car.z,car.yaw),carY=Number.isFinite(car.y)?car.y:roadHeight(car.x,car.z),roadPitch=Number.isFinite(car.pitch)?car.pitch:surface.pitch,roadRoll=Number.isFinite(car.roll)?car.roll:surface.roll,bodyPitch=finite(car.bodyPitch,0),bodyRoll=finite(car.bodyRoll,0),bodyHeave=finite(car.bodyHeave,0),suspension=Array.isArray(car.suspension)?car.suspension:[],wheelSpin=Array.isArray(car.wheelSpin)?car.wheelSpin:null;node.root.position.set(car.x,carY,car.z);node.root.rotation.x=roadPitch;node.root.rotation.y=car.yaw;node.root.rotation.z=roadRoll;node.body.position.y=bodyHeave;node.body.rotation.x=bodyPitch;node.body.rotation.z=bodyRoll;
   if(!node.wheelRestY)node.wheelRestY=node.wheels.map(wheel=>wheel.pivot.position.y);
   for(let wheelIndex=0;wheelIndex<node.wheels.length;wheelIndex++){const wheel=node.wheels[wheelIndex],contractIndex=wheelContractIndex(wheel),compression=clamp(finite(suspension[contractIndex],0),-.18,.34);wheel.pivot.position.y=node.wheelRestY[wheelIndex]+compression;if(wheel.front)wheel.pivot.rotation.y=car.steeringAngle||0;const spin=wheelSpin?finite(wheelSpin[contractIndex],car.speed/(wheel.radius||.43)):car.speed/(wheel.radius||.43);wheel.spin.rotation.x+=spin*stepDt;}
   if(node.tailMaterial)node.tailMaterial.emissiveColor.set(.22+(car.brake||0)*.55,.003,.002);
  }
  const bodyX=Math.sin(renderPlayer.yaw),bodyZ=Math.cos(renderPlayer.yaw),speed=Math.max(0,renderPlayer.speed||0),velSpeed=Math.hypot(renderPlayer.vx||0,renderPlayer.vz||0);
  let velX=bodyX,velZ=bodyZ;if(velSpeed>.35){velX=(renderPlayer.vx||0)/velSpeed;velZ=(renderPlayer.vz||0)/velSpeed;}
  const driftBlend=clamp(Math.abs(renderPlayer.driftAngle||0)*1.35,0,.72);
  let lookX=bodyX+(velX-bodyX)*driftBlend,lookZ=bodyZ+(velZ-bodyZ)*driftBlend;const lookLen=Math.hypot(lookX,lookZ)||1;lookX/=lookLen;lookZ/=lookLen;
  const steer=clamp(renderPlayer.steeringAngle||0,-.55,.55),latX=Math.cos(renderPlayer.yaw),latZ=-Math.sin(renderPlayer.yaw);let offset,look;
  if(race.phase==='menu'){
   const orbit=this.reducedMotion?0:Math.sin(this.elapsed*.08)*.18,a=renderPlayer.yaw+.72+orbit;
   offset={x:Math.sin(a)*7.8,y:2.65,z:Math.cos(a)*7.8};look={x:Math.cos(a)*1.25,y:.88,z:-Math.sin(a)*1.25};
  }else{
   offset={x:-lookX*(8.5+speed*.03),y:3.9+speed*.013,z:-lookZ*(8.5+speed*.03)};
   look={x:lookX*8+latX*steer*3.1,y:1.05,z:lookZ*8+latZ*steer*3.1};
  }
  const snap=!this.cameraReady||this.motion.resetCamera;
  const camera=this.followCamera.update(renderPlayer,offset,look,stepDt,snap,{reducedMotion:this.reducedMotion});
  const surge=this.boostEffects.update(cars,stepDt,race.phase,snap);
  // Add ignition displacement after the existing interpolated road/body camera.
  this.camera.position.set(camera.position.x+latX*surge.shakeX,camera.position.y+surge.shakeY,camera.position.z+latZ*surge.shakeX);
  this.camera.setTarget(v(camera.target.x,camera.target.y,camera.target.z));this.cameraReady=true;
  const boostTarget=(!this.reducedMotion&&race.phase==='racing'&&renderPlayer.boostActive)?1:0;this._boostFov+=(boostTarget-this._boostFov)*(1-Math.exp(-stepDt*7));
  this.camera.fov=race.phase==='menu'?.65:(this.reducedMotion?.8:.8+clamp(speed/500,0,.12)+this._boostFov*.035);
  if(race.weather==='wet'){for(let i=0;i<this.rainLines.length;i++){const x=renderPlayer.x+Math.sin(i*127.1)*25,z=renderPlayer.z+Math.cos(i*311.7)*25,y=renderPlayer.y+(((i*.71-this.elapsed*23)%20+20)%20);this.rainLines[i][0].set(x,y,z);this.rainLines[i][1].set(x-.18,y-1.2,z+.08);}B.MeshBuilder.CreateLineSystem('rain',{lines:this.rainLines,instance:this.rain});}
  this.effects?.update(this.carNodes,cars,stepDt,race.phase,race.weather);
  this.updateScenery?.(stepDt,renderPlayer,race.phase);
  this.scene.render();
 }
 dispose(){if(this.disposed)return;this.celShading?.dispose();this.boostEffects?.dispose();this.effects?.dispose();this.effects=null;this.motion?.clear();this.disposed=true;this.revision=(this.revision||0)+1;super.dispose();}
}
