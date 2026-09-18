import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { build as graphBuild } from 'esbuild';
import { build, Platform, Arch } from 'electron-builder';
import { versionParts } from '../server/portable-update.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
let version = pkg.version;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--version' && args[i + 1]) version = args[++i];
  else if (!['--skip-build', '--dir'].includes(args[i])) throw Error('Supported options: --skip-build, --dir, --version x.y.z');
}
versionParts(version);
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('请在 Windows x64 上构建 Electron 安装包');
if (!args.includes('--skip-build')) {
  if (!process.env.npm_execpath) throw Error('请使用 npm run package:electron');
  const result = spawnSync(process.execPath, [process.env.npm_execpath, 'run', 'build'], { cwd: project, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('前端构建失败');
}
await fs.access(path.join(project, 'dist', 'index.html'));
const { build: buildId } = JSON.parse(await fs.readFile(path.join(project, 'dist', 'lan-build.json'), 'utf8'));
const stamp = new Date().toISOString().replace(/\D/g, '');
const staging = path.join(project, 'artifacts', 'electron-staging', stamp);
const backend = path.join(staging, 'backend');
const output = path.join(project, 'artifacts', 'electron', `${version}-${stamp}`);
await fs.mkdir(backend, { recursive: true });
await fs.mkdir(output, { recursive: true });
async function copy(source, destination) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true, dereference: true, errorOnExist: true, force: false });
}
const graph = await graphBuild({ absWorkingDir: project, entryPoints: ['server/electron-service.mjs'],
  outdir: path.join(staging, 'graph'), bundle: true, write: false, metafile: true,
  platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
const inputs = Object.keys(graph.metafile.inputs).sort();
for (const file of inputs) {
  const resolved = path.resolve(project, file);
  if (!resolved.startsWith(project + path.sep) || !/^(server|src)\//.test(file.replaceAll('\\', '/'))
    || !['.mjs', '.js', '.json'].includes(path.extname(file))) throw Error('Unexpected backend dependency: ' + file);
  await copy(resolved, path.join(backend, file));
}
const external = new Set(Object.values(graph.metafile.inputs).flatMap(input => input.imports)
  .filter(item => item.external && !item.path.startsWith('node:')).map(item => item.path));
if ([...external].some(name => !['ws', '@msgpack/msgpack', 'steamworks.js'].includes(name))) throw Error('New backend dependency needs packaging: ' + [...external]);
await copy(path.join(project, 'dist'), path.join(backend, 'dist'));
for (const name of ['ws', '@msgpack/msgpack']) await copy(path.join(project, 'node_modules', name), path.join(backend, 'node_modules', name));
// The Steam bridge uses a dynamic native require. Ship only the Windows x64 N-API binary/DLLs.
for (const file of ['index.js', 'package.json', 'LICENSE', 'dist/win64']) {
  await copy(path.join(project, 'node_modules', 'steamworks.js', file), path.join(backend, 'node_modules', 'steamworks.js', file));
}
await fs.writeFile(path.join(backend, 'package.json'), JSON.stringify({ name: 'starsector-desktop-backend', version, private: true, type: 'module' }));
await fs.writeFile(path.join(backend, 'desktop-build.json'), JSON.stringify({ version, build: buildId, serverFiles: inputs }, null, 2));
const licenses = path.join(staging, 'licenses');
for (const name of ['react', 'react-dom', 'scheduler', 'lucide-react', 'ws', 'steamworks.js', '@msgpack/msgpack']) {
  await copy(path.join(project, 'node_modules', name, 'LICENSE'), path.join(licenses, name.replaceAll('/', '-') + '.txt'));
}
const electronDist = path.dirname(createRequire(import.meta.url)('electron'));
const artifacts = await build({ projectDir: project, targets: Platform.WINDOWS.createTarget(args.includes('--dir') ? ['dir'] : ['nsis', 'zip'], Arch.x64),
  publish: 'never', config: {
    appId: 'com.aca233.starsectorweb', productName: 'Starsector Web', electronVersion: pkg.devDependencies.electron, electronDist,
    directories: { output, buildResources: path.join(project, 'desktop') },
    extraMetadata: { version, main: 'desktop/main.mjs' }, asar: true, npmRebuild: false,
    files: ['desktop/**/*.mjs', 'package.json', '!node_modules/steamworks.js{,/**/*}', '!node_modules/@types{,/**/*}'],
    extraResources: [{ from: backend, to: 'backend' }, { from: licenses, to: 'licenses' },
      { from: path.join(project, 'docs', 'electron-desktop.md'), to: 'desktop-guide.md' }],
    extraFiles: [{ from: path.join(project, 'node_modules', 'steamworks.js', 'dist', 'win64', 'steam_api64.dll'), to: 'steam_api64.dll' }],
    win: { artifactName: 'Starsector-Web-Desktop-${version}-${arch}.${ext}' },
    nsis: { artifactName: 'Starsector-Web-Desktop-Setup-${version}-${arch}.${ext}', oneClick: false,
      perMachine: false, allowElevation: false, allowToChangeInstallationDirectory: true,
      deleteAppDataOnUninstall: false, createDesktopShortcut: true, runAfterFinish: false },
    publish: [{ provider: 'github', owner: 'Aca233', repo: 'starsector-web', releaseType: 'release' }],
  } });
const report = { version, build: buildId, output, artifacts, executable: path.join(output, 'win-unpacked', 'Starsector Web.exe') };
await fs.writeFile(path.join(output, 'desktop-build-report.json'), JSON.stringify(report, null, 2) + '\n');
await fs.mkdir(path.join(project, 'artifacts', 'electron'), { recursive: true });
await fs.writeFile(path.join(project, 'artifacts', 'electron', 'latest-build.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
