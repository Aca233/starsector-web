/** Reject reimported original UI pixels before dev/build/package. Never writes files. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const groups = ['ui','hud','warroom','cursors','icons','hullmods','factions'];
export function assertOriginalInterface(root) {
  const base=path.resolve(root,'public/game-assets');
  const provenance=JSON.parse(fs.readFileSync(path.join(root,'public/ui-artwork-provenance.json'),'utf8'));
  const approved=new Map(provenance.records.map(r=>[r.path,r]));
  const walk=dir=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
    if(e.isSymbolicLink())throw Error('UI artwork symlink not allowed');
    return e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)];
  }):[];
  const obsolete=walk(path.join(base,'graphics/fonts'));
  if(obsolete.length||fs.existsSync(path.join(base,'graphics/ui/starsector_title_alpha.png')))throw Error('Original fonts/title reintroduced; UI artwork policy rejected this build.');
  for(const group of groups)for(const file of walk(path.join(base,'graphics',group))){
    const name=path.relative(base,file).replaceAll('\\','/');
    if(name.includes('web_'))continue; // User-authored extension assets are not replaced.
    if(!approved.has(name))throw Error('Unreviewed interface artwork: '+name);
  }
  for(const [name,record]of approved){
    const file=path.resolve(base,name);
    if(!file.startsWith(base+path.sep))throw Error('UI artwork path escaped project');
    const data=fs.readFileSync(file);
    if(createHash('sha256').update(data).digest('hex')!==record.sha256)throw Error('UI artwork changed without provenance update: '+name);
  }
  return {approved:approved.size};
}
export function originalInterfacePlugin() {
  return {name:'original-interface-provenance',configResolved(config){assertOriginalInterface(config.root);}};
}
