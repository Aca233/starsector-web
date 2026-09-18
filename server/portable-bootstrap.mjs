import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { acquireUpdateLock, checkForUpdate, compareVersions, inside, installUpdate, readPackage, readState,
  resolvePackage, updateStorage, writeState } from './portable-update.mjs';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function bootstrapOptions(args) {
  const options = { update: true, checkOnly: false, rollback: false, steam: false, forwarded: [] };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--no-update') options.update = false;
    else if (arg === '--check-update') options.checkOnly = true;
    else if (arg === '--rollback') options.rollback = true;
    else if (arg === '--steam') options.steam = true;
    else if (['--lan', '--local', '--no-browser'].includes(arg)) options.forwarded.push(arg);
    else if (['--port', '--app-id', '--lobby', '+connect_lobby'].includes(arg) && args[i + 1]) options.forwarded.push(arg, args[++i]);
    else throw Error('未知启动参数：' + arg);
  }
  if (options.checkOnly && (options.rollback || !options.update)) throw Error('检查更新不能与回退/离线模式混用');
  for (let i = 0; i < options.forwarded.length; i++) {
    const arg = options.forwarded[i];
    if (arg === '--port' || arg === '--app-id') {
      const value = Number(options.forwarded[++i]);
      if (!Number.isSafeInteger(value) || value < 1 || (arg === '--port' && value > 65535)) throw Error('端口/AppID 参数无效');
    }
    if (!options.steam && ['--app-id', '--lobby', '+connect_lobby'].includes(arg)) throw Error('此参数仅支持 Steam 模式：' + arg);
  }
  if (options.steam && options.forwarded.some(arg => ['--lan', '--local'].includes(arg))) throw Error('Steam 与局域网/单机模式不能混用');
  return options;
}

async function runGame(root, options, lock) {
  const executable = inside(root, 'runtime', 'node.exe');
  const script = inside(root, 'server', options.steam ? 'steam-launcher.mjs' : 'portable-launcher.mjs');
  const started = Date.now();
  let stopping = false;
  let child;
  try {
    child = spawn(executable, [script, ...options.forwarded], { cwd: root, stdio: 'inherit', windowsHide: true,
      env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } });
  } catch (error) {
    // Windows can throw synchronously for an invalid/unlaunchable executable, before an error event exists.
    console.error('启动失败：' + error.message);
    return { code: 1, error, startupFailure: true };
  }
  // Register error/exit before any asynchronous lock I/O, including ENOENT/bad executable failures.
  const completion = new Promise(resolve => {
    child.once('error', error => resolve({ code: 1, error }));
    child.once('exit', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0) }));
  });
  const stop = () => { stopping = true; child.kill('SIGTERM'); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    if (child.pid) await lock.child(child.pid);
    const result = await completion;
    if (result.error) console.error('启动失败：' + result.error.message);
    return { ...result, startupFailure: result.code !== 0 && !stopping && Date.now() - started < 15000 };
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}

export async function bootstrap(args = process.argv.slice(2)) {
  const options = bootstrapOptions(args), baseManifest = await readPackage(base);
  if (options.steam && baseManifest.update.variant !== 'steam') throw Error('请使用 Steam 版安装包');
  // Only portable packages can reach this point. Never update a source checkout or the original game.
  let storage;
  try { storage = await updateStorage(base); }
  catch (error) {
    if (options.checkOnly || options.rollback) throw error;
    console.error('更新目录不可用，跳过更新并使用基础包：' + error.message);
    return (await runGame(base, options, { child: async () => {} })).code;
  }
  const lock = await acquireUpdateLock(storage);
  const log = message => {
    console.log(message);
    void fs.appendFile(inside(storage, 'launcher.log'), `${new Date().toISOString()} ${message}\n`).catch(() => {});
  };
  try {
    let state;
    try { state = await readState(storage); }
    catch (error) {
      if (options.checkOnly || options.rollback) throw error;
      log('更新状态损坏，保留原文件并使用基础包：' + error.message);
      return (await runGame(base, options, lock)).code;
    }
    let current;
    try { current = await resolvePackage(base, storage, state.active); }
    catch (error) {
      log('当前更新损坏，尝试保留的上一版本：' + error.message);
      const previous = Object.hasOwn(state, 'previous') ? state.previous : null;
      try { current = await resolvePackage(base, storage, previous); }
      catch { current = await resolvePackage(base, storage, null); }
      state = { schema: 1, active: current.root === base ? null : previous, skippedVersion: state.active?.version ?? null };
      await writeState(storage, state);
    }
    if (current.manifest.update.variant !== baseManifest.update.variant) throw Error('更新版本类型与基础包不一致');
    if (options.rollback) {
      if (!Object.hasOwn(state, 'previous')) throw Error('暂无上一版本可回退');
      const previous = await resolvePackage(base, storage, state.previous);
      if (compareVersions(previous.manifest.version, current.manifest.version) >= 0) throw Error('没有更早的版本可回退');
      const old = state.active;
      state = { schema: 1, active: state.previous, previous: old, skippedVersion: current.manifest.version };
      await writeState(storage, state);
      log(`已回退到 ${previous.manifest.version}。该问题版本不会再次自动安装；更高版本仍会检查。`);
      return 0;
    }
    log(`当前版本 ${current.manifest.version} · ${current.manifest.update.variant}`);
    if (options.update) {
      try {
        log('正在检查 GitHub Releases 更新（可用 --no-update 离线启动）……');
        const update = await checkForUpdate(current.manifest);
        if (!update) log('没有可用的新稳定版本。');
        else if (state.skippedVersion && compareVersions(update.version, state.skippedVersion) <= 0) log(`已跳过回退的问题版本 ${update.version}。`);
        else if (options.checkOnly) log(`发现新版本 ${update.version}；下次正常启动时自动安装。`);
        else {
          log(`发现 ${update.version}，正在下载并校验；旧版不会被覆盖。`);
          const active = await installUpdate(storage, update, { log });
          const next = await resolvePackage(base, storage, active);
          const nextState = { schema: 1, active, previous: state.active, skippedVersion: null };
          await writeState(storage, nextState);
          state = nextState; current = next;
          log(`更新完成，启动 ${current.manifest.version}。`);
        }
      } catch (error) {
        log('更新未完成，保留现有版本：' + error.message);
        if (options.checkOnly) return 1;
      }
    }
    if (options.checkOnly) return 0;
    const result = await runGame(current.root, options, lock);
    if (result.startupFailure && state.active && Object.hasOwn(state, 'previous')) {
      const previous = await resolvePackage(base, storage, state.previous);
      await writeState(storage, { schema: 1, active: state.previous, previous: state.active, skippedVersion: current.manifest.version });
      log(`新版启动失败，已回退到 ${previous.manifest.version}。`);
      return (await runGame(previous.root, options, lock)).code;
    }
    return result.code;
  } finally { await lock.release(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await bootstrap(); }
  catch (error) { console.error('启动/更新失败：' + error.message); process.exitCode = 1; }
}
