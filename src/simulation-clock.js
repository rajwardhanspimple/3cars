export const STEP=1/120;
export class SimulationClock {
 constructor(step){this.step=step;this.last=null;this.accumulator=0;}
 reset(now=null){this.last=now;this.accumulator=0;}
 advance(now,enabled=true){
  if(!Number.isFinite(now))return 0;
  if(this.last===null||!enabled){this.reset(now);return 0;}
  const elapsed=Math.max(0,(now-this.last)/1000);this.last=now;
  // Bound recovery from an OS sleep. Rendering never drives this clock.
  this.accumulator+=Math.min(elapsed,.5);let steps=0;
  while(this.accumulator+1e-10>=STEP&&steps<60){this.step(STEP);this.accumulator=Math.max(0,this.accumulator-STEP);steps++;}
  return steps;
 }
}
