import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const validId = value => typeof value === 'string' && /^[0-9]{16,20}$/.test(value) && BigInt(value) <= 18446744073709551615n;
const unavailable = 'Steam 浮层尚未就绪或被禁用。请在 Steam 设置 → 游戏中启用浮层；仍不可用时，从 Steam 启动此桌面程序。也可复制房间号邀请。';

/** Steam must initialize in the process owning the graphics device, before Electron creates it. */
export function loadDesktopSteam(root) {
  const backendRequire = createRequire(path.join(root, 'package.json'));
  const nativeRoot = path.dirname(backendRequire.resolve('steamworks.js'));
  // steamworks.js 0.4 lacks IsOverlayEnabled. Bind only these two read-only SDK functions;
  // no FFI, DLL path or arbitrary native method is exposed to the renderer/backend.
  // Preload the same DLL used by the addon. A second DLL instance would have no initialized SDK.
  const besideExe = path.join(path.dirname(process.execPath), 'steam_api64.dll');
  const library = require('koffi').load(fs.existsSync(besideExe) ? besideExe : path.join(nativeRoot, 'dist', 'win64', 'steam_api64.dll'));
  const sdk = backendRequire('steamworks.js');
  const getUtils = library.func('void *SteamAPI_SteamUtils_v010()');
  const isEnabled = library.func('bool SteamAPI_ISteamUtils_IsOverlayEnabled(void *self)');
  return { sdk, isOverlayEnabled: () => { const utils = getUtils(); if (!utils) throw Error('Steam Utils interface unavailable'); return isEnabled(utils); } };
}

export function steamRestartArgs(args) {
  return [...args.filter(arg => !arg.startsWith('--mode=')), '--mode=steam'];
}

export class DesktopSteamOverlay {
  constructor({ appId, load, getWindow, onInvite = () => {}, log = () => {} }) {
    Object.assign(this, { appId, load, getWindow, onInvite, log });
    this.prepared = false; this.client = null; this.callback = null; this.failure = '';
  }
  prepare() {
    if (this.prepared) return;
    this.prepared = true;
    try {
      const native = this.load();
      // Also supplies idle repainting so Steam can draw over static menus.
      native.sdk.electronEnableSteamOverlay();
      this.client = native.sdk.init(this.appId);
      this.isOverlayEnabled = native.isOverlayEnabled;
      this.callback = this.client.callback.register(8, ({ lobby_steam_id }) => {
        const id = String(lobby_steam_id);
        if (validId(id)) this.onInvite(id);
      });
      this.log('Steam 窗口浮层已初始化；可用状态由 Steam SDK 检测');
    } catch (error) {
      this.failure = 'Steam 窗口接口初始化失败，请先登录 Steam 后重启桌面程序；仍可复制房间号邀请。';
      this.log(this.failure + ' ' + String(error.message ?? error).slice(0, 240));
    }
  }
  status() {
    if (!this.prepared) return { supported: true, available: false, reason: '进入 Steam 模式后需重启桌面程序以初始化浮层。' };
    if (this.failure || !this.client) return { supported: true, available: false, reason: this.failure || unavailable };
    try {
      const available = !!this.isOverlayEnabled();
      return { supported: true, available, reason: available ? '' : unavailable };
    } catch {
      return { supported: true, available: false, reason: 'Steam 浮层状态读取失败，请重启桌面程序或复制房间号邀请。' };
    }
  }
  invite(lobby, owner) {
    if (!validId(lobby) || !validId(owner)) throw Error('无效的 Steam 邀请请求');
    const status = this.status();
    if (!status.available) throw Error(status.reason);
    if (String(this.client.localplayer.getSteamId().steamId64) !== owner) throw Error('Steam 登录账号已改变，请重启桌面程序');
    const win = this.getWindow();
    if (!win || win.isDestroyed()) throw Error('游戏窗口已关闭');
    if (win.isMinimized()) win.restore();
    win.show(); win.focus();
    this.client.overlay.activateInviteDialog(BigInt(lobby));
    // Activation is a void SDK call, not confirmation that an invitation was sent.
    return { ok: true, note: '已向 Steam 请求打开好友邀请。请在浮层中选择好友；关闭浮层可按 Shift+Tab。' };
  }
  close() { this.callback?.disconnect(); this.callback = null; }
}
