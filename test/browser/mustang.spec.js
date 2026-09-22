import {test,expect} from './fixtures.js';
const COUNT=1493119;
async function ready(page){await expect(page.locator('body')).toHaveAttribute('data-loading','false',{timeout:120000});}
async function modelStats(page){return page.evaluate(()=>{
 const scene=BABYLON.Engine.Instances.at(-1).scenes[0],root=scene.getTransformNodeByName('car-0');
 const meshes=root?.getChildMeshes().filter(m=>m.metadata?.mustang)||[];
 let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const mesh of meshes){mesh.computeWorldMatrix(true);const b=mesh.getBoundingInfo().boundingBox;for(let i=0;i<3;i++){min[i]=Math.min(min[i],b.minimumWorld.asArray()[i]);max[i]=Math.max(max[i],b.maximumWorld.asArray()[i]);}}
 const shadowMap=scene.getLightByName('sun')?.getShadowGenerator?.()?.getShadowMap?.(),shadowSize=shadowMap?.getSize?.();
 return{triangles:meshes.reduce((sum,m)=>sum+m.getTotalIndices()/3,0),parts:meshes.length,lod:meshes.reduce((n,m)=>n+(m.getLODLevels?.().length||0),0),meta:root?.metadata,min,max,frame:scene.getFrameId(),reflection:!!scene.environmentTexture,hardwareScale:scene.getEngine().getHardwareScalingLevel(),shadowMapSize:typeof shadowSize==='number'?shadowSize:shadowSize?.width??null,rainVertices:scene.getMeshByName('rain')?.getTotalVertices?.()||0};
 });}

test('Mustang retains every triangle and real wheel geometry in both settings',async({page})=>{
 const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:5173')&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))external.push(r.url());});
 await page.goto('/');await ready(page);await expect(page.locator('#start')).toBeEnabled({timeout:120000});await expect(page.locator('#model-status')).toHaveAttribute('data-triangles',String(COUNT));
 let stats=await modelStats(page);console.log('Full detail Mustang:',JSON.stringify(stats));expect(stats.triangles).toBe(COUNT);expect(stats.lod).toBe(0);expect(stats.meta.wheelCount).toBe(4);expect(stats.meta.geometrySimplified).toBe(false);expect(stats.meta.originalTriangles).toBe(COUNT);expect(stats.reflection).toBe(true);expect(stats.max[1]-stats.min[1]).toBeGreaterThan(1);expect(stats.max[1]-stats.min[1]).toBeLessThan(2);expect(stats.min[1]).toBeGreaterThan(-.15);
 await page.screenshot({path:'test-results/mustang-full-detail.png'});
 await page.locator('#quality').selectOption('medium');await ready(page);stats=await modelStats(page);expect(stats.triangles).toBe(COUNT);expect(stats.lod).toBe(0);expect(stats.meta.originalTriangles).toBe(COUNT);expect(stats.hardwareScale).toBeGreaterThan(1);expect(stats.hardwareScale).toBeLessThanOrEqual(6);expect(stats.shadowMapSize).toBeGreaterThanOrEqual(128);expect(stats.shadowMapSize).toBeLessThanOrEqual(2048);expect(stats.rainVertices).toBeGreaterThan(0);expect(stats.rainVertices).toBeLessThanOrEqual(480);
 await page.locator('#start').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing',{timeout:90000});await page.keyboard.down('w');await expect.poll(async()=>Number(await page.locator('#speed').textContent()),{timeout:90000}).toBeGreaterThan(8);await page.keyboard.up('w');await page.keyboard.press('p');
 stats=await modelStats(page);expect(stats.triangles).toBe(COUNT);expect(stats.meta.originalTriangles).toBe(COUNT);await page.screenshot({path:'test-results/mustang-racing-full-geometry.png'});
 await page.locator('#restart').click();await ready(page);stats=await modelStats(page);expect(stats.triangles).toBe(COUNT);expect(stats.meta.originalTriangles).toBe(COUNT);expect(errors).toEqual([]);expect(external).toEqual([]);
});

test('missing Mustang asset stops play with a recovery message, no primitive fallback',async({page})=>{
 await page.route('**/assets/mustang-2015.gltf',r=>r.fulfill({status:404,body:'Missing asset'}));await page.goto('/');await expect(page.locator('#error')).toBeVisible({timeout:120000});await expect(page.locator('#error-message')).toContainText('Mustang');await expect(page.locator('#start')).toBeDisabled();
 const count=await page.evaluate(()=>BABYLON.Engine.Instances.at(-1)?.scenes[0]?.getTransformNodeByName('car-0')?.getChildMeshes().length||0);expect(count).toBe(0);
});

test('asset download stays byte-identical and contains the original triangle count',async({request})=>{
 const response=await request.get('/assets/mustang-2015.gltf');expect(response.ok()).toBe(true);const bytes=await response.body();const {createHash}=await import('node:crypto');expect(createHash('sha256').update(bytes).digest('hex')).toBe('7bc4cd2e0e71730235b31cd5aa521e5511be81f61fa5b2da2bb62a9d478b7396');const g=JSON.parse(bytes.toString());expect(g.meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+g.accessors[p.indices].count/3,0),0)).toBe(COUNT);
});
