import {validateNativeFrameEventsRequest,projectNativeFrameEventBatches} from './native/FrameEffects.mjs';
import {NativeScenePresentation,validateNativeSceneRequest} from './native/ScenePresentation.mjs';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { canonicalJSON, identifier, integer, requireThat, immutableJSON } from '../../src/campaign/core/Values.mjs';
import { validateCampaignWorld } from '../../src/campaign/core/WorldState.mjs';
import { authorizePrincipal, planCampaignCommand, validateCommand } from '../../src/campaign/core/Kernel.mjs';
import {isNativeDevelopmentWorld,createNativeDevelopmentWorld,restoreNativeDevelopmentWorld,nativeDevelopmentEnvelope,nativeDevelopmentSummary,projectNativeDevelopmentPlayer,projectNativeDevelopmentObservations,validateNativeDevelopmentCommand,authorizeNativeDevelopmentPrincipal,applyNativeDevelopmentCommand,validateNativeDevelopmentFrame,requireNativeDevelopmentFrame,advanceNativeDevelopmentFrame} from './native/DevelopmentWorld.mjs';

/** Internal authority API, not a network authentication boundary. Run in CampaignWorker. */
export class CampaignRepository {
  #db; #rules; #closed=false; #nativeDevelopment=false; #nativeScenes=new Map(); #nativeWorlds=new Map(); #nativeMutation=false;
  constructor(filename,ruleset,{epoch=randomUUID(),enableNativeDevelopment=false}={}) {
    identifier(epoch);requireThat(typeof enableNativeDevelopment==='boolean','INVALID_NATIVE_WORLD','Native development opt-in must be boolean');this.#nativeDevelopment=enableNativeDevelopment;this.epoch=epoch;this.#rules=ruleset;
    this.#db=new DatabaseSync(filename);
    try {
      this.#db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
      const version=this.#db.prepare('PRAGMA user_version').get().user_version;
      requireThat(version===0||version===2,'DATABASE_VERSION','Unsupported campaign database version');
      if(version===0){
        requireThat(this.#db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get().n===0,
          'DATABASE_VERSION','Refusing to initialize an unrelated database');
        this.#db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE authority(id INTEGER PRIMARY KEY CHECK(id=1), epoch TEXT NOT NULL);
          CREATE TABLE worlds(id TEXT PRIMARY KEY, revision INTEGER NOT NULL, state TEXT NOT NULL);
          CREATE TABLE receipts(world_id TEXT NOT NULL REFERENCES worlds(id), actor TEXT NOT NULL, request_id TEXT NOT NULL,
            digest TEXT NOT NULL, receipt TEXT NOT NULL, PRIMARY KEY(world_id,actor,request_id));
          CREATE TABLE outbox(world_id TEXT NOT NULL REFERENCES worlds(id), revision INTEGER NOT NULL, payload TEXT NOT NULL,
            PRIMARY KEY(world_id,revision));
          PRAGMA user_version=2; COMMIT;`);
      }
      this.#db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
      // Opening a new authority fences older live instances of THIS database, not just old client packets.
      this.#db.prepare('INSERT INTO authority(id,epoch) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET epoch=excluded.epoch').run(this.epoch);
    }catch(error){this.#db.close();throw error;}
  }
  #requireOwner(){
    requireThat(!this.#closed,'STORE_CLOSED','Campaign database is closed');
    requireThat(this.#db.prepare('SELECT epoch FROM authority WHERE id=1').get()?.epoch===this.epoch,
      'AUTHORITY_REPLACED','A newer authority owns this database; stop this instance');
  }
  #transaction(fn){
    requireThat(!this.#closed,'STORE_CLOSED','Campaign database is closed');
    this.#db.exec('BEGIN IMMEDIATE');
    try{this.#requireOwner();const result=fn();this.#db.exec('COMMIT');return result;}catch(error){this.#db.exec('ROLLBACK');throw error;}
  }
  #compatible(world){requireThat(this.#rules.acceptsLock(world.rules),'RULESET_MISMATCH','World needs its original rules or an explicit migration');this.#rules.validateWorld(world);return world;}
  create(state){
    const world=this.#compatible(validateCampaignWorld(state));
    requireThat(world.revision===0,'INVALID_WORLD','New world must start at revision zero');
    return this.#transaction(()=>{
      requireThat(!this.#db.prepare('SELECT id FROM worlds WHERE id=?').get(world.id),'WORLD_EXISTS','Cannot overwrite an existing world');
      this.#db.prepare('INSERT INTO worlds VALUES(?,?,?)').run(world.id,world.revision,canonicalJSON(world));return world;
    });
  }
  read(id){
    identifier(id);this.#requireOwner();
    const row=this.#db.prepare('SELECT revision,state FROM worlds WHERE id=?').get(id);
    requireThat(row,'WORLD_NOT_FOUND','World not found');const stored=JSON.parse(row.state);requireThat(!isNativeDevelopmentWorld(stored),'WORLD_RUNTIME_MISMATCH','Use the explicit native development host, not reference rules');const world=this.#compatible(validateCampaignWorld(stored));
    requireThat(row.revision===world.revision,'CORRUPT_SAVE','Stored revisions disagree');return world;
  }
  execute(principal,input){
    const command=validateCommand(input);
    const digest=createHash('sha256').update(canonicalJSON({type:command.type,payload:command.payload,expected:command.expected})).digest('hex');
    return this.#transaction(()=>{
      const current=this.read(command.worldId),actor=authorizePrincipal(current,principal),actorKey=actor.kind+':'+actor.id;
      const old=this.#db.prepare('SELECT digest,receipt FROM receipts WHERE world_id=? AND actor=? AND request_id=?').get(current.id,actorKey,command.requestId);
      if(old){requireThat(old.digest===digest,'REQUEST_REUSED','Request ID was reused for a different command');return immutableJSON(JSON.parse(old.receipt));}
      requireThat(command.epoch===this.epoch,'STALE_AUTHORITY','Reconnect before submitting a new command');
      const plan=planCampaignCommand(current,command,actor,this.#rules);
      const receipt=immutableJSON({worldId:current.id,requestId:command.requestId,revision:plan.world.revision,result:plan.result});
      const saved=this.#db.prepare('UPDATE worlds SET revision=?,state=? WHERE id=? AND revision=?').run(plan.world.revision,canonicalJSON(plan.world),current.id,current.revision);
      requireThat(saved.changes===1,'VERSION_CONFLICT','World changed during commit');
      this.#db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(current.id,actorKey,command.requestId,digest,canonicalJSON(receipt));
      this.#db.prepare('INSERT INTO outbox VALUES(?,?,?)').run(current.id,plan.world.revision,canonicalJSON(plan.events));
      return receipt;
    });
  }
  eventsSince(worldId,revision,limit=100){
    this.read(worldId);integer(revision,'event cursor');integer(limit,'event limit',1);requireThat(limit<=1000,'QUERY_LIMIT','Event limit too large');
    const rows=this.#db.prepare('SELECT revision,payload FROM outbox WHERE world_id=? AND revision>? ORDER BY revision LIMIT ?').all(worldId,revision,limit);
    return immutableJSON(rows.map(row=>({revision:row.revision,events:JSON.parse(row.payload)})));
  }
  #requireNativeDevelopment(){requireThat(this.#nativeDevelopment,'NATIVE_RUNTIME_DISABLED','Incomplete native runtime requires an explicit development host');}
  #forgetNativeWorld(id){this.#nativeWorlds.delete(id);this.#nativeScenes.delete(id);}
  #retainNativeWorld(state){
    this.#nativeWorlds.delete(state.id);
    while(this.#nativeWorlds.size>=2)this.#forgetNativeWorld(this.#nativeWorlds.keys().next().value);
    this.#nativeWorlds.set(state.id,{state,revision:state.revision,at:performance.now()});return state;
  }
  #readNativeDevelopment(id){
    this.#requireNativeDevelopment();identifier(id);this.#requireOwner();requireThat(!this.#nativeMutation,'NATIVE_OPERATION_ACTIVE','Cannot observe an uncommitted native operation');
    const row=this.#db.prepare('SELECT revision FROM worlds WHERE id=?').get(id);requireThat(row,'WORLD_NOT_FOUND','World not found');const now=performance.now();
    for(const [key,entry]of this.#nativeWorlds)if(now-entry.at>60000)this.#forgetNativeWorld(key);
    const cached=this.#nativeWorlds.get(id);
    if(cached&&cached.revision===row.revision&&cached.state.revision===row.revision){this.#nativeWorlds.delete(id);cached.at=now;this.#nativeWorlds.set(id,cached);return cached.state;}
    // Decode only once per active world, not once per query, command and scene view.
    const stored=JSON.parse(this.#db.prepare('SELECT state FROM worlds WHERE id=?').get(id).state);
    requireThat(isNativeDevelopmentWorld(stored),'WORLD_RUNTIME_MISMATCH','This world belongs to the reference runtime');const state=restoreNativeDevelopmentWorld(stored);requireThat(row.revision===state.revision,'CORRUPT_SAVE','Stored native revisions disagree');return this.#retainNativeWorld(state);
  }
  #recoverNativeWorld(id){
    // Runtime operations can poison themselves or partially mutate a cyclic graph before
    // throwing. SQL rollback alone is insufficient; never reuse that in-memory instance.
    this.#nativeWorlds.delete(id);const scene=this.#nativeScenes.get(id);
    try{const state=this.#readNativeDevelopment(id);if(scene){scene.presentation.restoreCommittedState(state);scene.revision=state.revision;scene.at=performance.now();}}
    catch{this.#forgetNativeWorld(id);} // Preserve the original failure, not a recovery exception.
  }
  #projectNative(id,project){
    const state=this.#readNativeDevelopment(id);
    try{return project(state);}catch(error){if(error.code!=='FORBIDDEN')this.#recoverNativeWorld(id);throw error;}
  }
  createNativeDevelopment(input){
    this.#requireNativeDevelopment();const {state,envelope}=createNativeDevelopmentWorld(input);
    requireThat(!this.#nativeMutation,'NATIVE_OPERATION_ACTIVE','Cannot create a world during a native operation');
    const result=this.#transaction(()=>{requireThat(!this.#db.prepare('SELECT id FROM worlds WHERE id=?').get(state.id),'WORLD_EXISTS','Cannot overwrite an existing world');this.#db.prepare('INSERT INTO worlds VALUES(?,?,?)').run(state.id,0,JSON.stringify(envelope));return nativeDevelopmentSummary(state);});this.#retainNativeWorld(state);return result;
  }
  nativeDevelopmentStatus(id){return this.#projectNative(id,nativeDevelopmentSummary);}
  projectNativeDevelopmentPlayer(id,playerId){return this.#projectNative(id,state=>projectNativeDevelopmentPlayer(state,playerId));}
  projectNativeDevelopmentObservations(worldId,playerId,input){
    requireThat(input&&Object.getPrototypeOf(input)===Object.prototype&&Object.keys(input).every(k=>['worldId','epoch','observerDataRef'].includes(k)),'INVALID_REQUEST','Only native observation fields are accepted');requireThat(input.worldId===worldId,'FORBIDDEN','Wrong world');requireThat(input.epoch===this.epoch,'STALE_AUTHORITY','Reconnect before reading native observations');return this.#projectNative(worldId,state=>immutableJSON({...projectNativeDevelopmentObservations(state,playerId,input.observerDataRef),epoch:this.epoch}));
  }
  projectNativeDevelopmentScene(worldId,playerId,input){
    this.#requireNativeDevelopment();identifier(worldId);this.#requireOwner();validateNativeSceneRequest(input);requireThat(input.worldId===worldId,'FORBIDDEN','Wrong world');requireThat(input.epoch===this.epoch,'STALE_AUTHORITY','Reconnect before reading native scene');
    const state=this.#readNativeDevelopment(worldId),now=performance.now();
    for(const [id,entry] of this.#nativeScenes)if(now-entry.at>60000)this.#nativeScenes.delete(id);
    let cached=this.#nativeScenes.get(worldId);
    try{
      if(!cached){while(this.#nativeScenes.size>=2)this.#nativeScenes.delete(this.#nativeScenes.keys().next().value);cached={revision:state.revision,at:now,presentation:new NativeScenePresentation(state)};this.#nativeScenes.set(worldId,cached);}
      else if(cached.revision!==state.revision){cached.presentation.replaceState(state);cached.revision=state.revision;}
      cached.at=now;return immutableJSON({...cached.presentation.frame(playerId,input,now),epoch:this.epoch});
    }catch(error){if(error.code!=='FORBIDDEN')this.#recoverNativeWorld(worldId);throw error;}
  }
  /** Trusted backup/debug path only; not exposed in CampaignService or the HTTP gateway. */
  nativeDevelopmentCheckpoint(id){return this.#projectNative(id,state=>state.runtime.checkpoint());}
  executeNativeDevelopment(principal,input){
    this.#requireNativeDevelopment();const command=validateNativeDevelopmentCommand(input),digest=createHash('sha256').update(canonicalJSON({type:command.type,payload:command.payload,expectedRevision:command.expectedRevision})).digest('hex');
    requireThat(!this.#nativeMutation,'NATIVE_OPERATION_ACTIVE','Native writes must be serial');let changed=null;
    try{const receipt=this.#transaction(()=>{
      const current=this.#readNativeDevelopment(command.worldId),actor=authorizeNativeDevelopmentPrincipal(current,principal),actorKey=actor.kind+':'+actor.id;
      const old=this.#db.prepare('SELECT digest,receipt FROM receipts WHERE world_id=? AND actor=? AND request_id=?').get(current.id,actorKey,command.requestId);
      if(old){requireThat(old.digest===digest,'REQUEST_REUSED','Request ID was reused for a different native command');return immutableJSON(JSON.parse(old.receipt));}
      requireThat(command.epoch===this.epoch,'STALE_AUTHORITY','Reconnect before submitting a new command');
      requireThat(command.expectedRevision===current.revision,'VERSION_CONFLICT','Native world changed');
      if(actor.kind==='player')requireThat(current.controllers.find(c=>c.playerId===actor.id).fleetDataRefs.includes(command.payload.dataRef),'FORBIDDEN','Fleet is not controlled by this player');
      // Keep the running graph on success. An exception invalidates it after SQL rollback.
      changed=current;this.#nativeMutation=true;
      const plan=applyNativeDevelopmentCommand(current,actor,command);integer(current.revision+1,'next native revision');const previousRevision=current.revision;current.revision++;
      const envelope=nativeDevelopmentEnvelope(current),receipt=immutableJSON({worldId:current.id,requestId:command.requestId,revision:current.revision,result:plan.result});
      const saved=this.#db.prepare('UPDATE worlds SET revision=?,state=? WHERE id=? AND revision=?').run(current.revision,JSON.stringify(envelope),current.id,previousRevision);requireThat(saved.changes===1,'VERSION_CONFLICT','Native world changed during commit');
      this.#db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(current.id,actorKey,command.requestId,digest,canonicalJSON(receipt));this.#db.prepare('INSERT INTO outbox VALUES(?,?,?)').run(current.id,current.revision,canonicalJSON(plan.events));return receipt;
    });this.#nativeMutation=false;if(changed)this.#retainNativeWorld(changed);return receipt;
    }catch(error){this.#nativeMutation=false;if(changed)this.#recoverNativeWorld(changed.id);throw error;}
  }
  /** Trusted owning-thread API only. No Worker RPC or public HTTP tick until real services are complete. */
  advanceNativeDevelopmentFrame(input,prepare){
    this.#requireNativeDevelopment();const frame=validateNativeDevelopmentFrame(input);
    const identity={...frame};delete identity.epoch;const digest=createHash('sha256').update(canonicalJSON({type:'native.world.frame',...identity})).digest('hex');
    requireThat(!this.#nativeMutation,'NATIVE_OPERATION_ACTIVE','Native writes must be serial');let changed=null;
    try{const receipt=this.#transaction(()=>{
      const current=this.#readNativeDevelopment(frame.worldId),actorKey='system:native-world-frame';
      const old=this.#db.prepare('SELECT digest,receipt FROM receipts WHERE world_id=? AND actor=? AND request_id=?').get(current.id,actorKey,frame.requestId);
      if(old){requireThat(old.digest===digest,'REQUEST_REUSED','Frame request ID was reused');return immutableJSON(JSON.parse(old.receipt));}
      requireThat(frame.epoch===this.epoch,'STALE_AUTHORITY','Reconnect before advancing a frame');
      requireThat(frame.expectedRevision===current.revision,'VERSION_CONFLICT','Native world changed');
      requireNativeDevelopmentFrame(current,frame);
      requireThat(typeof prepare==='function','NATIVE_WORLD_FRAME_UNAVAILABLE','Actual host frame dependency factory required');
      integer(current.revision+1,'next native revision');changed=current;this.#nativeMutation=true;
      const plan=advanceNativeDevelopmentFrame(current,frame,prepare),previousRevision=current.revision;current.revision++;
      const envelope=nativeDevelopmentEnvelope(current),receipt=immutableJSON({worldId:current.id,requestId:frame.requestId,revision:current.revision,result:plan.result});
      const saved=this.#db.prepare('UPDATE worlds SET revision=?,state=? WHERE id=? AND revision=?').run(current.revision,JSON.stringify(envelope),current.id,previousRevision);
      requireThat(saved.changes===1,'VERSION_CONFLICT','Native world changed during frame commit');
      this.#db.prepare('INSERT INTO receipts VALUES(?,?,?,?,?)').run(current.id,actorKey,frame.requestId,digest,canonicalJSON(receipt));
      this.#db.prepare('INSERT INTO outbox VALUES(?,?,?)').run(current.id,current.revision,canonicalJSON(plan.events));return receipt;
    });this.#nativeMutation=false;if(changed)this.#retainNativeWorld(changed);return receipt;
    }catch(error){this.#nativeMutation=false;if(changed)this.#recoverNativeWorld(changed.id);throw error;}
  }
  /** Session identity is supplied by the authenticated gateway, never by the cursor body. */
  projectNativeDevelopmentFrameEvents(worldId,playerId,input){
    const request=validateNativeFrameEventsRequest(input);requireThat(request.worldId===worldId,'FORBIDDEN','Wrong world');requireThat(request.epoch===this.epoch,'STALE_AUTHORITY','Reconnect before reading native frame events');
    const state=this.#readNativeDevelopment(worldId);requireThat(state.controllers.some(c=>c.playerId===playerId),'FORBIDDEN','No native controller for session');requireThat(request.afterRevision<=state.revision,'INVALID_REQUEST','Frame event cursor is ahead of world');
    const batches=this.#db.prepare('SELECT revision,payload FROM outbox WHERE world_id=? AND revision>? AND revision<=? ORDER BY revision LIMIT ?').all(worldId,request.afterRevision,state.revision,request.limit).map(row=>({revision:row.revision,events:JSON.parse(row.payload)}));
    return immutableJSON({...projectNativeFrameEventBatches(state,playerId,request,batches),epoch:this.epoch});
  }
  /** Trusted host/debug outbox only; never expose this unfiltered stream over HTTP. */
  nativeDevelopmentEventsSince(worldId,revision,limit=100){
    this.#readNativeDevelopment(worldId);integer(revision,'event cursor');integer(limit,'event limit',1);requireThat(limit<=1000,'QUERY_LIMIT','Event limit too large');return immutableJSON(this.#db.prepare('SELECT revision,payload FROM outbox WHERE world_id=? AND revision>? ORDER BY revision LIMIT ?').all(worldId,revision,limit).map(row=>({revision:row.revision,events:JSON.parse(row.payload)})));
  }
  close(){if(!this.#closed){this.#nativeScenes.clear();this.#nativeWorlds.clear();this.#db.close();this.#closed=true;}}
}
