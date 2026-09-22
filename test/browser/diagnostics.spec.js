import {test,expect} from './fixtures.js';
test('startup creates a rendered full-resolution Mustang scene',async({page})=>{
 const messages=[];page.on('console',m=>{if(m.type()==='error')messages.push(m.text());});page.on('pageerror',e=>messages.push(e.message));await page.goto('/');
 await page.waitForFunction(()=>!document.querySelector('#start').disabled||!document.querySelector('#error').hidden,{},{timeout:120000});
 const error=await page.locator('#error-message').textContent();expect(error,`Startup error: ${error}; console: ${messages.join('; ')}`).toBe('');await expect(page.locator('#start')).toBeEnabled();await expect.poll(()=>page.evaluate(()=>globalThis.BABYLON.Engine.Instances.at(-1)?.scenes[0]?.getFrameId()||0)).toBeGreaterThan(2);
});
