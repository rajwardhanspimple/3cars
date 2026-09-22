import {RaceView as CircuitView} from './view.js';
import {createMustang,createCarEnvironment,MUSTANG_TRIANGLES} from './mustang.js';
import {clamp} from './sim.js';
const B=globalThis.BABYLON;
const v=(x=0,y=0,z=0)=>new B.Vector3(x,y,z);
export class RaceView extends CircuitView {
 constructor(canvas,race,options){
  super(canvas,race,options);
  this.environment=createCarEnvironment(this.scene);
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
  player.body.rotation.setAll(0);this.cameraReady=false;this.setWeather(race.weather);
  if(status){status.textContent='Original model: 1,493,119 triangles. No reduced-detail versions.';status.dataset.triangles=String(MUSTANG_TRIANGLES);status.dataset.loaded='true';}
 }
 render(dt){
  if(this.disposed||this.carNodes.length!==3)return;
  this.elapsed+=dt;const race=this.race;
  for(const car of race.cars){const node=this.carNodes[car.index];node.root.position.set(car.x,0,car.z);node.root.rotation.y=car.yaw;node.body.rotation.z=-car.steer*clamp(car.speed/80,0,.6)*.06;node.body.rotation.x=(car.brake-car.throttle)*.012;
   for(const wheel of node.wheels){wheel.spin.rotation.x+=car.speed*dt/(wheel.radius||.43);if(wheel.front)wheel.pivot.rotation.y=car.steer*.48/(1+car.speed*.018);}
   if(node.imported){const tail=node.meshes.find(m=>m.material?.name==='RedGlass')?.material;if(tail)tail.emissiveColor.set(.22+car.brake*.55,.003,.002);}
  }
  const p=race.player,forward=v(Math.sin(p.yaw),0,Math.cos(p.yaw));let desired,target;
  if(race.phase==='menu'){
   const orbit=this.reducedMotion?0:Math.sin(this.elapsed*.08)*.18;
   const a=p.yaw+.72+orbit;desired=v(p.x+Math.sin(a)*7.8,2.65,p.z+Math.cos(a)*7.8);
   // Shift the car into the free space beside the setup panel.
   target=v(p.x+Math.cos(a)*1.25,.88,p.z-Math.sin(a)*1.25);
  }else{desired=v(p.x-forward.x*(8.5+p.speed*.03),3.9+p.speed*.013,p.z-forward.z*(8.5+p.speed*.03));target=v(p.x+forward.x*8,1.05,p.z+forward.z*8);}
  if(!this.cameraReady){this.camera.position.copyFrom(desired);this.cameraReady=true;}else B.Vector3.LerpToRef(this.camera.position,desired,1-Math.exp(-dt*5),this.camera.position);
  this.camera.setTarget(target);this.camera.fov=race.phase==='menu'?.65:.8+(this.reducedMotion?0:clamp(p.speed/500,0,.12));
  if(race.weather==='wet'){for(let i=0;i<this.rainLines.length;i++){const x=p.x+Math.sin(i*127.1)*25,z=p.z+Math.cos(i*311.7)*25,y=((i*.71-this.elapsed*23)%20+20)%20;this.rainLines[i][0].set(x,y,z);this.rainLines[i][1].set(x-.18,y-1.2,z+.08);}B.MeshBuilder.CreateLineSystem('rain',{lines:this.rainLines,instance:this.rain});}
  this.scene.render();
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.revision=(this.revision||0)+1;super.dispose();}
}
