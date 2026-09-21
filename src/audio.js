export class RaceAudio {
 constructor(){this.ctx=null;this.muted=false;this.state={phase:'menu',rpm:900,speed:0,throttle:0,wet:false,slip:0,impact:0,gear:1};this.lastImpact=0;this.lastGear=1;this.note=0;this.noteTime=0;this.nodes=[];this.unlocking=null;}
 async unlock(){
  if(this.ctx){try{await this.ctx.resume();return true;}catch{return false;}}
  if(this.unlocking)return this.unlocking;
  this.unlocking=this.init();return this.unlocking;
 }
 async init(){
  const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Audio)return false;
  try{
   const c=this.ctx=new Audio();this.master=c.createGain();this.master.gain.value=0;this.master.connect(c.destination);this.nodes.push(this.master);
   const gain=()=>{const n=c.createGain();n.gain.value=0;n.connect(this.master);this.nodes.push(n);return n;};
   this.engineGain=gain();this.tireGain=gain();this.rainGain=gain();this.musicGain=gain();this.fxGain=gain();
   const oscillator=(type,dest)=>{const n=c.createOscillator();n.type=type;n.connect(dest);n.start();this.nodes.push(n);return n;};
   const low=c.createBiquadFilter();low.type='lowpass';low.frequency.value=1500;low.connect(this.engineGain);this.nodes.push(low);
   this.motor=oscillator('sawtooth',low);this.harmonic=oscillator('triangle',low);this.music=oscillator('triangle',this.musicGain);this.music.frequency.value=392;
   this.noise=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const samples=this.noise.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
   const source=c.createBufferSource();source.buffer=this.noise;source.loop=true;
   for(const [dest,freq,q] of [[this.tireGain,800,3],[this.rainGain,3200,.6]]){const filter=c.createBiquadFilter();filter.type='bandpass';filter.frequency.value=freq;filter.Q.value=q;source.connect(filter);filter.connect(dest);this.nodes.push(filter);}
   source.start();this.nodes.push(source);await c.resume();this.apply(0);return true;
  }catch{this.dispose();return false;}
 }
 setMuted(value){this.muted=!!value;this.apply(0);}
 update(state={},dt=0){
  const s=this.state;for(const k of ['phase','wet'])if(state[k]!==undefined)s[k]=state[k];
  for(const k of ['rpm','speed','throttle','slip','impact','gear'])if(Number.isFinite(state[k]))s[k]=state[k];
  if(this.ctx&&this.ctx.state==='running'){
   const drive=s.phase==='racing'||s.phase==='countdown';
   if(drive&&!this.muted&&s.impact>this.lastImpact)this.transient(.3,.18,480);
   if(drive&&!this.muted&&s.gear!==this.lastGear)this.transient(.075,.06,850);
   this.apply(dt);
  }
  this.lastImpact=s.impact;this.lastGear=s.gear;
 }
 apply(dt){
  if(!this.ctx||!this.master)return;const c=this.ctx,t=c.currentTime,s=this.state,drive=['racing','countdown'].includes(s.phase),live=!this.muted,menu=s.phase==='menu';
  const gain=(node,val,tau=.05)=>node.gain.setTargetAtTime(live?Math.max(0,Math.min(1,val)):0,t,tau);
  const rpm=Math.max(900,Math.min(8500,s.rpm)),tone=60+(rpm-900)*.017;
  this.motor.frequency.setTargetAtTime(tone,t,.04);this.harmonic.frequency.setTargetAtTime(tone*1.007,t,.04);
  gain(this.engineGain,drive?.016+s.throttle*.05+s.speed*.00018:0);gain(this.tireGain,drive?Math.min(.09,s.slip*.07+s.speed*.00018):0);gain(this.rainGain,drive&&s.wet?.013:0);
  gain(this.fxGain,drive?1:0);gain(this.musicGain,menu?.023:0,.08);gain(this.master,1);
  if(menu&&live){this.noteTime+=Math.min(.1,Math.max(0,dt));if(this.noteTime>.36){this.noteTime=0;this.note=(this.note+1)%8;this.music.frequency.setTargetAtTime([392,494,587,659,587,494,440,494][this.note],t,.015);}}else this.noteTime=0;
 }
 transient(strength,duration,freq){
  const c=this.ctx,t=c.currentTime,src=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();src.buffer=this.noise;filter.type='bandpass';filter.frequency.value=freq;
  gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(strength,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
  src.connect(filter);filter.connect(gain);gain.connect(this.fxGain);src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect();};src.start();src.stop(t+duration+.02);
 }
 dispose(){for(const n of this.nodes){try{n.stop?.();n.disconnect();}catch{}}this.nodes=[];this.ctx?.close().catch(()=>{});this.ctx=null;this.master=null;this.unlocking=null;}
}
