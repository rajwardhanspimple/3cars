import {test,expect} from './fixtures.js';
async function ready(page){await expect(page.locator('body')).toHaveAttribute('data-loading','false',{timeout:120000});}
test('renders the circuit, starts, accelerates, pauses, repairs, and restarts',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await ready(page);await expect(page.locator('#start')).toBeEnabled();await expect(page.locator('#error')).toBeHidden();await page.locator('#quality').selectOption('medium');await ready(page);await page.screenshot({path:'test-results/meridian-menu.png'});
 await page.locator('#start').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing');await page.keyboard.down('w');await expect.poll(async()=>Number(await page.locator('#speed').textContent())).toBeGreaterThan(8);await page.keyboard.up('w');
 await page.keyboard.press('p');await expect(page.locator('#pause-panel')).toBeVisible();const time=await page.locator('#race-time').textContent();await page.waitForTimeout(300);await expect(page.locator('#race-time')).toHaveText(time);
 await page.locator('#resume').focus();await page.keyboard.press('Space');await expect(page.locator('body')).toHaveAttribute('data-phase','racing');await page.keyboard.press('r');await expect(page.locator('#penalty')).toHaveText('+20.0s');await page.screenshot({path:'test-results/meridian-race.png'});
 await page.keyboard.press('p');await page.locator('#restart').click();await expect(page.locator('#penalty')).toHaveText('+0.0s');await expect(page.locator('body')).toHaveAttribute('data-phase','countdown');expect(errors).toEqual([]);
});
test('wet setup, selected car, mute, and quality persist across reload',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await ready(page);await expect(page.locator('#start')).toBeEnabled();await page.locator('input[value="titan"]').check();await ready(page);await page.locator('#weather').selectOption('wet');await ready(page);await page.locator('#quality').selectOption('medium');await ready(page);await page.locator('#mute').click();
 await page.reload();await ready(page);await expect(page.locator('#start')).toBeEnabled();await expect(page.locator('input[value="titan"]')).toBeChecked();await expect(page.locator('#weather')).toHaveValue('wet');await expect(page.locator('#quality')).toHaveValue('medium');await expect(page.locator('#mute')).toHaveText('Sound off');
 await page.locator('#start').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing');await expect(page.locator('#conditions')).toHaveText('Wet track');await page.screenshot({path:'test-results/meridian-wet.png'});expect(errors).toEqual([]);
});
test('storage failure does not prevent gameplay and blur pauses the clock',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}}));await page.goto('/');await ready(page);await expect(page.locator('#start')).toBeEnabled();await expect(page.locator('#storage-status')).toContainText('unavailable');await page.locator('#quality').selectOption('medium');await ready(page);
 await page.locator('#start').click();await expect(page.locator('body')).toHaveAttribute('data-phase','racing');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await expect(page.locator('#pause-panel')).toBeVisible();const time=await page.locator('#race-time').textContent();await page.waitForTimeout(300);await expect(page.locator('#race-time')).toHaveText(time);
});
test('WebGL failure gives a readable recovery message',async({page})=>{
 await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.includes('webgl'))return null;return original.call(this,type,...args);};});await page.goto('/');await expect(page.locator('#error')).toBeVisible();await expect(page.locator('#error-message')).toContainText('WebGL');
});
