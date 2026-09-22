import {Race,CARS,LAPS,clamp} from './sim.js';
import {trackBounds} from './circuit.js';
import {RaceView} from './mustang-view.js';
import {TrackRecords} from './storage.js';
import {trackInfo} from './tracks.js';
import {prepareRaceView} from './view-session.js';
import {RaceAudio} from './audio.js';
import {SimulationClient} from './simulation-client.js';
const $=id=>document.getElementById(id);
const ids=['menu','hud','pause-panel','results','error','error-message','setup','start','track','weather','quality','mute','saved-best','history-count','race-history','storage-status','race-canvas','position','lap','race-time','standings','current-lap','best-lap','penalty','engine-condition','steering-condition','tires-condition','rpm','rpm-fill','gear','speed','abs','tc','conditions','notification','countdown','minimap','result-title','result-summary','result-list','nitro-meter','nitro-value','nitro-status','drift-status','track-label','circuit-caption','game-title','track-intro','history-label'];
const ui=Object.fromEntries(ids.map(id=>[id,$(id)]));
const records=new TrackRecords(),audio=new RaceAudio(),keys=new Set();
let settings=records.loadSettings(),race=new Race(settings),view,simulation,saved=false,loading=true,viewReady=false,loadRevision=0,disposed=false,failed=false,pausePending=false,windowFocused=document.hasFocus(),loadLostFocus=false,last=performance.now(),previousPhase=null,frameId,lastSound=performance.now(),lastHUD=0;
race.route=trackInfo(settings.trackId);records.selectTrack(settings.trackId);
export const formatTime=seconds=>{if(seconds===null||!Number.isFinite(seconds))return 'None yet';const ms=Math.max(0,Math.floor(seconds*1000));return `${Math.floor(ms/60000)}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;};
const text=(id,value)=>{const node=ui[id];if(node&&node.textContent!==String(value))node.textContent=String(value);};
const selected=()=>({carId:ui.setup.elements.carId.value,trackId:ui.track.value,weather:ui.weather.value,quality:ui.quality.value,muted:settings.muted});
const pressed=(...codes)=>codes.some(code=>keys.has(code))?1:0;
const lapDisplay=p=>{if(p.finished)return 'Finished';if(p.lapStart===null)return 'Ready';const lapTime=formatTime(race.time-p.lapStart);return p.lapValid?lapTime:`${lapTime} (invalid)`;};
function inputState(){return loading||race.phase==='paused'?{}:{throttle:pressed('KeyW','ArrowUp'),brake:pressed('KeyS','ArrowDown'),steer:pressed('KeyD','ArrowRight')-pressed('KeyA','ArrowLeft'),handbrake:!!pressed('Space'),boost:!!pressed('ShiftLeft','ShiftRight')};}
function sendInput(){simulation?.input(inputState());}
function clearInput(){keys.clear();simulation?.input({});}
function storageStatus(){text('storage-status',records.available?`Settings, best laps, and the last 20 ${trackInfo(settings.trackId).name} races stay in this browser. Track records are separate.`:'Browser storage is unavailable. This session will not be saved.');}
function applyTrackCopy(){
 const track=trackInfo(settings.trackId);
 document.title=`3cars | ${track.name}`;document.body.dataset.track=track.id;
 text('track-label',`${track.name} / ${track.label}`);text('circuit-caption',track.name);text('game-title',track.title);text('track-intro',track.intro);text('history-label',`Recent ${track.name} races`);
 document.querySelector('meta[name="description"]')?.setAttribute('content',track.intro);
 ui.minimap.setAttribute('aria-label',`${track.name} route map showing the three cars`);
 ui['race-canvas'].setAttribute('aria-label',`3D ${track.name} circuit. Use W or Up to accelerate, S or Down to brake, Space for manual drift, Shift for boost, and A or D to steer.`);
}
function persistSettings(){settings=selected();records.saveSettings(settings);records.selectTrack(settings.trackId);applyTrackCopy();storageStatus();}
function setLoading(value,label='Loading car...'){loading=value;ui.setup.inert=value;ui.start.disabled=value;text('start',value?label:'Start five-lap race');document.body.dataset.loading=String(value);if(value)clearInput();}
function renderHistory(){
 records.selectTrack(settings.trackId);
 const rows=records.results();text('history-count',rows.length);ui['race-history'].replaceChildren();
 for(const row of rows){const li=document.createElement('li'),small=document.createElement('small');li.textContent=`P${row.position} / ${CARS.find(c=>c.id===row.carId)?.name} / ${formatTime(row.time+row.penalty)}`;small.textContent=`${new Date(row.finishedAt).toLocaleString()} / ${row.weather==='wet'?'Wet':'Dry'} / +${row.penalty}s`;li.append(small);ui['race-history'].append(li);}
 if(!rows.length){const li=document.createElement('li');li.textContent=`Finish your first ${trackInfo(settings.trackId).name} race to record a result.`;ui['race-history'].append(li);}
 const best=records.bestLap(settings.carId,settings.weather);text('saved-best',best===null?'No lap recorded':formatTime(best));storageStatus();
}
function applyMute(){audio.setMuted(settings.muted);text('mute',settings.muted?'Sound off':'Sound on');ui.mute.setAttribute('aria-pressed',String(settings.muted));}
function applySnapshot(state){
 if(disposed||failed)return;
 for(const key of ['phase','time','countdown','firstFinish','pausedPhase'])race[key]=state[key];
 if(Array.isArray(state.props))race.props=state.props;
 for(let i=0;i<race.cars.length;i++)Object.assign(race.cars[i],state.cars[i]);
 race.player=race.cars[0];
 if(view?.scene)view.scene.metadata={...view.scene.metadata,simulation:{phase:race.phase,time:race.time,steer:race.player.steer,nitro:race.player.nitro,boostActive:race.player.boostActive,drifting:race.player.drifting,props:race.props,routeId:race.route.id,routeName:race.route.name}};
 if(!loading){syncPhase();const now=performance.now();if(now-lastHUD>=66||race.phase==='paused'){updateHUD();lastHUD=now;}}
}
async function resetRace(start=false,focusTarget=null){
 if(disposed||failed||loading&&view)return;
 const generation=++loadRevision;saved=false;viewReady=false;loadLostFocus=false;setLoading(true,start?'Getting ready...':'Loading full-detail Mustang...');ui.error.hidden=true;
 const config=selected();race=new Race(config);race.route=trackInfo(config.trackId);
 try{
  const physicsReady=simulation.reset(config);
  // Observe the worker promise even if graphics construction throws synchronously.
  physicsReady.catch(()=>{});
  const prepared=prepareRaceView(view,RaceView,ui['race-canvas'],race,config);
  view=prepared.view;await Promise.all([prepared.ready,physicsReady]);
  if(generation!==loadRevision||disposed||failed)return;
  viewReady=true;last=performance.now();
  if(start){await simulation.command('start');if(document.hidden||!windowFocused||loadLostFocus)await simulation.command('pause');}
  if(generation!==loadRevision||disposed||failed)return;
  setLoading(false);previousPhase=null;syncPhase();updateHUD();sendInput();
  if(start&&race.phase!=='paused')ui['race-canvas'].focus();else if(!start&&focusTarget instanceof HTMLElement&&focusTarget.isConnected)focusTarget.focus();else if(!start)ui.start.focus();
 }catch(error){if(generation===loadRevision&&!disposed)fail(error);}
}
function syncPhase(){
 if(previousPhase===race.phase)return;previousPhase=race.phase;document.body.dataset.phase=race.phase;
 ui.menu.hidden=race.phase!=='menu';ui.hud.hidden=race.phase==='menu';ui['pause-panel'].hidden=race.phase!=='paused';ui.results.hidden=race.phase!=='finished';
 ui['race-canvas'].inert=['paused','finished'].includes(race.phase);ui.hud.inert=['paused','finished'].includes(race.phase);
 if(race.phase==='paused')$('resume').focus();if(race.phase==='finished'){clearInput();finishRace();$('race-again').focus();}if(race.phase==='menu')renderHistory();
}
function finishRace(){
 const order=race.standings(),p=race.player,position=order.indexOf(p)+1;
 text('result-title',position===1?'You take the win.':'Race complete');text('result-summary',`P${position} of 3. ${LAPS} laps at ${race.route.name} in ${formatTime(p.finishTime+p.penalty)}.`);ui['result-list'].replaceChildren();
 for(const [i,c]of order.entries()){const li=document.createElement('li'),name=document.createElement('span'),right=document.createElement('span'),detail=document.createElement('small');name.textContent=`${i+1}. ${c.name}`;right.textContent=formatTime(c.finishTime+c.penalty);detail.textContent=`Ford Mustang 2015 / ${c.model.name} / penalties +${c.penalty}s`;name.append(detail);li.append(name,right);ui['result-list'].append(li);}
 if(!saved){saved=true;records.selectTrack(race.route.id);records.recordRace({carId:p.model.id,weather:race.weather,position,time:p.finishTime,penalty:p.penalty,bestLap:p.bestLap,finishedAt:new Date().toISOString()});renderHistory();}
}
function updateHUD(){
 const p=race.player,order=race.standings();ui.position.innerHTML=`${order.indexOf(p)+1} <small>/ 3</small>`;ui.lap.innerHTML=`${p.lap} <small>/ ${LAPS}</small>`;
 text('race-time',formatTime(p.finished?p.finishTime:race.time));text('current-lap',lapDisplay(p));text('best-lap',formatTime(p.bestLap));text('penalty',`+${p.penalty.toFixed(1)}s`);
 text('speed',Math.round(p.speed*3.6));text('gear',p.gear);text('rpm',`${Math.round(p.rpm)} RPM`);ui['rpm-fill'].style.width=`${clamp(p.rpm/8500,0,1)*100}%`;
 for(const part of ['engine','steering','tires']){ui[`${part}-condition`].value=1-p.damage[part];ui[`${part}-condition`].title=`${Math.round((1-p.damage[part])*100)}% condition`;}
 ui.abs.classList.toggle('active',p.abs);ui.tc.classList.toggle('active',p.tc);text('conditions',race.weather==='wet'?'Wet track':'Dry track');
 text('nitro-value',`${Math.round(p.nitro??100)}%`);if(ui['nitro-meter'])ui['nitro-meter'].value=p.nitro??100;
 text('nitro-status',p.boostActive?'Boosting':p.nitroCooldown>0?`Cooling ${p.nitroCooldown.toFixed(1)}s`:p.nitro>=99.9?'Shift to boost':pressed('ShiftLeft','ShiftRight')?'Release Shift to recharge':'Recharging');
 text('drift-status',p.drifting?'Drifting. Release Space to grip.':'Space: handbrake');document.body.dataset.boost=String(!!p.boostActive);document.body.dataset.drifting=String(!!p.drifting);
 text('notification',p.finished&&race.phase==='racing'?'Finished. Waiting for the other drivers.':p.noticeUntil>race.time?p.notification:'');ui.countdown.hidden=race.phase!=='countdown';if(race.phase==='countdown')text('countdown',Math.max(1,Math.ceil(race.countdown)));
 ui.standings.replaceChildren();
 for(const[i,c]of order.entries()){const li=document.createElement('li');if(c.index===0)li.className='you';const pos=document.createElement('span'),name=document.createElement('span'),gap=document.createElement('span');pos.textContent=i+1;name.textContent=c.name;gap.textContent=c.finished?formatTime(c.finishTime+c.penalty):i===0?'Leader':`~+${((order[0].progress-c.progress)/Math.max(10,c.speed)).toFixed(1)}s`;li.append(pos,name,gap);ui.standings.append(li);}drawMap();
}
const map=ui.minimap.getContext('2d');
function drawMap(){
 if(!map)return;
 const t=race.track,bounds=trackBounds(t.points),padding=14,titleHeight=14,canvasWidth=ui.minimap.width||240,canvasHeight=ui.minimap.height||195,plotWidth=canvasWidth-padding*2,plotHeight=canvasHeight-padding*2-titleHeight,scale=Math.min(plotWidth/Math.max(bounds.width,1),plotHeight/Math.max(bounds.depth,1)),centerX=canvasWidth/2,centerY=padding+plotHeight/2,project=p=>[centerX+(p.x-bounds.centerX)*scale,centerY+(p.z-bounds.centerZ)*scale];
 map.clearRect(0,0,canvasWidth,canvasHeight);map.lineJoin='round';map.lineCap='round';map.beginPath();t.points.forEach((p,i)=>{const[x,y]=project(p);if(i)map.lineTo(x,y);else map.moveTo(x,y);});map.closePath();map.strokeStyle='#b3c7d2';map.lineWidth=7;map.stroke();map.strokeStyle='#fff';map.lineWidth=2;map.stroke();
 const start=project(t.at(0));map.fillStyle='#173c56';map.fillRect(start[0]-3,start[1]-4,6,8);for(const c of [...race.cars].reverse()){const[x,y]=project(c);map.beginPath();map.arc(x,y,c.index===0?5:4,0,Math.PI*2);map.fillStyle=c.model.color;map.fill();map.strokeStyle=c.index===0?'#173c56':'#fff';map.lineWidth=2;map.stroke();}map.fillStyle='#173c56';map.font='11px Segoe UI, Arial';map.fillText(race.route.name,padding,canvasHeight-padding);
}
async function togglePause(){
 if(loading||pausePending||failed)return;pausePending=true;clearInput();
 try{await simulation.command(race.phase==='paused'?'resume':'pause');updateHUD();syncPhase();if(race.phase!=='paused')ui['race-canvas'].focus();}
 catch(error){if(!disposed)fail(error);}finally{pausePending=false;}
}
function fail(error){if(disposed||failed)return;failed=true;console.error(error);clearInput();simulation?.dispose();cancelAnimationFrame(frameId);setLoading(false);viewReady=false;ui.start.disabled=true;audio.setMuted(true);view?.dispose();ui.menu.hidden=true;ui.hud.hidden=true;ui['pause-panel'].hidden=true;ui.results.hidden=true;ui.error.hidden=false;text('error-message',error.message||'Unable to run the game. Reload to try again.');document.body.dataset.phase='error';}
ui.setup.elements.carId.value=settings.carId;
ui.track.value=settings.trackId;ui.weather.value=settings.weather;ui.quality.value=settings.quality;applyMute();applyTrackCopy();
try{simulation=new SimulationClient(applySnapshot,fail);document.body.dataset.worker='ready';}catch(error){fail(error);}
if(!failed){syncPhase();renderHistory();resetRace();}
ui.setup.addEventListener('change',()=>{if(loading||failed)return;const active=document.activeElement;persistSettings();resetRace(false,active);});
ui.setup.addEventListener('submit',event=>{event.preventDefault();if(loading||failed)return;audio.unlock();persistSettings();resetRace(true);});
ui.menu.addEventListener('pointerdown',()=>audio.unlock(),{once:true});
ui.mute.addEventListener('click',()=>{audio.unlock();settings.muted=!settings.muted;records.saveSettings({muted:settings.muted});applyMute();});
$('pause').addEventListener('click',togglePause);$('resume').addEventListener('click',togglePause);$('restart').addEventListener('click',()=>{audio.unlock();if(!loading)resetRace(true);});$('race-again').addEventListener('click',()=>{audio.unlock();if(!loading)resetRace(true);});$('exit').addEventListener('click',()=>{if(!loading)resetRace();});$('result-setup').addEventListener('click',()=>{if(!loading)resetRace();});
const drivingKeys=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight']);
window.addEventListener('keydown',event=>{
 const target=event.target;if(event.ctrlKey||event.metaKey||event.altKey||(target instanceof Element&&target.closest('select,input,textarea,summary,[contenteditable=""],[contenteditable="true"]')))return;
 if(event.code==='KeyM'&&!event.repeat){ui.mute.click();return;}if(loading||failed||race.phase==='menu'||race.phase==='finished')return;
 if(['KeyP','Escape'].includes(event.code)&&!event.repeat){event.preventDefault();togglePause();return;}if(target instanceof Element&&target.closest('button,a'))return;
 if(drivingKeys.has(event.code)){event.preventDefault();if(race.phase!=='paused'){keys.add(event.code);sendInput();}}
 if(event.code==='KeyR'&&!event.repeat&&race.phase==='racing'){event.preventDefault();clearInput();simulation.command('repair').catch(fail);}
});
window.addEventListener('keyup',event=>{if(keys.delete(event.code))sendInput();});
function autoPause(){clearInput();if(loading){loadLostFocus=true;return;}if(!failed&&['countdown','racing'].includes(race.phase))simulation.command('pause').catch(error=>{if(!disposed)fail(error);});audio.update({phase:'paused',boostActive:false,drifting:false});}
window.addEventListener('focus',()=>{windowFocused=true;last=performance.now();});window.addEventListener('blur',()=>{windowFocused=false;autoPause();});document.addEventListener('visibilitychange',()=>{if(document.hidden)autoPause();last=performance.now();});
ui['race-canvas'].addEventListener('webglcontextlost',event=>{event.preventDefault();autoPause();fail(new Error('Graphics context was lost. Reload the game to continue.'));});
document.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const modal=[ui['pause-panel'],ui.results,ui.error].find(n=>!n.hidden);if(!modal)return;const buttons=[...modal.querySelectorAll('button')],first=buttons[0],lastButton=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();lastButton.focus();}else if(!event.shiftKey&&document.activeElement===lastButton){event.preventDefault();first.focus();}});
const soundTimer=setInterval(()=>{if(disposed||failed)return;const now=performance.now(),p=race.player;audio.update({phase:loading||document.hidden?'paused':race.phase,rpm:p.rpm,speed:p.speed,throttle:p.throttle,wet:race.weather==='wet',slip:p.slip,impact:p.impact,gear:p.gear,boostActive:p.boostActive,drifting:p.drifting},Math.min(.1,(now-lastSound)/1000));lastSound=now;},33);
function frame(now){if(disposed||failed)return;try{const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;if(!document.hidden&&!loading&&viewReady)view.render(race.phase==='paused'?0:dt);frameId=requestAnimationFrame(frame);}catch(error){fail(error);}}
frameId=requestAnimationFrame(frame);
window.addEventListener('pagehide',()=>{disposed=true;++loadRevision;clearInterval(soundTimer);cancelAnimationFrame(frameId);simulation?.dispose();audio.dispose();view?.dispose();},{once:true});
