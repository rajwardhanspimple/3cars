import {BoostState} from './boost-state.js';
const B=globalThis.BABYLON;
// Fixed-size graphic pools, independent of bloom and the world's lighting.
export class BoostEffects {
 constructor(scene,camera,{quality='high',reducedMotion=false}={}){
  this.scene=scene;this.camera=camera;this.reducedMotion=reducedMotion;this.disposed=false;
  this.player=new BoostState({reducedMotion});this.states=[];this.flames=[];this.clock=0;
  this.materials=['#2355ff','#6adfff','#f7ffff'].map((hex,i)=>{
   const m=new B.StandardMaterial(`boost-flame-layer-${i}`,scene);
   m.diffuseColor=B.Color3.Black();m.emissiveColor=B.Color3.FromHexString(hex);m.specularColor=B.Color3.Black();
   m.disableLighting=true;m.fogEnabled=false;m.alpha=[.58,.78,1][i];m.disableDepthWrite=true;
   m.transparencyMode=B.Material.MATERIAL_ALPHABLEND;m.metadata={celShading:false};return m;
  });
  this.lineMaterial=new B.StandardMaterial('boost-edge-ink',scene);
  Object.assign(this.lineMaterial,{disableLighting:true,fogEnabled:false,disableDepthWrite:true,backFaceCulling:false,alpha:.55,metadata:{celShading:false}});
  this.lineMaterial.diffuseColor=B.Color3.Black();this.lineMaterial.emissiveColor=B.Color3.FromHexString('#bcefff');this.lineMaterial.transparencyMode=B.Material.MATERIAL_ALPHABLEND;
  this.lines=Array.from({length:reducedMotion?0:quality==='high'?24:12},(_,i)=>{
   const mesh=new B.Mesh(`boost-edge-${i}`,scene),data=new B.VertexData();
   // A sharp tapered stroke, not a smoke particle or a full-screen blur.
   data.positions=[0,0,0,-.5,1,0,.5,1,0];data.indices=[0,1,2];data.normals=[0,0,-1,0,0,-1,0,0,-1];data.applyToMesh(mesh);
   mesh.material=this.lineMaterial;mesh.parent=camera;mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.metadata={celShading:false};mesh.setEnabled(false);return mesh;
  });
  this.metadata();
 }
 setCarNodes(nodes){
  if(this.disposed)return;
  for(const group of this.flames)for(const mesh of group)mesh.dispose();
  this.states=nodes.map(()=>new BoostState({reducedMotion:this.reducedMotion}));
  this.flames=nodes.map((node,index)=>[-1,1].flatMap(side=>this.materials.map((material,layer)=>{
   const mesh=B.MeshBuilder.CreateCylinder(`boost-flame-${index}-${side}-${layer}`,{height:1,diameterTop:0,diameterBottom:1,tessellation:5},this.scene);
   mesh.material=material;mesh.parent=node.body||node.root;mesh.rotation.x=-Math.PI/2;mesh.isPickable=false;
   mesh.alphaIndex=layer;mesh.metadata={celShading:false,side,layer};mesh.setEnabled(false);return mesh;
  })));
  this.reset();
 }
 reset(){this.player.reset();for(const state of this.states)state.reset();this.clock=0;for(const group of this.flames)for(const mesh of group)mesh.setEnabled(false);for(const mesh of this.lines)mesh.setEnabled(false);this.metadata();}
 update(cars,dt,phase,snap=false){
  if(this.disposed)return this.player;
  const h=Number.isFinite(dt)?Math.max(0,Math.min(.1,dt)):0;
  this.clock+=phase==='racing'?h:0;
  const player=cars.find(c=>c.index===0)||{};
  this.player.update(player,h,phase,snap);
  for(let i=0;i<this.flames.length;i++){
   const car=cars.find(c=>c.index===i)||{},state=this.states[i].update(car,h,phase,snap);
   for(const mesh of this.flames[i]){
    const {side,layer}=mesh.metadata,enabled=state.active&&state.intensity>.01;
    mesh.setEnabled(enabled);if(!enabled)continue;
    const pulse=this.reducedMotion?1:1+.07*Math.sin(this.clock*43+side+i);
    const length=[1.65,1.10,.62][layer]*(.65+.35*state.intensity)*pulse;
    const width=[.34,.24,.15][layer]*(.85+.15*state.intensity);
    mesh.scaling.set(width,length,width);mesh.position.set(side*.52,.42,-2.48-length/2);
    mesh.visibility=.75+.25*state.intensity;
   }
  }
  const aspect=this.scene.getEngine().getAspectRatio(this.camera),halfY=Math.tan(this.camera.fov/2),halfX=halfY*aspect;
  for(let i=0;i<this.lines.length;i++){
   const mesh=this.lines[i],strength=this.player.lines;mesh.setEnabled(strength>.02);if(strength<=.02)continue;
   const angle=i/this.lines.length*Math.PI*2+.13,dx=Math.cos(angle),dy=Math.sin(angle);
   const edge=1/Math.max(Math.abs(dx),Math.abs(dy)),travel=(this.clock*(.8+strength)+i*.618)%1;
   const radius=.82+travel*.17,x=dx*edge*radius*halfX,y=dy*edge*radius*halfY;
   mesh.position.set(x,y,1);mesh.rotation.z=Math.atan2(-x,y);
   mesh.scaling.set(.0025+strength*.003,.025+strength*.10,1);mesh.visibility=strength*(.25+.65*travel);
  }
  this.metadata();return this.player;
 }
 metadata(){this.scene.metadata={...this.scene.metadata,boostEffects:{flameMeshes:this.flames.reduce((n,g)=>n+g.length,0),linePool:this.lines.length,active:this.player.active,intensity:this.player.intensity,ignition:this.player.ignition,lines:this.player.lines,reducedMotion:this.reducedMotion}};}
 dispose(){if(this.disposed)return;this.reset();this.disposed=true;for(const group of this.flames)for(const mesh of group)mesh.dispose();for(const mesh of this.lines)mesh.dispose();for(const m of this.materials)m.dispose();this.lineMaterial.dispose();this.flames=[];this.lines=[];this.states=[];this.metadata();}
}
