import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import {createServer} from 'vite';
import {createServer as netServer} from 'node:net';
let chromium;try{({chromium}=createRequire(import.meta.url)('playwright'));}catch{({chromium}=createRequire('C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json')('playwright'));}
const complete=process.argv.includes('--complete');
const armory=process.argv.includes('--armory');
const out=complete?'artifacts/rocinante/complete-implementation':armory?'artifacts/rocinante/armory-implementation':'artifacts/rocinante/control-implementation';await fs.mkdir(out,{recursive:true});
const probe=netServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const server=await createServer({server:{host:'127.0.0.1',port,strictPort:true,open:false},logLevel:'error'});let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/__roci_controls.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Background rule verification</title>'}));
 await page.goto(`http://127.0.0.1:${port}/__roci_controls.html`);
 const main=await page.evaluate(async mode=>{if(mode==='complete'){const {runRocinanteCompleteScenarios}=await import('/scripts/rocinante-complete-scenarios.mjs');return runRocinanteCompleteScenarios();}if(mode==='armory'){const {runRocinanteArmoryScenarios}=await import('/scripts/rocinante-armory-scenarios.mjs');return runRocinanteArmoryScenarios();}const {runRocinanteControlScenarios}=await import('/scripts/rocinante-control-scenarios.mjs');return runRocinanteControlScenarios();},complete?'complete':armory?'armory':'run');
 await fs.writeFile(`${out}/main-result.json`,JSON.stringify(main,null,2));
 const worker=await page.evaluate(mode=>new Promise((resolve,reject)=>{
   const w=new Worker('/scripts/rocinante-control-worker.mjs',{type:'module'});
   const cleanup=()=>{clearTimeout(timer);w.terminate();};
   const timer=setTimeout(()=>{cleanup();reject(Error('Worker rule check timed out'));},90000);
   w.onmessage=({data})=>{cleanup();if(data.error)reject(Error(data.error));else resolve(data.result);};w.onerror=e=>{cleanup();reject(Error(e.message));};w.postMessage(mode);
 }),complete?'complete':armory?'armory':'run');
 assert.equal(errors.length,0,errors.join('\n'));assert.deepEqual(worker.checks,main.checks);
 const result={main,worker,pageErrors:errors,isolatedPort:port,workerScope:complete?'Registered ship, real authority in dedicated Worker, no multiplayer':armory?'Actual dedicated Worker executes R3 weapon/flight rules. No presentation art, full data-command protocol or multiplayer.':'Actual dedicated Worker runs production rules and projection. Not the full data-command protocol or multiplayer.'};
 await fs.writeFile(`${out}/check-result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({mainChecks:main.checks.length,workerChecks:worker.checks.length,pageErrors:errors},null,2));
}finally{await browser?.close();await server.close();}
