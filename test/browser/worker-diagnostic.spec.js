import {test,expect} from '@playwright/test';
test('diagnose worker messages with the full Mustang loaded',async({page})=>{
 await page.addInitScript(()=>{
  window.__transport={sent:[],received:[],beats:0};setInterval(()=>window.__transport.beats++,100);
  const Native=window.Worker;window.Worker=class extends Native{
   constructor(...args){super(...args);this.isSimulation=String(args[0]).includes('simulation-worker');if(this.isSimulation)this.addEventListener('message',({data})=>{const t=window.__transport;t.received.push({at:performance.now(),type:data.type,generation:data.generation,sequence:data.sequence,phase:data.state?.phase,countdown:data.state?.countdown,time:data.state?.time,message:data.message});if(t.received.length>20)t.received.shift();});}
   postMessage(data,...rest){if(this.isSimulation){const t=window.__transport;t.sent.push({at:performance.now(),type:data.type,generation:data.generation});if(t.sent.length>20)t.sent.shift();}return super.postMessage(data,...rest);}
  };
 });
 page.on('pageerror',e=>console.log('PAGE_ERROR',e.message));await page.goto('/');await expect(page.locator('#start')).toBeEnabled({timeout:120000});
 await page.evaluate(async()=>{const {RaceView}=await import('/src/mustang-view.js');RaceView.prototype.render=function(){};});
 await page.locator('#start').click();await page.waitForTimeout(5000);
 console.log('TRANSPORT',JSON.stringify(await page.evaluate(()=>({transport:window.__transport,phase:document.body.dataset.phase,countdown:document.querySelector('#countdown').textContent,error:document.querySelector('#error-message').textContent,hidden:document.hidden,focus:document.hasFocus()}))));
 await expect(page.locator('body')).toHaveAttribute('data-phase','racing',{timeout:1000});
});
