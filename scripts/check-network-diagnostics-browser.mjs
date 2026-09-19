import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
const require=createRequire(import.meta.url);let playwright;
try { playwright=require(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch(error) { if(process.env.PLAYWRIGHT_MODULE)throw error;playwright=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const output=path.resolve('artifacts/network-diagnostics-20260919');fs.mkdirSync(output,{recursive:true});
const {createLanServer}=await import('../server/lan-server.mjs');
const bundled=await build({entryPoints:['src/network/NetworkDiagnosticLog.ts'],bundle:true,format:'iife',globalName:'diagnostics',platform:'browser',write:false,
  define:{__LAN_BUILD_ID__:JSON.stringify('2026-09-19T09:19:59.837Z'),'import.meta.env':JSON.stringify({BASE_URL:'/',DEV:false})},logLevel:'silent'});
const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE || (process.platform==='win32'?'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe':undefined)});
try {
  const page=await browser.newPage({acceptDownloads:true});const errors=[],lines=[];
  page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.text().startsWith('[network-performance-v1] '))lines.push(m.text());});
  await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated diagnostic export</title><button id="download">导出联机性能日志</button>'}));
  await page.goto('http://diagnostics.test');await page.addScriptTag({content:bundled.outputFiles[0].text});
  await page.evaluate(()=>{
    const battle=diagnostics.nextDiagnosticBattle();
    diagnostics.recordNetworkDiagnostic({event:'battle-start',transport:'lan',battle});
    diagnostics.recordNetworkDiagnostic({event:'sample',transport:'lan',battle,role:'guest',seat:1,hudAgeMs:10,hud:{hz:17,fps:60,bytes:328200},password:'PRIVATE'});
    diagnostics.recordNetworkDiagnostic({event:'disconnected',transport:'lan',reason:'PRIVATE'});
    diagnostics.recordNetworkDiagnostic({event:'battle-stop',transport:'lan',battle});
    document.querySelector('#download').onclick=()=>diagnostics.downloadNetworkDiagnostics();
  });
  const downloading=page.waitForEvent('download');await page.locator('#download').click();const download=await downloading;
  assert.match(download.suggestedFilename(),/^network-performance-.*\.jsonl$/);
  const file=path.join(output,'browser-export.jsonl');await download.saveAs(file);
  const text=fs.readFileSync(file,'utf8'),rows=text.trim().split('\n').map(JSON.parse);
  assert.equal(rows[0].records,4);assert.equal(rows[2].hud.hz,17);assert.equal(rows[3].event,'disconnected');
  assert.ok(!text.includes('PRIVATE'));assert.equal(lines.length,4);assert.deepEqual(errors,[]);
  const result={ok:true,browser:browser.version(),checks:['actual Blob download','disconnect history retained','17 Hz unchanged','privacy allowlist','console bridge output']};
  const server=await createLanServer({host:'127.0.0.1',port:0,dist:path.join(output,'dist')});
  const appPage=await browser.newPage({acceptDownloads:true}), guestPage=await browser.newPage({acceptDownloads:true});const appErrors=[];appPage.on('pageerror',e=>appErrors.push(String(e)));
  try {
    const origin='http://127.0.0.1:'+server.server.address().port;
    await appPage.goto(origin+'/?view=lan');
    await appPage.getByRole('button',{name:'导出联机性能日志',exact:true}).waitFor();
    await appPage.goto(origin+'/?view=lan&log-test=host#host=1&name=LogTest');
    await appPage.getByRole('complementary',{name:'房间舰船'}).waitFor({timeout:45000});
    assert.equal(server.rooms.size,1);
    const roomCode=[...server.rooms.keys()][0];
    await guestPage.goto(origin+'/?view=lan&room='+roomCode);
    await guestPage.getByRole('button',{name:'加入房间',exact:true}).click();
    await guestPage.getByRole('complementary',{name:'房间舰船'}).waitFor({timeout:45000});
    server.closeRoom(roomCode);
    await guestPage.getByText('原房间已关闭或已离开；草稿仍可另存，退出后重新加入。',{exact:true}).first().waitFor();
    const saving=guestPage.waitForEvent('download');await guestPage.getByRole('button',{name:'导出联机性能日志',exact:true}).click();
    const saved=await saving;const file=path.join(output,'built-ui-export.jsonl');await saved.saveAs(file);
    const rows=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(rows.some(row=>row.event==='welcome'));assert.ok(rows.some(row=>row.event==='roomClosed'));
    assert.deepEqual(appErrors,[]);result.checks.push('built LAN entry export control','room export still usable after real relay closes room','real welcome/roomClosed events');
  } catch(error) { fs.writeFileSync(path.join(output,'built-ui-error.txt'), (await appPage.locator('body').innerText())+'\n'+appErrors.join('\n')); throw error; } finally { await appPage.close();await guestPage.close();await server.close(); }
  fs.writeFileSync(path.join(output,'browser-result.json'),JSON.stringify(result,null,2));console.log(result);
} finally { await browser.close(); }
