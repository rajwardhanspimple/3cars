import {test,expect} from './fixtures.js';
test('race countdown advances on worker time with full-resolution model',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:120000});await page.locator('#quality').selectOption('medium');await expect(page.locator('body')).toHaveAttribute('data-loading','false',{timeout:120000});
 await page.locator('#start').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing',{timeout:15000});await page.keyboard.press('p');await expect(page.locator('#pause-panel')).toBeVisible();
 const stats=await page.evaluate(()=>{const scene=BABYLON.Engine.Instances.at(-1).scenes[0];return{frame:scene.getFrameId(),triangles:scene.getTransformNodeByName('car-0').getChildMeshes().filter(m=>m.metadata?.mustang).reduce((sum,m)=>sum+m.getTotalIndices()/3,0),sim:scene.metadata.simulation};});
 console.log('Worker/renderer verification',JSON.stringify(stats));expect(stats.triangles).toBe(1493119);expect(stats.frame).toBeGreaterThan(0);expect(stats.sim.phase).toBe('paused');expect(errors).toEqual([]);
});
