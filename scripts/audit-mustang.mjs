import {createHash} from 'node:crypto';
const url='https://raw.githubusercontent.com/ViktorVelizarov/Custom-Cars-3D/f3196e7c2f59e093ffdf891dd72a8428ce4d0fe4/public/mustang.gltf';
const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`HTTP ${r.status}`);const bytes=Buffer.from(await r.arrayBuffer());
if(createHash('sha256').update(bytes).digest('hex')!=='7bc4cd2e0e71730235b31cd5aa521e5511be81f61fa5b2da2bb62a9d478b7396')throw Error('Checksum mismatch');
const g=JSON.parse(bytes);let triangles=0;for(const m of g.meshes)for(const p of m.primitives)triangles+=g.accessors[p.indices].count/3;
if(triangles!==1493119)throw Error('Full triangle count changed');
console.log('Original triangles:',triangles,'No simplification or LOD.');console.log('Embedded attribution:',JSON.stringify(g.asset.extras));
for(const n of g.nodes){if(n.mesh===undefined)continue;for(const p of g.meshes[n.mesh].primitives){const material=g.materials[p.material].name;if(!['Rubber_Black','Front_Glass','RedGlass','Calipers','Brushed_Aluminum','Chrome','Black_Metal_Paint'].includes(material))continue;const a=g.accessors[p.attributes.POSITION];console.log(JSON.stringify({node:n.name,material,triangles:g.accessors[p.indices].count/3,min:a.min,max:a.max}));}}
