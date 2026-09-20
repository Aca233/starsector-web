/** Single-primary-action regression against a real isolated LAN service and browser profiles.
 * Build first; LAN_TEST_DIST defaults to dist. Requires Playwright on NODE_PATH.
 * BROWSER_PATH optionally overrides Chromium. Never touches existing rooms or user storage. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createLanServer } from '../server/lan-server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
// Plain HTTP LAN mode uses the native socket, allowing deterministic receipt delay/rejection.
const app = await createLanServer({ host: '127.0.0.1', port: 0, isolated: false, dist: resolve(process.env.LAN_TEST_DIST ?? 'dist') });
const base = 'http://127.0.0.1:' + app.server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {}) });
const errors = [], passed = [];
const until = async (predicate, label) => {
  const deadline = Date.now() + 12000;
  while (!predicate()) { if (Date.now() > deadline) throw Error('Timed out: ' + label); await new Promise(resolve => setTimeout(resolve, 20)); }
};
async function client(name, host = false, code = '') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(name + ': ' + error.message));
  const state = { page, commands: [], id: null, room: null, hold: false, ack: null, rejectConfigure: false, rejectReady: false };
  await page.routeWebSocket('**/*', route => {
    const server = route.connectToServer();
    route.onMessage(raw => {
      const message = JSON.parse(String(raw)); state.commands.push(message);
      if ((state.rejectConfigure && message.type === 'configure') || (state.rejectReady && message.type === 'ready')) {
        state.rejectConfigure = false; state.rejectReady = false;
        route.send(JSON.stringify({ type: 'error', requestId: message.requestId, message: '测试：请求被拒绝，请重试' })); return;
      }
      server.send(raw);
    });
    server.onMessage(raw => {
      const message = JSON.parse(String(raw));
      if (message.type === 'welcome') state.id = message.id;
      if (message.type === 'room') state.room = message.room;
      if (message.type === 'configured' && state.hold) { state.ack = () => route.send(raw); return; }
      route.send(raw);
    });
  });
  await page.goto(base + '/?view=lan' + (code ? '&room=' + code : '') + '#' + (host ? 'host=1' : 'connect=1') + '&name=' + name);
  if (!host) await page.getByRole('button', { name: '加入房间', exact: true }).click();
  await page.locator('.lan-editor-primary').waitFor();
  await until(() => state.room && state.id, 'room entry ' + name);
  return state;
}
const count = (state, type) => state.commands.filter(message => message.type === type).length;
const me = state => state.room?.members.find(member => member.id === state.id);
try {
  const host = await client('host', true);
  const guest = await client('guest', false, host.room.code);
  const page = guest.page;
  assert.equal(await page.getByRole('button', { name: '仅应用配装', exact: true }).count(), 0, 'one primary workflow, not competing apply/ready buttons');
  const entryConfigure = count(guest, 'configure');
  const localRow = page.locator('.lan-team-member[data-local="true"]');
  const remoteRow = host.page.locator('.lan-team-member[data-local="false"]').filter({ hasText: 'guest' });
  const originalHull = me(guest).hull;
  await localRow.getByRole('button', { name: '更换舰船', exact: true }).click();
  await page.locator('.lan-room-hull-picker [data-hull-id="paragon"]').click();
  await page.locator('.lan-team-member[data-local="true"][data-preview="true"][data-hull="paragon"]').waitFor();
  assert.match(await localRow.innerText(), /本地预览/);
  assert.equal(count(guest, 'configure'), entryConfigure, 'changing hull previews locally without submitting');
  assert.equal(me(guest).hull, originalHull, 'preview does not mutate the authoritative room');
  assert.equal(await remoteRow.getAttribute('data-hull'), originalHull, 'other players still see the acknowledged ship');
  await page.locator('.lan-editor-primary').getByRole('button', { name: '放弃修改', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '确认', exact: true }).click();
  await page.locator('.lan-team-member[data-local="true"][data-hull="' + originalHull + '"]').waitFor();
  await localRow.getByRole('button', { name: '更换舰船', exact: true }).click();
  await page.locator('.lan-room-hull-picker [data-hull-id="paragon"]').click();
  passed.push('left roster: hull selection updates the local preview immediately, discard restores it, and peers do not see unsubmitted drafts');
  await page.getByRole('button', { name: /^角色技能/ }).click();
  await page.locator('[data-skill-id="helmsmanship"]').click();
  const beforeConfigure = count(guest, 'configure'), beforeReady = count(guest, 'ready');
  guest.hold = true;
  await page.getByRole('button', { name: /^应用并准备/ }).evaluate(button => { button.click(); setTimeout(() => button.click(), 80); });
  await until(() => guest.ack, 'configure acknowledgement intercepted');
  await page.getByRole('button', { name: /^等待服务器确认/ }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^等待服务器确认/ }).isDisabled(), true);
  assert.equal(count(guest, 'configure'), beforeConfigure + 1);
  assert.equal(count(guest, 'ready'), beforeReady, 'room broadcast alone must not prepare the player');
  guest.hold = false; guest.ack(); guest.ack = null;
  await until(() => me(guest)?.ready, 'guest ready after one skills-page click');
  await page.getByRole('button', { name: /^取消准备/ }).waitFor();
  assert.equal(count(guest, 'ready'), beforeReady + 1);
  assert.equal(me(guest).design.captainSkills.helmsmanship, 1);
  assert.equal(me(guest).hull, 'paragon');
  await host.page.locator('.lan-team-member[data-local="false"][data-hull="paragon"]').waitFor();
  passed.push('skills page: one click applies then readies only after a matching acknowledgement; double clicks are coalesced');

  await page.waitForTimeout(400); // Deliberately exceed the double-click suppression window.
  await page.getByRole('button', { name: /^取消准备/ }).click();
  await until(() => !me(guest)?.ready, 'cancel ready from skill screen');
  assert.equal(count(guest, 'configure'), beforeConfigure + 1, 'cancel ready does not resubmit a fit');
  await page.locator('[data-skill-id="helmsmanship"]').click();
  guest.rejectConfigure = true;
  await page.waitForTimeout(400);
  await page.keyboard.press('g');
  await page.getByRole('status').filter({ hasText: '测试：请求被拒绝' }).waitFor();
  assert.equal(count(guest, 'ready'), beforeReady + 2, 'rejected configure must not issue ready');
  assert.equal(await page.locator('[data-skill-id="helmsmanship"].is-elite').count(), 1, 'draft is retained');
  await page.waitForTimeout(400);
  guest.rejectReady = true;
  await page.keyboard.press('g');
  await until(() => me(guest)?.design?.captainSkills?.helmsmanship === 2, 'retry applies draft');
  await page.getByRole('button', { name: /^准备/ }).waitFor();
  await page.getByRole('status').filter({ hasText: '测试：请求被拒绝' }).waitFor();
  const acknowledgedCount = count(guest, 'configure');
  await page.waitForTimeout(400);
  await page.keyboard.press('g');
  await until(() => me(guest)?.ready, 'ready retry without reapplying');
  assert.equal(count(guest, 'configure'), acknowledgedCount);
  passed.push('skills shortcut: configure rejection retains the draft; ready rejection retries only ready, never reapplies or auto-retries');

  await page.getByRole('button', { name: '舰船改装', exact: true }).click();
  await page.waitForTimeout(400);
  await page.locator('.lan-editor-primary').getByRole('button', { name: '取消准备', exact: true }).click();
  await until(() => !me(guest)?.ready, 'cancel before refit shortcut');
  await page.waitForTimeout(400);
  await page.keyboard.press('n');
  await until(() => me(guest)?.ready, 'refit shortcut readies synced player');
  assert.equal(count(guest, 'configure'), acknowledgedCount);
  passed.push('refit shortcut uses the same ready/cancel workflow and skips unnecessary configure requests');

  const hp = host.page;
  await hp.getByRole('button', { name: /^角色技能/ }).click();
  await hp.locator('[data-skill-id="helmsmanship"]').click();
  await until(() => host.room.members.find(member => member.id === guest.id)?.ready, 'host sees ready guest');
  assert.equal(host.room.status, 'lobby', 'editing or another player becoming ready must not start automatically');
  await hp.getByRole('button', { name: /^应用并开始/ }).waitFor();
  const hostConfigure = count(host, 'configure'), hostStart = count(host, 'start');
  host.hold = true;
  await hp.keyboard.press('g');
  await until(() => host.ack, 'host configure acknowledged');
  assert.equal(host.room.members.find(member => member.id === guest.id).ready, true, 'host refit does not unready guest');
  assert.equal(count(host, 'start'), hostStart, 'start waits for configure receipt');
  host.hold = false; host.ack(); host.ack = null;
  await until(() => ['loading', 'running'].includes(host.room.status), 'host applies and starts in one action');
  assert.equal(count(host, 'configure'), hostConfigure + 1);
  assert.equal(count(host, 'start'), hostStart + 1);
  passed.push('host: explicit apply-and-start keeps guests ready and waits for the receipt before starting the real match');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed }, null, 2));
} finally { await browser.close(); await app.close(); }
