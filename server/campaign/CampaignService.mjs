import { Worker } from 'node:worker_threads';
import { CampaignError, immutableJSON } from '../../src/campaign/core/Values.mjs';

/** Nonblocking main-process facade. Does not create servers, ports or user worlds. */
export class CampaignService {
  #worker;#pending=new Map();#next=0;#closing=false;#exited=false;#ready;#exit;
  constructor({filename,timeoutMs=15000,enableNativeDevelopment=false}) {
    if(typeof enableNativeDevelopment!=='boolean')throw new CampaignError('INVALID_NATIVE_WORLD','Native development opt-in must be boolean');
    this.timeoutMs=timeoutMs;
    this.#worker=new Worker(new URL('./CampaignWorker.mjs',import.meta.url),{workerData:{filename,enableNativeDevelopment}});
    let resolveReady,rejectReady;
    this.#ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    // Initialization errors stay observable to ready()/requests, without unhandled rejections.
    this.#ready.catch(()=>{});
    this.#exit=new Promise(resolve=>this.#worker.once('exit',code=>{
      this.#exited=true;const error=new CampaignError('AUTHORITY_EXIT',`Campaign authority exited (${code})`);
      rejectReady(error);for(const p of this.#pending.values()){clearTimeout(p.timer);p.reject(error);}this.#pending.clear();resolve(code);
    }));
    this.#worker.on('error',error=>{rejectReady(error);for(const p of this.#pending.values()){clearTimeout(p.timer);p.reject(error);}this.#pending.clear();});
    this.#worker.on('message',message=>{
      if(message.type==='ready'){resolveReady(immutableJSON({epoch:message.epoch,rules:message.rules,nativeDevelopmentEnabled:message.nativeDevelopmentEnabled===true}));return;}
      if(message.type!=='reply')return;
      const pending=this.#pending.get(message.id);if(!pending)return;
      this.#pending.delete(message.id);clearTimeout(pending.timer);
      if(message.ok)pending.resolve(immutableJSON(message.value));else pending.reject(new CampaignError(message.error.code,message.error.message));
    });
  }
  ready(){return this.#ready;}
  async #request(op,data={}){
    if(this.#exited||this.#closing&&op!=='close')throw new CampaignError('STORE_CLOSED','Campaign service is closing');
    await this.#ready;
    if(this.#exited||this.#closing&&op!=='close')throw new CampaignError('STORE_CLOSED','Campaign service is closing');
    const id='rpc:'+String(++this.#next);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.#pending.delete(id);reject(new CampaignError('AUTHORITY_TIMEOUT','Request timed out; its commit status is unknown. Retry the same command requestId.'));},this.timeoutMs);
      this.#pending.set(id,{resolve,reject,timer});
      try{this.#worker.postMessage({id,op,...data});}catch(error){clearTimeout(timer);this.#pending.delete(id);reject(error);}
    });
  }
  createNativeDevelopment(input){return this.#request('native-create',{input});}
  nativeDevelopmentStatus(worldId){return this.#request('native-status',{worldId});}
  projectNativeDevelopmentPlayer(worldId,playerId){return this.#request('native-project-player',{worldId,playerId});}
  projectNativeDevelopmentScene(worldId,playerId,input){return this.#request('native-scene',{worldId,playerId,input});}
  projectNativeDevelopmentObservations(worldId,playerId,input){return this.#request('native-observations',{worldId,playerId,input});}
  executeNativeDevelopment(principal,command){return this.#request('native-execute',{principal,command});}
  projectNativeDevelopmentFrameEvents(worldId,playerId,input){return this.#request('native-frame-events',{worldId,playerId,input});}
  nativeDevelopmentEventsSince(worldId,revision,limit=100){return this.#request('native-events',{worldId,revision,limit});}
  create(world){return this.#request('create',{world});}
  read(worldId){return this.#request('read',{worldId});}
  projectPlayer(worldId,playerId){return this.#request('project-player',{worldId,playerId});}
  execute(principal,command){return this.#request('execute',{principal,command});}
  eventsSince(worldId,revision,limit=100){return this.#request('events',{worldId,revision,limit});}
  quoteLogistics(input){return this.#request('quote-logistics',{input});}
  quoteCargo(worldId,playerId,input){return this.#request('quote-cargo',{worldId,playerId,input});}
  browseMarket(worldId,playerId,input){return this.#request('browse-market',{worldId,playerId,input});}
  quoteMarketBasket(worldId,playerId,input){return this.#request('quote-market-basket',{worldId,playerId,input});}
  quoteMarket(worldId,playerId,input){return this.#request('quote-market',{worldId,playerId,input});}
  startSimulation(worldId){return this.#request('simulation-start',{worldId});}
  stopSimulation(worldId){return this.#request('simulation-stop',{worldId});}
  simulationStatus(worldId){return this.#request('simulation-status',{worldId});}
  async close(){
    if(this.#closing)return this.#exit;this.#closing=true;
    if(!this.#exited){try{await this.#request('close');}catch(error){if(!this.#exited)await this.#worker.terminate();throw error;}}
    return this.#exit;
  }
}
