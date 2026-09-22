import {test,expect} from '@playwright/test';

test('countdown and keyboard boost work without any graphics frames',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Disable only the scene render method before boot. Do not enqueue GPU work first.
 await page.route('**/src/boot.js',route=>route.fulfill({contentType:'text/javascript',body:`import {RaceView} from './mustang-view.js';RaceView.prototype.render=function(){};import('./main.js');`}));
 await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:120000});
 await page.locator('#start').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing',{timeout:15000});
 await page.keyboard.down('w');await expect.poll(()=>page.locator('#speed').textContent().then(Number),{timeout:10000}).toBeGreaterThan(20);
 await page.keyboard.down('Shift');await expect(page.locator('body')).toHaveAttribute('data-boost','true');await expect.poll(()=>page.locator('#nitro-meter').evaluate(el=>el.value),{timeout:5000}).toBeLessThan(95);
 await page.keyboard.up('Shift');await page.keyboard.up('w');await page.keyboard.press('p');await expect(page.locator('#pause-panel')).toBeVisible();
 const charge=await page.locator('#nitro-meter').evaluate(el=>el.value),time=await page.locator('#race-time').textContent();await page.waitForTimeout(500);expect(await page.locator('#nitro-meter').evaluate(el=>el.value)).toBe(charge);await expect(page.locator('#race-time')).toHaveText(time);await expect(page.locator('body')).toHaveAttribute('data-boost','false');
 await page.locator('#resume').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing');await expect.poll(()=>page.locator('#nitro-meter').evaluate(el=>el.value),{timeout:10000}).toBeGreaterThan(charge);
 await page.keyboard.down('w');await expect.poll(()=>page.locator('#speed').textContent().then(Number),{timeout:10000}).toBeGreaterThan(35);
 await page.keyboard.down('d');await page.keyboard.down('Space');await expect(page.locator('body')).toHaveAttribute('data-drifting','true',{timeout:3000});await page.keyboard.up('Space');await page.keyboard.up('d');await page.keyboard.up('w');await expect(page.locator('body')).toHaveAttribute('data-drifting','false',{timeout:3000});
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await expect(page.locator('#pause-panel')).toBeVisible();await expect(page.locator('body')).toHaveAttribute('data-boost','false');
 // Synthetic blur does not cause a real focus transition when clicking the same page.
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.locator('#restart').click();await expect(page.locator('body')).toHaveAttribute('data-phase','countdown');expect(await page.locator('#nitro-meter').evaluate(el=>el.value)).toBe(100);
 const stats=await page.evaluate(()=>{const s=BABYLON.Engine.Instances.at(-1).scenes[0];return{frame:s.getFrameId(),triangles:s.getTransformNodeByName('car-0').getChildMeshes().filter(m=>m.metadata?.mustang).reduce((n,m)=>n+m.getTotalIndices()/3,0)};});expect(stats.frame).toBe(0);expect(stats.triangles).toBe(1493119);expect(errors).toEqual([]);
});

test('worker clock and lifecycle commands run without a Babylon renderer',async({page})=>{
 await page.route('**/worker-test.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Worker check</title>'}));await page.goto('/worker-test.html');
 const result=await page.evaluate(async()=>{
  const {SimulationClient}=await import('/src/simulation-client.js');let latest;const client=new SimulationClient(state=>latest=state,error=>{throw error;});
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  try{await client.reset({carId:'vortex',weather:'dry'});await client.command('start');await wait(3400);const phase=latest.phase,time=latest.time;await client.command('pause');const frozen=latest.time;await wait(250);const unchanged=latest.time===frozen;await client.command('resume');await wait(250);const advanced=latest.time>frozen;await client.reset({carId:'apex',weather:'wet'});return{phase,time,unchanged,advanced,resetPhase:latest.phase,resetTime:latest.time,model:latest.cars[0].model.id};}finally{client.dispose();}
 });
 expect(result.phase).toBe('racing');expect(result.time).toBeGreaterThan(.15);expect(result.unchanged).toBe(true);expect(result.advanced).toBe(true);expect(result.resetPhase).toBe('menu');expect(result.resetTime).toBe(0);expect(result.model).toBe('apex');
});
