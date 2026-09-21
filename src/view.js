import { HALF_WIDTH, BARRIER, clamp } from './sim.js';
const B = globalThis.BABYLON;
const v = (x=0,y=0,z=0) => new B.Vector3(x,y,z);
const color = hex => B.Color3.FromHexString(hex);

export class RaceView {
  constructor(canvas, race, {quality='high'}={}) {
    if (!B || !B.Engine.IsSupported()) throw new Error('WebGL is unavailable. Enable hardware acceleration and use a current desktop browser.');
    this.canvas=canvas;this.race=race;this.quality=quality;this.engine=new B.Engine(canvas,true,{preserveDrawingBuffer:false,stencil:true,powerPreference:'high-performance'});
    this.engine.setHardwareScalingLevel(quality==='high'?1/Math.min(devicePixelRatio,1.5):1.4);
    this.scene=new B.Scene(this.engine);const scene=this.scene;
    scene.clearColor=new B.Color4(.69,.81,.87,1);scene.ambientColor=color('#879daa');scene.fogMode=B.Scene.FOGMODE_EXP2;scene.fogDensity=.0018;scene.fogColor=color('#b7cdd6');
    scene.imageProcessingConfiguration.toneMappingEnabled=true;scene.imageProcessingConfiguration.toneMappingType=B.ImageProcessingConfiguration.TONEMAPPING_ACES;
    scene.imageProcessingConfiguration.exposure=1.12;scene.imageProcessingConfiguration.contrast=1.12;
    this.camera=new B.FreeCamera('chase',v(-115,12,-142),scene);this.camera.minZ=.2;this.camera.maxZ=1400;this.camera.fov=.83;this.camera.setTarget(v(-80,0,-130));
    this.hemi=new B.HemisphericLight('sky',v(.1,1,0),scene);this.hemi.intensity=.85;this.hemi.groundColor=color('#4b604d');
    this.sun=new B.DirectionalLight('sun',v(-.5,-.85,.4),scene);this.sun.position=v(120,200,-100);this.sun.intensity=2.1;
    this.shadow=new B.ShadowGenerator(quality==='high'?2048:1024,this.sun);this.shadow.usePercentageCloserFiltering=true;this.shadow.filteringQuality=B.ShadowGenerator.QUALITY_MEDIUM;this.shadow.bias=.001;this.shadow.normalBias=.025;this.shadow.darkness=.24;
    this.materials={};this.carNodes=[];this.elapsed=0;this.cameraReady=false;
    this.createWorld();this.setRace(race);this.setWeather(race.weather);
    this.resize=()=>this.engine.resize();window.addEventListener('resize',this.resize);
  }
  mat(name,hex,metallic=0,roughness=.7) {
    if(this.materials[name])return this.materials[name];
    const m=new B.PBRMaterial(name,this.scene);m.albedoColor=color(hex);m.metallic=metallic;m.roughness=roughness;m.environmentIntensity=.7;
    this.materials[name]=m;return m;
  }
  box(name,size,pos,material,parent=null) {
    const mesh=B.MeshBuilder.CreateBox(name,{width:size[0],height:size[1],depth:size[2]},this.scene);
    mesh.position=v(...pos);mesh.material=material;if(parent)mesh.parent=parent;mesh.receiveShadows=true;return mesh;
  }
  texture(name,base,noise=12) {
    const t=new B.DynamicTexture(name,{width:512,height:512},this.scene,false),ctx=t.getContext();
    const img=ctx.createImageData(512,512);let seed=713;
    for(let i=0;i<img.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const n=(seed/4294967296-.5)*noise;for(let c=0;c<3;c++)img.data[i+c]=base[c]+n;img.data[i+3]=255;}
    ctx.putImageData(img,0,0);t.update();t.uScale=26;t.vScale=26;return t;
  }
  band(name,inner,outer,material,y=.025) {
    const paths=[[],[]],t=this.race.track;
    for(let i=0;i<=t.points.length;i++) {const s=i===t.points.length?t.length:t.points[i].s;for(const [j,offset] of [inner,outer].entries()){const p=t.at(s,offset);paths[j].push(v(p.x,y,p.z));}}
    const m=B.MeshBuilder.CreateRibbon(name,{pathArray:paths,sideOrientation:B.Mesh.DOUBLESIDE},this.scene);m.material=material;m.receiveShadows=true;return m;
  }
  merge(meshes,name) {if(!meshes.length)return;const merged=B.Mesh.MergeMeshes(meshes,true,true,undefined,false,true);if(merged){merged.name=name;merged.receiveShadows=true;merged.freezeWorldMatrix();}return merged;}
  sign(text,pos,width=10,height=2,parent=null) {
    const tex=new B.DynamicTexture('sign-text',{width:1024,height:256},this.scene,false),ctx=tex.getContext();ctx.fillStyle='#153347';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#f2f6f8';ctx.font='bold 115px Arial';ctx.textAlign='center';ctx.fillText(text,512,169);tex.update();
    const mat=new B.StandardMaterial('sign',this.scene);mat.diffuseTexture=tex;mat.emissiveColor=color('#758c97');mat.specularColor=B.Color3.Black();mat.backFaceCulling=false;
    const mesh=B.MeshBuilder.CreatePlane('sign',{width,height},this.scene);mesh.material=mat;mesh.position=v(...pos);if(parent)mesh.parent=parent;return mesh;
  }
  createWorld() {
    const asphalt=this.mat('asphalt','#62676b',0,.91);asphalt.albedoTexture=this.texture('asphalt-grain',[80,85,90],28);this.roadMaterial=asphalt;
    const grass=this.mat('grass','#819469',0,1);grass.albedoTexture=this.texture('grass-grain',[145,159,113],50);
    const ground=B.MeshBuilder.CreateGround('land',{width:2200,height:2200},this.scene);ground.material=grass;ground.receiveShadows=true;ground.position.y=-.08;
    const concrete=this.mat('runoff','#c0bbaa',0,.91),white=this.mat('white','#e9eee9'),orange=this.mat('kerb-red','#c64e39'),blue=this.mat('barrier-blue','#2b6586'),black=this.mat('rubber','#20272c'),steel=this.mat('steel','#939c9e',.6,.35);
    this.band('runoff',-BARRIER,BARRIER,concrete,0);this.band('circuit',-HALF_WIDTH,HALF_WIDTH,asphalt,.025);
    this.band('left-line',-HALF_WIDTH+.16,-HALF_WIDTH+.32,white,.035);this.band('right-line',HALF_WIDTH-.32,HALF_WIDTH-.16,white,.035);
    const kerbs=[],walls=[],fences=[],t=this.race.track;
    for(let s=0,n=0;s<t.length;s+=3.5,n++)for(const side of [-1,1]){
      const p=t.at(s,side*(HALF_WIDTH+.6)),k=this.box('kerb',[1.15,.13,3.55],[p.x,.05,p.z],n%2?white:orange);k.rotation.y=p.heading;kerbs.push(k);
      if(n%2===0){const b=t.at(s,side*(BARRIER+.45));const wall=this.box('safety-wall',[.7,1.1,7.1],[b.x,.5,b.z],n%8<4?white:blue);wall.rotation.y=b.heading;walls.push(wall);}
      if(n%5===0){const b=t.at(s,side*(BARRIER+1.1));const post=this.box('fence-post',[.13,3.8,.13],[b.x,1.9,b.z],steel);fences.push(post);}
    }
    this.merge(kerbs,'striped-kerbs');this.merge(walls,'concrete-barriers');this.merge(fences,'fence-posts');
    for(let row=0;row<2;row++)for(let col=0;col<12;col++){
      const p=t.at(row*.85,(col-5.5)*1.5),m=this.box('finish-check',[1.5,.025,.85],[p.x,.045,p.z],(row+col)%2?black:white);m.rotation.y=p.heading;
    }
    for(let s=-11;s>-45;s-=8)for(const side of [-1,1]){const p=t.at(s,side*2.5),m=this.box('grid-mark',[2.6,.024,.16],[p.x,.049,p.z],white);m.rotation.y=p.heading;}
    const start=t.at(0),gantry=new B.TransformNode('start-gantry',this.scene);gantry.position=v(start.x,0,start.z);gantry.rotation.y=start.heading;
    for(const side of [-1,1])this.box('gantry-pole',[.6,7,.6],[side*10,3.5,0],steel,gantry);
    this.box('gantry-top',[21,.65,1],[0,6.7,0],blue,gantry);this.sign('3cars | Meridian circuit',[0,5.8,-.08],17,1.8,gantry);
    for(let i=0;i<7;i++){
      this.box('pit-garage',[13,5.5,13],[-60+i*15,2.75,-170],this.mat('garage','#d7dcd8'));
      this.box('garage-door',[11,3.7,.12],[-60+i*15,1.86,-163.42],this.mat('door','#234557',.3,.5));
      this.box('glass-office',[12,2.8,10],[-60+i*15,6.9,-170],this.mat('architectural-glass','#396579',.35,.18));
      this.box('roof',[14,.22,14],[-60+i*15,8.45,-170],white);
    }
    this.sign('Meridian Motorsport',[-15,10,-167],46,3.5);
    // Grandstands use stepped seating and colored, merged crowd markers.
    const audience=[];for(let row=0;row<7;row++){
      this.box('stand-step',[105,.7,2.2],[15,1+row*.7,161+row*2],concrete);
      for(let seat=0;seat<55;seat++){const m=B.MeshBuilder.CreateSphere('spectator',{diameter:.54,segments:4},this.scene);m.position=v(-35+seat*1.9,1.8+row*.7,161+row*2);m.material=[blue,orange,white,black][(row*7+seat)%4];audience.push(m);}
    }this.merge(audience,'crowd');
    this.box('stand-roof',[110,.3,19],[15,8,168],white);for(const x of [-38,15,68])this.box('stand-support',[.35,8,.35],[x,4,177],steel);
    const treeMat=this.mat('leaves','#385646'),trunkMat=this.mat('trunk','#776659');const forest=[];
    for(let i=0;i<120;i++){
      const a=i*2.39996,r=215+(i%7)*13,x=Math.sin(a)*r,z=Math.cos(a)*r;
      const trunk=B.MeshBuilder.CreateCylinder('tree-trunk',{height:6,diameter:.55,tessellation:6},this.scene);trunk.position=v(x,3,z);trunk.material=trunkMat;forest.push(trunk);
      const crown=B.MeshBuilder.CreateCylinder('tree-crown',{height:9,diameterTop:.4,diameterBottom:5+(i%3),tessellation:7},this.scene);crown.position=v(x,8,z);crown.material=treeMat;forest.push(crown);
    }this.merge(forest,'forest');
    const mountainMat=this.mat('hills','#6b8587');for(let i=0;i<18;i++){
      const a=i/18*Math.PI*2,m=B.MeshBuilder.CreateCylinder('distant-hill',{height:65+i%4*22,diameterTop:5,diameterBottom:160,tessellation:7},this.scene);m.position=v(Math.sin(a)*650,10,Math.cos(a)*650);m.material=mountainMat;
    }
    const boardMat=this.mat('board','#f4f4e8');
    for(let s=100;s<t.length;s+=135){const p=t.at(s,22),node=new B.TransformNode('braking-marker',this.scene);node.position=v(p.x,0,p.z);node.rotation.y=p.heading;this.box('marker',[1.8,1.5,.15],[0,1.4,0],boardMat,node);this.sign('100',[0,1.4,-.09],1.7,.85,node);}
    this.createRain();
  }
  createCar(car) {
    const root=new B.TransformNode(`car-${car.index}`,this.scene),body=new B.TransformNode('suspension',this.scene);body.parent=root;
    const model=car.model,paint=this.mat(`paint-${model.id}`,model.color,.5,.24),trim=this.mat(`trim-${model.id}`,model.accent,.1,.45),glass=this.mat('car-glass','#213c50',.5,.13),rubber=this.mat('tire','#151e24',0,.94),alloy=this.mat('alloy','#c9ced0',.82,.23),carbon=this.mat('carbon','#26333a',.25,.53);
    const add=(name,size,pos,mat)=>this.box(name,size,pos,mat,body);
    // Lofted bodywork keeps the three silhouettes distinct without external assets.
    const stations=[[-2.4,.82,.62],[-1.8,1.00,.98],[-.9,1.03,1.02],[.6,1.00,.94],[1.65,.96,.72],[2.35,.8,.58]];
    if(model.id==='titan')stations.forEach(p=>{p[1]*=1.07;p[2]*=1.08;});
    if(model.id==='apex')stations.forEach(p=>{p[1]*=.97;p[2]*=.92;});
    const positions=[],indices=[];for(const [z,width,height] of stations)positions.push(-width,.35,z,width,.35,z,width,height,z,-width,height,z);
    for(let i=0;i<stations.length-1;i++)for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4,c=(i+1)*4+j,d=(i+1)*4+(j+1)%4;indices.push(a,c,b,b,c,d);}
    indices.push(0,1,2,0,2,3,20,23,22,20,22,21);
    const shell=new B.Mesh('formed-body',this.scene),data=new B.VertexData();data.positions=positions;data.indices=indices;const normals=[];B.VertexData.ComputeNormals(positions,indices,normals);data.normals=normals;data.applyToMesh(shell);shell.material=paint;shell.parent=body;shell.material.backFaceCulling=false;
    const cabin=add('cabin',[1.58,.63,1.75],[0,1.18,-.24],glass);cabin.rotation.x=-.06;
    add('roof',[1.48,.1,1.04],[0,1.54,-.35],paint);
    add('windshield-frame',[1.64,.07,.08],[0,1.48,.55],trim);
    for(const side of [-1,1]){
      add('window-pillar',[.075,.65,.1],[side*.79,1.18,-.48],paint);
      add('sill',[.13,.16,3.9],[side*1.035,.35,0],carbon);
      add('mirror-stalk',[.28,.07,.1],[side*1.07,1.1,.62],carbon);
      add('mirror',[.28,.16,.36],[side*1.23,1.13,.64],paint);
      add('headlight',[.52,.16,.1],[side*.57,.66,2.34],this.mat('headlight','#ecf5ff',.2,.15));
      add('rear-light',[.64,.11,.05],[side*.53,.77,-2.4],this.mat('taillight','#cf352d',.1,.3));
      add('wing-upright',[.08,.48,.11],[side*.6,1.1,-2.04],carbon);
      const exhaust=B.MeshBuilder.CreateCylinder('exhaust',{height:.3,diameter:.16,tessellation:12},this.scene);exhaust.rotation.x=Math.PI/2;exhaust.position=v(side*.6,.43,-2.48);exhaust.parent=body;exhaust.material=alloy;
    }
    add('splitter',[2.1,.08,.45],[0,.27,2.2],carbon);add('diffuser',[1.9,.22,.25],[0,.29,-2.35],carbon);
    add('rear-wing',[2.34,.095,.45],[0,1.39,-2.07],carbon);
    add('hood-stripe',[.28,.028,1.45],[0,.94,1.08],trim);
    for(let i=0;i<7;i++)add('grille-slat',[1.2,.025,.08],[0,.43+i*.032,2.41],carbon);
    const wheels=[];
    for(const side of [-1,1])for(const z of [-1.45,1.46]){
      const pivot=new B.TransformNode('wheel-steer',this.scene);pivot.parent=root;pivot.position=v(side*1.025,.43,z);
      const spin=new B.TransformNode('wheel-spin',this.scene);spin.parent=pivot;
      const tire=B.MeshBuilder.CreateCylinder('tire',{height:.32,diameter:.86,tessellation:32},this.scene);tire.rotation.z=Math.PI/2;tire.parent=spin;tire.material=rubber;
      const rim=B.MeshBuilder.CreateCylinder('rim',{height:.335,diameter:.60,tessellation:24},this.scene);rim.rotation.z=Math.PI/2;rim.parent=spin;rim.material=carbon;
      for(let i=0;i<7;i++){const spoke=this.box('spoke',[.35,.065,.55],[0,0,0],alloy,spin);spoke.rotation.x=i/7*Math.PI;}
      wheels.push({pivot,spin,front:z>0});
    }
    for(const mesh of root.getChildMeshes())this.shadow.addShadowCaster(mesh);
    return {root,body,wheels};
  }
  setRace(race) {
    this.race=race;for(const item of this.carNodes){for(const mesh of item.root.getChildMeshes())this.shadow.removeShadowCaster(mesh);item.root.dispose();}
    this.carNodes=race.cars.map(c=>this.createCar(c));this.cameraReady=false;this.setWeather(race.weather);
  }
  setWeather(weather) {
    const wet=weather==='wet';this.scene.clearColor=wet?new B.Color4(.34,.42,.48,1):new B.Color4(.69,.81,.87,1);
    this.scene.fogColor=wet?color('#71838e'):color('#b7cdd6');this.scene.fogDensity=wet?.0038:.0018;
    this.sun.intensity=wet?.6:2.1;this.hemi.intensity=wet?.8:.85;this.roadMaterial.roughness=wet?.21:.91;this.roadMaterial.metallic=wet?.28:0;
    if(this.rain)this.rain.setEnabled(wet);
  }
  createRain() {
    this.rainLines=Array.from({length:this.quality==='high'?240:100},(_,i)=>[v(),v()]);
    this.rain=B.MeshBuilder.CreateLineSystem('rain',{lines:this.rainLines,updatable:true},this.scene);this.rain.color=color('#bdcedc');this.rain.alpha=.38;this.rain.isPickable=false;
  }
  render(dt) {
    this.elapsed+=dt;const race=this.race;
    for(const car of race.cars){const node=this.carNodes[car.index];node.root.position.set(car.x,0,car.z);node.root.rotation.y=car.yaw;
      node.body.rotation.z=-car.steer*clamp(car.speed/80,0,.6)*.085;node.body.rotation.x=(car.brake-car.throttle)*.018;
      for(const wheel of node.wheels){wheel.spin.rotation.x+=car.speed*dt/.43;if(wheel.front)wheel.pivot.rotation.y=car.steer*.48/(1+car.speed*.018);}
    }
    const p=race.player,forward=v(Math.sin(p.yaw),0,Math.cos(p.yaw));
    let desired,target;
    if(race.phase==='menu'){
      const a=this.elapsed*.04;desired=v(p.x-9*Math.cos(a),4.3,p.z-9*Math.sin(a));target=v(p.x,1,p.z);
    }else {desired=v(p.x-forward.x*(10+p.speed*.035),4.8+p.speed*.014,p.z-forward.z*(10+p.speed*.035));target=v(p.x+forward.x*9,1.1,p.z+forward.z*9);}
    if(!this.cameraReady){this.camera.position.copyFrom(desired);this.cameraReady=true;}else B.Vector3.LerpToRef(this.camera.position,desired,1-Math.exp(-dt*5),this.camera.position);
    this.camera.setTarget(target);this.camera.fov=.83+clamp(p.speed/450,0,.15);
    if(race.weather==='wet'){
      for(let i=0;i<this.rainLines.length;i++){const x=p.x+Math.sin(i*127.1)*25,z=p.z+Math.cos(i*311.7)*25,y=((i*.71-this.elapsed*23)%20+20)%20;this.rainLines[i][0].set(x,y,z);this.rainLines[i][1].set(x-.18,y-1.2,z+.08);}
      B.MeshBuilder.CreateLineSystem('rain',{lines:this.rainLines,instance:this.rain});
    }
    this.scene.render();
  }
  dispose(){window.removeEventListener('resize',this.resize);this.scene.dispose();this.engine.dispose();}
}
