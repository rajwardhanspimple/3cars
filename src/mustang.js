// The original asset is never simplified. Runtime checks enforce every source triangle.
const B=globalThis.BABYLON;
export const MUSTANG_TRIANGLES=1493119;
export const MUSTANG_FLEET_TRIANGLES=MUSTANG_TRIANGLES*3;
const EXPECTED_MESHES=54;
const WHEEL_COUNT=4;
const vector=(x=0,y=0,z=0)=>new B.Vector3(x,y,z);
const assetURL=new URL('../assets/mustang-2015.gltf',import.meta.url);
const decoderURL=name=>new URL(`../vendor/draco/${name}`,import.meta.url).href;
const preparedByScene=new WeakMap();
let decoderConfigured=false;
function configureDecoder(){
 if(decoderConfigured)return;
 B.DracoCompression.Configuration={decoder:{wasmUrl:decoderURL('draco_wasm_wrapper.js'),wasmBinaryUrl:decoderURL('draco_decoder.wasm'),fallbackUrl:decoderURL('draco_decoder.js')}};
 decoderConfigured=true;
}
const triangleCount=meshes=>meshes.reduce((sum,m)=>sum+m.getTotalIndices()/3,0);
function bounds(meshes){let min=vector(Infinity,Infinity,Infinity),max=vector(-Infinity,-Infinity,-Infinity);for(const m of meshes){m.computeWorldMatrix(true);const box=m.getBoundingInfo().boundingBox;min=B.Vector3.Minimize(min,box.minimumWorld);max=B.Vector3.Maximize(max,box.maximumWorld);}return{min,max,size:max.subtract(min),center:min.add(max).scale(.5)};}
function materialName(mesh){return mesh.material?.name||'';}
function baseMaterialName(name=''){return String(name).replace(/^car-\d+-/,'');}
function meshBaseName(name=''){return String(name).replace(/^car-\d+-/,'').replace(/^mustang-template-/,'');}
function identity(mesh){mesh.parent=null;mesh.position.setAll(0);mesh.rotation.setAll(0);mesh.rotationQuaternion=null;mesh.scaling.setAll(1);mesh.computeWorldMatrix(true);}
function copyTransform(target,source){target.position.copyFrom(source.position);target.rotation.copyFrom(source.rotation);target.scaling.copyFrom(source.scaling);target.rotationQuaternion=source.rotationQuaternion?.clone?.()||null;}

function tuneMaterials(meshes,paintHex){
 for(const material of new Set(meshes.map(mesh=>mesh.material))){
  if(!(material instanceof B.PBRMaterial))continue;
  const name=baseMaterialName(material.name);
  material.environmentIntensity=1.0;
  if(name==='CARPAINT'){material.albedoColor=B.Color3.FromHexString(paintHex).toLinearSpace();material.metallic=.68;material.roughness=.24;material.clearCoat.isEnabled=true;material.clearCoat.intensity=1;material.clearCoat.roughness=.12;}
  else if(name==='Rubber_Black'){material.metallic=0;material.roughness=.85;material.albedoColor=new B.Color3(.016,.018,.02);}
  else if(name==='Chrome'){material.metallic=1;material.roughness=.16;}
  else if(name==='Black_Metal_Paint'){material.metallic=.85;material.roughness=.26;}
  else if(name==='Black_Plastic'){material.metallic=0;material.roughness=.65;material.albedoColor=new B.Color3(.012,.014,.016);}
  else if(name==='Window_Glass'){material.metallic=.15;material.roughness=.08;material.albedoColor=new B.Color3(.035,.055,.07);material.alpha=.84;material.transparencyMode=B.PBRMaterial.PBRMATERIAL_ALPHABLEND;}
  else if(['Front_Glass','GlassTransparent'].includes(name)){material.metallic=.08;material.roughness=.09;material.alpha=.30;material.transparencyMode=B.PBRMaterial.PBRMATERIAL_ALPHABLEND;material.albedoColor=new B.Color3(.35,.42,.46);}
  else if(name==='RedGlass'){material.metallic=.15;material.roughness=.18;material.emissiveColor=new B.Color3(.22,.002,.001);}
  else if(name==='Light'){material.emissiveColor=new B.Color3(.28,.3,.32);material.metallic=.1;material.roughness=.18;}
  else if(name==='Mirror'){material.metallic=1;material.roughness=.04;material.albedoColor=new B.Color3(.7,.72,.74);}
 }
}

// Split material-combined wheels by axle and side. Each input triangle appears once.
// No vertex welding, decimation, mesh replacement, or LOD is performed.
function splitWheelParts(mesh,centers,scene){
 const source=B.VertexData.ExtractFromMesh(mesh,true,true),positions=source.positions,indices=source.indices;
 const groups=Array.from({length:5},()=>[]);
 const tire=baseMaterialName(materialName(mesh))==='Rubber_Black';
 for(let i=0;i<indices.length;i+=3){
  let x=0,y=0,z=0;for(let j=0;j<3;j++){const k=indices[i+j]*3;x+=positions[k]/3;y+=positions[k+1]/3;z+=positions[k+2]/3;}
  let index=4,best=Infinity;
  for(let j=0;j<WHEEL_COUNT;j++){const c=centers[j],distance=(x-c.x)**2+(z-c.z)**2+(y-c.y)**2;if(distance<best){best=distance;index=j;}}
  if(!tire&&best>.63**2)index=4;
  groups[index].push(indices[i],indices[i+1],indices[i+2]);
 }
 const parts=[];
 for(let group=0;group<5;group++){
  const refs=groups[group];if(!refs.length)continue;
  const remap=new Map(),data=new B.VertexData(),attributes=[['positions',3],['normals',3],['uvs',2],['uvs2',2],['tangents',4],['colors',4]].filter(([key])=>source[key]);
  for(const[key]of attributes)data[key]=[];data.indices=[];
  for(const old of refs){let next=remap.get(old);if(next===undefined){next=remap.size;remap.set(old,next);for(const[key,size]of attributes)for(let j=0;j<size;j++)data[key].push(source[key][old*size+j]);}data.indices.push(next);}
  const part=new B.Mesh(`mustang-${mesh.name}-${group}`,scene);data.applyToMesh(part);part.material=mesh.material;parts.push({mesh:part,wheel:group===4?null:group});
 }
 if(triangleCount(parts.map(p=>p.mesh))!==mesh.getTotalIndices()/3)throw Error('Wheel triangle preservation failed');
 mesh.dispose(false,false);return parts;
}

async function loadAndPrepareMustang(view){
 configureDecoder();const scene=view.scene;
 if(!B.SceneLoader.IsPluginForExtensionAvailable('.gltf'))throw Error('Mustang glTF loader is unavailable. Run npm install and reload.');
 let container;
 try{container=await B.SceneLoader.LoadAssetContainerAsync(new URL('./',assetURL).href,'mustang-2015.gltf',scene);}catch(error){throw new Error(`Unable to load the full-resolution Mustang. Run npm run assets and reload. ${error.message}`);}
 if(view.disposed){container.dispose();throw Error('Car load canceled');}
 container.addAllToScene();
 const meshes=container.meshes.filter(m=>m.getTotalVertices()>0&&m.getTotalIndices()>0);
 if(triangleCount(meshes)!==MUSTANG_TRIANGLES){container.dispose();throw Error('Mustang triangle count does not match the full-resolution source.');}
 // Bake the source hierarchy into geometry once, preserving indices and all triangles.
 const worlds=meshes.map(m=>m.computeWorldMatrix(true).clone());
 meshes.forEach((mesh,i)=>{mesh.makeGeometryUnique();identity(mesh);mesh.bakeTransformIntoVertices(worlds[i]);mesh.refreshBoundingInfo();mesh.computeWorldMatrix(true);});
 const initial=bounds(meshes),red=meshes.find(m=>baseMaterialName(materialName(m))==='RedGlass');
 const rearZ=red?(red.getBoundingInfo().boundingBox.centerWorld.z-initial.center.z):-1;
 const flip=rearZ>0?Math.PI:0;
 const rotation=B.Matrix.RotationY(flip),scale=4.784/initial.size.z;
 const normalization=B.Matrix.Translation(-initial.center.x,-initial.min.y,-initial.center.z).multiply(rotation).multiply(B.Matrix.Scaling(scale,scale,scale)).multiply(B.Matrix.Translation(0,.04,0));
 for(const mesh of meshes){mesh.bakeTransformIntoVertices(normalization);mesh.refreshBoundingInfo();mesh.computeWorldMatrix(true);}
 const tireMeshes=meshes.filter(m=>baseMaterialName(materialName(m))==='Rubber_Black');
 if(tireMeshes.length!==WHEEL_COUNT)throw Error('Unexpected Mustang tire structure');
 const axleRanges=Array.from({length:WHEEL_COUNT},()=>({min:vector(Infinity,Infinity,Infinity),max:vector(-Infinity,-Infinity,-Infinity)}));
 for(const mesh of tireMeshes){const p=mesh.getVerticesData(B.VertexBuffer.PositionKind);for(let i=0;i<p.length;i+=3){const group=(p[i]>=0?2:0)+(p[i+2]>=0?1:0),r=axleRanges[group];r.min.x=Math.min(r.min.x,p[i]);r.min.y=Math.min(r.min.y,p[i+1]);r.min.z=Math.min(r.min.z,p[i+2]);r.max.x=Math.max(r.max.x,p[i]);r.max.y=Math.max(r.max.y,p[i+1]);r.max.z=Math.max(r.max.z,p[i+2]);}}
 const centers=axleRanges.map(r=>r.min.add(r.max).scale(.5));
 if(centers.some(c=>!Number.isFinite(c.x)||c.y<.1||c.y>1))throw Error('Mustang wheel positions are invalid');
 const root=new B.TransformNode('mustang-source-template',scene),body=new B.TransformNode('mustang-template-body',scene);body.parent=root;
 const wheels=centers.map((center,i)=>{const pivot=new B.TransformNode(`mustang-template-steer-${i}`,scene),spin=new B.TransformNode(`mustang-template-spin-${i}`,scene);pivot.parent=root;pivot.position.copyFrom(center);spin.parent=pivot;return{pivot,spin,front:center.z>0,radius:(axleRanges[i].max.y-axleRanges[i].min.y)/2};});
 const wheelMaterials=new Set(['Rubber_Black','Black_Metal_Paint','Brushed_Aluminum','Calipers']);
 const finalMeshes=[];
 for(const mesh of meshes){
  const matName=baseMaterialName(materialName(mesh));
  if(wheelMaterials.has(matName)){const caliper=matName==='Calipers';for(const part of splitWheelParts(mesh,centers,scene)){if(part.wheel===null)part.mesh.parent=body;else{part.mesh.parent=caliper?wheels[part.wheel].pivot:wheels[part.wheel].spin;part.mesh.position.copyFrom(centers[part.wheel].negate());}finalMeshes.push(part.mesh);}}
  else{mesh.parent=body;finalMeshes.push(mesh);}
 }
 tuneMaterials(finalMeshes,'#ffffff');
 for(const mesh of finalMeshes){mesh.receiveShadows=true;mesh.isPickable=false;mesh.name=`mustang-template-${meshBaseName(mesh.name)}`;mesh.metadata={mustang:true,template:true,sourceTriangles:MUSTANG_TRIANGLES};if(mesh.geometry)mesh.geometry.metadata={...mesh.geometry.metadata,mustangShared:true,sourceTriangles:MUSTANG_TRIANGLES};}
 const count=triangleCount(finalMeshes);
 if(count!==MUSTANG_TRIANGLES)throw Error(`Full-resolution model verification failed: ${count}`);
 if(finalMeshes.length!==EXPECTED_MESHES)throw Error(`Unexpected Mustang mesh count: ${finalMeshes.length}`);
 root.metadata={model:'Ford Mustang 2015 EDITION',imported:true,triangles:count,originalTriangles:MUSTANG_TRIANGLES,geometrySimplified:false,wheelCenters:centers.map(c=>c.asArray()),wheelCount:WHEEL_COUNT,meshCount:finalMeshes.length,template:true};
 root.setEnabled(false);
 scene.metadata={...scene.metadata,mustang:root.metadata};
 return{root,body,wheels,meshes:finalMeshes,triangles:count,meshCount:finalMeshes.length};
}
function preparedMustang(view){
 const scene=view.scene;
 let promise=preparedByScene.get(scene);
 if(!promise){promise=loadAndPrepareMustang(view).catch(error=>{preparedByScene.delete(scene);throw error;});preparedByScene.set(scene,promise);}
 return promise;
}
function cloneMaterial(material,prefix){
 if(!material)return null;
 const base=baseMaterialName(material.name)||'material';
 const clone=material.clone?.(`${prefix}-${base}`)||material;
 clone.name=`${prefix}-${base}`;
 return clone;
}
function cloneRig(view,template,car,orderIndex=0){
 const scene=view.scene,prefix=`car-${car?.index??orderIndex}`;
 const root=new B.TransformNode(prefix,scene),body=new B.TransformNode(`${prefix}-body`,scene);body.parent=root;copyTransform(body,template.body);
 const wheels=template.wheels.map((wheel,i)=>{const pivot=new B.TransformNode(`${prefix}-steer-${i}`,scene),spin=new B.TransformNode(`${prefix}-spin-${i}`,scene);pivot.parent=root;spin.parent=pivot;copyTransform(pivot,wheel.pivot);copyTransform(spin,wheel.spin);return{pivot,spin,front:wheel.front,radius:wheel.radius};});
 const materialMap=new Map(),meshMap=[];
 for(const source of template.meshes){
  const parent=source.parent===template.body?body:wheels.find(w=>source.parent===w.pivot)?.pivot||wheels.find(w=>source.parent===w.spin)?.spin||body;
  const mesh=source.clone(`${prefix}-${meshBaseName(source.name)}`,parent,true);
  copyTransform(mesh,source);
  let material=materialMap.get(source.material);
  if(material===undefined){material=cloneMaterial(source.material,prefix);materialMap.set(source.material,material);}
  mesh.material=material;mesh.receiveShadows=true;mesh.isPickable=false;
  mesh.metadata={mustang:true,sourceTriangles:MUSTANG_TRIANGLES,geometryShared:true};
  view.shadow?.addShadowCaster(mesh);
  meshMap.push(mesh);
 }
 tuneMaterials(meshMap,car?.model?.color||'#ffffff');
 const count=triangleCount(meshMap);
 if(count!==MUSTANG_TRIANGLES)throw Error(`Full-resolution model verification failed for ${prefix}: ${count}`);
 if(meshMap.length!==EXPECTED_MESHES)throw Error(`Unexpected Mustang mesh count for ${prefix}: ${meshMap.length}`);
 root.metadata={model:'Ford Mustang 2015 EDITION',imported:true,triangles:count,originalTriangles:MUSTANG_TRIANGLES,geometrySimplified:false,wheelCenters:template.root.metadata.wheelCenters,wheelCount:WHEEL_COUNT,meshCount:meshMap.length,geometryShared:true};
 const paint=meshMap.find(m=>baseMaterialName(materialName(m))==='CARPAINT')?.material||null;
 const tailMaterial=meshMap.find(m=>baseMaterialName(materialName(m))==='RedGlass')?.material||null;
 return{root,body,wheels,imported:true,meshes:meshMap,paint,tailMaterial,model:car?.model,template:template.root};
}
function verifyFleet(scene,rigs){
 for(const rig of rigs){
  const count=triangleCount(rig.meshes);
  if(count!==MUSTANG_TRIANGLES)throw Error(`Fleet Mustang triangle verification failed: ${count}`);
  if(rig.wheels.length!==WHEEL_COUNT)throw Error('Fleet Mustang wheel verification failed');
  rig.root.metadata={...rig.root.metadata,triangles:count,originalTriangles:MUSTANG_TRIANGLES,geometrySimplified:false,wheelCount:WHEEL_COUNT};
 }
 const geometryShared=rigs.length<2||rigs.slice(1).every(rig=>rig.meshes.length===rigs[0].meshes.length&&rig.meshes.every((mesh,i)=>mesh.geometry===rigs[0].meshes[i].geometry));
 if(!geometryShared)throw Error('Mustang geometry sharing verification failed');
 scene.metadata={...scene.metadata,mustang:rigs[0]?.root.metadata||scene.metadata?.mustang,fleet:{carCount:rigs.length,trianglesPerCar:MUSTANG_TRIANGLES,totalTriangles:MUSTANG_TRIANGLES*rigs.length,geometryShared:true}};
}
export async function createMustangFleet(view,cars){
 const template=await preparedMustang(view);
 if(view.disposed)throw Error('Car load canceled');
 const rigs=cars.map((car,i)=>cloneRig(view,template,car,i));
 verifyFleet(view.scene,rigs);
 return rigs;
}
export async function createMustang(view,car){
 const [rig]=await createMustangFleet(view,[car]);
 return rig;
}

// Original sky radiance for paint/glass reflections. No external HDR download.
export function createCarEnvironment(scene){
 const size=128,faces=[];
 for(let face=0;face<6;face++){
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const u=2*(x+.5)/size-1,w=2*(y+.5)/size-1;
   const dir=[vector(1,-w,-u),vector(-1,-w,u),vector(u,1,w),vector(u,-1,-w),vector(u,-w,1),vector(-u,-w,-1)][face].normalize();
   const sky=Math.max(0,dir.y),horizon=Math.exp(-Math.abs(dir.y)*9),sun=Math.pow(Math.max(0,dir.dot(vector(.5,.8,-.3).normalize())),100);
   const cloud=Math.pow(Math.max(0,Math.sin(dir.x*11+dir.z*7)*Math.cos(dir.z*13-dir.x*4)),5)*Math.max(0,1-sky)*.22;
   const rgb=dir.y>=0?[.2+.3*(1-sky)+horizon*.18+cloud+sun,.35+.24*(1-sky)+horizon*.15+cloud+sun,.55+.15*(1-sky)+cloud+sun]:[.095+horizon*.15,.11+horizon*.17,.12+horizon*.19];
   const k=(y*size+x)*4;for(let c=0;c<3;c++)data[k+c]=Math.min(255,Math.round(rgb[c]*255));data[k+3]=255;
  }faces.push(data);
 }
 const texture=new B.RawCubeTexture(scene,faces,size,B.Engine.TEXTUREFORMAT_RGBA,B.Engine.TEXTURETYPE_UNSIGNED_BYTE,true,false,B.Texture.TRILINEAR_SAMPLINGMODE);
 texture.name='Meridian sky reflections';texture.gammaSpace=false;texture.coordinatesMode=B.Texture.CUBIC_MODE;scene.environmentTexture=texture;scene.environmentIntensity=.7;return texture;
}
