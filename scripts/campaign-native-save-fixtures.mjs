const escape = value => String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const tag = (name, attributes = {}, body = '') => '<'+name+Object.entries(attributes).map(([k,v])=>' '+k+'="'+escape(v)+'"').join('')+'>'+body+'</'+name+'>';
export function nativeSaveFixture() {
 let uid=1000; const next=()=>String(uid++);
 const scalar=(name,value)=>tag(name,{},escape(value));
 const stat=(base='0.0',modified='0.0',body='')=>tag('g',{z:next(),b:base,m:modified},body);
 const bonus=name=>tag(name,{z:next(),fB:'0.0',m:'1.0',pM:'0.0',nR:'false'});
 const ids={};
 function market(ref,id){
  const demandRef=next();ids[id]={market:ref,demand:demandRef};
  const owner=()=>tag('m',{ref});
  const demand=tag('demand',{z:demandRef,dC:'luxury_goods'},owner()+stat('0.1','9999').replaceAll('<g','<d').replaceAll('</g>','</d>'));
  const commodity=c=>tag('COMkt',{z:next(),c,sto:'123.75',mS:'2',mD:'5',iSL:'true',iDL:'false',eU:'0.0'},owner()+tag('d',{ref:demandRef})+stat()+bonus('pDM')+bonus('pSM')+
   tag('available',{z:next(),b:'0.0',m:'4.0'},tag('fMs',{z:next(),s:'core_base',v:'5.0'})+tag('fMs',{z:next(),s:'event',v:'-1.0'})+tag('tM',{z:next()},tag('e',{},scalar('st','event')+tag('WTMTSM',{z:next(),tR:'-0.25',s:'event'}))))+
   ['tradeMod','tradeModPlus','tradeModMinus'].map(name=>stat().replaceAll('<g','<'+name).replaceAll('</g>','</'+name+'>')).join(''));
  return tag('Market',{z:ref},scalar('id',id)+scalar('name',id+' & <test>')+tag('commodities',{z:next()},commodity('luxury_goods')+commodity('lobster'))+tag('demandData',{z:next()},demand+tag('market',{ref}))+scalar('size',4)+scalar('location','0.1|-20.5')+scalar('factionId','independent')+scalar('playerOwned','false')+scalar('isFreePort','false')+
   ['hazard','incomeMult','upkeepMult'].map(name=>stat('1.0','1.0').replaceAll('<g','<'+name).replaceAll('</g>','</'+name+'>')).join('')+['accessibilityMod','demandPriceMod','supplyPriceMod'].map(bonus).join('')+
   tag('suppressedConditions',{z:next()},scalar('st','habitable'))+tag('conditions',{z:next()},tag('MCon',{z:next(),i:'habitable',u:'unique',s:'true'},owner()))+
   tag('industries',{z:next()},tag('PopulationAndInfrastructure',{z:next(),id:'population',bP:'0.0',b:'false',wD:'false'},owner()+scalar('buildTime','1.0')+stat().replaceAll('<g','<dR').replaceAll('</g>','</dR>')+stat('1.0','1.0').replaceAll('<g','<sB').replaceAll('</g>','</sB>'))));
 }
 const markets=market('10','a')+market('20','b');
 const economy=tag('Economy',{z:'2'},tag('econ',{z:'3'},tag('markets',{z:'4'},tag('Market',{ref:'20'})+tag('Market',{ref:'10'})))+tag('stepper',{z:'5'},tag('econ',{ref:'3'})+tag('tasks',{z:'6'})+scalar('state','WAITING')+scalar('elapsed','1.5')+scalar('untilNext','3.0')+scalar('iterLeft','2')+scalar('prevMonth','7')));
 const campaign='<?xml version="1.0"?>'+tag('CampaignEngine',{z:'1'},tag('economy',{ref:'2'})+tag('clock',{z:'7'},scalar('secondsPerDay','10.0')+scalar('timestamp','-55648769512000'))+tag('pool',{},markets+economy)+tag('playerFleet',{},scalar('private','DO_NOT_COPY_OR_EXECUTE')));
 const descriptor='<?xml version="1.0"?>'+tag('SaveGameData',{z:'1'},scalar('gameVersion','0.98a-RC8')+scalar('saveFileVersion','0.6')+scalar('compressed','false')+tag('enabledMods',{z:'2'}));
 return {campaign,descriptor,ids};
}
