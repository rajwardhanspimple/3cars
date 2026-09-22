import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dest=resolve(root,'assets/environment');
const manifest=JSON.parse(await readFile(new URL('../assets/environment-sources.json',import.meta.url),'utf8'));
const digest=(bytes,kind='sha256')=>createHash(kind).update(bytes).digest('hex');
function allowed(url){const u=new URL(url);if(u.protocol!=='https:'||!['raw.githubusercontent.com','api.polyhaven.com','dl.polyhaven.org'].includes(u.hostname))throw Error('Unapproved asset host: '+url);return u;}
async function fetchBytes(url){allowed(url);let last;for(let i=0;i<3;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error(`${r.status}: ${url}`);return Buffer.from(await r.arrayBuffer());}catch(e){last=e;}}throw last;}
async function download(url,path,md5,size){
 let bytes;try{bytes=await readFile(path);}catch(e){if(e.code!=='ENOENT')throw e;}
 const valid=b=>(!size||b.length===size)&&(!md5||digest(b,'md5')===md5);
 if(!bytes||!valid(bytes)){bytes=await fetchBytes(url);if(!valid(bytes))throw Error('Asset checksum/size mismatch: '+url);await mkdir(dirname(path),{recursive:true});const tmp=path+'.tmp';await writeFile(tmp,bytes);await rename(tmp,path);}
 return bytes;
}
function glbJSON(bytes){if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('Expected GLB2');if(bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Missing GLB JSON');return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());}
function safePath(base,path){const p=resolve(base,path);if(relative(base,p).startsWith('..')||path.includes('\\'))throw Error('Unsafe asset path '+path);return p;}
export async function prepareEnvironment(){
 await mkdir(dest,{recursive:true});
 const cherryBytes=await download(manifest.cherry.url,resolve(dest,'cherry.glb'),null,manifest.cherry.bytes),cherry=glbJSON(cherryBytes),extra=JSON.stringify(cherry.asset?.extras||{});
 console.log('CHERRY_SOURCE_METADATA',extra);
 if(!extra.includes('db1b69851fd449928d36767c4f15502d')||!extra.toLowerCase().includes(manifest.cherry.creator)||!extra.includes(manifest.cherry.license))throw Error('Cherry mirror attribution does not match verified creator listing');
 for(const uri of [...(cherry.buffers||[]),...(cherry.images||[])].map(x=>x.uri).filter(Boolean))if(!uri.startsWith('data:'))throw Error('External cherry asset URI');
 const textureRecords=[];
 for(const t of manifest.textures){const b=await download(t.url,resolve(dest,t.file),t.md5);textureRecords.push({file:t.file,sha256:digest(b),bytes:b.length});}
 const api=JSON.parse((await fetchBytes(manifest.greenTree.api)).toString()),entry=api.gltf?.[manifest.greenTree.resolution]?.gltf;
 if(!entry?.url||!entry?.md5)throw Error('Poly Haven glTF manifest missing');
 const greenDir=resolve(dest,'green-tree'),sourceBytes=await download(entry.url,resolve(greenDir,'source.gltf'),entry.md5,entry.size),gltf=JSON.parse(sourceBytes),includes=entry.include||{};
 for(const item of [...(gltf.buffers||[]),...(gltf.images||[])]){
  if(!item.uri||item.uri.startsWith('data:'))continue;
  const key=decodeURIComponent(item.uri),include=includes[key]||Object.entries(includes).find(([p])=>p.split('/').pop()===key.split('/').pop())?.[1];
  if(!include?.url||!include?.md5)throw Error('Unverified glTF dependency '+key);
  const local=key.replace(/^\.\//,'');await download(include.url,safePath(greenDir,local),include.md5,include.size);item.uri=local;
 }
 // All dependencies stay same-origin in the published build.
 await writeFile(resolve(greenDir,'scene.gltf'),JSON.stringify(gltf));
 const greenTriangles=(gltf.meshes||[]).reduce((n,m)=>n+m.primitives.reduce((k,p)=>k+(gltf.accessors[p.indices]?.count||0)/3,0),0);
 const cherryTriangles=(cherry.meshes||[]).reduce((n,m)=>n+m.primitives.reduce((k,p)=>k+(cherry.accessors[p.indices]?.count||0)/3,0),0);
 const report={cherry:{sha256:digest(cherryBytes),triangles:cherryTriangles,source:manifest.cherry.source,license:manifest.cherry.license},green:{source:'https://polyhaven.com/a/jacaranda_tree',sha256:digest(sourceBytes),triangles:greenTriangles,license:'CC0-1.0'},textures:textureRecords};
 await writeFile(resolve(dest,'verification.json'),JSON.stringify(report,null,2));console.log('ENVIRONMENT_ASSETS_VERIFIED',JSON.stringify(report));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)prepareEnvironment().catch(e=>{console.error(e.stack);process.exitCode=1;});
