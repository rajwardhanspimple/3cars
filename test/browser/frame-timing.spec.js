import {test,expect} from './fixtures.js';
test('worker snapshots reach the rendered full-resolution scene',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:120000});await page.locator('#quality').selectOption('medium');await expect(page.locator('body')).toHaveAttribute('data-loading','false',{timeout:120000});
 // Countdown duration is asserted without graphics in arcade.spec.js. Software GPU
 // stalls can delay UI delivery, so this test checks eventual renderer integration.
 await page.locator('#start').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing',{timeout:90000});await page.keyboard.press('p');await expect(page.locator('#pause-panel')).toBeVisible();
 const stats=await page.evaluate(()=>{const scene=BABYLON.Engine.Instances.at(-1).scenes[0];return{frame:scene.getFrameId(),triangles:scene.getTransformNodeByName('car-0').getChildMeshes().filter(m=>m.metadata?.mustang).reduce((sum,m)=>sum+m.getTotalIndices()/3,0),sim:scene.metadata.simulation};});
 console.log('Worker/renderer verification',JSON.stringify(stats));expect(stats.triangles).toBe(1493119);expect(stats.frame).toBeGreaterThan(0);expect(stats.sim.phase).toBe('paused');expect(errors).toEqual([]);
});
