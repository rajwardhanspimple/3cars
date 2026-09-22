import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
const source='https://sketchfab.com/3d-models/ford-mustang-2015-edition-4b1a593df06042e29dce6049b466f932';
const url='https://raw.githubusercontent.com/ViktorVelizarov/Custom-Cars-3D/f3196e7c2f59e093ffdf891dd72a8428ce4d0fe4/public/mustang.gltf';
await mkdir('asset-audit',{recursive:true});const report={source};
try{const r=await fetch('https://api.sketchfab.com/v3/models/4b1a593df06042e29dce6049b466f932',{signal:AbortSignal.timeout(20000)});report.sourceStatus=r.status;if(r.ok){const data=await r.json();report.original={name:data.name,license:data.license,author:data.user?.displayName};}}catch(e){report.sourceError=e.message;}
const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Model HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());
if(createHash('sha256').update(bytes).digest('hex')!=='7bc4cd2e0e71730235b31cd5aa521e5511be81f61fa5b2da2bb62a9d478b7396')throw Error('Checksum mismatch');
const g=JSON.parse(bytes.toString());const credit=g.asset.extras;
if(credit.source!==source||!credit.license.startsWith('CC-BY-4.0')||!credit.author.includes('WarEntertainment'))throw Error('Embedded attribution mismatch');
report.licenseEvidence='Pinned Sketchfab-exported glTF asset.extras. Original live listing currently unavailable; no claim of live verification.';
report.credit=credit;report.triangles=g.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0),0);
report.materials=g.materials.map((m,i)=>({i,name:m.name}));
report.transforms=g.nodes.map((n,i)=>({i,name:n.name,matrix:n.matrix,translation:n.translation,rotation:n.rotation,scale:n.scale})).filter(n=>n.matrix||n.translation||n.rotation||n.scale);
report.parts=g.nodes.filter(n=>n.mesh!==undefined).map(n=>({node:n.name,parts:g.meshes[n.mesh].primitives.map(p=>({material:g.materials[p.material].name,count:g.accessors[p.indices].count,min:g.accessors[p.attributes.POSITION].min,max:g.accessors[p.attributes.POSITION].max}))}));
await writeFile('asset-audit/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
