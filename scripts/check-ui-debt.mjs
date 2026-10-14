// UI debt metrics for docs/uiux-rework-plan-2026-10-01.md. Read-only.
// Usage: node scripts/check-ui-debt.mjs [--json out.json] [--compare baseline.json]
// Campaign UI (src/campaign) is reported separately: it is outside the rework scope.
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {join, relative} from 'node:path';

const ROOT = 'src';
const CAMPAIGN = 'src/campaign';
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else out.push(path.replaceAll('\\', '/'));
  }
  return out;
}
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

function measure(files, sources) {
  const css = files.filter(f => f.endsWith('.css'));
  const tsx = files.filter(f => /\.(tsx|ts)$/.test(f));
  const classOwners = new Map();
  const m = {cssFiles: css.length, cssLines: 0, colorLiterals: 0, tinyFontSizes: 0, important: 0, importantByFile: {}, inlineStyle: 0, cssImports: 0};
  for (const f of css) {
    const raw = sources.get(f), body = stripComments(raw);
    m.cssLines += raw.split('\n').length;
    m.colorLiterals += (body.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi) ?? []).length;
    m.tinyFontSizes += [...body.matchAll(/font(?:-size)?\s*:[^;}]*?\b(\d+(?:\.\d+)?)px/g)].filter(x => Number(x[1]) <= 10).length;
    const imp = (body.match(/!important/g) ?? []).length;
    if (imp) m.importantByFile[f] = imp;
    m.important += imp;
    for (const block of body.matchAll(/([^{}]+)\{/g)) {
      if (/^\s*@/.test(block[1])) continue;
      for (const cls of block[1].matchAll(/\.([a-zA-Z_][\w-]*)/g)) {
        if (!classOwners.has(cls[1])) classOwners.set(cls[1], new Set());
        classOwners.get(cls[1]).add(f);
      }
    }
  }
  for (const f of tsx) {
    const src = sources.get(f);
    m.inlineStyle += (src.match(/style=\{\{/g) ?? []).length;
    m.cssImports += (src.match(/^\s*import\s+(?:[^'"]*from\s+)?['"][^'"]+\.css['"]/gm) ?? []).length;
  }
  const multi = [...classOwners].filter(([, s]) => s.size >= 3).sort((a, b) => b[1].size - a[1].size);
  m.multiOwnerClasses = multi.length;
  m.topMultiOwner = Object.fromEntries(multi.slice(0, 15).map(([c, s]) => [c, s.size]));
  return m;
}

const all = (await walk(ROOT)).filter(f => /\.(css|tsx|ts)$/.test(f));
const sources = new Map(await Promise.all(all.map(async f => [f, await readFile(f, 'utf8')])));
const inScope = all.filter(f => !f.startsWith(CAMPAIGN + '/'));
const result = {date: new Date().toISOString(), scope: measure(inScope, sources), campaign: measure(all.filter(f => f.startsWith(CAMPAIGN + '/')), sources)};

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const baselinePath = flag('--compare');
if (baselinePath) {
  const base = JSON.parse(await readFile(baselinePath, 'utf8')).scope;
  result.delta = Object.fromEntries(Object.entries(result.scope).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, v - base[k]]));
}
const out = flag('--json');
if (out) await writeFile(out, JSON.stringify(result, null, 2));
const {topMultiOwner: _topMultiOwner, importantByFile: _importantByFile, ...summary} = result.scope;
console.log(JSON.stringify({scope: summary, delta: result.delta, files: relative('.', ROOT)}, null, 1));
