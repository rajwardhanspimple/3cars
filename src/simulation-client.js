export class SimulationClient {
 constructor(onState,onError){
  this.generation=0;this.sequence=0;this.nextId=1;this.pending=new Map();this.onState=onState;this.onError=onError;this.disposed=false;
  this.worker=new Worker(new URL('./simulation-worker.js',import.meta.url),{type:'module'});
  this.worker.addEventListener('error',event=>this.fail(new Error(event.message||'Simulation worker failed. Reload the game.')));
  this.worker.addEventListener('message',({data})=>{
   if(this.disposed||data.generation!==this.generation)return;
   if(data.type==='error'){this.fail(new Error(data.message));return;}
   if(data.state&&data.sequence>this.sequence){this.sequence=data.sequence;this.onState(data.state);}
   if(data.type==='state')this.worker.postMessage({type:'ack',generation:this.generation});
   if(data.type==='reply'){const pending=this.pending.get(data.id);if(pending){clearTimeout(pending.timer);this.pending.delete(data.id);pending.resolve(data.state);}}
  });
 }
 reset(config){this.generation++;this.sequence=0;this.rejectPending(new Error('Race reset'));return this.command('reset',{config});}
 command(type,payload={}){
  if(this.disposed)return Promise.reject(new Error('Simulation closed'));
  const id=this.nextId++;return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Simulation did not respond. Reload the game.'));},15000);
   this.pending.set(id,{resolve,reject,timer});this.worker.postMessage({type,id,generation:this.generation,...payload});
  });
 }
 input(input){if(!this.disposed)this.worker.postMessage({type:'input',generation:this.generation,input});}
 rejectPending(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error);}this.pending.clear();}
 fail(error){if(this.disposed)return;this.dispose();this.onError(error);}
 dispose(){if(this.disposed)return;this.disposed=true;this.rejectPending(new Error('Simulation closed'));this.worker.terminate();}
}
