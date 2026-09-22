import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TrackRecords, LocalRecords, SETTINGS_KEY } from '../src/storage.js';
import { DEFAULT_TRACK, MOUNTAIN_TRACK, TRACKS, trackInfo } from '../src/tracks.js';
import { prepareRaceView } from '../src/view-session.js';
class Memory {
 constructor(seed={}) { this.map=new Map(Object.entries(seed)); }
 getItem(k) { return this.map.get(k)??null; }
 setItem(k,v) { this.map.set(k,String(v)); }
 removeItem(k) { this.map.delete(k); }
}
const entry={carId:'vortex',weather:'dry',position:1,time:310,penalty:0,bestLap:60,finishedAt:'2026-09-21T10:00:00Z'};
const mountainKey=TRACKS[MOUNTAIN_TRACK].recordsKey, cityKey=TRACKS[DEFAULT_TRACK].recordsKey;
const old=JSON.stringify({version:1,settings:{carId:'apex',weather:'wet',quality:'medium',muted:true},results:[entry],bests:{'vortex:dry':60}});

test('track settings default to night city and round-trip stable keys without touching records',()=>{
 const s=new Memory({[mountainKey]:old}), r=new TrackRecords(s);
 assert.deepEqual(r.loadSettings(),{carId:'apex',weather:'wet',quality:'medium',muted:true,trackId:DEFAULT_TRACK});
 assert.equal(s.getItem(SETTINGS_KEY),null);
 for(const trackId of [MOUNTAIN_TRACK,DEFAULT_TRACK]){
  assert.equal(r.saveSettings({trackId}),true);
  assert.equal(new TrackRecords(s).loadSettings().trackId,trackId);
  assert.equal(JSON.parse(s.getItem(SETTINGS_KEY)).settings.trackId,trackId);
  assert.equal(s.getItem(mountainKey),old);assert.equal(s.getItem(cityKey),null);
 }
 assert.equal(r.saveSettings({trackId:'unknown'}),false);
 assert.equal(r.saveSettings({extra:true}),false);
 assert.throws(()=>r.selectTrack('unknown'),/Unknown track/);
});

test('record histories and all-time bests remain separate across switches and reloads',()=>{
 const s=new Memory({[mountainKey]:old}), r=new TrackRecords(s);
 assert.equal(r.bestLap('vortex','dry'),null);assert.deepEqual(r.results(),[]);
 r.recordRace({...entry,bestLap:45});
 assert.equal(s.getItem(mountainKey),old);
 r.selectTrack(MOUNTAIN_TRACK);
 assert.equal(r.bestLap('vortex','dry'),60);assert.equal(r.results().length,1);
 r.recordRace({...entry,bestLap:55});
 const city=s.getItem(cityKey);
 assert.equal(r.bestLap('vortex','dry'),55);
 r.selectTrack(DEFAULT_TRACK);
 for(let i=0;i<25;i++)r.recordRace({...entry,bestLap:80+i,time:500+i});
 assert.equal(r.results().length,20);assert.equal(r.bestLap('vortex','dry'),45);
 assert.notEqual(s.getItem(cityKey),city);
 const reload=new TrackRecords(s);assert.equal(reload.bestLap('vortex','dry'),45);
 reload.selectTrack(MOUNTAIN_TRACK);assert.equal(reload.bestLap('vortex','dry'),55);
 assert.equal(reload.results().length,2);
 assert.equal(new LocalRecords(s).bestLap('vortex','dry'),55);
});

test('settings-only migration follows existing precedence and never imports old results',()=>{
 for(const source of ['3cars.records.sakura-v1','3cars.records.arcade-v1','3cars.records']){
  const s=new Memory({[source]:old}), r=new TrackRecords(s);
  assert.equal(r.loadSettings().carId,'apex');assert.equal(r.loadSettings().trackId,DEFAULT_TRACK);
  assert.deepEqual(r.results(),[]);assert.equal(r.bestLap('vortex','dry'),null);
  r.saveSettings({trackId:MOUNTAIN_TRACK});r.selectTrack(MOUNTAIN_TRACK);
  assert.deepEqual(r.results(),[]);assert.equal(r.bestLap('vortex','dry'),null);
  assert.equal(s.getItem(source),old);assert.equal(s.getItem(mountainKey),null);
 }
 for(const bad of ['{broken',JSON.stringify({version:2,settings:{trackId:MOUNTAIN_TRACK}})]){
  const r=new TrackRecords(new Memory({[SETTINGS_KEY]:bad,[mountainKey]:old}));
  assert.equal(r.loadSettings().trackId,DEFAULT_TRACK);assert.equal(r.loadSettings().carId,'vortex');
 }
 const badCity=new TrackRecords(new Memory({[cityKey]:'{broken',[mountainKey]:old}));
 assert.deepEqual(badCity.results(),[]);assert.equal(badCity.bestLap('vortex','dry'),null);
 assert.equal(trackInfo('invalid').id,DEFAULT_TRACK);
});

test('settings and history tolerate blocked storage',()=>{
 const s=new Memory(), r=new TrackRecords(s);
 s.getItem=()=>{throw Error('blocked');};
 assert.equal(r.loadSettings().trackId,DEFAULT_TRACK);assert.equal(r.available,false);
 assert.equal(r.saveSettings({trackId:MOUNTAIN_TRACK}),false);assert.deepEqual(r.results(),[]);
});

test('track and quality switching dispose before construction; same-track reset reuses view',async()=>{
 const events=[];
 class View {
  constructor(canvas,race,config){Object.assign(this,config);this.ready=Promise.resolve();events.push('create');}
  dispose(){events.push('dispose');}
  setRace(){events.push('reset');return Promise.resolve();}
 }
 let p=prepareRaceView(null,View,null,{}, {trackId:DEFAULT_TRACK,quality:'high'});await p.ready;
 const first=p.view;
 p=prepareRaceView(first,View,null,{}, {trackId:DEFAULT_TRACK,quality:'high'});await p.ready;
 assert.equal(p.view,first);assert.deepEqual(events,['create','reset']);
 p=prepareRaceView(first,View,null,{}, {trackId:MOUNTAIN_TRACK,quality:'high'});await p.ready;
 assert.deepEqual(events,['create','reset','dispose','create']);assert.notEqual(p.view,first);
 p=prepareRaceView(p.view,View,null,{}, {trackId:MOUNTAIN_TRACK,quality:'medium'});await p.ready;
 assert.deepEqual(events.slice(-2),['dispose','create']);
});

test('setup exposes both track keys and main uses track-aware records and replacement',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
 const main=await readFile(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(html,/select id="track" name="trackId"/);
 for(const id of Object.keys(TRACKS))assert.ok(html.includes(`value="${id}"`));
 assert.match(main,/prepareRaceView\(view,RaceView/);assert.match(main,/new TrackRecords\(/);
 assert.match(main,/map\.fillText\(race\.route\.name/);
 assert.match(main,/records\.selectTrack\(race\.route\.id\)/);
});

// Dependency-free cases above still run in the simulation job.
let B=null;
try { ({default:B}=await import('babylonjs')); } catch {}
if(!B){
 test('world-switch NullEngine tests skipped: babylonjs is not installed',{skip:'run npm install for world lifecycle coverage'},()=>{});
}else{
 globalThis.BABYLON=B;
 const {Race}=await import('../src/sim.js');
 const {RaceView}=await import('../src/view.js');
 const {applyDaytimeCel}=await import('../src/world-selection.js');
 class HeadlessView {
  constructor(canvas,race,config){
   Object.assign(this,config);this.race=race;this.engine=new B.NullEngine();this.scene=new B.Scene(this.engine);
   this.camera=new B.FreeCamera('camera',new B.Vector3(0,2,-10),this.scene);
   this.sun=new B.DirectionalLight('sun',new B.Vector3(-1,-1,0),this.scene);
   this.hemi=new B.HemisphericLight('sky',B.Vector3.Up(),this.scene);
   this.createRain=RaceView.prototype.createRain;
   if(this.trackId===DEFAULT_TRACK)RaceView.prototype.createWorld.call(this);
   else{
    // Mountain downloads and canvas sky cannot run in NullEngine. Use a small
    // resource fixture for the destination, with the real daytime palette and
    // real production scene/engine disposal, not a mocked dispose function.
    const mesh=B.MeshBuilder.CreateBox('mountain-fixture',{},this.scene);
    mesh.material=new B.StandardMaterial('mountain-fixture',this.scene);
    mesh.material.diffuseTexture=B.RawTexture.CreateRGBATexture(new Uint8Array([255,255,255,255]),1,1,this.scene);
    this.scenery={update(){},ready:Promise.resolve()};
    this.ready=this.scenery.ready.then(()=>applyDaytimeCel(this));
   }
  }
  dispose(){RaceView.prototype.dispose.call(this);}
  setRace(race){this.race=race;return this.ready;}
 }
 for(const quality of ['high','medium'])test(`scene replacement releases city resources and observers (${quality})`,async()=>{
  let prepared=prepareRaceView(null,HeadlessView,null,new Race(),{trackId:DEFAULT_TRACK,quality});
  let current=prepared.view;await prepared.ready;
  try{
   for(const trackId of [MOUNTAIN_TRACK,DEFAULT_TRACK,MOUNTAIN_TRACK,DEFAULT_TRACK]){
    const oldView=current, oldScene=current.scene, oldEngine=current.engine;
    const meshes=[...oldScene.meshes],materials=[...oldScene.materials],textures=[...oldScene.textures];
    let disposedMeshes=0,disposedMaterials=0,disposedTextures=0;
    meshes.forEach(m=>m.onDisposeObservable.addOnce(()=>disposedMeshes++));
    materials.forEach(m=>m.onDisposeObservable.addOnce(()=>disposedMaterials++));
    textures.forEach(t=>t.onDisposeObservable.addOnce(()=>disposedTextures++));
    oldScene.onBeforeRenderObservable.add(()=>{});
    prepared=prepareRaceView(current,HeadlessView,null,new Race(),{trackId,quality});current=prepared.view;
    assert.equal(oldScene.isDisposed,true);assert.ok(!B.Engine.Instances.includes(oldEngine));
    assert.equal(disposedMeshes,meshes.length);assert.equal(disposedMaterials,materials.length);assert.equal(disposedTextures,textures.length);
    assert.equal(oldScene.meshes.length,0);assert.equal(oldScene.materials.length,0);assert.equal(oldScene.textures.length,0);
    assert.equal(oldScene.onBeforeRenderObservable.hasObservers(),false);
    assert.ok(meshes.every(m=>m.isDisposed()));
    await prepared.ready;
    assert.ok(current.scene.meshes.every(m=>!meshes.includes(m)));
    assert.equal(current.scene.metadata.celShading.palette,trackId===DEFAULT_TRACK?'city-night':'mountain-day');
    assert.equal(current.celShading.options.bloom.enabled,quality==='high');
    oldView.dispose(); // Idempotent, including when pagehide follows failure.
   }
   assert.throws(()=>RaceView.prototype.createWorld.call(current),/only one world/);
  }finally{current.dispose();}
 });
 test('selected city builder failures propagate to the view readiness promise',async()=>{
  const original=B.RawTexture.CreateRGBATexture;let view;
  try{
   B.RawTexture.CreateRGBATexture=()=>{throw Error('injected load failure');};
   view=new HeadlessView(null,new Race(),{trackId:DEFAULT_TRACK,quality:'medium'});
   await assert.rejects(view.ready,/injected load failure/);
  }finally{B.RawTexture.CreateRGBATexture=original;view?.dispose();}
 });
}
