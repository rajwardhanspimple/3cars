import { roadHeight, roadPose } from './mountain-layout.js';
import { populationBudget, streetDistance } from './city-gameplay.js';
const B=globalThis.BABYLON;

// Extract low-level solids from the final rendered district, not a second copy
// of its random placement algorithm. The worker receives only plain numbers.
export function districtColliders(scene) {
 const result=[];
 for(const mesh of scene.meshes){
  if(!mesh.isVisible||mesh.metadata?.role!=='solid'||mesh.metadata?.template||mesh.metadata?.npc)continue;
  if(['prop','guardrail','rail-post','bollard-band'].includes(mesh.metadata?.kind))continue;
  mesh.computeWorldMatrix(true);
  const box=mesh.getBoundingInfo().boundingBox,a=box.minimumWorld,b=box.maximumWorld,c=box.centerWorld;
  const ground=roadHeight(c.x,c.z);
  // Roof details and overhead awnings are above the vehicle contact envelope.
  if(a.y>ground+2.1||b.y<ground-.5)continue;
  result.push({id:mesh.name,x:(a.x+b.x)/2,z:(a.z+b.z)/2,width:Math.max(.05,b.x-a.x),length:Math.max(.05,b.z-a.z),yaw:0});
 }
 return result;
}
function openStreets(view) {
 const {scene,race}=view;
 for(const mesh of [...scene.meshes]){
  const kind=mesh.metadata?.kind;
  if(kind==='guardrail'||kind==='rail-post')mesh.dispose();
  else if(['wall','layout-bollard','bollard-band'].includes(kind)){
   mesh.computeWorldMatrix(true);const p=mesh.getAbsolutePosition();
   if(streetDistance(race.track,p.x,p.z)<8)mesh.dispose();
  }
 }
 // Connect the existing district tiles through the old 22m race shoulder gap.
 // Grid streets end at the asphalt edge, and never cover the circuit itself.
 const p=[],uv=[],indices=[],normals=[],{centerX:cx,centerZ:cz}=race.track.bounds;
 for(let iz=-200;iz<200;iz++)for(let ix=-200;ix<200;ix++){
  const x=cx+ix*2,z=cz+iz*2;
  if(streetDistance(race.track,x+1,z+1)>6)continue;
  const distance=race.track.project(x+1,z+1).distance;
  if(distance<10.5||distance>25)continue;
  const n=p.length/3;
  for(const [wx,wz] of [[x,z],[x+2,z],[x,z+2],[x+2,z+2]]){p.push(wx,roadHeight(wx,wz)+.03,wz);uv.push((wx-cx)/80,(wz-cz)/80);}
  indices.push(n,n+2,n+1,n+1,n+2,n+3);
 }
 B.VertexData.ComputeNormals(p,indices,normals);
 if(normals.filter((_,i)=>i%3===1).reduce((a,b)=>a+b,0)<0){for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];B.VertexData.ComputeNormals(p,indices,normals);}
 const mesh=new B.Mesh('city-free-roam-street-connections',scene),data=new B.VertexData();
 data.positions=p;data.indices=indices;data.normals=normals;data.uvs=uv;data.applyToMesh(mesh);
 mesh.material=scene.getMeshByName('city-district-streets')?.material;mesh.isPickable=false;
 mesh.metadata={cityWorld:true,role:'surface',freeRoam:true};
 Object.assign(scene.metadata.scenery,{visibleBarrierRails:0,visibleBarrierPosts:0,physicsBarrierOffset:null,districtFreeDriving:true,districtCrossings:'open-grid-streets'});
}
export function installCityLife(view) {
 const {scene,race}=view;
 if(!race.cityEnabled)return;
 if(race.freeRoam)openStreets(view);
 const colliders=districtColliders(scene);view.districtCollisionLayout=colliders;
 race.configureDistrict(colliders);
 const budget=populationBudget(race.quality,race.density),sources=new Map(),pools={traffic:[],pedestrian:[]};
 const source=(key,hex,emissive=false)=>{
  const mesh=B.MeshBuilder.CreateBox(`npc-template-${key}`,{size:1},scene),mat=new B.StandardMaterial(`npc-${key}`,scene);
  mat.diffuseColor=B.Color3.FromHexString(hex);mat.specularColor=B.Color3.Black();
  if(emissive)mat.emissiveColor=mat.diffuseColor.clone();mesh.material=mat;mesh.isVisible=false;
  mesh.metadata={template:true,npc:true};sources.set(key,mesh);return mesh;
 };
 source('blue','#4382af');source('red','#ac5478');source('glass','#172940');source('dark','#182033');source('skin','#d1aa87');source('headlight','#e1eaff',true);
 function part(root,key,size,pos){const mesh=sources.get(key).createInstance(`npc-${key}-${root.name}`);mesh.scaling.set(...size);mesh.position.set(...pos);mesh.parent=root;mesh.isPickable=false;mesh.metadata={npc:true};return mesh;}
 for(const kind of ['traffic','pedestrian'])for(let i=0;i<(kind==='traffic'?budget.traffic:budget.pedestrians);i++){
  const root=new B.TransformNode(`npc-${kind}-${i}`,scene),limbs=[];
  if(kind==='traffic'){
   part(root,i%2?'red':'blue',[1.7,.65,3.6],[0,.7,0]);part(root,'glass',[1.45,.55,1.8],[0,1.27,-.15]);
   for(const x of [-.85,.85])for(const z of [-1.1,1.1])part(root,'dark',[.22,.55,.6],[x,.36,z]);
   for(const x of [-.55,.55])part(root,'headlight',[.38,.13,.06],[x,.8,1.83]);
  }else{
   part(root,i%2?'red':'blue',[.45,.65,.28],[0,1.05,0]);part(root,'skin',[.3,.32,.3],[0,1.57,0]);
   for(const x of [-.13,.13])limbs.push(part(root,'dark',[.15,.68,.18],[x,.38,0]));
   for(const x of [-.31,.31])limbs.push(part(root,'skin',[.13,.6,.15],[x,1.02,0]));
  }
  root.setEnabled(false);pools[kind].push({root,limbs});
 }
 const update=view.scenery.update.bind(view.scenery);
 view.scenery.update=(dt,player,phase)=>{
  update(dt,player,phase);
  for(const kind of ['traffic','pedestrian']){
   const bodies=kind==='traffic'?view.race.traffic:view.race.pedestrians;
   pools[kind].forEach(({root,limbs},i)=>{
    const body=bodies?.[i];root.setEnabled(!!body);if(!body)return;
    const pose=roadPose(body.x,body.z,body.yaw);
    root.position.set(body.x,pose.y+(kind==='pedestrian'?.16:0),body.z);root.rotation.set(pose.pitch,body.yaw,pose.roll);
    for(let j=0;j<limbs.length;j++)limbs[j].rotation.x=Math.sin((view.race.time||0)*7+i+(j%2)*Math.PI)*Math.min(.45,body.speed*.25);
   });
  }
 };
 view.updateScenery=(dt,player,phase)=>view.scenery.update(dt,player,phase);
 view.celShading?.refresh();
 Object.assign(scene.metadata.scenery,{districtColliderCount:colliders.length,npcBudget:budget,npcDensity:race.density,npcSourceMeshes:sources.size,npcRealLights:0});
 view.scenery.update(0,race.player,race.phase);
}
