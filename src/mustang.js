// The original asset is never simplified. Runtime checks enforce every source triangle.
const B=globalThis.BABYLON;
export const MUSTANG_TRIANGLES=1493119;
const vector=(x=0,y=0,z=0)=>new B.Vector3(x,y,z);
const assetURL=new URL('../assets/mustang-2015.gltf',import.meta.url);
const decoderURL=name=>new URL(`../vendor/draco/${name}`,import.meta.url).href;
let decoderConfigured=false;
function configureDecoder(){
 if(decoderConfigured)return;
 B.DracoCompression.Configuration={decoder:{wasmUrl:decoderURL('draco_wasm_wrapper.js'),wasmBinaryUrl:decoderURL('draco_decoder.wasm'),fallbackUrl:decoderURL('draco_decoder.js')}};
 decoderConfigured=true;
}
const triangleCount=meshes=>meshes.reduce((sum,m)=>sum+m.getTotalIndices()/3,0);
function bounds(meshes){let min=vector(Infinity,Infinity,Infinity),max=vector(-Infinity,-Infinity,-Infinity);for(const m of meshes){m.computeWorldMatrix(true);const box=m.getBoundingInfo().boundingBox;min=B.Vector3.Minimize(min,box.minimumWorld);max=B.Vector3.Maximize(max,box.maximumWorld);}return{min,max,size:max.subtract(min),center:min.add(max).scale(.5)};}
function materialName(mesh){return mesh.material?.name||'';}
function identity(mesh){mesh.parent=null;mesh.position.setAll(0);mesh.rotation.setAll(0);mesh.rotationQuaternion=null;mesh.scaling.setAll(1);mesh.computeWorldMatrix(true);}

function tuneMaterials(meshes,paintHex){
 for(const m of new Set(meshes.map(mesh=>mesh.material))){
  if(!(m instanceof B.PBRMaterial))continue;
  m.environmentIntensity=1.0;
  if(m.name==='CARPAINT'){m.albedoColor=B.Color3.FromHexString(paintHex).toLinearSpace();m.metallic=.68;m.roughness=.24;m.clearCoat.isEnabled=true;m.clearCoat.intensity=1;m.clearCoat.roughness=.12;}
  else if(m.name==='Rubber_Black'){m.metallic=0;m.roughness=.85;m.albedoColor=new B.Color3(.016,.018,.02);}
  else if(m.name==='Chrome'){m.metallic=1;m.roughness=.16;}
  else if(m.name==='Black_Metal_Paint'){m.metallic=.85;m.roughness=.26;}
  else if(m.name==='Black_Plastic'){m.metallic=0;m.roughness=.65;m.albedoColor=new B.Color3(.012,.014,.016);}
  else if(m.name==='Window_Glass'){m.metallic=.15;m.roughness=.08;m.albedoColor=new B.Color3(.035,.055,.07);m.alpha=.84;m.transparencyMode=B.PBRMaterial.PBRMATERIAL_ALPHABLEND;}
  else if(['Front_Glass','GlassTransparent'].includes(m.name)){m.metallic=.08;m.roughness=.09;m.alpha=.30;m.transparencyMode=B.PBRMaterial.PBRMATERIAL_ALPHABLEND;m.albedoColor=new B.Color3(.35,.42,.46);}
  else if(m.name==='RedGlass'){m.metallic=.15;m.roughness=.18;m.emissiveColor=new B.Color3(.22,.002,.001);}
  else if(m.name==='Light'){m.emissiveColor=new B.Color3(.28,.3,.32);m.metallic=.1;m.roughness=.18;}
  else if(m.name==='Mirror'){m.metallic=1;m.roughness=.04;m.albedoColor=new B.Color3(.7,.72,.74);}
 }
}

// Split material-combined wheels by axle and side. Each input triangle appears once.
// No vertex welding, decimation, mesh replacement, or LOD is performed.
function splitWheelParts(mesh,centers,scene){
 const source=B.VertexData.ExtractFromMesh(mesh,true,true),positions=source.positions,indices=source.indices;
 const groups=Array.from({length:5},()=>[]);
 const tire=materialName(mesh)==='Rubber_Black';
 for(let i=0;i<indices.length;i+=3){
  let x=0,y=0,z=0;for(let j=0;j<3;j++){const k=indices[i+j]*3;x+=positions[k]/3;y+=positions[k+1]/3;z+=positions[k+2]/3;}
  let index=4,best=Infinity;
  for(let j=0;j<4;j++){const c=centers[j],distance=(x-c.x)**2+(z-c.z)**2+(y-c.y)**2;if(distance<best){best=distance;index=j;}}
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

export async function createMustang(view,car){
 configureDecoder();const scene=view.scene;
 if(!B.SceneLoader.IsPluginForExtensionAvailable('.gltf'))throw Error('Mustang glTF loader is unavailable. Run npm install and reload.');
 let container;
 try{container=await B.SceneLoader.LoadAssetContainerAsync(new URL('./',assetURL).href,'mustang-2015.gltf',scene);}catch(error){throw new Error(`Unable to load the full-resolution Mustang. Run npm run assets and reload. ${error.message}`);}
 if(view.disposed){container.dispose();throw Error('Car load canceled');}
 container.addAllToScene();
 const meshes=container.meshes.filter(m=>m.getTotalVertices()>0&&m.getTotalIndices()>0);
 if(triangleCount(meshes)!==MUSTANG_TRIANGLES){container.dispose();throw Error('Mustang triangle count does not match the full-resolution source.');}
 // Bake the source hierarchy into geometry, preserving indices and all triangles.
 const worlds=meshes.map(m=>m.computeWorldMatrix(true).clone());
 meshes.forEach((mesh,i)=>{mesh.makeGeometryUnique();identity(mesh);mesh.bakeTransformIntoVertices(worlds[i]);mesh.refreshBoundingInfo();mesh.computeWorldMatrix(true);});
 const initial=bounds(meshes),red=meshes.find(m=>materialName(m)==='RedGlass');
 const rearZ=red?(red.getBoundingInfo().boundingBox.centerWorld.z-initial.center.z):-1;
 const flip=rearZ>0?Math.PI:0;
 const rotation=B.Matrix.RotationY(flip),scale=4.784/initial.size.z;
 const normalization=B.Matrix.Translation(-initial.center.x,-initial.min.y,-initial.center.z).multiply(rotation).multiply(B.Matrix.Scaling(scale,scale,scale)).multiply(B.Matrix.Translation(0,.04,0));
 for(const mesh of meshes){mesh.bakeTransformIntoVertices(normalization);mesh.refreshBoundingInfo();mesh.computeWorldMatrix(true);}
 const tireMeshes=meshes.filter(m=>materialName(m)==='Rubber_Black');
 if(tireMeshes.length!==4)throw Error('Unexpected Mustang tire structure');
 const axleRanges=Array.from({length:4},()=>({min:vector(Infinity,Infinity,Infinity),max:vector(-Infinity,-Infinity,-Infinity)}));
 for(const mesh of tireMeshes){const p=mesh.getVerticesData(B.VertexBuffer.PositionKind);for(let i=0;i<p.length;i+=3){const group=(p[i]>=0?2:0)+(p[i+2]>=0?1:0),r=axleRanges[group];r.min.x=Math.min(r.min.x,p[i]);r.min.y=Math.min(r.min.y,p[i+1]);r.min.z=Math.min(r.min.z,p[i+2]);r.max.x=Math.max(r.max.x,p[i]);r.max.y=Math.max(r.max.y,p[i+1]);r.max.z=Math.max(r.max.z,p[i+2]);}}
 const centers=axleRanges.map(r=>r.min.add(r.max).scale(.5));
 if(centers.some(c=>!Number.isFinite(c.x)||c.y<.1||c.y>1))throw Error('Mustang wheel positions are invalid');
 const root=new B.TransformNode('car-0',scene),body=new B.TransformNode('mustang-body',scene);body.parent=root;
 const wheels=centers.map((center,i)=>{const pivot=new B.TransformNode(`mustang-steer-${i}`,scene),spin=new B.TransformNode(`mustang-spin-${i}`,scene);pivot.parent=root;pivot.position.copyFrom(center);spin.parent=pivot;return{pivot,spin,front:center.z>0,radius:(axleRanges[i].max.y-axleRanges[i].min.y)/2};});
 const wheelMaterials=new Set(['Rubber_Black','Black_Metal_Paint','Brushed_Aluminum','Calipers']);
 const finalMeshes=[];
 for(const mesh of meshes){
  if(wheelMaterials.has(materialName(mesh))){const caliper=materialName(mesh)==='Calipers';for(const part of splitWheelParts(mesh,centers,scene)){if(part.wheel===null)part.mesh.parent=body;else{part.mesh.parent=caliper?wheels[part.wheel].pivot:wheels[part.wheel].spin;part.mesh.position.copyFrom(centers[part.wheel].negate());}finalMeshes.push(part.mesh);}}
  else{mesh.parent=body;finalMeshes.push(mesh);}
 }
 tuneMaterials(finalMeshes,car.model.color);
 for(const mesh of finalMeshes){mesh.receiveShadows=true;mesh.isPickable=false;mesh.metadata={mustang:true,sourceTriangles:MUSTANG_TRIANGLES};view.shadow.addShadowCaster(mesh);}
 const count=triangleCount(finalMeshes);
 if(count!==MUSTANG_TRIANGLES)throw Error(`Full-resolution model verification failed: ${count}`);
 root.metadata={model:'Ford Mustang 2015 EDITION',imported:true,triangles:count,originalTriangles:MUSTANG_TRIANGLES,geometrySimplified:false,wheelCenters:centers.map(c=>c.asArray()),wheelCount:4};
 scene.metadata={...scene.metadata,mustang:root.metadata};
 const result={root,body,wheels,imported:true,container,meshes:finalMeshes,paint:finalMeshes.find(m=>materialName(m)==='CARPAINT')?.material};
 return result;
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
