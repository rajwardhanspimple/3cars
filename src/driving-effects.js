const B=globalThis.BABYLON;
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));

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

export class DrivingEffects{
 constructor(scene,{reducedMotion=false}={}){
  this.scene=scene;this.reducedMotion=reducedMotion;this.disposed=false;this.smokeIndex=0;this.skidIndex=0;this.emitClock=0;this.carStates=[];this.flames=[];
  this.smokeCount=reducedMotion?18:42;this.skidCount=96;this.smokeTexture=makeSmokeTexture(scene);
  this.smokeMaterial=new B.StandardMaterial('drift-smoke-material',scene);this.smokeMaterial.diffuseColor=new B.Color3(.62,.64,.62);this.smokeMaterial.opacityTexture=this.smokeTexture;this.smokeMaterial.alpha=.62;this.smokeMaterial.specularColor=B.Color3.Black();this.smokeMaterial.transparencyMode=B.Material.MATERIAL_ALPHABLEND;this.smokeMaterial.disableLighting=true;
  this.skidMaterial=new B.StandardMaterial('skid-mark-material',scene);this.skidMaterial.diffuseColor=new B.Color3(.015,.014,.012);this.skidMaterial.alpha=.36;this.skidMaterial.specularColor=B.Color3.Black();this.skidMaterial.transparencyMode=B.Material.MATERIAL_ALPHABLEND;
  this.flameMaterial=new B.StandardMaterial('boost-flame-material',scene);this.flameMaterial.emissiveColor=new B.Color3(.14,.42,1);this.flameMaterial.diffuseColor=new B.Color3(.05,.18,.9);this.flameMaterial.alpha=.46;this.flameMaterial.specularColor=B.Color3.Black();this.flameMaterial.transparencyMode=B.Material.MATERIAL_ALPHABLEND;
  this.smoke=Array.from({length:this.smokeCount},(_,i)=>{const mesh=B.MeshBuilder.CreatePlane(`tire-smoke-${i}`,{size:1},scene);mesh.material=this.smokeMaterial;mesh.billboardMode=B.Mesh.BILLBOARDMODE_ALL;mesh.isPickable=false;mesh.setEnabled(false);return{mesh,life:0,age:0,x:0,y:0,z:0,rise:0,scale:1};});
  this.skids=Array.from({length:this.skidCount},(_,i)=>{const mesh=B.MeshBuilder.CreatePlane(`skid-mark-${i}`,{width:.28,height:1.15},scene);mesh.material=this.skidMaterial;mesh.rotation.x=Math.PI/2;mesh.position.y=.032;mesh.isPickable=false;mesh.setEnabled(false);return mesh;});
  this.updateMetadata();
 }
 setCarNodes(nodes){
  this.disposeFlames();this.carStates=nodes.map(()=>({lastX:0,lastZ:0,lastSkidX:0,lastSkidZ:0,ready:false}));
  this.flames=nodes.map((node,index)=>[-1,1].map(side=>{const mesh=B.MeshBuilder.CreateCylinder(`boost-flame-${index}-${side}`,{height:.58,diameterTop:.025,diameterBottom:.18,tessellation:12},this.scene);mesh.material=this.flameMaterial;mesh.parent=node.root;mesh.position.set(side*.52,.42,-2.6);mesh.rotation.x=-Math.PI/2;mesh.scaling.set(.55,.65,.55);mesh.isPickable=false;mesh.setEnabled(false);return mesh;}));
  this.reset();this.updateMetadata();
 }
 disposeFlames(){for(const pair of this.flames)for(const mesh of pair)mesh.dispose();this.flames=[];}
 reset(){for(const item of this.smoke){item.life=0;item.age=0;item.mesh.setEnabled(false);}for(const mark of this.skids)mark.setEnabled(false);for(const pair of this.flames)for(const mesh of pair)mesh.setEnabled(false);for(const state of this.carStates)state.ready=false;this.emitClock=0;this.updateMetadata();}
 update(nodes,cars,dt,phase){
  if(this.disposed)return;const racing=phase==='racing';
  this.updateSmoke(dt);this.updateFlames(cars,racing);
  if(!racing||dt<=0)return;
  this.emitClock+=dt;const emitStep=this.reducedMotion?.13:.055;if(this.emitClock<emitStep)return;this.emitClock=0;
  for(const car of cars){const state=this.carStates[car.index];if(!state)continue;const speed=Math.max(0,car.speed||0),slip=clamp((car.slip||0)+(car.drifting?.45:0)+(car.brake||0)*.28,0,1);
   if(!state.ready){state.lastX=state.lastSkidX=car.x;state.lastZ=state.lastSkidZ=car.z;state.ready=true;continue;}
   if(speed<5||slip<.12){state.lastX=car.x;state.lastZ=car.z;continue;}
   if(!this.reducedMotion||slip>.42)this.emitSmoke(car,slip);
   const dx=car.x-state.lastSkidX,dz=car.z-state.lastSkidZ,dist=Math.hypot(dx,dz);
   if(dist>.82&&(car.drifting||car.brake>.35||slip>.45)){this.placeSkid(car,state,dx,dz,dist);state.lastSkidX=car.x;state.lastSkidZ=car.z;}
   state.lastX=car.x;state.lastZ=car.z;
  }
  this.updateMetadata();
 }
 updateSmoke(dt){
  if(dt<=0)return;
  for(const item of this.smoke)if(item.life>0){item.age+=dt;const t=item.age/item.life;if(t>=1){item.life=0;item.mesh.setEnabled(false);continue;}item.y+=item.rise*dt;item.mesh.position.set(item.x,item.y,item.z);const s=item.scale*(1+t*.9);item.mesh.scaling.set(s,s,s);item.mesh.visibility=(1-t)*(.38+item.scale*.08);}
 }
 updateFlames(cars,racing){
  for(const car of cars){const pair=this.flames[car.index];if(!pair)continue;const active=racing&&!!car.boostActive;for(let i=0;i<pair.length;i++){const mesh=pair[i];mesh.setEnabled(active);if(active){const pulse=.82+Math.sin((car.nitro||0)*.31+i)*.08;mesh.visibility=.42;mesh.scaling.set(.5,.55+pulse*.18,.5);}}}
 }
 emitSmoke(car,slip){
  const yaw=car.yaw||0,backX=-Math.sin(yaw),backZ=-Math.cos(yaw),sideX=Math.cos(yaw),sideZ=-Math.sin(yaw),amount=this.reducedMotion?1:2;
  for(let n=0;n<amount;n++)for(const side of[-1,1]){const item=this.smoke[this.smokeIndex++%this.smoke.length],jitter=((this.smokeIndex*17)%11-5)*.018;item.x=car.x+backX*1.45+sideX*(side*.82+jitter);item.z=car.z+backZ*1.45+sideZ*(side*.82-jitter);item.y=.18;item.life=.62+slip*.38;item.age=0;item.rise=.42+slip*.18;item.scale=.36+slip*.32;item.mesh.position.set(item.x,item.y,item.z);item.mesh.scaling.set(item.scale,item.scale,item.scale);item.mesh.visibility=.38;item.mesh.setEnabled(true);}
 }
 placeSkid(car,state,dx,dz,dist){
  const heading=Math.atan2(dx,dz),yaw=car.yaw||0,sideX=Math.cos(yaw),sideZ=-Math.sin(yaw),length=clamp(dist,.8,2.8);
  for(const side of[-1,1]){const mark=this.skids[this.skidIndex++%this.skids.length];mark.position.x=(car.x+state.lastSkidX)*.5+sideX*side*.82;mark.position.z=(car.z+state.lastSkidZ)*.5+sideZ*side*.82;mark.position.y=.034;mark.rotation.y=heading;mark.scaling.y=length/1.15;mark.visibility=.26+clamp(car.slip||0,0,1)*.18;mark.setEnabled(true);}
 }
 stop(){for(const item of this.smoke){item.life=0;item.mesh.setEnabled(false);}for(const pair of this.flames)for(const mesh of pair)mesh.setEnabled(false);this.updateMetadata();}
 updateMetadata(){this.scene.metadata={...this.scene.metadata,effects:{smokePool:this.smokeCount,skidPool:this.skidCount,activeSmoke:this.smoke.filter(item=>item.life>0).length,flamePairs:this.flames.length,reducedMotion:this.reducedMotion}};}
 dispose(){if(this.disposed)return;this.stop();this.disposed=true;this.disposeFlames();for(const item of this.smoke)item.mesh.dispose();for(const mark of this.skids)mark.dispose();this.smokeMaterial.dispose();this.skidMaterial.dispose();this.flameMaterial.dispose();this.smokeTexture.dispose();}
}
