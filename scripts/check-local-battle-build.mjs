import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {createLanServer} from '../server/lan-server.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');
const output=path.resolve(process.env.LOCAL_BUILD_SMOKE_OUT??'artifacts/network-stream-20260922/phase33/built-smoke.json');
const build=JSON.parse(fs.readFileSync('artifacts/local-latest-build.json'));const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
assert.ok(build.graphs?.worker.some(s=>s.file.replaceAll('\\','/').endsWith('/host.worker.ts')),'Host Worker must be fingerprinted, not just the renderer');
for(const s of build.watchedSources??[])assert.equal(sha(s.file),s.sha256,'Watched build input changed: '+s.file);
for(const s of build.sources)assert.equal(sha(s.file),s.sha256,'Source changed since build: '+s.file);
assert.ok(!build.sources.some(s=>/(^|[\\/])campaign([\\/.]|$)/i.test(s.file)),'Battle build must exclude career modules');
const server=await createLanServer({host:'127.0.0.1',port:0,dist:path.resolve('dist')});let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.server.address().port+'/');await page.getByRole('button',{name:'局域网联机',exact:true}).waitFor({timeout:30000});
 const backend=await page.evaluate(()=>fetch('/lan/info').then(r=>r.json()));assert.equal(backend.build,build.build);
 const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('src')));assert.ok(scripts.length>0);
 // LAN is code-split: the build constant belongs to its loaded dependency graph, not necessarily main.js.
 await page.goto('http://127.0.0.1:'+server.server.address().port+'/?view=lan');await page.getByRole('form',{name:'创建房间',exact:true}).waitFor({timeout:30000});
 const moduleUrls=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>r.name).filter(url=>new URL(url).origin===location.origin&&new URL(url).pathname.endsWith('.js')));
 const served=await page.evaluate(urls=>Promise.all(urls.map(async url=>(await fetch(url)).text())),moduleUrls);
 assert.ok(served.some(code=>code.includes(build.build)),'Actually loaded LAN frontend modules must carry this build ID');assert.deepEqual(errors,[]);
 const report={scope:'Compiled local battle frontend boot and build identity only; full multiplayer checked separately with frozen sources.',build:build.build,backendBuild:backend.build,title:await page.title(),body:await page.locator('body').innerText(),scripts,moduleUrls,errors};fs.writeFileSync(output,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();await server.close();}
