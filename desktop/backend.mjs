import path from 'node:path';
import { utilityProcess } from 'electron';

/** One owned service per desktop instance. Do not reuse or terminate unrelated local servers. */
export class DesktopBackend {
  constructor({ root, port, appId, log, failed, quitRequested, overlay }) {
    Object.assign(this, { root, port, appId, log, failed, quitRequested, overlay });
    this.child = null; this.info = null; this.expectedExit = false; this.pendingInvite = null;
  }
  async start(mode) {
    if (this.child) throw Error('后台服务尚未停止');
    this.expectedExit = false;
    const env = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = utilityProcess.fork(path.join(this.root, 'server', 'electron-service.mjs'), [], {
      cwd: this.root, env, serviceName: 'Starsector game service', stdio: 'pipe',
    });
    this.child = child; this.mode = mode;
    let overlayTimer;
    this.exited = new Promise(resolve => child.once('exit', code => {
      clearInterval(overlayTimer);
      const unexpected = !this.expectedExit && !!this.info;
      this.child = null; this.info = null; resolve(code);
      if (unexpected) this.failed(`游戏后台异常退出 (${code})`);
    }));
    child.stdout?.on('data', data => this.log(String(data).trim()));
    child.stderr?.on('data', data => this.log(String(data).trim()));
    try {
      this.info = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('游戏后台启动超时；Steam 模式请检查客户端后重试')), 20000);
        const finish = (error, info) => { clearTimeout(timeout); child.off('exit', earlyExit); if (error) reject(error); else resolve(info); };
        const earlyExit = code => finish(Error(`游戏后台启动失败 (${code})`));
        child.once('exit', earlyExit);
        child.once('spawn', () => {
          child.postMessage({ type: 'start', mode, port: this.port, appId: this.appId, overlay: this.overlay?.status(), pendingInvite: this.pendingInvite });
          if (mode === 'steam' && this.overlay) {
            overlayTimer = setInterval(() => { if (child === this.child && !this.expectedExit) child.postMessage({ type: 'steam-overlay-state', overlay: this.overlay.status() }); }, 1000);
            overlayTimer.unref();
          }
        });
        child.on('message', message => {
          if (message?.type === 'ready' && message.port === this.port && message.mode === mode) {
            finish(null, message);
            if (mode === 'steam' && this.pendingInvite) { child.postMessage({ type: 'steam-pending-invite', lobby: this.pendingInvite }); this.pendingInvite = null; }
          }
          else if (message?.type === 'error') { this.log(message.message); if (!this.info) finish(Error(message.message)); }
          else if (message?.type === 'quit-request') this.quitRequested();
          else if (message?.type === 'steam-invite' && mode === 'steam' && child === this.child && !this.expectedExit) {
            try {
              if (!this.overlay) throw Error('此桌面程序未接入 Steam 浮层');
              const result = this.overlay.invite(message.lobby, message.owner);
              child.postMessage({ type: 'steam-invite-result', id: message.id, result });
            } catch (error) { child.postMessage({ type: 'steam-invite-result', id: message.id, error: String(error.message ?? error) }); }
          }
        });
      });
      return this.info;
    } catch (error) { await this.stop(); throw error; }
  }
  receiveSteamInvite(lobby) {
    this.pendingInvite = lobby;
    if (this.child && this.info?.mode === 'steam' && !this.expectedExit) { this.child.postMessage({ type: 'steam-pending-invite', lobby }); this.pendingInvite = null; }
  }
  async stop() {
    const child = this.child;
    if (!child) return;
    this.expectedExit = true;
    child.postMessage({ type: 'stop' });
    const timer = setTimeout(() => child.kill(), 5000);
    try { await this.exited; }
    finally { clearTimeout(timer); this.info = null; }
  }
}
