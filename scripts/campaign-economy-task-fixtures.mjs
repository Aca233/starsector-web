/** Mutable test world for task-call ordering; task algorithms themselves live in the implementation/original Java. */
export function taskFixture(config) {
  const trace=[],markets=new Map(config.markets.map(m=>[m.id,{...m}])),reach=config.markets.map(m=>m.id),economy=[...reach];
  const listeners=new Map(config.listeners.map(l=>[l.id,{...l}])),listenerRoster=[...(config.listenerRoster??config.listeners.map(l=>l.id))],counts=new Map();
  const removeOne=(list,id)=>{const i=list.indexOf(id);if(i>=0)list.splice(i,1);};
  function emit(event){trace.push(event);const count=(counts.get(event)??0)+1;counts.set(event,count);for(const a of config.actions??[]){if(a.trigger!==event||a.occurrence!==count)continue;
    if(a.type==='add-market'){markets.set(a.id,{id:a.id,econGroup:a.group});if(!reach.includes(a.id))reach.push(a.id);if(!economy.includes(a.id))economy.push(a.id);}
    else if(a.type==='remove-market'){removeOne(reach,a.id);removeOne(economy,a.id);}
    else if(a.type==='group')markets.get(a.id).econGroup=a.group;
    else if(a.type==='add-listener'){if(!listeners.has(a.id))listeners.set(a.id,{id:a.id,expired:false});listenerRoster.push(a.id);}
    else if(a.type==='remove-listener')removeOne(listenerRoster,a.id);
    else if(a.type==='expire')listeners.get(a.id).expired=true;
    else throw Error('Unknown test action '+a.type);
  }}
  const runtime={
    listReachMarkets:()=>reach,listEconomyMarkets:()=>economy,getCommoditySpecs:()=>config.specs,getMarketEconGroup:id=>markets.get(id).econGroup,
    refreshCharacterEffects:id=>emit('character:'+id),refreshGovernedOutpostEffects:id=>emit('governed:'+id),
    reapplyConditions:id=>emit('conditions:'+id),reapplyIndustries:id=>emit('industries:'+id),
    computeCommodityData:(id,group)=>emit('network:'+id+':'+group+':'+economy.filter(m=>markets.get(m).econGroup===group).join(',')),
    updateStockpileAndPrice:(m,c)=>emit('stockpile:'+m+':'+c),advanceImmigration:(m,days,ui)=>emit('immigration:'+m+':'+days+':'+ui),
    listUpdateListeners:()=>listenerRoster,isEconomyListenerExpired:id=>{const b=listeners.get(id).expired;emit('expired:'+id+':'+b);return b;},
    removeUpdateListener:id=>{emit('removeListener:'+id);removeOne(listenerRoster,id);},commodityUpdated:(l,c)=>emit('commodity:'+l+':'+c),economyUpdated:l=>emit('finish:'+l),
  };
  return {runtime,trace,markets,reach,economy,listeners,listenerRoster};
}
export const forced = (params={})=>({mode:'forced',params:{withIncomeAndUpkeep:true,withStockpileUpdate:true,forceNonUIStep:false,withImmigration:true,...params}});
export function taskConfig(){return {markets:[{id:'a',econGroup:null},{id:'b',econGroup:'private'}],listeners:[{id:'first',expired:false},{id:'second',expired:false}],specs:[{id:'fuel',economyTier:2,tags:[]},{id:'food',economyTier:1,tags:[]},{id:'ore',economyTier:1,tags:[]},{id:'ships',economyTier:3,tags:['meta']},{id:'credits',economyTier:0,tags:['nonecon']}],actions:[]};}
