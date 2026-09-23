/** Original BaseIndustry storage methods with minimal non-economic engine dependencies. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
function block(text, signature) {
    const start = text.indexOf(signature); assert.ok(start >= 0, signature);
    let end = text.indexOf('{', start) + 1, depth = 1;
    for (; end < text.length && depth; end++) { if (text[end] === '{') depth++; else if (text[end] === '}') depth--; }
    assert.equal(depth, 0); return text.slice(start, end);
}
const j = JSON.stringify, number = v => Object.is(v, -0) ? '-0.0f' : v + 'f';
function statInit(target, stat) {
    if (stat === null) return target + '=null;';
    return target + '=new MutableStat(' + number(stat.base) + ');' + ['flat', 'percent', 'mult'].map(channel => stat.modifiers[channel].map(m => target + '.modify' + channel[0].toUpperCase() + channel.slice(1) + 'Always(' + j(m.id) + ',' + number(m.value) + ',null);').join('')).join('');
}
function mapInit(target, map) {
    if (map === null) return target + '=null;';
    return target + '=new LinkedHashMap<>();' + Object.entries(map).map(([id, amount]) => '{MutableCommodityQuantity q=new MutableCommodityQuantity();' + statInit('q.quantity', amount) + target + '.put(' + j(id) + ',q);}').join('');
}
export function nativeIndustryStorageSnapshots(cases) {
    const root = fileURLToPath(new URL('../..', import.meta.url)), api = join(root, 'decompiled/starfarer.api/com/fs/starfarer/api'), dir = mkdtempSync(join(tmpdir(), 'campaign-storage-'));
    const read = path => readFileSync(join(api, path), 'utf8');
    try {
        for (const name of ['MutableStat', 'StatBonus']) writeFileSync(join(dir, name + '.java'), read('combat/' + name + '.java').replace(/^package .*;\r?\n/m, '').replace(/^import com\.fs\.starfarer\..*;\r?\n/gm, ''));
        const base = read('impl/campaign/econ/impl/BaseIndustry.java');
        const scenarios = cases.map((p, i) => 'static void scenario' + i + '(){BaseIndustry b=new BaseIndustry();b.id=' + j(p.industryId) + ';b.alias=' + j(p.classAlias) + ';b.buildTime=' + number(p.buildTime) + ';' + ['supplyBonus', 'demandReduction', 'income', 'upkeep'].map(k => statInit('b.' + k, p[k])).join('') + mapInit('b.supply', p.supply) + mapInit('b.demand', p.demand) + 'if(b.readResolve()!=b)throw new AssertionError();String before=snapshot(b);Object supply=b.supply,demand=b.demand,income=b.income,upkeep=b.upkeep;b.doPostSaveRestore();System.out.println(' + j('{"readResolved":') + '+before+' + j(',"restored":') + '+snapshot(b)+' + j(',"freshStorage":') + '+(supply!=b.supply&&demand!=b.demand&&income!=b.income&&upkeep!=b.upkeep)+' + j('}') + ');}').join('\n');
        const java = String.raw`import java.util.*;
class IndustrySpecAPI{}
class Settings{IndustrySpecAPI getIndustrySpec(String id){return new IndustrySpecAPI();}}
class Global{static Settings settings=new Settings();static Settings getSettings(){return settings;}}
class MutableCommodityQuantity{MutableStat quantity;MutableStat getQuantity(){return quantity;}}
class BaseIndustry{String id,alias,modId;String[]modIds;float buildTime;IndustrySpecAPI spec;MutableStat supplyBonus,demandReduction,income,upkeep;Map<String,MutableCommodityQuantity>supply,demand;
${block(base, 'protected Object readResolve(')}
${block(base, 'public void doPostSaveRestore(')}
}
public class Oracle{
static String mods(Map<String,MutableStat.StatMod>m){StringJoiner j=new StringJoiner(",","[","]");for(MutableStat.StatMod v:m.values())j.add("{\"id\":\""+v.source+"\",\"value\":"+(double)v.value+"}");return j.toString();}
static String stat(MutableStat s){if(s==null)return "null";return "{\"base\":"+(double)s.getBaseValue()+",\"modifiers\":{\"flat\":"+mods(s.getFlatMods())+",\"percent\":"+mods(s.getPercentMods())+",\"mult\":"+mods(s.getMultMods())+"}}";}
static String quantities(Map<String,MutableCommodityQuantity>m){if(m==null)return "null";StringJoiner j=new StringJoiner(",","{","}");for(String id:m.keySet())j.add("\""+id+"\":"+stat(m.get(id).getQuantity()));return j.toString();}
static String snapshot(BaseIndustry b){return "{\"industryId\":\""+b.id+"\",\"classAlias\":\""+b.alias+"\",\"buildTime\":"+(double)b.buildTime+",\"supplyBonus\":"+stat(b.supplyBonus)+",\"demandReduction\":"+stat(b.demandReduction)+",\"supply\":"+quantities(b.supply)+",\"demand\":"+quantities(b.demand)+",\"income\":"+stat(b.income)+",\"upkeep\":"+stat(b.upkeep)+"}";}
${scenarios}
public static void main(String[]args){${cases.map((_, i) => 'scenario' + i + '();').join('')}}
}`;
        writeFileSync(join(dir, 'Oracle.java'), java);
        const compiled = spawnSync('javac', ['-encoding', 'UTF-8', '-d', dir, ...['MutableStat', 'StatBonus', 'Oracle'].map(name => join(dir, name + '.java'))], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024, windowsHide: true }); assert.equal(compiled.status, 0, compiled.stderr);
        const run = spawnSync('java', ['-cp', dir, 'Oracle'], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }); assert.equal(run.status, 0, run.stderr);
        return run.stdout.trim().split(/\r?\n/).map(line => JSON.parse(line));
    } finally {
        const target = resolve(dir), parent = resolve(tmpdir()); assert.ok(target.startsWith(parent + sep) && target !== parent);
        for (const file of readdirSync(target)) unlinkSync(join(target, file)); rmdirSync(target);
    }
}
