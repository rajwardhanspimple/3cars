import {test as base,expect} from '@playwright/test';
// Hosted CI has no physical GPU. Reduce only raster and shadow-map resolution.
// Every original model triangle, material, wheel, and scene object remains loaded.
export const test=base.extend({softwareRasterBudget:[async({page},use)=>{
 if(process.env.CI)await page.route('**/src/boot.js',route=>route.fulfill({contentType:'text/javascript',body:`
  import {RaceView} from './mustang-view.js';
  const render=RaceView.prototype.render;
  RaceView.prototype.render=function(dt){
   if(!this.testRasterBudget){this.testRasterBudget=true;this.engine.setHardwareScalingLevel(6);this.shadow.getShadowMap().resize(128);}
   return render.call(this,dt);
  };
  import('./main.js').catch(error=>{console.error(error);document.querySelector('#menu').hidden=true;document.querySelector('#error').hidden=false;document.querySelector('#error-message').textContent=error.message;});
 `}));
 await use();
},{auto:true}]});
export {expect};
