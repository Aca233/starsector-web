// Share one audit across Vite's main AND separately bundled Worker graphs.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export function createLocalBattleBuildAudit(root){
 root=path.resolve(root);const graphs={main:new Set(),worker:new Set()},watched=new Set();
 const campaign=id=>/(^|[\\/])campaign([\\/.]|$)/i.test(id);
 const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 return {plugin(graph){if(!graphs[graph])throw Error('Unknown battle build graph');return {name:'local-battle-'+graph+'-audit',generateBundle(){for(const id of this.getModuleIds()){if(id.startsWith('\0'))continue;if(campaign(id))throw Error('Campaign module in local '+graph+' battle build: '+id);graphs[graph].add(id);}for(const file of this.getWatchFiles?.()??[])watched.add(file);}};},report(){
  const moduleIds=[...new Set([...graphs.main,...graphs.worker])];
  const records=ids=>[...new Set(ids.map(id=>path.resolve(id.split('?')[0])))].filter(file=>file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()).sort().map(file=>({file:path.relative(root,file),sha256:sha(file)}));
  return {sources:records(moduleIds),watchedSources:records([...watched]),graphs:Object.fromEntries(Object.entries(graphs).map(([key,ids])=>[key,records([...ids])]))};
 }};
}
