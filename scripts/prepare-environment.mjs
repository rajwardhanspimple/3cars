import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {resolve,dirname,relative,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {optimizeGreenTree} from './optimize-foliage.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dest=resolve(root,'assets/environment');
const manifest=JSON.parse(await readFile(new URL('../assets/environment-sources.json',import.meta.url),'utf8'));
const digest=(bytes,kind='sha256')=>createHash(kind).update(bytes).digest('hex');
const mb=n=>`${(n/1048576).toFixed(1)} MB`;
function allowed(url){const u=new URL(url);if(u.protocol!=='https:'||!['raw.githubusercontent.com','api.polyhaven.com','dl.polyhaven.org'].includes(u.hostname))throw Error('Unapproved asset host: '+url);return u;}

// The timeout applies to each stalled chunk, not the whole transfer, so large
// files on slow connections keep going instead of aborting and restarting.
async function streamTo(url,path,label){
 await mkdir(dirname(path),{recursive:true});
 const tmp=path+'.tmp',response=await fetch(url,{signal:AbortSignal.timeout(45000)});
 if(!response.ok)throw Error(`${response.status}: ${url}`);
 const total=Number(response.headers.get('content-length'))||0,hash=createHash('sha256'),md5=createHash('md5');
 const file=createWriteStream(tmp);let done=0,shown=-1,last=Date.now();
 const reader=response.body.getReader();
 try{
  for(;;){
   const chunk=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(Error(`stalled for 45s: ${label}`)),45000))]);
   if(chunk.done)break;
   const buffer=Buffer.from(chunk.value);hash.update(buffer);md5.update(buffer);done+=buffer.length;
   if(!file.write(buffer))await new Promise(r=>file.once('drain',r));
   const pct=total?Math.floor(done/total*100):-1;
   if(pct>=0&&pct>=shown+5){shown=pct;process.stdout.write(`\r  ${label} ${pct}% of ${mb(total)}   `);}
   else if(pct<0&&Date.now()-last>2000){last=Date.now();process.stdout.write(`\r  ${label} ${mb(done)}   `);}
  }
 }finally{await new Promise(r=>file.end(r));reader.releaseLock?.();}
 process.stdout.write(`\r  ${label} done, ${mb(done)}          \n`);
 await rename(tmp,path);
 return {bytes:done,sha256:hash.digest('hex'),md5:md5.digest('hex')};
}
async function fetchBytes(url){allowed(url);let last;for(let attempt=1;attempt<=3;attempt++){try{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`${r.status}: ${url}`);return Buffer.from(await r.arrayBuffer());}catch(e){last=e;if(attempt<3)console.log(`  retry ${attempt} of 2 for ${basename(new URL(url).pathname)}: ${e.message}`);}}throw last;}
async function download(url,path,md5,size){
 allowed(url);
 const label=basename(path);
 let bytes;try{bytes=await readFile(path);}catch(e){if(e.code!=='ENOENT')throw e;}
 const valid=b=>(!size||b.length===size)&&(!md5||digest(b,'md5')===md5);
 if(bytes&&valid(bytes)){console.log(`  ${label} cached, ${mb(bytes.length)}`);return bytes;}
 let last;
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const result=await streamTo(url,path,label);
   if(size&&result.bytes!==size)throw Error(`size mismatch: expected ${size}, got ${result.bytes}`);
   if(md5&&result.md5!==md5)throw Error('checksum mismatch');
   return await readFile(path);
  }catch(e){last=e;if(attempt<3)console.log(`  retry ${attempt} of 2 for ${label}: ${e.message}`);}
 }
 throw Error(`Failed to download ${label} after 3 attempts: ${last?.message}`);
}
function glbJSON(bytes){if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2)throw Error('Expected GLB2');if(bytes.readUInt32LE(16)!==0x4e4f534a)throw Error('Missing GLB JSON');return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString().trim());}
function safePath(base,path){const p=resolve(base,path);if(relative(base,p).startsWith('..')||path.includes('\\'))throw Error('Unsafe asset path '+path);return p;}
export async function prepareEnvironment(){
 await mkdir(dest,{recursive:true});
 console.log('Preparing environment assets. Large files download once, then cache.');
 const cherryBytes=await download(manifest.cherry.url,resolve(dest,'cherry.glb'),null,manifest.cherry.bytes),cherry=glbJSON(cherryBytes),extra=JSON.stringify(cherry.asset?.extras||{});
 if(digest(cherryBytes)!=='43c28c4611abdfc058fa484383156e70f5f1cf6ee52b19eb7f97851867a277fc')throw Error('Cherry source checksum changed');
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
 await writeFile(resolve(greenDir,'scene.gltf'),JSON.stringify(gltf));
 const optimization=await optimizeGreenTree();
 const cherryTriangles=(cherry.meshes||[]).reduce((n,m)=>n+m.primitives.reduce((k,p)=>k+(cherry.accessors[p.indices]?.count||0)/3,0),0);
 const report={cherry:{sha256:digest(cherryBytes),triangles:cherryTriangles,source:manifest.cherry.source,license:manifest.cherry.license},green:{source:'https://polyhaven.com/a/jacaranda_tree',sha256:digest(sourceBytes),license:'CC0-1.0',optimization},textures:textureRecords};
 await writeFile(resolve(dest,'verification.json'),JSON.stringify(report,null,2));console.log('ENVIRONMENT_ASSETS_VERIFIED',JSON.stringify(report));return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)prepareEnvironment().catch(e=>{console.error(e.stack);process.exitCode=1;});
