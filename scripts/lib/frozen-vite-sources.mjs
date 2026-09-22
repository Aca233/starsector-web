// Test-only immutable source graph for paired Vite runs during concurrent WIP.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
const sha=code=>crypto.createHash('sha256').update(code).digest('hex');
export function freezeBrowserSources(output){
 const files=[];const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory()){if(e.name!=='campaign')walk(file);}else if(/\.(?:[cm]?[jt]sx?|json)$/.test(e.name)){const code=fs.readFileSync(file,'utf8');files.push({file:path.relative(process.cwd(),file).replaceAll('\\','/'),code,sha256:sha(code)});}}};walk(path.resolve('src'));const snapshot={createdAt:new Date().toISOString(),files};fs.writeFileSync(output,JSON.stringify(snapshot));return{files:files.length,sha256:sha(fs.readFileSync(output))};
}
export function frozenBrowserPlugin(file){
 if(!file)return{name:'no-frozen-sources'};
 const snapshot=JSON.parse(fs.readFileSync(file,'utf8')),sources=new Map(snapshot.files.map(r=>[path.resolve(r.file).replaceAll('\\','/').toLowerCase(),r.code]));
 for(const row of snapshot.files)if(sha(row.code)!==row.sha256)throw Error('Frozen source checksum failed: '+row.file);
 return{name:'frozen-browser-sources',enforce:'pre',load(id){
 const [file,query='']=id.split('?'),code=sources.get(file.replaceAll('\\','/').toLowerCase());
 if(code===undefined)return null;
 const params=new URLSearchParams(query);
 // Preserve Vite resource semantics: raw imports are JavaScript string modules,
 // not the source text parsed as code. Worker/URL wrappers belong to Vite; their
 // underlying worker graph loads the frozen source through its own plugin.
 if(params.has('raw'))return 'export default '+JSON.stringify(code)+';';
 if(params.has('url')||params.has('worker')||params.has('sharedworker'))return null;
 return code;
}};
}
