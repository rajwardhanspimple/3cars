import {RaceView as CircuitView} from './view.js';
import {createMustang,createCarEnvironment,MUSTANG_TRIANGLES} from './mustang.js';
import {DrivingEffects} from './driving-effects.js';
import {clamp} from './sim.js';
const B=globalThis.BABYLON;
const v=(x=0,y=0,z=0)=>new B.Vector3(x,y,z);
const nowSeconds=()=>((globalThis.performance?.now?.()??Date.now())*.001);
export class RaceView extends CircuitView {
 constructor(canvas,race,options){
  super(canvas,race,options);
  this.environment=createCarEnvironment(this.scene);
  this.effects=new DrivingEffects(this.scene,{reducedMotion:this.reducedMotion});
  if(this.carNodes?.length)this.effects.setCarNodes(this.carNodes);
  this._lastFrameTime=nowSeconds();
  this._boostFov=0;
  // The base constructor invokes the overridden setRace and sets ready.
  this.scene.imageProcessingConfiguration.exposure=1.04;
  this.scene.imageProcessingConfiguration.contrast=1.08;
 }
 setRace(race){
  this.ready=this.refreshRace(race);return this.ready;
 }
 async refreshRace(race){
  const revision=this.revision=(this.revision||0)+1;this.race=race;
  const status=document.getElementById('model-status');if(status)status.textContent='Loading original Mustang geometry...';
  if(!this.modelPromise)this.modelPromise=createMustang(this,race.player);
  const player=await this.modelPromise;
  if(this.disposed||revision!==this.revision)return;
  for(const item of this.carNodes){if(item===player)continue;for(const mesh of item.root.getChildMeshes())this.shadow.removeShadowCaster(mesh);item.root.dispose();}
  this.carNodes=[player,...race.cars.slice(1).map(car=>super.createCar(car))];
  if(player.paint)player.paint.albedoColor=B.Color3.FromHexString(race.player.model.color).toLinearSpace();
  for(const wheel of player.wheels){wheel.spin.rotation.setAll(0);wheel.pivot.rotation.setAll(0);}
  player.body.rotation.setAll(0);this.cacheTailMaterials();this.effects?.setCarNodes(this.carNodes);this.cameraReady=false;this.setWeather(race.weather);
  if(status){status.textContent='Original model: 1,493,119 triangles. No reduced-detail versions.';status.dataset.triangles=String(MUSTANG_TRIANGLES);status.dataset.loaded='true';}
 }
 cacheTailMaterials(){
  for(const node of this.carNodes||[])if(node?.imported&&!node.tailMaterial)node.tailMaterial=node.meshes?.find(mesh=>mesh.material?.name==='RedGlass')?.material||null;
 }
 render(){
  if(this.disposed||this.carNodes.length!==3)return;
  const t=nowSeconds(),dt=clamp(t-(this._lastFrameTime||t),1/240,1/20);this._lastFrameTime=t;
  this.elapsed+=dt;const race=this.race;
  for(const car of race.cars){const node=this.carNodes[car.index];node.root.position.set(car.x,0,car.z);node.root.rotation.y=car.yaw;node.body.rotation.z=-(car.steer||0)*clamp(car.speed/80,0,.6)*.06;node.body.rotation.x=((car.brake||0)-(car.throttle||0))*.012;
   for(const wheel of node.wheels){wheel.spin.rotation.x+=car.speed*dt/(wheel.radius||.43);if(wheel.front)wheel.pivot.rotation.y=car.steeringAngle||0;}
   if(node.tailMaterial)node.tailMaterial.emissiveColor.set(.22+(car.brake||0)*.55,.003,.002);
  }
  const p=race.player,bodyX=Math.sin(p.yaw),bodyZ=Math.cos(p.yaw),speed=Math.max(0,p.speed||0),velSpeed=Math.hypot(p.vx||0,p.vz||0);
  let velX=bodyX,velZ=bodyZ;if(velSpeed>.35){velX=(p.vx||0)/velSpeed;velZ=(p.vz||0)/velSpeed;}
  const driftBlend=clamp(Math.abs(p.driftAngle||0)*1.35+(p.drifting ? .24 : 0),0,.72);
  let lookX=bodyX+(velX-bodyX)*driftBlend,lookZ=bodyZ+(velZ-bodyZ)*driftBlend;const lookLen=Math.hypot(lookX,lookZ)||1;lookX/=lookLen;lookZ/=lookLen;
  const steer=clamp(p.steeringAngle||0,-.55,.55),latX=Math.cos(p.yaw),latZ=-Math.sin(p.yaw);let desired,target;
  if(race.phase==='menu'){
   const orbit=this.reducedMotion?0:Math.sin(this.elapsed*.08)*.18;
   const a=p.yaw+.72+orbit;desired=v(p.x+Math.sin(a)*7.8,2.65,p.z+Math.cos(a)*7.8);
   // Shift the car into the free space beside the setup panel.
   target=v(p.x+Math.cos(a)*1.25,.88,p.z-Math.sin(a)*1.25);
  }else{desired=v(p.x-lookX*(8.5+speed*.03),3.9+speed*.013,p.z-lookZ*(8.5+speed*.03));target=v(p.x+lookX*8+latX*steer*3.1,1.05,p.z+lookZ*8+latZ*steer*3.1);}
  if(!this.cameraReady){this.camera.position.copyFrom(desired);this.cameraReady=true;}else B.Vector3.LerpToRef(this.camera.position,desired,1-Math.exp(-dt*10),this.camera.position);
  this.camera.setTarget(target);
  const boostTarget=(!this.reducedMotion&&race.phase==='racing'&&p.boostActive)?1:0;this._boostFov+= (boostTarget-this._boostFov)*(1-Math.exp(-dt*7));
  this.camera.fov=race.phase==='menu'?.65:.8+clamp(speed/500,0,.12)+(this.reducedMotion?0:this._boostFov*.035);
  if(race.weather==='wet'){for(let i=0;i<this.rainLines.length;i++){const x=p.x+Math.sin(i*127.1)*25,z=p.z+Math.cos(i*311.7)*25,y=((i*.71-this.elapsed*23)%20+20)%20;this.rainLines[i][0].set(x,y,z);this.rainLines[i][1].set(x-.18,y-1.2,z+.08);}B.MeshBuilder.CreateLineSystem('rain',{lines:this.rainLines,instance:this.rain});}
  this.effects?.update(this.carNodes,race.cars,race.phase==='paused'?0:dt,race.phase);
  this.scene.render();
 }
 dispose(){if(this.disposed)return;this.effects?.dispose();this.effects=null;this.disposed=true;this.revision=(this.revision||0)+1;super.dispose();}
}
