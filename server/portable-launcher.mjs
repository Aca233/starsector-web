import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createLanServer } from './lan-server.mjs';
import protocol from '../src/network/protocol.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function openPage(url) {
  // URL is constructed here from a numeric port, never from a request or arbitrary input.
  const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
    windowsHide: true, stdio: 'ignore',
  });
  child.on('error', () => console.error('无法自动打开浏览器，请复制上面的地址到 Edge 或 Chrome。'));
  child.unref();
}

async function existingPackage(port, mode, manifest, build) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/lan/info`, {
      signal: AbortSignal.timeout(800), redirect: 'error',
    });
    if (!response.ok) return false;
    const info = await response.json();
    return info.service === 'starsector-web-lan' && info.protocol === protocol.version
      && info.build === build && info.portable?.id === manifest.id && info.portable?.mode === mode;
  } catch { return false; }
}

/** Uses only the files beside this launcher; no npm, installed Node, original game or registry. */
export async function launchPortable({ mode = 'lan', port, openBrowser = true } = {}) {
  if (!['local', 'lan'].includes(mode)) throw Error('Unknown launch mode');
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) throw Error('端口必须是 1–65535 的整数。');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'portable-manifest.json'), 'utf8'));
  const { build } = JSON.parse(await fs.readFile(path.join(root, 'dist', 'lan-build.json'), 'utf8'));
  if (manifest.build !== build) throw Error('游戏文件版本不一致，请完整重新解压，勿混用不同版本的文件。');
  const startPort = port ?? (mode === 'lan' ? 32101 : 32100);
  const endPort = port === undefined ? Math.min(65535, startPort + 9) : startPort;
  for (let candidate = startPort; candidate <= endPort; candidate++) {
    const url = `http://127.0.0.1:${candidate}/${mode === 'lan' ? '?view=lan' : ''}`;
    let app;
    try {
      app = await createLanServer({ host: mode === 'lan' ? '0.0.0.0' : '127.0.0.1', port: candidate,
        dist: path.join(root, 'dist'), isolated: true, portable: { id: manifest.id, mode } });
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      if (await existingPackage(candidate, mode, manifest, build)) {
        console.log(`游戏已经在运行：${url}\n已复用原服务。关闭这个重复启动的窗口不会停止原服务。`);
        if (openBrowser) openPage(url);
        return { reused: true, url, app: null };
      }
      console.log(`端口 ${candidate} 被其他程序占用，未关闭或修改该程序。`);
      continue;
    }
    console.log(`\n远行星号 Web · Windows 联机版\n${mode === 'lan' ? '局域网模式（仅用于可信网络）' : '单机模式（只监听本机）'}\n\n本机打开：${url}`);
    if (mode === 'lan') {
      for (const address of app.addresses) console.log(`分享给同一局域网的朋友：${address}`);
      console.log('在网页内创建房间，再分享房间码。不要关闭房主战斗页面。\n异地朋友请先加入同一虚拟局域网，再分享虚拟网卡的 IP 链接，不要分享 127.0.0.1。\n若系统询问防火墙权限，仅按需允许专用网络；本程序不会自动修改防火墙。');
    } else {
      console.log('这是可选的单机试玩模式。一起玩时请使用默认的“启动游戏.cmd”。');
    }
    if (candidate !== startPort) console.log('已改用备用端口。浏览器方案库按地址隔离；旧方案可用 JSON 导入。');
    console.log('\n游玩时保留此窗口，可以最小化。关闭窗口或按 Ctrl+C 可停止服务。\n第一次加载资源可能需要一会儿。若浏览器没有打开，请手动访问上面的地址。\n');
    if (openBrowser) openPage(url);
    return { reused: false, url, app };
  }
  throw Error(`端口 ${startPort}–${endPort} 不可用。请关闭自己先前启动的游戏窗口后重试，或指定 --port。`);
}

function optionsFromArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lan') options.mode = 'lan';
    else if (args[i] === '--local') options.mode = 'local';
    else if (args[i] === '--no-browser') options.openBrowser = false;
    else if (args[i] === '--port' && args[i + 1]) options.port = Number(args[++i]);
    else throw Error(`未知启动参数：${args[i]}`);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { app } = await launchPortable(optionsFromArgs(process.argv.slice(2)));
    if (app) {
      let stopping = false;
      const stop = () => {
        if (stopping) return;
        stopping = true;
        const timeout = setTimeout(() => process.exit(1), 3000);
        timeout.unref();
        void app.close().then(() => process.exit(0), () => process.exit(1));
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    }
  } catch (error) {
    console.error('\n启动失败：', error.message);
    console.error('请先完整解压到普通文件夹，不要在压缩包内直接启动。不要只复制启动脚本或 index.html。');
    process.exitCode = 1;
  }
}
