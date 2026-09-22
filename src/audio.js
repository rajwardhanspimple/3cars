import {BoostState} from './boost-state.js';
export class RaceAudio {
 constructor(){this.ctx=null;this.muted=false;this.state={phase:'menu',rpm:900,speed:0,throttle:0,wet:false,slip:0,impact:0,gear:1,boostActive:false,drifting:false};this.boostEnvelope=new BoostState();this.lastImpact=0;this.lastGear=1;this.note=0;this.noteTime=0;this.notes=[392,494,587,659,587,494,440,494];this.nodes=[];this.unlocking=null;}
 async unlock(){
  if(this.ctx){try{if(this.ctx.state!=='closed')await this.ctx.resume();return this.ctx.state==='running';}catch{return false;}}
  if(this.unlocking)return this.unlocking;
  this.unlocking=this.init();
  try{return await this.unlocking;}finally{this.unlocking=null;}
 }
 async init(){
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return false;
  try{
   const c=this.ctx=new Audio();this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);this.nodes.push(this.master);
   const gain=()=>{const n=c.createGain();n.gain.value=0;n.connect(this.master);this.nodes.push(n);return n;};
   this.engineGain=gain();this.tireGain=gain();this.driftGain=gain();this.rainGain=gain();this.boostGain=gain();this.whooshGain=gain();this.musicGain=gain();this.fxGain=gain();
   const oscillator=(type,dest)=>{const n=c.createOscillator();n.type=type;n.connect(dest);n.start();this.nodes.push(n);return n;};
   const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=1500;low.connect(this.engineGain);this.nodes.push(low);
   this.motor=oscillator('sawtooth',low);this.harmonic=oscillator('triangle',low);this.music=oscillator('triangle',this.musicGain);this.music.frequency.value=392;
   this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const samples=this.noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
   const source=c.createBufferSource();source.buffer=this.noise;source.loop=true;
   this.tireFilter=c.createBiquadFilter();this.tireFilter.type='bandpass';this.tireFilter.frequency.value=800;this.tireFilter.Q.value=3;source.connect(this.tireFilter);this.tireFilter.connect(this.tireGain);this.nodes.push(this.tireFilter);
   this.driftFilter=c.createBiquadFilter();this.driftFilter.type='bandpass';this.driftFilter.frequency.value=950;this.driftFilter.Q.value=7;source.connect(this.driftFilter);this.driftFilter.connect(this.driftGain);this.nodes.push(this.driftFilter);
   this.rainFilter=c.createBiquadFilter();this.rainFilter.type='bandpass';this.rainFilter.frequency.value=3200;this.rainFilter.Q.value=.6;source.connect(this.rainFilter);this.rainFilter.connect(this.rainGain);this.nodes.push(this.rainFilter);
   this.boostFilter=c.createBiquadFilter();this.boostFilter.type='highpass';this.boostFilter.frequency.value=1800;this.boostFilter.Q.value=.9;source.connect(this.boostFilter);this.boostFilter.connect(this.boostGain);this.nodes.push(this.boostFilter);
   // Broad low noise layer shares the existing loop. No oscillator or per-frame allocation.
   this.whooshFilter=c.createBiquadFilter();this.whooshFilter.type='bandpass';this.whooshFilter.frequency.value=180;this.whooshFilter.Q.value=.65;source.connect(this.whooshFilter);this.whooshFilter.connect(this.whooshGain);this.nodes.push(this.whooshFilter);
   source.start();this.nodes.push(source);await c.resume();this.apply(0);return true;
  }catch{this.dispose();return false;}
 }
 setMuted(value){this.muted=!!value;this.apply(0);}
 update(state={},dt=0){
  const s=this.state;
  if(state.phase!==undefined)s.phase=state.phase;if(state.wet!==undefined)s.wet=state.wet;
  if(state.boostActive!==undefined)s.boostActive=!!state.boostActive;if(state.drifting!==undefined)s.drifting=!!state.drifting;
  if(Number.isFinite(state.rpm))s.rpm=state.rpm;if(Number.isFinite(state.speed))s.speed=state.speed;if(Number.isFinite(state.throttle))s.throttle=state.throttle;if(Number.isFinite(state.slip))s.slip=state.slip;if(Number.isFinite(state.impact))s.impact=state.impact;if(Number.isFinite(state.gear))s.gear=state.gear;
  this.boostEnvelope.update(s,dt,s.phase);
  if(this.ctx){
   const drive=s.phase==='racing'||s.phase==='countdown',live=!this.muted&&this.ctx.state==='running';
   if(drive&&live&&s.impact>this.lastImpact)this.transient(.3,.18,480);
   if(drive&&live&&s.gear!==this.lastGear)this.transient(.075,.06,850);
   this.apply(dt);
  }
  this.lastImpact=s.impact;this.lastGear=s.gear;
 }
 setGain(node,val,live,t,tau){node.gain.setTargetAtTime(live?Math.max(0,Math.min(1,val)):0,t,tau);}
 apply(dt){
  if(!this.ctx||!this.master)return;const c=this.ctx,t=c.currentTime,s=this.state,racing=s.phase==='racing',drive=racing||s.phase==='countdown',live=!this.muted&&c.state==='running',menu=s.phase==='menu';
  const rpm=Math.max(900,Math.min(8500,s.rpm)),speed=Math.max(0,s.speed),throttle=Math.max(0,Math.min(1,s.throttle)),slip=Math.max(0,Math.min(1.5,s.slip)),boost=racing&&s.boostActive?1:0,drift=racing&&s.drifting?1:0;
  const surge=racing?this.boostEnvelope.intensity:0,ignition=this.boostEnvelope.ignition;
  const tone=60+(rpm-900)*.017+throttle*10+boost*28;
  this.motor.frequency.setTargetAtTime(tone,t,.035);this.harmonic.frequency.setTargetAtTime(tone*1.007+boost*5,t,.035);
  this.boostFilter.frequency.setTargetAtTime(Math.max(1400,Math.min(5200,1700+speed*10+throttle*900+(rpm-900)*.18)),t,.06);
  this.whooshFilter.frequency.setTargetAtTime(160+surge*260+Math.min(speed,100)*1.4+ignition*100,t,.06);
  this.driftFilter.frequency.setTargetAtTime(Math.max(650,Math.min(1700,780+speed*6+slip*280)),t,.05);
  this.setGain(this.engineGain,drive?.016+throttle*.05+speed*.00018+boost*.012:0,live,t,.05);
  this.setGain(this.tireGain,drive?Math.min(.13,slip*.075+speed*.00018+drift*.045):0,live,t,.05);
  this.setGain(this.driftGain,drift?Math.min(.16,.06+slip*.08+speed*.00018):0,live,t,.04);
  this.setGain(this.rainGain,drive&&s.wet?.013:0,live,t,.05);
  this.setGain(this.boostGain,surge*(.025+throttle*.02),live,t,.04);
  this.setGain(this.whooshGain,surge*(.065+throttle*.025+ignition*.025),live,t,.045);
  this.setGain(this.fxGain,drive?1:0,live,t,.05);this.setGain(this.musicGain,menu?.023:0,live,t,.08);this.setGain(this.master,1,live,t,.05);
  if(menu&&live){this.noteTime+=Math.min(.1,Math.max(0,dt));if(this.noteTime>.36){this.noteTime=0;this.note=(this.note+1)%8;this.music.frequency.setTargetAtTime(this.notes[this.note],t,.015);}}else this.noteTime=0;
 }
 transient(strength,duration,freq){
  if(!this.ctx||!this.noise||!this.fxGain)return;const c=this.ctx,t=c.currentTime,src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();src.buffer=this.noise;filter.type='bandpass';filter.frequency.value=freq;
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(strength,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  src.connect(filter);filter.connect(gain);gain.connect(this.fxGain);src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};src.start();src.stop(t+duration+.02);
 }
 dispose(){this.boostEnvelope.reset();for(const n of this.nodes){try{n.stop?.();n.disconnect();}catch{}}this.nodes=[];this.ctx?.close().catch(()=>{});this.ctx=null;this.master=null;this.unlocking=null;}
}
