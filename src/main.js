import { Race, CARS, LAPS, clamp } from './sim.js';
import { RaceView } from './view.js';
import { LocalRecords } from './storage.js';
import { RaceAudio } from './audio.js';
const $=id=>document.getElementById(id);
const ids=['menu','hud','pause-panel','results','error','error-message','setup','start','weather','quality','mute','saved-best','history-count','race-history','storage-status','race-canvas','position','lap','race-time','standings','current-lap','best-lap','penalty','engine-condition','steering-condition','tires-condition','rpm','rpm-fill','gear','speed','abs','tc','conditions','notification','countdown','minimap','result-title','result-summary','result-list'];
const ui=Object.fromEntries(ids.map(id=>[id,$(id)]));
const records=new LocalRecords(),audio=new RaceAudio();let settings=records.loadSettings(),race=new Race(settings),view,keys=new Set(),saved=false,accumulator=0,last=performance.now(),hudClock=0,previousPhase=null,frameId;
export const formatTime=seconds=>{if(seconds===null||!Number.isFinite(seconds))return 'None yet';const ms=Math.max(0,Math.floor(seconds*1000));return `${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
function text(id,value){const node=ui[id];if(node.textContent!==String(value))node.textContent=String(value);}
function selected(){return {carId:ui.setup.elements.carId.value,weather:ui.weather.value,quality:ui.quality.value,muted:settings.muted};}
function storageStatus(){text('storage-status',records.available?'Settings, best laps, and the last 20 races stay in this browser.':'Browser storage is unavailable. This session will not be saved.');}
function persistSettings(){settings=selected();records.saveSettings(settings);storageStatus();}
function renderHistory(){
 const rows=records.results();text('history-count',rows.length);ui['race-history'].replaceChildren();
 for(const row of rows){const li=document.createElement('li'),small=document.createElement('small');li.textContent=`P${row.position} / ${CARS.find(c=>c.id===row.carId)?.name} / ${formatTime(row.time+row.penalty)}`;small.textContent=`${new Date(row.finishedAt).toLocaleString()} / ${row.weather==='wet'?'Rain':'Dry'} / +${row.penalty}s`;li.append(small);ui['race-history'].append(li);}
 if(!rows.length){const li=document.createElement('li');li.textContent='Finish your first race to record a result.';ui['race-history'].append(li);}
 const best=records.bestLap(settings.carId,settings.weather);text('saved-best',best===null?'No lap recorded':formatTime(best));storageStatus();
}
function applyMute(){audio.setMuted(settings.muted);text('mute',settings.muted?'Sound off':'Sound on');ui.mute.setAttribute('aria-pressed',String(settings.muted));}
function resetRace(start=false){
 keys.clear();accumulator=0;saved=false;race=new Race(selected());
 if(view&&view.quality!==ui.quality.value){view.dispose();view=new RaceView(ui['race-canvas'],race,{quality:ui.quality.value});}else view?.setRace(race);
 last=performance.now();if(start)race.start();previousPhase=null;syncPhase();updateHUD();if(start)ui['race-canvas'].focus();else ui.start.focus();
}
function syncPhase(){
 if(previousPhase===race.phase)return;previousPhase=race.phase;document.body.dataset.phase=race.phase;
 ui.menu.hidden=race.phase!=='menu';ui.hud.hidden=race.phase==='menu';ui['pause-panel'].hidden=race.phase!=='paused';ui.results.hidden=race.phase!=='finished';
 ui['race-canvas'].inert=['paused','finished'].includes(race.phase);ui.hud.inert=['paused','finished'].includes(race.phase);
 if(race.phase==='paused')$('resume').focus();if(race.phase==='finished'){finishRace();$('race-again').focus();}if(race.phase==='menu')renderHistory();
}
function finishRace(){
 const order=race.standings(),p=race.player,position=order.indexOf(p)+1;
 text('result-title',position===1?'You take the win.':'Race complete');text('result-summary',`P${position} of 3. ${LAPS} laps at Meridian in ${formatTime(p.finishTime+p.penalty)}.`);ui['result-list'].replaceChildren();
 for(const [i,c] of order.entries()){const li=document.createElement('li'),name=document.createElement('span'),right=document.createElement('span'),detail=document.createElement('small');name.textContent=`${i+1}. ${c.name}`;right.textContent=formatTime(c.finishTime+c.penalty);detail.textContent=`${c.model.name} / penalties +${c.penalty}s`;name.append(detail);li.append(name,right);ui['result-list'].append(li);}
 if(!saved){saved=true;records.recordRace({carId:p.model.id,weather:race.weather,position,time:p.finishTime,penalty:p.penalty,bestLap:p.bestLap,finishedAt:new Date().toISOString()});renderHistory();}
}
function updateHUD(){
 const p=race.player,order=race.standings();ui.position.innerHTML=`${order.indexOf(p)+1} <small>/ 3</small>`;ui.lap.innerHTML=`${p.lap} <small>/ ${LAPS}</small>`;
 text('race-time',formatTime(p.finished?p.finishTime:race.time));text('current-lap',p.finished?'Finished':p.lapStart===null?'Ready':formatTime(race.time-p.lapStart));text('best-lap',formatTime(p.bestLap));text('penalty',`+${p.penalty.toFixed(1)}s`);
 text('speed',Math.round(p.speed*3.6));text('gear',p.gear);text('rpm',`${Math.round(p.rpm)} RPM`);ui['rpm-fill'].style.width=`${clamp(p.rpm/8500,0,1)*100}%`;
 for(const part of ['engine','steering','tires']){ui[`${part}-condition`].value=1-p.damage[part];ui[`${part}-condition`].title=`${Math.round((1-p.damage[part])*100)}% condition`;}
 ui.abs.classList.toggle('active',p.abs);ui.tc.classList.toggle('active',p.tc);text('conditions',race.weather==='wet'?'Wet track':'Dry track');
 text('notification',p.finished&&race.phase==='racing'?'Finished. Waiting for the other drivers.':p.noticeUntil>race.time?p.notification:'');ui.countdown.hidden=race.phase!=='countdown';if(race.phase==='countdown')text('countdown',Math.max(1,Math.ceil(race.countdown)));
 ui.standings.replaceChildren();for(const[i,c]of order.entries()){const li=document.createElement('li');if(c.index===0)li.className='you';const pos=document.createElement('span'),name=document.createElement('span'),gap=document.createElement('span');pos.textContent=i+1;name.textContent=c.name;gap.textContent=c.finished?formatTime(c.finishTime+c.penalty):i===0?'Leader':`~+${((order[0].progress-c.progress)/Math.max(10,c.speed)).toFixed(1)}s`;li.append(pos,name,gap);ui.standings.append(li);}drawMap();
}
const map=ui.minimap.getContext('2d');
function drawMap(){
 if(!map)return;const t=race.track,project=p=>[120+p.x*.55,100+p.z*.55];map.clearRect(0,0,240,195);map.lineJoin='round';map.lineCap='round';map.beginPath();t.points.forEach((p,i)=>{const[x,y]=project(p);if(i)map.lineTo(x,y);else map.moveTo(x,y);});map.closePath();map.strokeStyle='#b3c7d2';map.lineWidth=7;map.stroke();map.strokeStyle='#ffffff';map.lineWidth=2;map.stroke();
 const start=project(t.at(0));map.fillStyle='#173c56';map.fillRect(start[0]-3,start[1]-4,6,8);for(const c of [...race.cars].reverse()){const[x,y]=project(c);map.beginPath();map.arc(x,y,c.index===0?5:4,0,Math.PI*2);map.fillStyle=c.model.color;map.fill();map.strokeStyle=c.index===0?'#173c56':'#fff';map.lineWidth=2;map.stroke();}map.fillStyle='#173c56';map.font='11px Segoe UI, Arial';map.fillText('Meridian circuit',12,182);
}
function togglePause(){keys.clear();race.pause();accumulator=0;last=performance.now();updateHUD();syncPhase();audio.update({phase:race.phase});if(race.phase!=='paused')ui['race-canvas'].focus();}
function fail(error){console.error(error);cancelAnimationFrame(frameId);audio.setMuted(true);ui.menu.hidden=true;ui.hud.hidden=true;ui.error.hidden=false;text('error-message',error.message||'Unable to render the circuit. Reload or try a different browser.');document.body.dataset.phase='error';}
ui.setup.elements.carId.value=settings.carId;ui.weather.value=settings.weather;ui.quality.value=settings.quality;applyMute();
view=new RaceView(ui['race-canvas'],race,settings);ui.start.disabled=false;text('start','Start five-lap race');syncPhase();renderHistory();
ui.setup.addEventListener('change',()=>{const active=document.activeElement;persistSettings();resetRace();if(race.phase==='menu'&&active instanceof HTMLElement&&active.isConnected)active.focus();});
ui.setup.addEventListener('submit',event=>{event.preventDefault();audio.unlock();persistSettings();resetRace(true);});ui.menu.addEventListener('pointerdown',()=>audio.unlock(),{once:true});
ui.mute.addEventListener('click',()=>{audio.unlock();settings.muted=!settings.muted;records.saveSettings({muted:settings.muted});applyMute();});
$('pause').addEventListener('click',togglePause);$('resume').addEventListener('click',togglePause);$('restart').addEventListener('click',()=>resetRace(true));$('race-again').addEventListener('click',()=>resetRace(true));$('exit').addEventListener('click',()=>resetRace());$('result-setup').addEventListener('click',()=>resetRace());
const drivingKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']);
window.addEventListener('keydown',event=>{
 const target=event.target;if(event.ctrlKey||event.metaKey||event.altKey||(target instanceof Element&&target.closest('select,input,textarea,summary,[contenteditable=""],[contenteditable="true"]')))return;
 if(event.code==='KeyM'&&!event.repeat){ui.mute.click();return;}if(race.phase==='menu'||race.phase==='finished')return;
 if(['KeyP','Escape'].includes(event.code)&&!event.repeat){event.preventDefault();togglePause();return;}if(target instanceof Element&&target.closest('button,a'))return;
 if(drivingKeys.has(event.code)){event.preventDefault();if(race.phase!=='paused')keys.add(event.code);}if(event.code==='KeyR'&&!event.repeat&&race.phase==='racing'){event.preventDefault();race.repair();updateHUD();}
});
window.addEventListener('keyup',e=>keys.delete(e.code));
function autoPause(){keys.clear();if(['countdown','racing'].includes(race.phase)){race.pause();accumulator=0;updateHUD();syncPhase();}audio.update({phase:'paused'});}
window.addEventListener('blur',autoPause);document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();last=performance.now();accumulator=0;});
ui['race-canvas'].addEventListener('webglcontextlost',event=>{event.preventDefault();autoPause();fail(new Error('Graphics context was lost. Reload the game to continue.'));});
document.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const modal=[ui['pause-panel'],ui.results,ui.error].find(n=>!n.hidden);if(!modal)return;const buttons=[...modal.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
const pressed=(...codes)=>codes.some(k=>keys.has(k))?1:0;
function frame(now){
 try{
  const elapsed=Math.min(.1,Math.max(0,(now-last)/1000));last=now;
  if(!document.hidden){accumulator+=elapsed;const input={throttle:pressed('KeyW','ArrowUp'),brake:pressed('KeyS','ArrowDown','Space'),steer:pressed('KeyD','ArrowRight')-pressed('KeyA','ArrowLeft')};while(accumulator>=1/120){race.step(1/120,input);accumulator-=1/120;}syncPhase();const p=race.player;audio.update({phase:race.phase,rpm:p.rpm,speed:p.speed,throttle:p.throttle,wet:race.weather==='wet',slip:p.slip,impact:p.impact,gear:p.gear},elapsed);hudClock+=elapsed;if(hudClock>.1){updateHUD();hudClock=0;}view.render(race.phase==='paused'?0:elapsed);}
  frameId=requestAnimationFrame(frame);
 }catch(error){fail(error);}
}
frameId=requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);audio.dispose();view.dispose();},{once:true});
