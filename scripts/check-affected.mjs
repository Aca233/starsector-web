import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {checkCatalog, selectChecks} from './lib/check-catalog.mjs';
const root = path.resolve(import.meta.dirname, '..'), args = process.argv.slice(2);
const values = flag => args.flatMap((argument, i) => argument === flag ? [args[i + 1]] : []);
const valueFlags = ['--file', '--domain', '--check', '--json'];
for (let i = 0; i < args.length; i++) {
  if (valueFlags.includes(args[i])) {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw Error(`${args[i]} requires a value`);
    i++;
  } else if (!['--catalog', '--run', '--help'].includes(args[i])) throw Error('Unknown option: ' + args[i]);
}
if (args.includes('--help')) {
  console.log('Preview: node scripts/check-affected.mjs [--file <path>] [--domain <domain>] [--json <report>]\n'
    + 'Run the same selection: add --run. With no selectors, use tracked and untracked Git changes.\n'
    + 'Inventory: --catalog. Manual check selection: --check <id> (repeatable).\n'
    + 'Domains: foundation, combat, campaign, content, persistence, network, ui.');
  process.exit(0);
}
if (args.includes('--catalog') && (args.includes('--run') || values('--file').length || values('--domain').length || values('--check').length))
  throw Error('--catalog is inventory only. Select files, domains or checks separately.');
if (values('--check').length && (values('--file').length || values('--domain').length)) throw Error('--check cannot be combined with --file or --domain; no selectors are silently ignored.');
const catalog = checkCatalog(root);
const named = values('--check');
for (const id of named) if (!catalog.some(check => check.id === id && check.runnable)) throw Error('Unknown runnable check: ' + id);
let files = values('--file');
files = files.map(file => {
  const relative = path.relative(root, path.resolve(root, file)).replaceAll('\\', '/');
  if (!relative || relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) throw Error('--file must identify a path inside this workspace: ' + file);
  return relative;
});
if (!files.length && !values('--domain').length && !named.length && !args.includes('--catalog')) {
  const tracked = execFileSync('git', ['diff', '--name-only', 'HEAD', '-z'], {cwd: root, encoding: 'utf8'}).split('\0');
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {cwd: root, encoding: 'utf8'}).split('\0');
  files = [...new Set([...tracked, ...untracked].filter(Boolean))];
}
const plan = args.includes('--catalog') ? {checks: catalog} : named.length
  ? {checks: catalog.filter(check => named.includes(check.id))} : selectChecks(catalog, files, values('--domain'));
const report = {...plan, checks: plan.checks.map(({dependencies: _dependencies, ...check}) => check)};
const output = values('--json')[0];
if (output) fs.writeFileSync(path.resolve(output), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (args.includes('--run')) {
  const results = [];
  for (const check of plan.checks) {
    const result = spawnSync(process.execPath, check.command, {cwd: root, stdio: 'inherit', env: process.env, windowsHide: true});
    results.push({id: check.id, exit: result.status, error: result.error?.message});
    if (result.status !== 0 || result.error) process.exitCode = 1;
  }
  console.log(JSON.stringify({results}, null, 2));
}
