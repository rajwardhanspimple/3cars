import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const id='4b1a593df06042e29dce6049b466f932';
const url='https://raw.githubusercontent.com/ViktorVelizarov/Custom-Cars-3D/f3196e7c2f59e093ffdf891dd72a8428ce4d0fe4/public/mustang.gltf';
const dir='asset-audit';await mkdir(dir,{recursive:true});
const report={};
try{
 const response=await fetch(`https://api.sketchfab.com/v3/models/${id}`,{signal:AbortSignal.timeout(30000)});
 report.sourceStatus=response.status;
 if(response.ok){const data=await response.json();report.original={name:data.name,author:data.user?.displayName,username:data.user?.username,license:data.license,isDownloadable:data.isDownloadable,vertexCount:data.vertexCount,faceCount:data.faceCount,description:data.description,viewerUrl:data.viewerUrl};}
}catch(error){report.sourceError=error.message;}
const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Model HTTP ${response.status}`);
const bytes=Buffer.from(await response.arrayBuffer());const sha=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
if(sha!=='5c8620a26ddfceca07df425c80e2d8f6703dd6df')throw Error('Source checksum mismatch');
const gltf=JSON.parse(bytes.toString());
report.asset=gltf.asset;report.byteLength=bytes.length;report.sha256=createHash('sha256').update(bytes).digest('hex');report.extensions=gltf.extensionsUsed;
report.buffers=gltf.buffers?.map(b=>({byteLength:b.byteLength,uri:b.uri?.startsWith('data:')?'embedded':b.uri}));report.images=gltf.images?.map(i=>({name:i.name,uri:i.uri?.startsWith('data:')?'embedded':i.uri}));
report.materials=gltf.materials?.map((m,i)=>({i,name:m.name,pbr:m.pbrMetallicRoughness,alphaMode:m.alphaMode,extensions:m.extensions}));
report.nodes=gltf.nodes?.map((n,i)=>({i,name:n.name,children:n.children,mesh:n.mesh,t:n.translation,r:n.rotation,s:n.scale}));
report.meshes=gltf.meshes?.map((m,i)=>({i,name:m.name,parts:m.primitives.map(p=>({mat:p.material,count:gltf.accessors[p.indices]?.count,min:gltf.accessors[p.attributes.POSITION]?.min,max:gltf.accessors[p.attributes.POSITION]?.max}))}));
await writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await writeFile(`${dir}/mustang.gltf`,bytes);
console.log(JSON.stringify(report));
if(report.original?.license?.slug!=='by')throw Error('Original CC BY license not confirmed. Do not distribute the asset.');
