import { HALF_WIDTH, BARRIER, clamp } from './sim.js';
import { buildScenicWorld } from './scenic-world.js';
const B=globalThis.BABYLON;
const v=(x=0,y=0,z=0)=>new B.Vector3(x,y,z);
const color=hex=>B.Color3.FromHexString(hex);

export class RaceView {
 constructor(canvas,race,{quality='high'}={}) {
  if(!B||!B.Engine.IsSupported)throw new Error('WebGL is unavailable. Enable hardware acceleration and use a current desktop browser.');
  this.canvas=canvas;this.race=race;this.quality=quality;this.reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.engine=new B.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,powerPreference:'high-performance'});
  this.engine.setHardwareScalingLevel(quality==='high'?1/Math.min(devicePixelRatio,1.5):1.4);
  this.scene=new B.Scene(this.engine);const scene=this.scene;
  scene.clearColor=new B.Color4(.72,.82,.88,1);scene.ambientColor=color('#879daa');scene.fogMode=B.Scene.FOGMODE_EXP2;scene.fogDensity=.0016;scene.fogColor=color('#bed0d7');
  scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;scene.imageProcessingConfiguration.exposure=1.08;scene.imageProcessingConfiguration.contrast=1.1;
  this.camera=new B.FreeCamera('chase',v(-115,12,-142),scene);this.camera.minZ=.2;this.camera.maxZ=1500;this.camera.fov=.83;this.camera.setTarget(v(-80,0,-130));
  this.hemi=new B.HemisphericLight('sky',v(.1,1,0),scene);this.hemi.intensity=.92;this.hemi.groundColor=color('#5c6d58');
  this.sun=new B.DirectionalLight('sun',v(-.48,-.84,.36),scene);this.sun.position=v(170,245,-150);this.sun.intensity=2.25;
  this.shadow=new B.ShadowGenerator(quality==='high'?2048:1024,this.sun);this.shadow.usePercentageCloserFiltering=true;this.shadow.filteringQuality=quality==='high'?B.ShadowGenerator.QUALITY_MEDIUM:B.ShadowGenerator.QUALITY_LOW;this.shadow.bias=.001;this.shadow.normalBias=.025;this.shadow.darkness=.22;
  if(B.DefaultRenderingPipeline){this.pipeline=new B.DefaultRenderingPipeline('sakura-post',true,scene,[this.camera]);this.pipeline.fxaaEnabled=true;this.pipeline.samples=quality==='high'?4:1;this.pipeline.bloomEnabled=quality==='high';this.pipeline.bloomThreshold=.86;this.pipeline.bloomWeight=.18;this.pipeline.bloomKernel=48;this.pipeline.imageProcessingEnabled=true;}
  this.materials={};this.carNodes=[];this.elapsed=0;this.cameraReady=false;
  this.createWorld();this.setRace(race);
  this.resize=()=>this.engine.resize();window.addEventListener('resize',this.resize);
 }
 mat(name,hex,metallic=0,roughness=.7){if(this.materials[name])return this.materials[name];const m=new B.PBRMaterial(name,this.scene);m.albedoColor=color(hex);m.metallic=metallic;m.roughness=roughness;m.environmentIntensity=.7;return this.materials[name]=m;}
 box(name,size,pos,material,parent=null){const mesh=B.MeshBuilder.CreateBox(name,{width:size[0],height:size[1],depth:size[2]},this.scene);mesh.position=v(...pos);mesh.material=material;if(parent)mesh.parent=parent;mesh.receiveShadows=true;return mesh;}
 texture(name,base,noise=12){const t=new B.DynamicTexture(name,{width:512,height:512},this.scene,false),ctx=t.getContext(),img=ctx.createImageData(512,512);let seed=713;for(let i=0;i<img.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const n=(seed/4294967296-.5)*noise;for(let c=0;c<3;c++)img.data[i+c]=base[c]+n;img.data[i+3]=255;}ctx.putImageData(img,0,0);t.update();t.uScale=1;t.vScale=1;return t;}
 band(name,inner,outer,material,y=.025){const paths=[[],[]],t=this.race.track,uvs=[],width=Math.abs(outer-inner);for(let i=0;i<=t.points.length;i++){const s=i===t.points.length?t.length:t.points[i].s;for(const [j,offset]of[inner,outer].entries()){const p=t.at(s,offset);paths[j].push(v(p.x,y,p.z));}}const m=B.MeshBuilder.CreateRibbon(name,{pathArray:paths,sideOrientation:B.Mesh.DOUBLESIDE},this.scene);for(let j=0;j<2;j++)for(let i=0;i<=t.points.length;i++){const s=i===t.points.length?t.length:t.points[i].s;uvs.push(s/8,j*width/8);}m.setVerticesData(B.VertexBuffer.UVKind,uvs);m.material=material;m.receiveShadows=true;return m;}
 merge(meshes,name){if(!meshes.length)return;const groups=new Map();for(const mesh of meshes){const key=mesh.material||'none';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);}let last;for(const [material,group]of groups){const merged=B.Mesh.MergeMeshes(group,true,true,undefined,false,false);if(merged){merged.name=groups.size>1?`${name}-${material.name||'material'}`:name;merged.material=material==='none'?null:material;merged.receiveShadows=true;merged.freezeWorldMatrix();last=merged;}}return last;}
 freezeStaticWorld(){for(const mesh of this.scene.meshes)if(!mesh.name.startsWith('car-')&&!mesh.name.includes('wheel'))mesh.freezeWorldMatrix();}
 sign(text,pos,width=10,height=2,parent=null){const tex=new B.DynamicTexture('sign-text',{width:1024,height:256},this.scene,false),ctx=tex.getContext();ctx.fillStyle='#153347';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#f2f6f8';ctx.font='bold 115px Arial';ctx.textAlign='center';ctx.fillText(text,512,169);tex.update();const mat=new B.StandardMaterial('sign',this.scene);mat.diffuseTexture=tex;mat.emissiveColor=color('#758c97');mat.specularColor=B.Color3.Black();mat.backFaceCulling=false;const mesh=B.MeshBuilder.CreatePlane('sign',{width,height},this.scene);mesh.material=mat;mesh.position=v(...pos);if(parent)mesh.parent=parent;return mesh;}
 createWorld(){buildScenicWorld(this);}
 updateScenery(dt,player,phase){if(this.scenery&&this.scenery.update)this.scenery.update(dt,player,phase);}
 createCar(car){
  const root=new B.TransformNode(`car-${car.index}`,this.scene),body=new B.TransformNode('suspension',this.scene);body.parent=root;
  const model=car.model,paint=this.mat(`paint-${model.id}`,model.color,.5,.24),trim=this.mat(`trim-${model.id}`,model.accent,.1,.45),glass=this.mat('car-glass','#213c50',.5,.13),rubber=this.mat('tire','#151e24',0,.94),alloy=this.mat('alloy','#c9ced0',.82,.23),carbon=this.mat('carbon','#26333a',.25,.53);
  const add=(name,size,pos,mat)=>this.box(name,size,pos,mat,body);
  const stations=[[-2.4,.82,.62],[-1.8,1,.98],[-.9,1.03,1.02],[.6,1,.94],[1.65,.96,.72],[2.35,.8,.58]];
  if(model.id==='titan')stations.forEach(p=>{p[1]*=1.07;p[2]*=1.08;});if(model.id==='apex')stations.forEach(p=>{p[1]*=.97;p[2]*=.92;});
  const positions=[],indices=[];for(const[z,width,height]of stations)positions.push(-width,.35,z,width,.35,z,width,height,z,-width,height,z);
  for(let i=0;i<stations.length-1;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4,c=(i+1)*4+j,d=(i+1)*4+(j+1)%4;indices.push(a,c,b,b,c,d);}indices.push(0,1,2,0,2,3,20,23,22,20,22,21);
  const shell=new B.Mesh('formed-body',this.scene),data=new B.VertexData();data.positions=positions;data.indices=indices;const normals=[];B.VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.applyToMesh(shell);shell.material=paint;shell.parent=body;shell.material.backFaceCulling=false;
  const cabin=add('cabin',[1.58,.63,1.75],[0,1.18,-.24],glass);cabin.rotation.x=-.06;add('roof',[1.48,.1,1.04],[0,1.54,-.35],paint);add('windshield-frame',[1.64,.07,.08],[0,1.48,.55],trim);
  for(const side of[-1,1]){add('window-pillar',[.075,.65,.1],[side*.79,1.18,-.48],paint);add('sill',[.13,.16,3.9],[side*1.035,.35,0],carbon);add('mirror-stalk',[.28,.07,.1],[side*1.07,1.1,.62],carbon);add('mirror',[.28,.16,.36],[side*1.23,1.13,.64],paint);add('headlight',[.52,.16,.1],[side*.57,.66,2.34],this.mat('headlight','#ecf5ff',.2,.15));add('rear-light',[.64,.11,.05],[side*.53,.77,-2.4],this.mat('taillight','#cf352d',.1,.3));add('wing-upright',[.08,.48,.11],[side*.6,1.1,-2.04],carbon);const exhaust=B.MeshBuilder.CreateCylinder('exhaust',{height:.3,diameter:.16,tessellation:12},this.scene);exhaust.rotation.x=Math.PI/2;exhaust.position=v(side*.6,.43,-2.48);exhaust.parent=body;exhaust.material=alloy;}
  add('splitter',[2.1,.08,.45],[0,.27,2.2],carbon);add('diffuser',[1.9,.22,.25],[0,.29,-2.35],carbon);add('rear-wing',[2.34,.095,.45],[0,1.39,-2.07],carbon);add('hood-stripe',[.28,.028,1.45],[0,.94,1.08],trim);for(let i=0;i<7;i++)add('grille-slat',[1.2,.025,.08],[0,.43+i*.032,2.41],carbon);
  const wheels=[];for(const side of[-1,1])for(const z of[-1.45,1.46]){const pivot=new B.TransformNode('wheel-steer',this.scene);pivot.parent=root;pivot.position=v(side*1.025,.43,z);const spin=new B.TransformNode('wheel-spin',this.scene);spin.parent=pivot;const tire=B.MeshBuilder.CreateCylinder('tire',{height:.32,diameter:.86,tessellation:32},this.scene);tire.rotation.z=Math.PI/2;tire.parent=spin;tire.material=rubber;const rim=B.MeshBuilder.CreateCylinder('rim',{height:.335,diameter:.60,tessellation:24},this.scene);rim.rotation.z=Math.PI/2;rim.parent=spin;rim.material=carbon;for(let i=0;i<7;i++){const spoke=this.box('spoke',[.35,.065,.55],[0,0,0],alloy,spin);spoke.rotation.x=i/7*Math.PI;}wheels.push({pivot,spin,front:z>0});}
  for(const mesh of root.getChildMeshes())this.shadow.addShadowCaster(mesh);
  return{root,body,wheels};
 }
 setRace(race){this.race=race;for(const item of this.carNodes){for(const mesh of item.root.getChildMeshes())this.shadow.removeShadowCaster(mesh);item.root.dispose();}this.carNodes=race.cars.map(c=>this.createCar(c));this.cameraReady=false;this.setWeather(race.weather);}
 setWeather(weather){const wet=weather==='wet';if(this.scenery&&this.scenery.setWeather)this.scenery.setWeather(weather);else{this.scene.clearColor=wet?new B.Color4(.38,.47,.52,1):new B.Color4(.72,.82,.88,1);this.scene.fogColor=wet?color('#7f929b'):color('#bed0d7');this.scene.fogDensity=wet?.0035:(this.quality==='high'?.00145:.0019);this.sun.intensity=wet?.72:2.25;this.hemi.intensity=wet?.8:.92;}if(this.roadMaterial){this.roadMaterial.roughness=wet?.19:.86;this.roadMaterial.metallic=wet?.24:0;this.roadMaterial.environmentIntensity=wet?1.05:.82;}if(this.rain)this.rain.setEnabled(wet);}
 createRain(){this.rainLines=Array.from({length:this.quality==='high'?240:100},()=>[v(),v()]);this.rain=B.MeshBuilder.CreateLineSystem('rain',{lines:this.rainLines,updatable:true},this.scene);this.rain.color=color('#bdcedc');this.rain.alpha=.38;this.rain.isPickable=false;}
 render(dt){
  this.elapsed+=dt;const race=this.race;
  for(const car of race.cars){const node=this.carNodes[car.index];node.root.position.set(car.x,0,car.z);node.root.rotation.y=car.yaw;node.body.rotation.z=-car.steer*clamp(car.speed/80,0,.6)*.085;node.body.rotation.x=(car.brake-car.throttle)*.018;for(const wheel of node.wheels){wheel.spin.rotation.x+=car.speed*dt/.43;if(wheel.front)wheel.pivot.rotation.y=car.steer*.48/(1+car.speed*.018);}}
  const p=race.player,forward=v(Math.sin(p.yaw),0,Math.cos(p.yaw));let desired,target;
  if(race.phase==='menu'){const a=this.reducedMotion?0:this.elapsed*.04;desired=v(p.x-9*Math.cos(a),4.3,p.z-9*Math.sin(a));target=v(p.x,1,p.z);}else{desired=v(p.x-forward.x*(10+p.speed*.035),4.8+p.speed*.014,p.z-forward.z*(10+p.speed*.035));target=v(p.x+forward.x*9,1.1,p.z+forward.z*9);}
  if(!this.cameraReady){this.camera.position.copyFrom(desired);this.cameraReady=true;}else B.Vector3.LerpToRef(this.camera.position,desired,1-Math.exp(-dt*5),this.camera.position);
  this.camera.setTarget(target);this.camera.fov=.83+(this.reducedMotion?0:clamp(p.speed/450,0,.15));
  this.updateScenery(dt,p,race.phase);
  if(race.weather==='wet'){for(let i=0;i<this.rainLines.length;i++){const x=p.x+Math.sin(i*127.1)*25,z=p.z+Math.cos(i*311.7)*25,y=((i*.71-this.elapsed*23)%20+20)%20;this.rainLines[i][0].set(x,y,z);this.rainLines[i][1].set(x-.18,y-1.2,z+.08);}B.MeshBuilder.CreateLineSystem('rain',{lines:this.rainLines,instance:this.rain});}
  this.scene.render();
 }
 dispose(){window.removeEventListener('resize',this.resize);this.scene.dispose();this.engine.dispose();}
}
