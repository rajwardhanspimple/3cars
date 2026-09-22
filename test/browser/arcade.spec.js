import {test,expect} from '@playwright/test';

test('countdown and keyboard boost keep working when graphics rendering stops',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:120000});
 // Keep browser animation scheduling intact for input and UI. Suspend only game rendering.
 await page.evaluate(async()=>{const {RaceView}=await import('/src/mustang-view.js');RaceView.prototype.render=function(){};});
 await page.locator('#start').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing',{timeout:15000});
 await page.keyboard.down('w');await expect.poll(()=>page.locator('#speed').textContent().then(Number),{timeout:10000}).toBeGreaterThan(20);
 await page.keyboard.down('Shift');await expect(page.locator('body')).toHaveAttribute('data-boost','true');await expect.poll(()=>page.locator('#nitro-meter').evaluate(el=>el.value),{timeout:5000}).toBeLessThan(95);
 await page.keyboard.up('Shift');await page.keyboard.up('w');await page.keyboard.press('p');await expect(page.locator('#pause-panel')).toBeVisible();
 const charge=await page.locator('#nitro-meter').evaluate(el=>el.value),time=await page.locator('#race-time').textContent();await page.waitForTimeout(500);expect(await page.locator('#nitro-meter').evaluate(el=>el.value)).toBe(charge);await expect(page.locator('#race-time')).toHaveText(time);await expect(page.locator('body')).toHaveAttribute('data-boost','false');
 await page.locator('#resume').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing');await expect.poll(()=>page.locator('#nitro-meter').evaluate(el=>el.value),{timeout:10000}).toBeGreaterThan(charge);
 await page.keyboard.down('w');await expect.poll(()=>page.locator('#speed').textContent().then(Number),{timeout:10000}).toBeGreaterThan(35);
 await page.keyboard.down('d');await page.keyboard.down('Space');await expect(page.locator('body')).toHaveAttribute('data-drifting','true',{timeout:3000});await page.keyboard.up('Space');await page.keyboard.up('d');await page.keyboard.up('w');await expect(page.locator('body')).toHaveAttribute('data-drifting','false',{timeout:3000});
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await expect(page.locator('#pause-panel')).toBeVisible();await expect(page.locator('body')).toHaveAttribute('data-boost','false');expect(errors).toEqual([]);
});

test('worker clock and lifecycle commands run without a Babylon renderer',async({page})=>{
 await page.route('**/worker-test.html',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Worker check</title>'}));await page.goto('/worker-test.html');
 const result=await page.evaluate(async()=>{
  const worker=new Worker('/src/simulation-worker.js',{type:'module'});let latest;const pending=new Map();let next=1;
  worker.onmessage=({data})=>{if(data.state)latest=data.state;if(data.type==='state')worker.postMessage({type:'ack',generation:1});if(data.type==='reply'){pending.get(data.id)?.resolve(data.state);pending.delete(data.id);}if(data.type==='error'){for(const p of pending.values())p.reject(Error(data.message));}};
  const command=(type,extra={})=>new Promise((resolve,reject)=>{const id=next++;pending.set(id,{resolve,reject});worker.postMessage({type,id,generation:1,...extra});setTimeout(()=>{if(pending.delete(id))reject(Error('Worker timeout'));},8000);});
  try{await command('reset',{config:{carId:'vortex',weather:'dry'}});await command('start');await new Promise(r=>setTimeout(r,3400));const phase=latest.phase,time=latest.time;await command('pause');const frozen=latest.time;await new Promise(r=>setTimeout(r,250));const unchanged=latest.time===frozen;await command('resume');await new Promise(r=>setTimeout(r,250));return{phase,time,unchanged,advanced:latest.time>frozen};}finally{worker.terminate();}
 });
 expect(result.phase).toBe('racing');expect(result.time).toBeGreaterThan(.15);expect(result.unchanged).toBe(true);expect(result.advanced).toBe(true);
});
