import path from 'node:path';
import { utilityProcess } from 'electron';

/** One owned service per desktop instance. Do not reuse or terminate unrelated local servers. */
export class DesktopBackend {
  constructor({ root, port, appId, log, failed, quitRequested }) {
    Object.assign(this, { root, port, appId, log, failed, quitRequested });
    this.child = null; this.info = null; this.expectedExit = false;
  }
  async start(mode) {
    if (this.child) throw Error('后台服务尚未停止');
    this.expectedExit = false;
    const env = { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = utilityProcess.fork(path.join(this.root, 'server', 'electron-service.mjs'), [], {
      cwd: this.root, env, serviceName: 'Starsector game service', stdio: 'pipe',
    });
    this.child = child;
    this.exited = new Promise(resolve => child.once('exit', code => {
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
        child.once('spawn', () => child.postMessage({ type: 'start', mode, port: this.port, appId: this.appId }));
        child.on('message', message => {
          if (message?.type === 'ready' && message.port === this.port && message.mode === mode) finish(null, message);
          else if (message?.type === 'error') { this.log(message.message); if (!this.info) finish(Error(message.message)); }
          else if (message?.type === 'quit-request') this.quitRequested();
        });
      });
      return this.info;
    } catch (error) { await this.stop(); throw error; }
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
