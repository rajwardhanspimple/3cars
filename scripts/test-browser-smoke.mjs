// Direct Chromium smoke + preview screenshots. No workflow required.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const green=JSON.parse(await readFile('assets/environment/green-tree/scene.gltf','utf8'));
console.log('GREEN_MODEL_STRUCTURE',JSON.stringify({scenes:green.scenes,nodes:green.nodes.map(n=>({name:n.name,mesh:n.mesh,children:n.children})),meshes:green.meshes.map(m=>({name:m.name,triangles:m.primitives.reduce((n,p)=>n+green.accessors[p.indices].count/3,0)}))}));
const server=spawn(process.execPath,['scripts/server.mjs'],{env:{...process.env,PORT:'5174'},stdio:'inherit'});let browser;
const timer=setTimeout(()=>{console.error('Browser smoke exceeded 180 seconds');browser?.close();server.kill();process.exit(1);},180000);
try{
 for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:5174/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE_ERROR',m.text());});
 await page.addInitScript(()=>localStorage.setItem('3cars.records.mountain-preview-v1',JSON.stringify({version:1,settings:{carId:'vortex',quality:'medium',weather:'dry',muted:true},results:[],bests:{}})));
 await page.route('**/src/boot.js',route=>route.fulfill({contentType:'text/javascript',body:`
 import {RaceView} from './mustang-view.js';const render=RaceView.prototype.render;
 RaceView.prototype.render=function(dt){window.__testView=this;this.smokeFrames=this.smokeFrames||0;if(this.smokeFrames>=4)return;if(!this.smokeFrames){this.engine.setHardwareScalingLevel(2);this.scene.shadowsEnabled=false;}this.smokeFrames++;return render.call(this,dt);};
 import('./main.js').catch(e=>{document.querySelector('#error-message').textContent=e.message;document.querySelector('#error').hidden=false;});
 `}));
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.loading==='false'||!document.querySelector('#error').hidden,null,{timeout:120000});
 assert.equal(await page.locator('#error-message').textContent(),'');
 await page.waitForFunction(()=>BABYLON.Engine.Instances.at(-1).scenes[0].getFrameId()>=4,null,{timeout:60000});
 const stats=await page.evaluate(()=>{const v=window.__testView,s=v.scene;return{fleet:s.metadata.fleet,scenery:s.metadata.scenery,treeRoots:s.transformNodes.filter(n=>n.name.startsWith('tree-root-')).length,carY:v.carNodes.map(n=>n.root.position.y),triangles:v.carNodes.map(n=>n.meshes.reduce((a,m)=>a+m.getTotalIndices()/3,0))};});
 assert.deepEqual(stats.triangles,[1493119,1493119,1493119]);assert.ok(stats.treeRoots>40);assert.ok(stats.carY.every(y=>y>0));
 await mkdir('dist/qa',{recursive:true});await page.screenshot({path:'dist/qa/mountain-startup.png',timeout:30000});
 await page.locator('#start').click();await page.waitForFunction(()=>document.body.dataset.phase==='racing',null,{timeout:15000});await page.keyboard.down('w');await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>20,null,{timeout:10000});await page.keyboard.down('Shift');await page.waitForFunction(()=>document.body.dataset.boost==='true',null,{timeout:5000});await page.keyboard.up('Shift');await page.keyboard.up('w');await page.keyboard.press('p');await page.waitForFunction(()=>document.body.dataset.phase==='paused');
 // Independent scenic overview with unchanged runtime assets for visual review.
 await page.evaluate(()=>{const v=window.__testView,t=v.race.track,p=t.at(t.length*.28);v.camera.position.set(p.x-65,95,p.z-100);v.camera.setTarget(new BABYLON.Vector3(p.x,18,p.z));document.querySelector('main').style.display='none';v.scene.render();});
 await page.screenshot({path:'dist/qa/mountain-hairpin.png',timeout:30000});
 assert.deepEqual(errors,[]);console.log('BROWSER_SMOKE_PASS',JSON.stringify(stats));
}catch(e){console.error('BROWSER_SMOKE_FAILURE',e.stack);process.exitCode=1;}finally{clearTimeout(timer);await browser?.close();server.kill();}
