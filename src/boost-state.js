// Presentation only. Never changes nitro charge, cooldown, velocity or controls.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,f=0)=>Number.isFinite(n)?n:f;
export class BoostState {
 constructor({reducedMotion=false}={}){this.reducedMotion=reducedMotion;this.reset();}
 reset(){this.active=false;this.intensity=0;this.age=0;this.ignition=0;this.lines=0;this.shakeX=0;this.shakeY=0;}
 update(car={},dt=0,phase='menu',snap=false){
  const h=clamp(finite(dt),0,.1),active=phase==='racing'&&!car.finished&&!!car.boostActive;
  if(phase!=='racing'||car.finished){this.reset();return this;}
  if(snap){this.reset();this.active=active;this.age=.22;}
  if(active&&!this.active){this.age=0;}
  this.active=active;
  if(h>0){
   this.age+=h;
   const speed=Math.max(0,finite(car.speed)),throttle=clamp(finite(car.throttle),0,1);
   const target=active?.65+.2*throttle+.15*clamp(speed/80,0,1):0;
   this.intensity+=(target-this.intensity)*(1-Math.exp(-h*(active?12:20)));
   // No low-speed streaks. Hard boost begins at 40m/s; ordinary speed at 65m/s.
   const highSpeed=clamp((speed-65)/20,0,1);
   const hardBoost=active?clamp((speed-40)/25,0,1)*throttle*this.intensity:0;
   this.lines=this.reducedMotion?0:Math.max(highSpeed,hardBoost);
  }
  this.ignition=active?Math.max(0,1-this.age/.22):0;
  const amplitude=this.reducedMotion?0:this.ignition*this.ignition*.065;
  this.shakeX=Math.sin(this.age*110)*amplitude;
  this.shakeY=Math.sin(this.age*157)*amplitude*.65;
  return this;
 }
}
