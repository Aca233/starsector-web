import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { DesktopSteamOverlay, steamRestartArgs } from '../desktop/steam-overlay.mjs';
import { DesktopOverlayBridge } from '../server/steam/desktop-overlay-bridge.mjs';
import { SteamGateway } from '../server/steam/gateway.mjs';
const lobby = '109775240000000001', owner = '76561198000000001';
function fixture() {
  const calls = [], invited = [];
  let available = true, destroyed = false, callback;
  const client = { localplayer: { getSteamId: () => ({ steamId64: BigInt(owner) }) },
    callback: { register: (event, fn) => { assert.equal(event, 8); callback = fn; return { disconnect: () => calls.push('disconnect') }; } },
    overlay: { activateInviteDialog: id => calls.push(['invite', id]) } };
  const overlay = new DesktopSteamOverlay({ appId: 480, onInvite: id => invited.push(id),
    load: () => ({ sdk: { electronEnableSteamOverlay: () => calls.push('configure'), init: appId => { assert.equal(appId,480); calls.push('init'); return client; } }, isOverlayEnabled: () => available }),
    getWindow: () => ({ isDestroyed: () => destroyed, isMinimized: () => true, restore: () => calls.push('restore'), show: () => calls.push('show'), focus: () => calls.push('focus') }) });
  return { overlay, calls, invited, callback: value => callback(value), available: value => { available = value; }, destroyed: () => { destroyed = true; } };
}
test('configure before SDK init; invoke on window owner; preserve uint64 lobby ID', () => {
  const f = fixture(); assert.equal(f.overlay.status().available, false);
  f.overlay.prepare(); f.overlay.prepare(); assert.deepEqual(f.calls, ['configure', 'init']);
  assert.equal(f.overlay.status().available, true); assert.equal(f.overlay.invite(lobby, owner).ok, true);
  assert.deepEqual(f.calls.slice(2), ['restore','show','focus',['invite',BigInt(lobby)]]);
  f.callback({lobby_steam_id: BigInt(lobby)}); f.callback({lobby_steam_id: 'invalid'}); assert.deepEqual(f.invited,[lobby]);
  f.overlay.close(); assert.equal(f.calls.at(-1),'disconnect');
});
test('disabled overlay, invalid IDs, changed identity and missing window never report success', () => {
  const f = fixture(); f.overlay.prepare(); f.available(false);
  assert.equal(f.overlay.status().available,false); assert.throws(()=>f.overlay.invite(lobby,owner),/尚未就绪/);
  f.available(true);
  for (const invalid of ['123456','-1','18446744073709551616','steam://bad',null]) assert.throws(()=>f.overlay.invite(invalid,owner),/无效/);
  assert.throws(()=>f.overlay.invite(lobby,'76561198000000002'),/账号已改变/);
  f.destroyed(); assert.throws(()=>f.overlay.invite(lobby,owner),/窗口已关闭/);
  assert.equal(f.calls.filter(Array.isArray).length,0);
});
test('SDK failure remains actionable and restart arguments preserve profile and port', () => {
  const overlay = new DesktopSteamOverlay({appId:480,load:()=>{throw Error('offline');},getWindow:()=>null});
  overlay.prepare(); assert.equal(overlay.status().available,false); assert.match(overlay.status().reason,/登录 Steam 后重启/);
  assert.deepEqual(steamRestartArgs(['.','--mode=local','--port=33215','--profile=C:/test']),['.','--port=33215','--profile=C:/test','--mode=steam']);
});
test('IPC correlation, duplicate gate, propagated error, timeout, shutdown and late response', async () => {
  const sent=[]; const bridge = new DesktopOverlayBridge(message=>sent.push(message),null,20);
  bridge.receive({type:'steam-overlay-state',overlay:{supported:true,available:true,reason:''}}); assert.equal(bridge.status().available,true);
  const pending=bridge.invite(lobby,owner); await assert.rejects(bridge.invite(lobby,owner),/正在打开/);
  bridge.receive({type:'steam-invite-result',id:999,result:{ok:true}}); assert.equal(bridge.pending.size,1);
  bridge.receive({type:'steam-invite-result',id:sent.at(-1).id,result:{ok:true,note:'requested'}}); assert.equal((await pending).ok,true);
  const failed=bridge.invite(lobby,owner); bridge.receive({type:'steam-invite-result',id:sent.at(-1).id,error:'disabled'}); await assert.rejects(failed,/disabled/);
  await assert.rejects(bridge.invite(lobby,owner),/未响应/);
  const stopped=bridge.invite(lobby,owner); bridge.close(); await assert.rejects(stopped,/已停止/);
  bridge.receive({type:'steam-invite-result',id:sent.at(-1).id,result:{ok:true}}); assert.equal(bridge.pending.size,0);
  await assert.rejects(bridge.invite(lobby,owner),/已停止/);
});
test('HTTP invitation uses selected lobby, never headless native dialog; browser/offline/cross-origin denied', async () => {
  const requests=[]; const gateway = new SteamGateway({build:'test',overlay:{status:()=>({supported:true,available:true,reason:''}),invite:async(...args)=>{requests.push(args);return {ok:true,note:'requested'};}}});
  gateway.initialized=true; gateway.owner=owner;
  const server=createServer((req,res)=>{if(!gateway.http(req,res)){res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); const origin='http://127.0.0.1:'+server.address().port;
  const post=(data={},extra={})=>fetch(origin+'/steam/invite',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Starsector-Steam':'1',...extra},body:JSON.stringify(data)});
  try {
    assert.equal((await post()).status,400);
    gateway.selected={id:lobby,owner,lobby:{leave(){},openInviteDialog(){throw Error('must not invoke background overlay');}}};
    assert.equal((await post({}, {Origin:'http://evil.test'})).status,403);
    assert.equal((await fetch(origin+'/steam/invite')).status,403);
    const response=await post({lobby:'109775240000000009'}); assert.equal(response.status,200); assert.deepEqual(requests,[[lobby,owner]]);
    gateway.networkLost=true; assert.equal((await post()).status,400); gateway.networkLost=false;
    gateway.overlay=null; assert.equal(gateway.status().overlay.supported,false);
    const browser=await post(); assert.equal(browser.status,400); assert.match((await browser.json()).error,/浏览器版不支持/);
    assert.equal(requests.length,1);
  } finally { await gateway.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
});
