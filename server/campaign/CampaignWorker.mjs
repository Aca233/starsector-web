import { quoteCargoPreview } from './CargoPreview.mjs';
import { projectCampaignPlayer } from './PlayerProjection.mjs';
import { CampaignSimulationLoop } from './SimulationLoop.mjs';
import { parentPort, workerData } from 'node:worker_threads';
import { CampaignRepository } from './Repository.mjs';
import { createReferenceRuleset } from '../../src/campaign/ReferenceRuleset.mjs';
import { identifier, requireThat } from '../../src/campaign/core/Values.mjs';

// This worker is internal only. The eventual network gateway must authenticate
// sessions before supplying principals; clients must never choose a system actor.
const rules=createReferenceRuleset();
const store=new CampaignRepository(workerData.filename,rules,{enableNativeDevelopment:workerData.enableNativeDevelopment===true});
const simulation=new CampaignSimulationLoop(store);
parentPort.postMessage({type:'ready',epoch:store.epoch,rules:rules.lock,nativeDevelopmentEnabled:workerData.enableNativeDevelopment===true});
parentPort.on('message',message=>{
  let id=message?.id;
  try{
    identifier(id,'RPC ID');
    requireThat(typeof message.op==='string','INVALID_RPC','Missing RPC operation');
    let value;
    switch(message.op){
      case 'native-create':value=store.createNativeDevelopment(message.input);break;
      case 'native-status':value=store.nativeDevelopmentStatus(message.worldId);break;
      case 'native-project-player':value=store.projectNativeDevelopmentPlayer(message.worldId,message.playerId);break;
      case 'native-scene':value=store.projectNativeDevelopmentScene(message.worldId,message.playerId,message.input);break;
      case 'native-observations':value=store.projectNativeDevelopmentObservations(message.worldId,message.playerId,message.input);break;
      case 'native-execute':value=store.executeNativeDevelopment(message.principal,message.command);break;
      case 'native-frame-events':value=store.projectNativeDevelopmentFrameEvents(message.worldId,message.playerId,message.input);break;
      case 'native-events':value=store.nativeDevelopmentEventsSince(message.worldId,message.revision,message.limit);break;
      case 'create':value=store.create(message.world);break;
      case 'read':value=store.read(message.worldId);break;
      case 'project-player':value=projectCampaignPlayer(store.read(message.worldId),message.playerId,rules);break;
      case 'execute':value=store.execute(message.principal,message.command);break;
      case 'events':value=store.eventsSince(message.worldId,message.revision,message.limit);break;
      case 'quote-logistics':value=rules.services.logistics.quote(message.input);break;
      case 'quote-cargo':
        requireThat(message.input?.epoch === store.epoch, 'STALE_AUTHORITY', 'Authority changed');
        value={...quoteCargoPreview(store.read(message.worldId),message.playerId,message.input,rules),epoch:store.epoch};break;
      case 'browse-market': {
        requireThat(message.input?.worldId === message.worldId, 'FORBIDDEN', 'Wrong world');
        requireThat(message.input?.epoch === store.epoch, 'STALE_AUTHORITY', 'Authority changed');
        requireThat(typeof rules.services.market?.browse === 'function', 'RULES_UNAVAILABLE', 'Pinned market provider does not support browsing');
        const { worldId, epoch, ...input } = message.input;
        value = { ...rules.services.market.browse(store.read(worldId), { kind: 'player', id: message.playerId }, input), epoch };
        break;
      }
      case 'quote-market-basket': {
        requireThat(message.input?.worldId === message.worldId, 'FORBIDDEN', 'Wrong world');
        requireThat(message.input?.epoch === store.epoch, 'STALE_AUTHORITY', 'Authority changed');
        requireThat(typeof rules.services.market?.quoteBasket === 'function', 'RULES_UNAVAILABLE', 'Pinned market provider does not support baskets');
        const { worldId, epoch, ...input } = message.input;
        value = { ...rules.services.market.quoteBasket(store.read(worldId), { kind: 'player', id: message.playerId }, input), worldId, epoch };
        break;
      }
      case 'quote-market':value=rules.services.market.quote(store.read(message.worldId),{kind:'player',id:message.playerId},message.input);break;
      case 'simulation-start':value=simulation.start(message.worldId);break;
      case 'simulation-stop':value=simulation.stop(message.worldId);break;
      case 'simulation-status':value=simulation.status(message.worldId);break;
      case 'close':simulation.close();store.close();value={closed:true};break;
      default:throw Object.assign(Error('Unknown campaign RPC'),{code:'INVALID_RPC'});
    }
    parentPort.postMessage({type:'reply',id,ok:true,value});
    if(message.op==='close')parentPort.close();
  }catch(error){parentPort.postMessage({type:'reply',id:typeof id==='string'?id:'invalid',ok:false,error:{code:error.code??'CAMPAIGN_FAILURE',message:error.message}});}
});
