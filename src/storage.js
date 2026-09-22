const KEY='3cars.records.mountain-preview-v1';
const SAKURA_KEY='3cars.records.sakura-v1';
const ARCADE_KEY='3cars.records.arcade-v1';
const LEGACY_KEY='3cars.records';
const DEFAULTS={carId:'vortex',weather:'dry',muted:false,quality:'high'};
const cars=['vortex','apex','titan'],weather=['dry','wet'];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const emptyData=()=>({version:1,settings:{...DEFAULTS},results:[],bests:{}});
function validSetting(k,v){return k==='carId'?cars.includes(v):k==='weather'?weather.includes(v):k==='muted'?typeof v==='boolean':k==='quality'?['high','medium'].includes(v):false;}
function cleanSettings(value){const out={...DEFAULTS};if(object(value))for(const k of Object.keys(out))if(validSetting(k,value[k]))out[k]=value[k];return out;}
function cleanRace(r){
 if(!object(r)||Object.keys(r).some(k=>!['carId','weather','position','time','penalty','bestLap','finishedAt'].includes(k)))return null;
 if(!cars.includes(r.carId)||!weather.includes(r.weather)||!Number.isInteger(r.position)||r.position<1||r.position>3||!finite(r.time)||r.time<=0||!finite(r.penalty)||r.penalty<0)return null;
 if(r.bestLap!==null&&(!finite(r.bestLap)||r.bestLap<=0||r.bestLap>r.time))return null;
 if(typeof r.finishedAt!=='string'||r.finishedAt.length>40||!/^\d{4}-\d{2}-\d{2}T/.test(r.finishedAt)||!Number.isFinite(Date.parse(r.finishedAt)))return null;
 return {carId:r.carId,weather:r.weather,position:r.position,time:r.time,penalty:r.penalty,bestLap:r.bestLap,finishedAt:r.finishedAt};
}
function migratedSettings(storage){
 for(const key of [SAKURA_KEY,ARCADE_KEY,LEGACY_KEY]){
  let text;
  try{text=storage.getItem(key);}catch{return null;}
  if(text===null)continue;
  let data;
  try{data=JSON.parse(text);}catch{return null;}
  return object(data)&&data.version===1?cleanSettings(data.settings):null;
 }
 return null;
}

export class LocalRecords {
 constructor(storage){
  this._storage=null;this._available=false;
  try{this._storage=storage===undefined?globalThis.localStorage:storage;const key=`3cars.probe.${Math.random()}`;this._storage.setItem(key,'1');this._available=this._storage.getItem(key)==='1';this._storage.removeItem(key);}catch{}
 }
 get available(){return this._available;}
 read(){
  const empty=emptyData();if(!this._available)return empty;
  let text;try{text=this._storage.getItem(KEY);}catch{this._available=false;return empty;}
  if(text===null){
   try{const settings=migratedSettings(this._storage);if(settings)empty.settings=settings;}catch{}
   return empty;
  }
  let data;try{data=JSON.parse(text);}catch{return empty;}if(!object(data)||data.version!==1)return empty;
  empty.settings=cleanSettings(data.settings);empty.results=Array.isArray(data.results)?data.results.map(cleanRace).filter(Boolean).slice(0,20):[];
  for(const c of cars)for(const w of weather){const k=`${c}:${w}`,n=data.bests?.[k];if(finite(n)&&n>0)empty.bests[k]=n;}
  for(const r of empty.results)if(r.bestLap!==null){const k=`${r.carId}:${r.weather}`;empty.bests[k]=Math.min(empty.bests[k]??Infinity,r.bestLap);}
  return empty;
 }
 write(data){if(!this._available)return false;try{this._storage.setItem(KEY,JSON.stringify(data));return true;}catch{this._available=false;return false;}}
 loadSettings(){return this.read().settings;}
 saveSettings(partial){if(!object(partial)||!Object.entries(partial).every(([k,v])=>validSetting(k,v)))return false;const data=this.read();data.settings={...data.settings,...partial};return this.write(data);}
 bestLap(carId,condition){if(!cars.includes(carId)||!weather.includes(condition))return null;return this.read().bests[`${carId}:${condition}`]??null;}
 recordRace(entry){const row=cleanRace(entry);if(!row)return false;const data=this.read();data.results=[row,...data.results].slice(0,20);if(row.bestLap!==null){const key=`${row.carId}:${row.weather}`;data.bests[key]=Math.min(data.bests[key]??Infinity,row.bestLap);}return this.write(data);}
 results(){return this.read().results;}
}
