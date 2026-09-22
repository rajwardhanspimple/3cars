import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRecords } from '../src/storage.js';
const KEY='3cars.records.mountain-preview-v1';
const SAKURA_KEY='3cars.records.sakura-v1';
const ARCADE_KEY='3cars.records.arcade-v1';
const LEGACY_KEY='3cars.records';
const DEFAULTS={carId:'vortex',weather:'dry',muted:false,quality:'high'};
const SAKURA_SETTINGS={carId:'vortex',weather:'wet',muted:true,quality:'high'};
const ARCADE_SETTINGS={carId:'apex',weather:'wet',muted:true,quality:'medium'};
const LEGACY_SETTINGS={carId:'titan',weather:'dry',muted:false,quality:'high'};
class Memory {
 constructor(seed={}){this.map=new Map(Object.entries(seed));this.throwOnGet=new Set();this.throwOnSet=new Set();}
 getItem(k){if(this.blockRead||this.throwOnGet.has(k))throw Error('blocked');return this.map.get(k)??null;}
 setItem(k,v){if(this.blockWrite||this.throwOnSet.has(k))throw Error('quota');this.map.set(k,String(v));}
 removeItem(k){this.map.delete(k);}
}
const entry={carId:'vortex',weather:'dry',position:1,time:310,penalty:0,bestLap:60,finishedAt:'2026-09-21T10:00:00Z'};
const sakuraRecord=JSON.stringify({version:1,settings:SAKURA_SETTINGS,results:[entry],bests:{'vortex:dry':60}});
const arcadeRecord=JSON.stringify({version:1,settings:ARCADE_SETTINGS,results:[entry],bests:{'vortex:dry':60}});
const legacyRecord=JSON.stringify({version:1,settings:LEGACY_SETTINGS,results:[{...entry,weather:'wet'}],bests:{'apex:wet':55}});

test('mountain preview settings round-trip through a new instance',()=>{
 const s=new Memory(),r=new LocalRecords(s);
 assert.equal(r.available,true);
 assert.deepEqual(r.loadSettings(),DEFAULTS);
 assert.equal(r.saveSettings(ARCADE_SETTINGS),true);
 assert.deepEqual(new LocalRecords(s).loadSettings(),ARCADE_SETTINGS);
});

test('invalid settings, blocked storage, and later read failure are safe',()=>{
 const s=new Memory(),r=new LocalRecords(s);
 assert.equal(r.saveSettings({carId:'ghost'}),false);
 assert.equal(r.saveSettings({unknown:1}),false);
 s.blockRead=true;
 r.loadSettings();
 assert.equal(r.available,false);
 assert.equal(r.saveSettings({carId:'apex'}),false);
 const blocked=new Memory();
 blocked.blockRead=true;
 assert.equal(new LocalRecords(blocked).available,false);
});


test('invalid mountain preview records fall back safely without importing older route data',()=>{
 const migrated=JSON.stringify({version:1,settings:SAKURA_SETTINGS,results:[entry],bests:{'vortex:dry':60}});
 for(const value of ['{broken',JSON.stringify({version:2,settings:SAKURA_SETTINGS,results:[entry],bests:{'vortex:dry':60}})]){
  const r=new LocalRecords(new Memory({[KEY]:value,[SAKURA_KEY]:migrated,[ARCADE_KEY]:arcadeRecord,[LEGACY_KEY]:legacyRecord}));
  assert.equal(r.results().length,0);
  assert.equal(r.bestLap('vortex','dry'),null);
  assert.deepEqual(r.loadSettings(),DEFAULTS);
 }
});

test('sakura settings migrate first while results stay separate',()=>{
 const s=new Memory({[SAKURA_KEY]:sakuraRecord,[ARCADE_KEY]:arcadeRecord,[LEGACY_KEY]:legacyRecord});
 const r=new LocalRecords(s);
 assert.deepEqual(r.loadSettings(),SAKURA_SETTINGS);
 assert.equal(r.results().length,0);
 assert.equal(r.bestLap('vortex','dry'),null);
 assert.equal(s.getItem(KEY),null);
 assert.equal(s.getItem(SAKURA_KEY),sakuraRecord);
 assert.equal(s.getItem(ARCADE_KEY),arcadeRecord);
 assert.equal(s.getItem(LEGACY_KEY),legacyRecord);
 assert.equal(r.recordRace(entry),true);
 const stored=JSON.parse(s.getItem(KEY));
 assert.deepEqual(stored.settings,SAKURA_SETTINGS);
 assert.equal(stored.results.length,1);
 assert.equal(stored.bests['vortex:dry'],60);
 assert.equal(s.getItem(SAKURA_KEY),sakuraRecord);
 assert.equal(s.getItem(ARCADE_KEY),arcadeRecord);
 assert.equal(s.getItem(LEGACY_KEY),legacyRecord);
});

test('arcade settings migrate when sakura key is missing',()=>{
 const s=new Memory({[ARCADE_KEY]:arcadeRecord,[LEGACY_KEY]:legacyRecord});
 const r=new LocalRecords(s);
 assert.deepEqual(r.loadSettings(),ARCADE_SETTINGS);
 assert.equal(r.results().length,0);
 assert.equal(r.bestLap('vortex','dry'),null);
 assert.equal(s.getItem(KEY),null);
 assert.equal(s.getItem(ARCADE_KEY),arcadeRecord);
 assert.equal(s.getItem(LEGACY_KEY),legacyRecord);
});

test('legacy settings migrate only when sakura and arcade keys are missing',()=>{
 const s=new Memory({[LEGACY_KEY]:legacyRecord});
 const r=new LocalRecords(s);
 assert.deepEqual(r.loadSettings(),LEGACY_SETTINGS);
 assert.equal(r.results().length,0);
 assert.equal(r.bestLap('apex','wet'),null);
 assert.equal(s.getItem(KEY),null);
 assert.equal(s.getItem(LEGACY_KEY),legacyRecord);
});

test('malformed sakura key blocks fallback to arcade and legacy settings',()=>{
 for(const value of ['{broken',JSON.stringify({version:2,settings:SAKURA_SETTINGS})]){
  const r=new LocalRecords(new Memory({[SAKURA_KEY]:value,[ARCADE_KEY]:arcadeRecord,[LEGACY_KEY]:legacyRecord}));
  assert.deepEqual(r.loadSettings(),DEFAULTS);
  assert.equal(r.results().length,0);
  assert.equal(r.bestLap('vortex','dry'),null);
 }
});

test('malformed arcade key blocks fallback to older legacy settings when sakura is missing',()=>{
 for(const value of ['{broken',JSON.stringify({version:2,settings:ARCADE_SETTINGS})]){
  const r=new LocalRecords(new Memory({[ARCADE_KEY]:value,[LEGACY_KEY]:legacyRecord}));
  assert.deepEqual(r.loadSettings(),DEFAULTS);
  assert.equal(r.results().length,0);
  assert.equal(r.bestLap('vortex','dry'),null);
 }
});


test('blocked sakura migration read leaves defaults and does not import arcade or legacy settings',()=>{
 const s=new Memory({[ARCADE_KEY]:arcadeRecord,[LEGACY_KEY]:legacyRecord});
 s.throwOnGet.add(SAKURA_KEY);
 const r=new LocalRecords(s);
 assert.equal(r.available,true);
 assert.deepEqual(r.loadSettings(),DEFAULTS);
 assert.equal(r.results().length,0);
});

test('quota errors disable persistence without crashing',()=>{
 const s=new Memory(),r=new LocalRecords(s);
 s.blockWrite=true;
 assert.equal(r.saveSettings({muted:true}),false);
 assert.equal(r.available,false);
 assert.equal(r.recordRace(entry),false);
});

test('all-time best survives history trimming and remains scoped',()=>{
 const s=new Memory(),r=new LocalRecords(s);
 r.saveSettings({muted:true});
 assert.equal(r.recordRace(entry),true);
 r.recordRace({...entry,weather:'wet',bestLap:75});
 r.recordRace({...entry,carId:'apex',bestLap:55});
 for(let i=0;i<25;i++)assert.equal(r.recordRace({...entry,bestLap:80+i,time:500+i}),true);
 assert.equal(r.results().length,20);
 assert.equal(r.results()[0].time,524);
 assert.equal(r.bestLap('vortex','dry'),60);
 assert.equal(r.bestLap('vortex','wet'),75);
 assert.equal(r.bestLap('apex','dry'),55);
 assert.equal(r.bestLap('apex','wet'),null);
 assert.equal(new LocalRecords(s).bestLap('vortex','dry'),60);
 assert.equal(r.loadSettings().muted,true);
});

test('invalid race data cannot persist',()=>{
 const r=new LocalRecords(new Memory()),cycle={};
 cycle.self=cycle;
 for(const change of [{time:NaN},{time:Infinity},{time:-1},{penalty:-1},{position:4},{carId:'x'},{weather:'snow'},{bestLap:400},{bestLap:0},{finishedAt:cycle},{finishedAt:'bad'},{extra:true}])assert.equal(r.recordRace({...entry,...change}),false);
 assert.equal(r.recordRace(entry),true);
 assert.deepEqual(r.results()[0],entry);
});

test('blocked localStorage getter is safe',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked');}});
 try{assert.equal(new LocalRecords().available,false);}finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;}
});
