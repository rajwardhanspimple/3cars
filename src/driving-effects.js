import {roadHeight,roadPose} from './mountain-layout.js';

const B=globalThis.BABYLON;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const WHEEL_OFFSETS=[{lat:-.88,long:1.45},{lat:.88,long:1.45},{lat:-.88,long:-1.45},{lat:.88,long:-1.45}];
const WIND_X=.38,WIND_Z=.14;
const SURFACE_COLORS={asphalt:'#62645f',curb:'#c9c5bc',grass:'#7d8a4c',dirt:'#a67846',water:'#b8c9cf',grit:'#9b8a6f'};
const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const wheelArray=(car,key,fallback=0)=>Array.from({length:4},(_,i)=>finite(Array.isArray(car?.[key])?car[key][i]:undefined,fallback));
const contactArray=car=>Array.from({length:4},(_,i)=>['asphalt','curb','grass','dirt'].includes(car?.wheelContact?.[i])?car.wheelContact[i]:'asphalt');

function makeSmokeTexture(scene){
 const size=128,texture=new B.DynamicTexture('drift-smoke-procedural',{width:size,height:size},scene,false),ctx=texture.getContext(),image=ctx.createImageData(size,size);
 let seed=1493119;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  seed=(seed*1664525+1013904223)>>>0;
  const dx=x/(size-1)*2-1,dy=y/(size-1)*2-1,r=Math.sqrt(dx*dx+dy*dy),soft=clamp(1-r,0,1),noise=(seed/4294967295-.5)*.18,a=Math.pow(soft,1.8)*(1+noise);
  const k=(y*size+x)*4;image.data[k]=230;image.data[k+1]=232;image.data[k+2]=226;image.data[k+3]=Math.round(clamp(a,0,1)*255);
 }
 ctx.putImageData(image,0,0);texture.update();return texture;
}
function material(scene,name,hex,alpha=.62,texture=null){
 const m=new B.StandardMaterial(name,scene);m.diffuseColor=B.Color3.FromHexString(hex);m.emissiveColor=m.diffuseColor.scale(.34);m.alpha=alpha;m.specularColor=B.Color3.Black();m.transparencyMode=B.Material.MATERIAL_ALPHABLEND;if(texture){m.opacityTexture=texture;m.disableLighting=true;}return m;
}
function surfaceNormal(yaw,pitch,roll){
 const rotation=B.Quaternion.FromEulerAngles(pitch,yaw,roll),matrix=B.Matrix.Identity();
 rotation.toRotationMatrix(matrix);
 return B.Vector3.TransformNormal(B.Axis.Y,matrix).normalize();
}
function contactPoint(car,index){
 const yaw=car.yaw||0,sideX=Math.cos(yaw),sideZ=-Math.sin(yaw),frontX=Math.sin(yaw),frontZ=Math.cos(yaw),o=WHEEL_OFFSETS[index];
 const x=car.x+sideX*o.lat+frontX*o.long,z=car.z+sideZ*o.lat+frontZ*o.long;
 return{x,z,y:roadHeight(x,z)};
}

export class DrivingEffects{
 constructor(scene,{reducedMotion=false}={}){
  this.scene=scene;this.reducedMotion=reducedMotion;this.disposed=false;this.smokeIndex=0;this.skidIndex=0;this.particleIndex=0;this.speckIndex=0;this.emitClock=0;this.carStates=[];this.flames=[];
  this.smokeCount=reducedMotion?18:42;this.skidCount=128;this.particleCount=reducedMotion?70:170;this.speckCount=reducedMotion?36:96;this.smokeTexture=makeSmokeTexture(scene);
  this.smokeMaterial=material(scene,'drift-smoke-material','#9ea09a',.62,this.smokeTexture);
  this.particleMaterials={dust:material(scene,'shoulder-dust-material',SURFACE_COLORS.dirt,.56,this.smokeTexture),grass:material(scene,'grass-clod-dust-material',SURFACE_COLORS.grass,.54,this.smokeTexture),grit:material(scene,'curb-grit-material',SURFACE_COLORS.grit,.52,this.smokeTexture),water:material(scene,'wet-road-mist-material',SURFACE_COLORS.water,.42,this.smokeTexture)};
  this.speckMaterials={dirt:material(scene,'dirt-clod-material',SURFACE_COLORS.dirt,.9),grass:material(scene,'grass-clod-material',SURFACE_COLORS.grass,.88),grit:material(scene,'gravel-speck-material',SURFACE_COLORS.grit,.86),water:material(scene,'water-spray-speck-material',SURFACE_COLORS.water,.58)};
  this.skidMaterial=material(scene,'skid-mark-material','#050403',.36);
  this.flameMaterial=material(scene,'boost-flame-material','#0d2ee6',.46);
  this.flameMaterial.emissiveColor=new B.Color3(.14,.42,1);
  this.smoke=Array.from({length:this.smokeCount},(_,i)=>{const mesh=B.MeshBuilder.CreatePlane(`tire-smoke-${i}`,{size:1},scene);mesh.material=this.smokeMaterial;mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;mesh.setEnabled(false);return{mesh,life:0,age:0,x:0,y:0,z:0,vx:0,vz:0,rise:0,scale:1};});
  this.particles=Array.from({length:this.particleCount},(_,i)=>{const mesh=B.MeshBuilder.CreatePlane(`tire-particulate-${i}`,{size:1},scene);mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;mesh.setEnabled(false);return{mesh,life:0,age:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,scale:1,kind:'dust'};});
  this.specks=Array.from({length:this.speckCount},(_,i)=>{const mesh=B.MeshBuilder.CreateSphere(`grit-speck-${i}`,{diameter:.07,segments:4},scene);mesh.isPickable=false;mesh.setEnabled(false);return{mesh,life:0,age:0,x:0,y:0,z:0,vx:0,vy:0,vz:0,bounces:0};});
  this.skids=Array.from({length:this.skidCount},(_,i)=>{const mesh=B.MeshBuilder.CreatePlane(`skid-mark-${i}`,{width:.18,height:1.05},scene);mesh.material=this.skidMaterial;mesh.rotation.x=Math.PI/2;mesh.isPickable=false;mesh.setEnabled(false);return mesh;});
  this.updateMetadata();
 }
 setCarNodes(nodes){
  this.disposeFlames();this.carStates=nodes.map(()=>({wheels:Array.from({length:4},()=>({lastX:0,lastZ:0,lastSkidX:0,lastSkidZ:0,ready:false}))}));
  this.flames=nodes.map((node,index)=>[-1,1].map(side=>{const mesh=B.MeshBuilder.CreateCylinder(`boost-flame-${index}-${side}`,{height:.58,diameterTop:.025,diameterBottom:.18,tessellation:12},this.scene);mesh.material=this.flameMaterial;mesh.parent=node.root;mesh.position.set(side*.52,.42,-2.6);mesh.rotation.x=-Math.PI/2;mesh.scaling.set(.55,.65,.55);mesh.isPickable=false;mesh.setEnabled(false);return mesh;}));
  this.reset();this.updateMetadata();
 }
 disposeFlames(){for(const pair of this.flames)for(const mesh of pair)mesh.dispose();this.flames=[];}
 reset(){for(const item of this.smoke){item.life=0;item.age=0;item.mesh.setEnabled(false);}for(const item of this.particles){item.life=0;item.age=0;item.mesh.setEnabled(false);}for(const item of this.specks){item.life=0;item.age=0;item.mesh.setEnabled(false);}for(const mark of this.skids)mark.setEnabled(false);for(const pair of this.flames)for(const mesh of pair)mesh.setEnabled(false);for(const state of this.carStates)for(const wheel of state.wheels)wheel.ready=false;this.emitClock=0;this.updateMetadata();}
 update(nodes,cars,dt,phase,weather='clear'){
  if(this.disposed)return;const racing=phase==='racing';
  this.updateSmoke(dt);this.updateParticles(dt);this.updateSpecks(dt);this.updateFlames(cars,racing);
  if(!racing||dt<=0)return;
  this.emitClock+=dt;const emitStep=this.reducedMotion ? .09 : .045;if(this.emitClock<emitStep)return;this.emitClock=0;
  for(const car of cars){const state=this.carStates[car.index];if(!state)continue;const speed=Math.max(0,car.speed||0),slips=wheelArray(car,'wheelSlip',finite(car.slip,0)),loads=wheelArray(car,'wheelLoad',1),contacts=contactArray(car),roughness=clamp(finite(car.roughness,0),0,1);
   for(let i=0;i<4;i++){
    const p=contactPoint(car,i),wheel=state.wheels[i],dx=p.x-wheel.lastX,dz=p.z-wheel.lastZ,dist=Math.hypot(dx,dz),slip=clamp(slips[i],0,2.2),load=loads[i];
    if(!wheel.ready){this.syncWheel(wheel,p);wheel.ready=true;continue;}
    if(dist>10||load<=.04){this.syncWheel(wheel,p);continue;}
    if(speed<2){this.syncWheel(wheel,p);continue;}
    const slide=clamp((slip-.08)/1.05,0,1),surface=contacts[i],wet=weather==='wet';
    if(slide>.04){
     if((surface==='asphalt'||surface==='curb')&&!wet)this.emitSmoke(p,car.yaw,slide,speed,i);
     if(wet)this.emitParticulate(p,car.yaw,slide,speed,'water',i,roughness);
     else if(surface==='dirt')this.emitParticulate(p,car.yaw,slide,speed,'dust',i,roughness);
     else if(surface==='grass')this.emitParticulate(p,car.yaw,slide,speed,'grass',i,roughness);
     else if(surface==='curb')this.emitParticulate(p,car.yaw,slide,speed,'grit',i,roughness);
    }
    const skidDx=p.x-wheel.lastSkidX,skidDz=p.z-wheel.lastSkidZ,skidDist=Math.hypot(skidDx,skidDz);
    if(skidDist>.55&&slide>.5&&(surface==='asphalt'||surface==='curb')){this.placeSkid(p,wheel,skidDx,skidDz,skidDist,slide,wet);wheel.lastSkidX=p.x;wheel.lastSkidZ=p.z;}
    wheel.lastX=p.x;wheel.lastZ=p.z;
   }
  }
  this.updateMetadata();
 }
 syncWheel(wheel,p){wheel.lastX=wheel.lastSkidX=p.x;wheel.lastZ=wheel.lastSkidZ=p.z;}
 updateSmoke(dt){
  if(dt<=0)return;
  for(const item of this.smoke)if(item.life>0){item.age+=dt;const t=item.age/item.life;if(t>=1){item.life=0;item.mesh.setEnabled(false);continue;}item.x+=(item.vx+WIND_X*.18)*dt;item.z+=(item.vz+WIND_Z*.18)*dt;item.y+=item.rise*dt*(1-t*.75);item.mesh.position.set(item.x,item.y,item.z);const s=item.scale*(1+t*1.1);item.mesh.scaling.set(s,s,s);item.mesh.visibility=(1-t)*(.34+item.scale*.1);}
 }
 updateParticles(dt){
  if(dt<=0)return;
  for(const item of this.particles)if(item.life>0){item.age+=dt;const t=item.age/item.life;if(t>=1){item.life=0;item.mesh.setEnabled(false);continue;}item.vy+=(item.kind==='water'?-1.8:-.34)*dt;item.x+=(item.vx+WIND_X*(item.kind==='water'?.04:.22))*dt;item.z+=(item.vz+WIND_Z*(item.kind==='water'?.04:.22))*dt;item.y+=item.vy*dt;const ground=roadHeight(item.x,item.z)+.035;if(item.y<ground){item.y=ground;item.vy=0;item.vx*=.55;item.vz*=.55;}item.mesh.position.set(item.x,item.y,item.z);const s=item.scale*(1+t*(item.kind==='water'?.55:1.35));item.mesh.scaling.set(s,s,s);item.mesh.visibility=(1-t)*(.42+item.scale*.08);}
 }
 updateSpecks(dt){
  if(dt<=0)return;
  for(const item of this.specks)if(item.life>0){item.age+=dt;if(item.age>=item.life){item.life=0;item.mesh.setEnabled(false);continue;}item.vy-=7.5*dt;item.x+=item.vx*dt;item.y+=item.vy*dt;item.z+=item.vz*dt;const ground=roadHeight(item.x,item.z)+.045;if(item.y<ground){item.y=ground;if(item.bounces++<2&&Math.abs(item.vy)>.6)item.vy=-item.vy*.33;else{item.vy=0;item.vx*=.45;item.vz*=.45;}}item.mesh.position.set(item.x,item.y,item.z);item.mesh.visibility=1-item.age/item.life;}
 }
 updateFlames(cars,racing){
  for(const car of cars){const pair=this.flames[car.index];if(!pair)continue;const active=racing&&!!car.boostActive;for(let i=0;i<pair.length;i++){const mesh=pair[i];mesh.setEnabled(active);if(active){const pulse=.82+Math.sin((car.nitro||0)*.31+i)*.08;mesh.visibility=.42;mesh.scaling.set(.5,.55+pulse*.18,.5);}}}
 }
 emitSmoke(p,yaw,slide,speed,wheelIndex){
  const backX=-Math.sin(yaw),backZ=-Math.cos(yaw),amount=this.reducedMotion?1:Math.max(1,Math.ceil(slide*3));
  for(let n=0;n<amount;n++){const item=this.smoke[this.smokeIndex++%this.smoke.length],jitter=((this.smokeIndex*17+wheelIndex*13)%11-5)*.02;item.x=p.x+backX*.35+jitter;item.z=p.z+backZ*.35-jitter;item.y=p.y+.16;item.vx=backX*(.4+speed*.006)*slide;item.vz=backZ*(.4+speed*.006)*slide;item.life=.55+slide*.55;item.age=0;item.rise=.26+slide*.34;item.scale=.22+slide*.46;item.mesh.material=this.smokeMaterial;item.mesh.position.set(item.x,item.y,item.z);item.mesh.scaling.set(item.scale,item.scale,item.scale);item.mesh.visibility=.36;item.mesh.setEnabled(true);}
 }
 emitParticulate(p,yaw,slide,speed,kind,wheelIndex,roughness){
  const backX=-Math.sin(yaw),backZ=-Math.cos(yaw),side=((wheelIndex%2)?1:-1),sideX=Math.cos(yaw)*side,sideZ=-Math.sin(yaw)*side,rate=(this.reducedMotion?1:2)+Math.floor(slide*2+roughness*2);
  for(let n=0;n<rate;n++){const item=this.particles[this.particleIndex++%this.particles.length],spread=((this.particleIndex*19)%13-6)*.018;item.kind=kind;item.x=p.x+sideX*.08+spread;item.z=p.z+sideZ*.08-spread;item.y=p.y+(kind==='water'?.11:.08);item.vx=backX*(.45+speed*.012)*slide+sideX*.18;item.vz=backZ*(.45+speed*.012)*slide+sideZ*.18;item.vy=(kind==='water'?.45:.75)+slide*.5;item.life=(kind==='water'?.45:.8)+slide*.45;item.age=0;item.scale=(kind==='water'?.18:.22)+slide*(kind==='grass'?.34:.48);item.mesh.material=this.particleMaterials[kind]||this.particleMaterials.dust;item.mesh.position.set(item.x,item.y,item.z);item.mesh.scaling.set(item.scale,item.scale,item.scale);item.mesh.visibility=.44;item.mesh.setEnabled(true);}
  const specks=kind==='water'?1:Math.ceil(slide*(this.reducedMotion?1:3));
  for(let n=0;n<specks;n++){const item=this.specks[this.speckIndex++%this.specks.length],scatter=((this.speckIndex*23)%17-8)*.025;item.x=p.x;item.y=p.y+.08;item.z=p.z;item.vx=backX*(1.2+speed*.018)*slide+sideX*(.45+scatter);item.vz=backZ*(1.2+speed*.018)*slide+sideZ*(.45-scatter);item.vy=.9+slide*1.6;item.life=kind==='water'?.45:.7+slide*.3;item.age=0;item.bounces=0;item.mesh.material=this.speckMaterials[kind==='dust'?'dirt':kind]||this.speckMaterials.grit;const s=kind==='water'?.045:.055+slide*.035;item.mesh.scaling.set(s,s,s);item.mesh.position.set(item.x,item.y,item.z);item.mesh.visibility=.85;item.mesh.setEnabled(true);}
 }
 placeSkid(p,wheel,dx,dz,dist,slide,wet){
  const heading=Math.atan2(dx,dz),length=clamp(dist,.45,2.2),surface=roadPose(p.x,p.z,heading),normal=surfaceNormal(heading,surface.pitch,surface.roll),mark=this.skids[this.skidIndex++%this.skids.length];
  mark.position.x=p.x+normal.x*.032;mark.position.y=surface.y+normal.y*.032;mark.position.z=p.z+normal.z*.032;mark.rotationQuaternion=B.Quaternion.FromEulerAngles(Math.PI/2+surface.pitch,heading,surface.roll);mark.scaling.y=length/1.05;mark.visibility=(wet?.14:.24)+slide*(wet?.08:.18);mark.setEnabled(true);
 }
 stop(){for(const item of this.smoke){item.life=0;item.mesh.setEnabled(false);}for(const item of this.particles){item.life=0;item.mesh.setEnabled(false);}for(const item of this.specks){item.life=0;item.mesh.setEnabled(false);}for(const pair of this.flames)for(const mesh of pair)mesh.setEnabled(false);this.updateMetadata();}
 updateMetadata(){this.scene.metadata={...this.scene.metadata,effects:{smokePool:this.smokeCount,skidPool:this.skidCount,particulatePool:this.particleCount,speckPool:this.speckCount,activeSmoke:this.smoke.filter(item=>item.life>0).length,activeParticulate:this.particles.filter(item=>item.life>0).length,flamePairs:this.flames.length,reducedMotion:this.reducedMotion}};}
 dispose(){if(this.disposed)return;this.stop();this.disposed=true;this.disposeFlames();for(const item of this.smoke)item.mesh.dispose();for(const item of this.particles)item.mesh.dispose();for(const item of this.specks)item.mesh.dispose();for(const mark of this.skids)mark.dispose();this.smokeMaterial.dispose();for(const m of Object.values(this.particleMaterials))m.dispose();for(const m of Object.values(this.speckMaterials))m.dispose();this.skidMaterial.dispose();this.flameMaterial.dispose();this.smokeTexture.dispose();}
}
