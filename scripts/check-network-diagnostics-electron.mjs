import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
const require=createRequire(import.meta.url), electron=require('electron');
await fs.mkdir(path.resolve('artifacts'),{recursive:true});
const dir=await fs.mkdtemp(path.resolve('artifacts/network-log-electron-'));
const harness=path.join(dir,'check.mjs');
const moduleUrl=pathToFileURL(path.resolve('desktop/network-log.mjs')).href;
await fs.writeFile(harness, `
import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { DesktopNetworkLog, attachDesktopNetworkLog } from ${JSON.stringify(moduleUrl)};
const dir=${JSON.stringify(dir)};
app.setPath('userData',dir+'/profile');app.enableSandbox();
const server=createServer((q,s)=>{
  if(q.url==='/assets/log.js'){s.setHeader('content-type','text/javascript');s.end('window.emitMetric=record=>console.info("[network-performance-v1] "+JSON.stringify(record));');}
  else {s.setHeader('content-type','text/html');s.end('<!doctype html><title>Isolated log test</title><script src="/assets/log.js"></script>');}
});
let win;
async function run() {
try {
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  await app.whenReady();
  const origin='http://127.0.0.1:'+server.address().port;
  const log=new DesktopNetworkLog(dir+'/network-performance.jsonl');
  win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  attachDesktopNetworkLog(win.webContents,origin,log);
  await win.loadURL(origin+'/');
  const record={version:1,event:'sample',transport:'lan',hudAgeMs:10,hud:{hz:17,fps:60},token:'PRIVATE',monotonicMs:1000};
  const code='window.emitMetric('+JSON.stringify(record)+');';
  const inlineCode='console.info("[network-performance-v1] "+JSON.stringify('+JSON.stringify(record)+'));';
  await win.webContents.executeJavaScript(code);
  await log.flush();
  let rows=(await fs.readFile(log.file,'utf8')).trim().split('\\n').map(JSON.parse);
  assert.equal(rows.length,1);assert.equal(rows[0].hud.hz,17);assert.ok(!JSON.stringify(rows).includes('PRIVATE'));
  const iframeCode='new Promise(resolve=>{const f=document.createElement("iframe");f.srcdoc='+JSON.stringify('<script>'+inlineCode+'</script>')+';f.onload=()=>resolve(true);document.body.append(f);})';
  await win.webContents.executeJavaScript(iframeCode);
  await log.flush();rows=(await fs.readFile(log.file,'utf8')).trim().split('\\n').map(JSON.parse);assert.equal(rows.length,1);
  await win.loadURL(origin+'/not-game');await win.webContents.executeJavaScript(code);await log.flush();
  rows=(await fs.readFile(log.file,'utf8')).trim().split('\\n').map(JSON.parse);assert.equal(rows.length,1);
  await fs.writeFile(dir+'/result.json',JSON.stringify({ok:true,electron:process.versions.electron,checks:['sandboxed main-frame writes','private fields stripped','iframe rejected','non-game URL rejected']}));
  win.destroy();server.close();app.exit(0);
} catch(error) { console.error(error);win?.destroy();server.close();app.exit(1); }
}
void run();
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron,[harness],{env,stdio:'inherit',windowsHide:true});
const timer=setTimeout(()=>child.kill(),30000);
const code=await new Promise(resolve=>child.once('exit',resolve));clearTimeout(timer);
if(code!==0)throw Error('Isolated Electron log test failed: '+code);
console.log(await fs.readFile(path.join(dir,'result.json'),'utf8'));
