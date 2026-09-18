import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { BOOTSTRAP_VERSION, UPDATE_REPOSITORY, sha256File, versionParts } from '../server/portable-update.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let version = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8')).version;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--version' && args[i + 1]) version = args[++i];
  else if (!['--skip-build', '--steam'].includes(args[i])) throw Error('Supported options: --skip-build, --steam, --version x.y.z');
}
versionParts(version);
const steamMode = args.includes('--steam');
if (process.platform !== 'win32' || process.arch !== 'x64' || Number(process.versions.node.split('.')[0]) < 22) {
  throw Error('请使用 Windows x64 的 Node.js 22+ 制作此免安装包。');
}

async function copy(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true, dereference: true, errorOnExist: true, force: false });
}
function command(executable, argv, env = process.env) {
  const result = spawnSync(executable, argv, { cwd: project, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`Command failed (${result.status}): ${path.basename(executable)}`);
}

if (!args.includes('--skip-build')) {
  const npm = process.env.npm_execpath;
  if (!npm) throw Error('请通过 npm run package:windows 运行，或自行构建后传入 --skip-build。');
  command(process.execPath, [npm, 'run', 'build']);
}
const dist = path.join(project, 'dist');
const { build: buildId } = JSON.parse(await fs.readFile(path.join(dist, 'lan-build.json'), 'utf8'));
await fs.access(path.join(dist, 'index.html'));
const nodeExe = await fs.realpath(process.execPath);
const nodeLicense = path.join(path.dirname(nodeExe), 'LICENSE');
await fs.access(nodeLicense);

// Use the parser's dependency graph, but copy the original modules. Bundling would change
// import.meta.url and accidentally trigger lan-server.mjs's CLI entry inside the launcher.
const graph = await build({ absWorkingDir: project, entryPoints: steamMode ? ['server/steam-launcher.mjs', 'server/portable-launcher.mjs', 'server/portable-bootstrap.mjs'] : ['server/portable-launcher.mjs', 'server/portable-bootstrap.mjs'], outdir: path.join(project, 'node_modules', '.tmp', 'portable-graph'),
  bundle: true, write: false, metafile: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
const inputs = Object.keys(graph.metafile.inputs).sort();
for (const file of inputs) {
  const resolved = path.resolve(project, file);
  if (!resolved.startsWith(project + path.sep) || !/^(server|src)\//.test(file.replaceAll('\\', '/'))
    || !['.mjs', '.js', '.json'].includes(path.extname(file))) throw Error(`Unexpected runtime dependency: ${file}`);
}
const externals = new Set(Object.values(graph.metafile.inputs).flatMap(input => input.imports)
  .filter(i => i.external && !i.path.startsWith('node:')).map(i => i.path));
if ([...externals].some(name => !['ws', '@msgpack/msgpack', 'yauzl', ...(steamMode ? ['steamworks.js'] : [])].includes(name))) throw Error(`New external dependencies need packaging: ${[...externals]}`);

const stamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' })
  .format(new Date()).replace(/\D/g, '');
const id = `Starsector-Web-${steamMode ? "Steam" : "Multiplayer"}-${version}-win-x64-${stamp}`;
const output = path.join(project, 'artifacts', 'releases');
await fs.mkdir(output, { recursive: true });
const stage = path.join(output, id);
await fs.mkdir(stage); // A new release only: never delete or overwrite another package.
const destination = path.join(stage, 'Starsector-Web');
await fs.mkdir(destination);
const zip = path.join(output, `${id}.zip`);
console.log('复制离线资源与便携运行环境……');
await copy(dist, path.join(destination, 'dist'));
for (const file of inputs) await copy(path.join(project, file), path.join(destination, file));
await copy(nodeExe, path.join(destination, 'runtime', 'node.exe'));
await copy(nodeLicense, path.join(destination, 'runtime', 'LICENSE.txt'));
await copy(path.join(project, 'node_modules', 'ws'), path.join(destination, 'node_modules', 'ws'));
await copy(path.join(project, 'node_modules', '@msgpack', 'msgpack'), path.join(destination, 'node_modules', '@msgpack', 'msgpack'));
await copy(path.join(project, 'node_modules', '@msgpack', 'msgpack', 'LICENSE'), path.join(destination, 'licenses', 'msgpack.txt'));
for (const name of ['yauzl', 'pend']) {
  await copy(path.join(project, 'node_modules', name), path.join(destination, 'node_modules', name));
  await copy(path.join(project, 'node_modules', name, 'LICENSE'), path.join(destination, 'licenses', `${name}.txt`));
}
if (steamMode) {
  await copy(path.join(project, 'node_modules', 'steamworks.js'), path.join(destination, 'node_modules', 'steamworks.js'));
  await copy(path.join(project, 'node_modules', 'steamworks.js', 'LICENSE'), path.join(destination, 'licenses', 'steamworks.js.txt'));
  await copy(path.join(project, 'docs', 'steam-multiplayer.md'), path.join(destination, 'docs', 'steam-multiplayer.md'));
}
for (const name of ['react', 'react-dom', 'scheduler', 'lucide-react', 'ws']) {
  await copy(path.join(project, 'node_modules', name, 'LICENSE'), path.join(destination, 'licenses', `${name}.txt`));
}
await fs.writeFile(path.join(destination, 'package.json'), JSON.stringify({ name: 'starsector-web-portable',
  version, private: true, type: 'module' }, null, 2) + '\n');
let revision = 'unknown', sourceDirty = true;
try {
  revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: project, encoding: 'utf8', windowsHide: true }).trim();
  sourceDirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: project, encoding: 'utf8', windowsHide: true }).trim();
} catch { /* Source archives can be packaged without a git installation. */ }
const manifest = { id, version, update: { schema: 1, repository: UPDATE_REPOSITORY, variant: steamMode ? 'steam' : 'multiplayer', bootstrapVersion: BOOTSTRAP_VERSION }, defaultMode: steamMode ? 'steam' : 'lan', build: buildId, createdAt: new Date().toISOString(), platform: 'win32', arch: 'x64',
  nodeVersion: process.version, sourceRevision: revision, sourceDirty, serverFiles: inputs };
await fs.writeFile(path.join(destination, 'portable-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const launcher = mode => [
  '@echo off', 'setlocal DisableDelayedExpansion', 'chcp 65001 >nul',
  'set "NODE_OPTIONS="', 'set "NODE_PATH="',
  'if not exist "%~dp0runtime\\node.exe" (',
  '  echo Please extract the ENTIRE ZIP before starting the game.', '  pause', '  exit /b 1', ')',
  'pushd "%~dp0"', 'if errorlevel 1 exit /b 1',
  `"%~dp0runtime\\node.exe" "%~dp0server\\portable-bootstrap.mjs"${mode === 'lan' ? ' --lan' : ' --local'} %*`,
  'set "RESULT=%ERRORLEVEL%"', 'popd', 'if not "%RESULT%"=="0" pause', 'exit /b %RESULT%', '',
].join('\r\n');
if (steamMode) {
  const vbs = [
    'Option Explicit', 'Dim shell, fso, base, command',
    'Set shell = CreateObject("WScript.Shell")', 'Set fso = CreateObject("Scripting.FileSystemObject")',
    'base = fso.GetParentFolderName(WScript.ScriptFullName)',
    'shell.CurrentDirectory = base',
    'shell.Environment("PROCESS")("NODE_OPTIONS") = ""', 'shell.Environment("PROCESS")("NODE_PATH") = ""',
    'command = Chr(34) & base & "\\runtime\\node.exe" & Chr(34) & " " & Chr(34) & base & "\\server\\portable-bootstrap.mjs" & Chr(34) & " --steam"',
    'shell.Run command, 0, False', '',
  ].join('\r\n');
  await fs.writeFile(path.join(destination, 'SteamLauncher.vbs'), vbs);
  const hidden = ['@echo off', 'setlocal DisableDelayedExpansion', 'wscript.exe "%~dp0SteamLauncher.vbs"', ''].join('\r\n');
  await fs.writeFile(path.join(destination, '启动游戏.cmd'), hidden);
  await fs.writeFile(path.join(destination, '启动 Steam 联机.cmd'), hidden);
  await fs.writeFile(path.join(destination, '局域网联机.cmd'), launcher('lan'));
  await fs.writeFile(path.join(destination, '诊断 Steam 联机.cmd'), launcher('lan').replace('portable-bootstrap.mjs" --lan', 'portable-bootstrap.mjs" --steam'));
  await copy(path.join(project, 'node_modules', 'steamworks.js', 'dist', 'win64', 'steam_api64.dll'), path.join(destination, 'runtime', 'steam_api64.dll'));
} else await fs.writeFile(path.join(destination, '启动游戏.cmd'), launcher('lan'));
await fs.writeFile(path.join(destination, '单机试玩.cmd'), launcher('local'));
const maintenance = flag => launcher('lan').replace(' --lan %*', ' ' + flag + ' %*').replace('if not "%RESULT%"=="0" pause', 'pause');
await fs.writeFile(path.join(destination, '检查更新.cmd'), maintenance('--check-update'));
await fs.writeFile(path.join(destination, '回退上一版.cmd'), maintenance('--rollback'));
await fs.writeFile(path.join(destination, '离线启动.cmd'), launcher('lan').replace(' --lan %*', (steamMode ? ' --steam' : ' --lan') + ' --no-update %*'));
let readme = `远行星号 Web · Windows 联机免安装包

【一起玩：先确定一位房主】
1. 房主完整解压 ZIP，再双击“启动游戏.cmd”。不要在压缩包内直接运行。
2. 默认浏览器打开联机页 http://127.0.0.1:32101/?view=lan 。无需安装 Node/npm/原版游戏，不需要管理员权限。
3. 房主在网页内创建房间，将控制台显示的可达 IP 链接和房间码发给朋友。
4. 朋友用最新 Edge / Chrome 打开房主链接并加入同一房间；不要各自新建房间。
5. 房主的启动窗口和战斗网页要保持运行。启动窗口可以最小化。

【异地联机：使用虚拟局域网】
不同家庭/不同网络不能直接访问彼此的 192.168.x.x 等私有地址。
所有玩家先自行安装同一种组网工具（例如 Radmin VPN 或 Tailscale），加入同一个虚拟网络，并确认允许互相访问。
然后房主启动本游戏，分享控制台中“虚拟网卡”的 IP 链接和房间码。也可将软件显示的虚拟 IP 填入下方格式：
http://房主虚拟IP:32101/?view=lan
例如 Radmin VPN 常见 26.x.x.x，Tailscale 常见 100.x.x.x；必须使用软件实际分配的 IP，不要照抄示例。
如果用了备用端口，请以启动窗口中的实际端口为准。不要向朋友发送 localhost 或 127.0.0.1。
Radmin VPN 官方下载：https://www.radmin-vpn.com/
Tailscale 官方下载：https://tailscale.com/download
本包不会安装这些软件、登录账号、创建虚拟网络、修改防火墙或做公网端口映射。
若防火墙阻止朋友连接，仅按需允许可信网络上的本程序/TCP 实际端口；不要关闭整个防火墙。

【朋友是否必须下载这个包】
不必须。只要虚拟网络已互通，朋友用浏览器访问房主链接即可，游戏资源由房主提供。
每人都拿一份包主要方便轮换房主。参加同一场战斗时，所有人仍应打开同一个房主链接。
第一次加载受房主上传速度、网络延迟/中继影响，可能较慢。
“公网中转”需要另行部署服务器、HTTPS/WSS 和访问控制；本包不自动提供公网链接或穿透服务。

【退出与数据】
结束后关闭启动窗口或按 Ctrl+C 停止服务，正在进行的对局也会结束；只关浏览器不会停止服务。
存档/方案保存在浏览器本机存储中，包里不带制作者的个人存档、浏览器资料或方案库。
浏览器、IP、端口不同会使用不同的方案库；跨模式/跨电脑/换房主地址时请用游戏内的方案 JSON 导入/导出。
默认“启动游戏.cmd”监听所有本机网卡，仅在可信网络使用。不会注册开机启动，也不会隐藏常驻。
“单机试玩.cmd”是可选入口，只监听 127.0.0.1:32100，不用于朋友加入。

【系统要求与排错】
Windows 10/11 x64；现代浏览器、WebGL2 与可用的硬件加速。不是手机或 Mac 安装包。
请发送整个 ZIP，不要单独发送 CMD 或 dist/index.html。
重复启动会复用匹配版本服务；其他程序占用端口时只尝试备用端口，不终止未知进程。
若浏览器未自动打开，请复制控制台中的地址手动访问。
若打不开朋友的链接：先确认虚拟网在线/访问策略、IP、实际端口及防火墙，再确认房主窗口未关闭。
Windows/安全软件若阻止运行，应先核对来源和文件，不要盲目绕过警告或关闭安全防护。

【内容与授权】
这是非官方 Web 舰船设计/战斗沙盒，不是原版完整战役或官方发行包。
技术上不依赖原版安装；原版美术、音频等仍归各自权利人，此包不赋予新增授权。
请确认你有相应的资源使用与分享权限，尤其不要据此直接公开商业发布。
Node.js 授权位于 runtime/LICENSE.txt；React、Lucide、ws 等授权位于 licenses/。

版本：${id}
Node：${process.version} / x64
`;
if (steamMode) readme = `远行星号 Web · Steam 浏览器联机开发测试包

【Steam 联机：所有玩家都要拿一份相同版本】
1. 每位玩家先打开并登录自己的 Steam 账号。
2. 完整解压后，双击“启动 Steam 联机.cmd”或“启动游戏.cmd”。本机接口隐藏运行，默认浏览器自动打开游戏。
3. 房主创建 Steam 房间，在“邀请朋友”里复制完整 Steam 房间号。朋友在自己的网页中粘贴该号码加入。
4. 不要分享 localhost / 127.0.0.1 地址，也不要分享侧栏的六位局域网编号。游戏资源由各自的启动包提供。
5. 配装、分队、AI 编成、开始游戏都在原网页界面。只有房主计算战斗，不需要另租中转服务器。
6. 房主游戏网页与启动器都必须保持运行。Steam 网页菜单退出房间后，可点击“退出启动器”停止本机接口。仅关闭浏览器不会自动停止启动器。
7. 若窗口未打开或 Steam 连接失败，运行“诊断 Steam 联机.cmd”查看原因。不能通过网页登录替代 Steam 客户端登录。

【已知边界】
默认 AppID 480（Spacewar）只用于开发联调。正式使用应换自己的 AppID，并遵守 Steamworks 和游戏资源授权要求。
接入 steamworks.js 0.4 的 Steam P2P 可靠消息接口，做了压缩、分片和拥塞限流；不承诺固定 SDR 路由或延迟。
Steam 浮层可能无法显示在普通浏览器中，复制房间号始终是主要邀请方式。已经运行的启动器会接收 Steam 邀请回调，由玩家确认后加入。
不修改防火墙、账号凭据、开机启动或 Steam 安装文件。不需要 Electron、不需要另装 Node/npm。
启动器默认仅监听本机 127.0.0.1；只有明确选择局域网模式才监听局域网。
尚需两台电脑、两个 Steam 账号进行真实跨网验证；本机模拟传输验证不能当作 Valve 中继实测。
原生验证曾出现初始化后接口未响应，Steam 重连稳定性尚未实测修复；当前为开发联调包，不是已完成真实 Steam 验收的发行版。详细验证记录见 docs/steam-multiplayer.md。

【可选：原有局域网方式】
` + readme.replaceAll('启动游戏.cmd', '局域网联机.cmd');
readme += `\n【自动更新】\n每次启动先检查 GitHub Releases 稳定版；下载并校验 SHA-256 后使用新版。无网络/校验失败时继续旧版。\n请始终使用最初解压目录的启动脚本。更新安装在 .updates 中，不覆盖旧版或浏览器方案库；开始对局后不更新。\n检查更新.cmd 仅检查；离线启动.cmd 跳过检查；回退上一版.cmd 切回旧版并跳过该问题版本。\n请先退出旧启动器再进行更新或回退。旧版本和失败下载会保留，可能占用额外磁盘空间。\nSteam 隐藏启动的更新进度可用诊断启动器或 .updates/launcher.log 查看。\n`;
await fs.writeFile(path.join(destination, '先看这里.txt'), '\ufeff' + readme.replaceAll('\n', '\r\n'));
console.log('创建可直接发送的 ZIP（包含顶层 Starsector-Web 文件夹）……');
const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
command(powershell, ['-NoProfile', '-NonInteractive', '-Command',
  '$ErrorActionPreference="Stop"; Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory($env:STARSECTOR_PACKAGE_STAGE,$env:STARSECTOR_PACKAGE_ZIP,[System.IO.Compression.CompressionLevel]::Optimal,$false)'],
{ ...process.env, STARSECTOR_PACKAGE_STAGE: stage, STARSECTOR_PACKAGE_ZIP: zip });
const sha256 = await sha256File(zip);
const report = { zip, folder: destination, sha256, zipBytes: (await fs.stat(zip)).size, ...manifest };
await fs.writeFile(path.join(output, `${id}.json`), JSON.stringify(report, null, 2) + '\n');
const updateEntry = { schema: 1, repository: UPDATE_REPOSITORY, version, variant: manifest.update.variant,
  package: { id, asset: path.basename(zip), bytes: report.zipBytes, sha256, build: buildId, bootstrapVersion: BOOTSTRAP_VERSION } };
await fs.writeFile(path.join(output, `${id}.update.json`), JSON.stringify(updateEntry, null, 2) + '\n');
console.log(JSON.stringify({ zip, folder: destination, zipMiB: +(report.zipBytes / 1024 ** 2).toFixed(1), node: process.version }, null, 2));
