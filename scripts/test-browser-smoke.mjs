// Direct Chromium smoke + preview screenshots. No workflow required.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const server=spawn(process.execPath,['scripts/server.mjs'],{env:{...process.env,PORT:'5174'},stdio:'inherit'});let browser;
const timer=setTimeout(()=>{console.error('Browser smoke exceeded 240 seconds');browser?.close();server.kill();process.exit(1);},240000);
try{
 for(let n=0;n<50;n++){try{if((await fetch('http://127.0.0.1:5174/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE_ERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE_ERROR',m.text());});
 await page.addInitScript(()=>localStorage.setItem('3cars.records.mountain-preview-v1',JSON.stringify({version:1,settings:{carId:'vortex',quality:'medium',weather:'dry',muted:true},results:[],bests:{}})));
 await page.route('**/src/boot.js',route=>route.fulfill({contentType:'text/javascript',body:`
 import {RaceView} from './mustang-view.js';const render=RaceView.prototype.render;
 RaceView.prototype.render=function(dt){window.__testView=this;this.frameBudget=(this.frameBudget||0);if(this.frameBudget>=6)return;if(!this.frameBudget){this.engine.setHardwareScalingLevel(2);this.scene.shadowsEnabled=false;}this.frameBudget++;return render.call(this,dt);};
 import('./main.js').catch(e=>{document.querySelector('#error-message').textContent=e.message;document.querySelector('#error').hidden=false;});
 `}));
 await page.goto('http://127.0.0.1:5174/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.body.dataset.loading==='false'||!document.querySelector('#error').hidden,null,{timeout:120000});
 assert.equal(await page.locator('#error-message').textContent(),'');
 await page.waitForFunction(()=>BABYLON.Engine.Instances.at(-1).scenes[0].getFrameId()>=4,null,{timeout:60000});
 const stats=await page.evaluate(()=>{const v=window.__testView,s=v.scene;return{fleet:s.metadata.fleet,scenery:s.metadata.scenery,treeRoots:s.transformNodes.filter(n=>n.name.startsWith('tree-root-')).length,carY:v.carNodes.map(n=>n.root.position.y),triangles:v.carNodes.map(n=>n.meshes.reduce((a,m)=>a+m.getTotalIndices()/3,0))};});
 assert.deepEqual(stats.triangles,[1493119,1493119,1493119]);assert.ok(stats.treeRoots>40);assert.ok(stats.carY.every(y=>y>0));
 // Petals must fall from real cherry canopies, not follow the camera.
 const petals=await page.evaluate(()=>{
  const v=window.__testView,state=v.scenery.getPetalState(),roots={};
  for(const n of v.scene.transformNodes)if(n.metadata?.layoutId)roots[n.metadata.layoutId]={x:n.metadata.colliderCenter.x,z:n.metadata.colliderCenter.z,type:n.metadata.treeType};
  const sample=state.filter(p=>p.sourceId).slice(0,40).map(p=>({...p,tree:roots[p.sourceId]}));
  const player={x:v.race.player.x,z:v.race.player.z};
  return {count:state.length,sample,player,before:state.map(p=>({x:p.x,y:p.y,z:p.z}))};
 });
 assert.ok(petals.count>0,'petal pool must be active');
 assert.ok(petals.sample.length>0,'petals must report a source tree');
 for(const p of petals.sample){
  assert.ok(p.tree,`petal source ${p.sourceId} must be a real tree`);
  assert.equal(p.tree.type,'cherry','only cherry trees shed petals');
  assert.ok(Math.hypot(p.spawnX-p.tree.x,p.spawnZ-p.tree.z)<=p.canopyRadius+.001,'petal must spawn inside its canopy');
 }
 // Move the car far away; petals must not teleport with it.
 const independent=await page.evaluate(async()=>{
  const v=window.__testView,before=v.scenery.getPetalState().map(p=>({x:p.x,z:p.z,id:p.sourceId}));
  v.race.player.x+=400;v.race.player.z+=400;v.updateScenery(1/60,{...v.race.player},'racing');
  const after=v.scenery.getPetalState();
  let followed=0;for(let i=0;i<before.length;i++)if(Math.hypot(after[i].x-before[i].x,after[i].z-before[i].z)>50)followed++;
  return {followed,total:before.length};
 });
 assert.equal(independent.followed,0,'petals must stay in world space when the camera jumps');
 await mkdir('dist/qa',{recursive:true});await page.screenshot({path:'dist/qa/mountain-startup.png',timeout:40000});
 await page.locator('#start').click();await page.waitForFunction(()=>document.body.dataset.phase==='racing',null,{timeout:15000});
 await page.keyboard.down('w');await page.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>20,null,{timeout:10000});
 await page.keyboard.down('Shift');await page.waitForFunction(()=>document.body.dataset.boost==='true',null,{timeout:5000});await page.keyboard.up('Shift');
 // Space must produce a real measured slide through the worker pipeline.
 await page.keyboard.down('a');await page.keyboard.down(' ');
 const slid=await page.waitForFunction(()=>{const c=window.__testView?.race?.player;return c&&Math.abs(c.driftAngle)>.12?Math.abs(c.driftAngle):false;},null,{timeout:12000}).then(h=>h.jsonValue());
 console.log('BROWSER_DRIFT_SLIP_DEG',(slid*180/Math.PI).toFixed(1));
 await page.keyboard.up(' ');await page.keyboard.up('a');await page.keyboard.up('w');await page.keyboard.press('p');
 await page.waitForFunction(()=>document.body.dataset.phase==='paused');
 await page.evaluate(()=>{const v=window.__testView,t=v.race.track,p=t.at(t.length*.28);v.camera.position.set(p.x-65,95,p.z-100);v.camera.setTarget(new BABYLON.Vector3(p.x,18,p.z));document.querySelector('main').style.display='none';v.scene.render();});
 await page.screenshot({path:'dist/qa/mountain-hairpin.png',timeout:40000});
 assert.deepEqual(errors,[]);console.log('BROWSER_SMOKE_PASS',JSON.stringify({...stats,petals:{count:petals.count,checked:petals.sample.length},independent}));
}catch(e){console.error('BROWSER_SMOKE_FAILURE',e.stack);process.exitCode=1;}finally{clearTimeout(timer);await browser?.close();server.kill();}
