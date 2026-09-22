// Bounded Chromium integration check, run directly without workflow orchestration.
// Software WebGL is rendered at reduced raster resolution with full car geometry.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const server=spawn(process.execPath,['scripts/server.mjs'],{env:{...process.env,PORT:'5174'},stdio:'inherit'});
let browser;
const timeout=setTimeout(()=>{console.error('Browser smoke exceeded 150 seconds');browser?.close();server.kill();process.exit(1);},150000);
try{
 for(let n=0;n<40;n++){try{if((await fetch('http://127.0.0.1:5174/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1100,height:760}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('3cars.records.sakura-v1',JSON.stringify({version:1,settings:{carId:'vortex',quality:'medium',weather:'dry',muted:true},results:[],bests:{}})));
 await page.route('**/src/boot.js',route=>route.fulfill({contentType:'text/javascript',body:`
 import {RaceView} from './mustang-view.js';
 const render=RaceView.prototype.render;
 RaceView.prototype.render=function(dt){
  this.smokeFrames=this.smokeFrames||0;if(this.smokeFrames>=3)return;
  if(!this.smokeFrames){this.engine.setHardwareScalingLevel(5);this.scene.shadowsEnabled=false;}
  this.smokeFrames++;return render.call(this,dt);
 };
 import('./main.js').catch(e=>{document.querySelector('#error-message').textContent=e.message;document.querySelector('#error').hidden=false;});
 `}));
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.loading==='false'||!document.querySelector('#error').hidden,null,{timeout:90000});
 assert.equal(await page.locator('#error-message').textContent(),'');
 const stats=await page.evaluate(()=>{const s=BABYLON.Engine.Instances.at(-1).scenes[0];return{fleet:s.metadata.fleet,scenery:s.metadata.scenery,triangles:[0,1,2].map(i=>s.getTransformNodeByName('car-'+i).getChildMeshes().filter(m=>m.metadata?.mustang).reduce((n,m)=>n+m.getTotalIndices()/3,0))};});
 assert.deepEqual(stats.triangles,[1493119,1493119,1493119]);assert.equal(stats.fleet.geometryShared,true);
 await page.waitForFunction(()=>BABYLON.Engine.Instances.at(-1).scenes[0].getFrameId()>=3,null,{timeout:60000});
 await mkdir('dist/qa',{recursive:true});await page.screenshot({path:'dist/qa/sakura-startup.png',timeout:20000});
 await page.locator('#start').click();await page.waitForFunction(()=>document.body.dataset.phase==='racing',null,{timeout:15000});
 await page.keyboard.down('w');await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>20,null,{timeout:10000});await page.keyboard.down('Shift');
 await page.waitForFunction(()=>document.body.dataset.boost==='true',null,{timeout:5000});await page.keyboard.up('Shift');await page.keyboard.up('w');await page.keyboard.press('p');
 await page.waitForFunction(()=>document.body.dataset.phase==='paused');assert.deepEqual(errors,[]);
 console.log('BROWSER_SMOKE_PASS',JSON.stringify(stats));console.log('Three actual software-WebGL frames and DOM/worker/boost/pause passed. Manual visual quality and gaming GPU FPS remain unchecked.');
}catch(e){console.error('BROWSER_SMOKE_FAILURE',e.stack);process.exitCode=1;}finally{clearTimeout(timeout);await browser?.close();server.kill();}
