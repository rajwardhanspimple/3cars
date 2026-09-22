import {Race} from './city-gameplay.js';
import {SimulationClock} from './simulation-clock.js';
let race=new Race(),generation=0,sequence=0,input={},lastPublish=0,waiting=false;
const clock=new SimulationClock(dt=>race.step(dt,input));
function snapshot(){return{generation,sequence:++sequence,state:{phase:race.phase,time:race.time,countdown:race.countdown,firstFinish:race.firstFinish,pausedPhase:race.pausedPhase,cars:race.cars,props:race.props,traffic:race.traffic,pedestrians:race.pedestrians}};}
function publish(id){self.postMessage({type:id===undefined?'state':'reply',id,...snapshot()});if(id===undefined)waiting=true;}
self.addEventListener('message',({data})=>{
 const {type,id}=data;
 try{
  if(type==='reset'){generation=data.generation;sequence=0;race=new Race(data.config);input={};waiting=false;clock.reset(performance.now());publish(id);return;}
  if(data.generation!==generation)return;
  if(type==='ack'){waiting=false;return;}
  if(type==='input'){input=data.input||{};return;}
  if(type==='district'){if(race.phase!=='menu')throw Error('District must load before driving');race.configureDistrict(data.colliders);publish(id);return;}
  clock.advance(performance.now(),['racing','countdown'].includes(race.phase));
  if(type==='start'){if(race.cityEnabled&&!race.districtConfigured)throw Error('City collisions are not ready');race.start();}
  else if(type==='pause'){input={};if(['countdown','racing'].includes(race.phase))race.pause();}
  else if(type==='resume'){input={};if(race.phase==='paused')race.pause();}
  else if(type==='repair'){input={};race.repair();}
  else throw Error(`Unknown simulation command: ${type}`);
  clock.reset(performance.now());publish(id);
 }catch(error){self.postMessage({type:'error',id,generation,message:error.message});}
});
setInterval(()=>{
 try{const now=performance.now();clock.advance(now,['countdown','racing'].includes(race.phase));if(now-lastPublish>=33&&!waiting){lastPublish=now;publish();}}
 catch(error){self.postMessage({type:'error',generation,message:error.message});clock.reset(performance.now());}
},8);
