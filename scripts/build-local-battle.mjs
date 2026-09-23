/** Build local battle/desktop frontend only, never a release package. Default
 * output stays dist; isolated comparisons may name a NEW artifacts directory. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build,loadConfigFromFile} from 'vite';
import {createLocalBattleBuildAudit} from './lib/local-battle-build-audit.mjs';
import {frozenBrowserPlugin} from './lib/frozen-vite-sources.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),artifacts=path.join(root,'artifacts');
const output=path.resolve(root,process.env.LOCAL_BATTLE_OUT??'dist'),isolated=output!==path.join(root,'dist');
if(isolated&&!output.startsWith(artifacts+path.sep))throw Error('Isolated build output must stay within project artifacts');
if(isolated&&fs.existsSync(output))throw Error('Isolated build requires a new directory; never replace existing artifacts');
const manifestFile=isolated?path.join(output,'build-audit.json'):path.join(artifacts,'local-latest-build.json');
const frozenFile=process.env.LOCAL_BATTLE_FROZEN?path.resolve(process.env.LOCAL_BATTLE_FROZEN):null;
if(frozenFile&&!isolated)throw Error('Frozen experimental source must not replace the current local dist');
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const frozenRows=frozenFile?JSON.parse(fs.readFileSync(frozenFile,'utf8')).files:[];
const frozenMap=new Map(frozenRows.map(row=>[row.file.replaceAll('\\','/'),row]));
const serializerFlag=process.env.VITE_LAN_SERIALIZER_WORKER;
if(serializerFlag!==undefined&&!['true','false'].includes(serializerFlag))throw Error('Invalid serializer build flag');
fs.mkdirSync(artifacts,{recursive:true});
const loaded=await loadConfigFromFile({command:'build',mode:'production'},path.join(root,'vite.config.ts'));
if(!loaded)throw Error('Missing project build configuration');
const config=loaded.config;config.root=root;config.configFile=false;
if(serializerFlag!==undefined)config.define={...config.define,'import.meta.env.VITE_LAN_SERIALIZER_WORKER':JSON.stringify(serializerFlag)};
config.build={...config.build,outDir:output,emptyOutDir:false,rollupOptions:{...config.build?.rollupOptions,input:{main:path.join(root,'index.html')}}};
const audit=createLocalBattleBuildAudit(root);config.plugins.unshift(frozenBrowserPlugin(frozenFile));config.plugins.push(audit.plugin('main'));
const previousWorkers=config.worker?.plugins;
config.worker={...config.worker,plugins:()=>[frozenBrowserPlugin(frozenFile),...(previousWorkers?.()??[]),audit.plugin('worker')]};
await build(config);
const raw=audit.report();
// Virtual catalog/summary plugins read JSON themselves. Do not claim those raw
// reads were frozen by a source loader; require exact equality instead.
for(const row of [...raw.sources,...raw.watchedSources]){
 const saved=frozenMap.get(row.file.replaceAll('\\','/'));
 if(saved&&row.file.endsWith('.json')&&saved.sha256!==row.sha256)throw Error('Generated JSON input drifted from frozen build: '+row.file);
}
const captured=rows=>rows.map(row=>{const saved=frozenMap.get(row.file.replaceAll('\\','/'));return saved?{...row,sha256:saved.sha256,captured:true}:row;});
const sources=captured(raw.sources),graphs=Object.fromEntries(Object.entries(raw.graphs).map(([graph,rows])=>[graph,captured(rows)]));
if(!graphs.worker.some(s=>s.file.replaceAll('\\','/').endsWith('/host.worker.ts')))throw Error('Host Worker dependency graph not audited');
if(!sources.length)throw Error('No build inputs recorded');
const outputFiles=[];
const recordAssets=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())recordAssets(file);else if(/\.(js|css)$/.test(file))outputFiles.push({file:path.relative(output,file).replaceAll('\\','/'),sha256:sha(file)});}};
recordAssets(path.join(output,'assets'));
const report={at:new Date().toISOString(),scope:isolated?'Isolated compiled battle comparison; not installed/released. Captured source used in main and nested Workers.':'Local current battle/desktop entry only; not a release. Prior output assets retained.',output:path.relative(root,output),frozen:frozenFile?{file:path.relative(root,frozenFile),sha256:sha(frozenFile)}:null,serializerWorker:serializerFlag===undefined?null:serializerFlag==='true',build:JSON.parse(fs.readFileSync(path.join(output,'lan-build.json'),'utf8')).build,indexSha256:sha(path.join(output,'index.html')),sources,graphs,watchedSources:raw.watchedSources,outputFiles};
fs.writeFileSync(manifestFile,JSON.stringify(report,null,2));
console.log(isolated?'ISOLATED BATTLE BUILD':'LATEST LOCAL BUILD',report.build,'modules',sources.length,'manifest',manifestFile);
