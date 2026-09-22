import {test,expect} from '@playwright/test';
test('race countdown advances with full-resolution model',async({page})=>{
 const messages=[];page.on('console',m=>{if(m.type()==='error')messages.push(m.text());});page.on('pageerror',e=>messages.push(e.message));
 await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:120000});await page.locator('#quality').selectOption('medium');await expect(page.locator('body')).toHaveAttribute('data-loading','false',{timeout:120000});
 await page.locator('#start').click();
 for(let i=0;i<6;i++){await page.waitForTimeout(2000);console.log('FRAME',await page.evaluate(()=>({phase:document.body.dataset.phase,loading:document.body.dataset.loading,countdown:document.getElementById('countdown').textContent,hidden:document.hidden,focus:document.hasFocus(),error:document.getElementById('error-message').textContent,frames:BABYLON.Engine.Instances.at(-1)?.scenes[0]?.getFrameId(),speed:document.getElementById('speed').textContent})));}
 expect(messages).toEqual([]);await expect(page.locator('body')).toHaveAttribute('data-phase','racing',{timeout:10000});
});
