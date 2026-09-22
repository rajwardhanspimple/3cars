// This transform is deliberately restricted to the CC0 green tree.
// It never reads or modifies the Mustang or cherry model.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {weld,simplify,prune,dedup} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
// Plain filesystem paths only. A URL pathname becomes /D:/... on Windows and fails to open.
const base=fileURLToPath(new URL('../assets/environment/green-tree/',import.meta.url));
export async function optimizeGreenTree(){
 const source=resolve(base,'scene.gltf'),output=resolve(base,'optimized.glb'),cache=resolve(base,'optimized.json');
 const bytes=await readFile(source),key=createHash('sha256').update(bytes).update('foliage-v1-ratio.045-error.003').digest('hex');
 try{const info=JSON.parse(await readFile(cache,'utf8'));if(info.key===key&&(await readFile(output)).length===info.bytes){console.log('Foliage already optimized, using cache.');return info;}}catch{}
 console.log('Optimizing foliage geometry. This takes a minute on first run and is then cached.');
 await MeshoptSimplifier.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
 const doc=await io.read(source);
 const triangles=()=>doc.getRoot().listMeshes().reduce((n,m)=>n+m.listPrimitives().reduce((k,p)=>k+(p.getIndices()?.getCount()||0)/3,0),0),before=triangles();
 console.log(`  source ${before.toLocaleString()} triangles, simplifying...`);
 await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio:.045,error:.003}),prune(),dedup());
 const after=triangles();if(after<10000||after>600000)throw Error(`Green foliage budget failed: ${before} -> ${after}`);
 const data=await io.writeBinary(doc);await writeFile(output,data);const info={key,sourceTriangles:before,triangles:after,bytes:data.length,error:.003,ratio:.045,onlyGreenTree:true};await writeFile(cache,JSON.stringify(info));console.log('GREEN_FOLIAGE_OPTIMIZED',JSON.stringify(info));return info;
}
