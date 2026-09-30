/** Isolated production-bundled room control; no user browser/server or saved settings. */
import {captureFrozenBattleStyles} from './lib/frozen-battle-styles.mjs';
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {createRequire} from 'node:module';import {build} from 'esbuild';
const root=path.resolve('artifacts/lan-sampled-autofire-20260929'),out=root+'/ui';fs.mkdirSync(out,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_PACKAGE||'C:/Users/Aca/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const snap=JSON.parse(fs.readFileSync(root+'/frozen-after.json')),sources=new Map(snap.files.map(r=>[path.resolve(r.file).toLowerCase(),r.code]));
await build({stdin:{loader:'tsx',resolveDir:process.cwd(),contents:`import React from 'react';import{createRoot}from'react-dom/client';import{LanRoomTools}from'./src/network/LanRoomTools';import './src/network/lan.css';
const root=createRoot(document.getElementById('root')!);(window as any).ruleEvents=[];(window as any).showRule=(guest=false,status='lobby',profile='standard')=>root.render(<LanRoomTools room={{hostId:'h',code:'TEST',status,capacity:2,members:[{id:'h',team:0},{id:'g',team:1}],options:{battleSize:3200,aiHulls:[[],[]],assignment:'teams',aiDecisionProfile:profile}} as any} id={guest?'g':'h'} addresses={[]} send={m=>(window as any).ruleEvents.push(m)} />);(window as any).showRule();`},outfile:out+'/app.js',bundle:true,external:['/game-assets/*','/content/*'],format:'esm',platform:'browser',jsx:'automatic',minify:true,logLevel:'silent',define:{__LAN_BUILD_ID__:'"decision-ui"','process.env.NODE_ENV':'"production"','import.meta.env':JSON.stringify({BASE_URL:'/',DEV:false,PROD:true})},plugins:[{name:'frozen-src',setup(b){b.onLoad({filter:/\.(?:[cm]?[jt]sx?|json)$/},args=>{const code=sources.get(args.path.toLowerCase());if(code===undefined)return;return{contents:code,loader:path.extname(args.path).slice(1).replace(/^[cm]([jt]s)$/,'$1')};});}}]});
await captureFrozenBattleStyles(out);
const assets=new Map(JSON.parse(fs.readFileSync(root+'/assets.json')).map(r=>['/'+path.relative('public',r.file).replaceAll('\\','/'),r.snapshot]));
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost'),key=url.pathname;let file;if(key==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/frozen-battle.css"><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>');return;}if(key==='/app.js'||key==='/app.css'||key==='/frozen-battle.css')file=out+key;else file=assets.get(key);if(!file||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',key.endsWith('.js')?'text/javascript':key.endsWith('.css')?'text/css':key.endsWith('.json')?'application/json':'application/octet-stream');res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('button',{name:'房间设置',exact:true}).click();
 const select=page.getByRole('combobox',{name:'AI 决策规则',exact:true});await select.waitFor();assert.equal(await select.inputValue(),'standard');assert.ok(await select.isEnabled());
 await select.selectOption('large-battle-v3');assert.deepEqual(await page.evaluate(()=>window.ruleEvents),[{type:'options',options:{aiDecisionProfile:'large-battle-v3'}}]);
 await page.evaluate(()=>window.showRule(false,'lobby','large-battle-v3'));await page.waitForFunction(()=>document.querySelector('[aria-label="AI 决策规则"]').value==='large-battle-v3');
 await page.screenshot({path:out+'/host-rule.png',fullPage:true});
 await page.evaluate(()=>window.showRule(true,'lobby','large-battle-v3'));await page.waitForFunction(()=>document.querySelector('[aria-label="AI 决策规则"]').disabled);assert.equal(await select.inputValue(),'large-battle-v3');
 await page.evaluate(()=>window.showRule(false,'running','large-battle-v3'));assert.ok(await select.isDisabled());assert.ok(await page.getByText('本局规则已锁定。',{exact:false}).count());
 await page.getByRole('button',{name:'返回',exact:true}).click();await select.waitFor({state:'hidden'});assert.deepEqual(errors,[]);
 const result={passed:['production-bundled actual room control','default standard','host emits selected rule','guest disabled','match locked','close returns'],scope:'Isolated component fixture, not a complete live multiplayer game',errors};fs.writeFileSync(root+'/ui-result.json',JSON.stringify(result,null,2));console.log(result);
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}


