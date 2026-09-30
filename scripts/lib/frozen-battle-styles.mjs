import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import tailwind from '@tailwindcss/vite';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Compile the SAME three full stylesheets as the real multiplayer fixture once.
 * Serve these immutable bytes in every paired arm; do not compile live styles
 * again while unrelated UI work is in progress. No browser or production build. */
export async function captureFrozenBattleStyles(directory){
 const root=path.resolve(directory);await fs.mkdir(root,{recursive:true});
 const files=['src/index.css','src/network/lan.css','src/ui/core/motion.css'];
 const server=await createServer({configFile:false,root:process.cwd(),optimizeDeps:{noDiscovery:true,entries:[],include:[]},plugins:tailwind(),server:{host:'127.0.0.1',port:0,open:false,watch:null},logLevel:'error'});
 const parts=[];
 try{
  await server.listen();const origin='http://127.0.0.1:'+server.httpServer.address().port;
  for(const file of files){
   const response=await fetch(origin+'/'+file+'?direct');assert.equal(response.status,200,file);
   assert.match(response.headers.get('content-type')??'',/text\/css/);
   const css=await response.text();assert.ok(css.trim());
   assert.ok(!css.includes(origin),'Captured CSS must not point at the temporary server');
   parts.push({file,css,sourceSha256:sha(await fs.readFile(file)),compiledSha256:sha(css)});
  }
 }finally{await server.close();}
 const css=parts.map(p=>`/* Frozen full stylesheet: ${p.file} */\n${p.css}`).join('\n');
 const output=path.join(root,'frozen-battle.css');await fs.writeFile(output,css);
 const manifest={path:output,sha256:sha(css),bytes:Buffer.byteLength(css),parts:parts.map(({css:_css,...p})=>p),scope:'Exact full Vite CSS outputs, in the same index/lan/motion cascade order. No selector pruning or graphical-setting change. No live CSS recompilation during paired runs.'};
 await fs.writeFile(path.join(root,'frozen-battle-styles.json'),JSON.stringify(manifest,null,2));return manifest;
}
