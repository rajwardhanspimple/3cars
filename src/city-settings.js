import { TrackRecords } from './storage.js';
import { CITY_TRACK, modeFor } from './city-gameplay.js';
// Separate supplemental settings preserve the established migration contract.
export const CITY_SETTINGS_KEY='3cars.settings.city-life-v1';
export class CityRecords extends TrackRecords {
 loadSettings(){
  const base=super.loadSettings();let saved={};
  if(this.available)try{const data=JSON.parse(this._storage.getItem(CITY_SETTINGS_KEY)||'null');if(data?.version===1)saved=data.settings||{};}catch{}
  return {...base,mode:['race','free-roam'].includes(saved.mode)?saved.mode:'free-roam',density:saved.density==='reduced'?'reduced':'busy'};
 }
 saveSettings(partial){
  const {mode,density,...base}=partial||{};
  if(mode!==undefined&&!['race','free-roam'].includes(mode)||density!==undefined&&!['busy','reduced'].includes(density))return false;
  const before=this.loadSettings();
  if(!super.saveSettings(base))return false;
  try{this._storage.setItem(CITY_SETTINGS_KEY,JSON.stringify({version:1,settings:{mode:mode??before.mode,density:density??before.density}}));return true;}
  catch{this._available=false;return false;}
 }
 selectTrack(trackId,mode='race'){
  super.selectTrack(trackId);this.mode=modeFor(trackId,mode);
  if(trackId===CITY_TRACK&&this.mode==='free-roam')this.key='3cars.records.anime-night-city-v1.free-roam-v1';
 }
}
export function installCitySetup(settings){
 const container=document.querySelector('.setup-options');
 for(const [id,title,options] of [['mode','Mode',[['free-roam','Free-roam (city)'],['race','Circuit race']]],['density','City population',[['busy','Busy'],['reduced','Reduced']]]]){
  if(document.getElementById(id))continue;
  const label=document.createElement('label'),select=document.createElement('select');label.textContent=title;select.id=id;select.name=id;
  for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
  select.value=settings[id];label.append(select);container.append(label);
 }
 const note=document.createElement('p');note.className='fine-print';note.textContent='City free-roam: leave the circuit to explore. Lap timing pauses off course. Return to the segment before your next checkpoint to resume. R recovers to your last valid checkpoint (+20s). AI rivals stay on the circuit.';container.after(note);
 const status=document.createElement('p');status.id='off-course';status.className='notification';status.setAttribute('role','status');status.hidden=true;document.getElementById('hud').append(status);
}
