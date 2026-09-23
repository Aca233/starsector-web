import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { originalIndustryDisruptionKey } from '../src/campaign/rules/OriginalIndustryRuntime.mjs';
function block(t, s) { const a=t.indexOf(s);assert.ok(a>=0,s);let i=t.indexOf('{',a)+1,d=1;for(;i<t.length&&d;i++){if(t[i]==='{')d++;else if(t[i]==='}')d--;}assert.equal(d,0);return t.slice(a,i); }
const j=JSON.stringify,n=value=>Object.is(value,-0)?'-0.0f':value+'f';
export function nativeIndustryRuntimeSnapshots(cases) {
    const root=fileURLToPath(new URL('../..',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'campaign-runtime-'));
    const read=p=>readFileSync(join(root,'decompiled',p),'utf8');
    try {
        const memory=read('starfarer_obf/com/fs/starfarer/campaign/rules/Memory.java'),base=read('starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/BaseIndustry.java');
        const runtimeClass=p=>originalIndustryDisruptionKey(p.industryId).slice('$core_disrupted_'.length);
        const classes=[...new Set(cases.map(runtimeClass))].map(name=>'class '+name+' extends BaseIndustry{}').join('\n');
        const scenarios=cases.map((p,index)=>{
            const d=p.disruption,v=typeof d.value==='string'?j(d.value):typeof d.value==='boolean'?String(d.value):n(d.value);
            return 'static void scenario'+index+'(){BaseIndustry b=new '+runtimeClass(p)+'();b.building='+p.building+';b.upgradeId='+j(p.upgradeId)+';b.improved='+p.improved+';'+(d.present?'b.market.memory.data.put('+j(d.key)+','+v+');':'')+d.expires.map(days=>'{Memory.Expire e=new Memory.Expire();e.key='+j(d.key)+';e.timeLeft='+n(days)+';b.market.memory.expire.add(e);}').join('')+'System.out.println(snapshot(b));}';
        }).join('\n');
        const java=String.raw`import java.util.*;
interface DoNotObfuscate{}
class Memory{LinkedHashMap<String,Object>data=new LinkedHashMap<>();List<Expire>expire=new ArrayList<>();boolean restored=false;
// Primitive key projection only. Entity references are outside this oracle's captured inputs.
void replaceIdsWithEntities(LinkedHashMap<String,Object>data){}
${['public boolean contains(', 'public boolean getBoolean(', 'public String getString(', 'public float getExpire(', 'public boolean is(String string2, boolean', 'public static class Expire'].map(s=>block(memory,s)).join('\n')}
}
class Market{Memory memory=new Memory();Memory getMemoryWithoutUpdate(){return memory;}}
class BaseIndustry{String dKey,upgradeId;Boolean improved;boolean building;Market market=new Market();
${['public String getDisruptedKey(', 'public float getDisruptedDays(', 'public boolean isDisrupted(', 'public boolean isImproved('].map(s=>block(base,s)).join('\n')}
}
${classes}
public class Oracle{
static String snapshot(BaseIndustry b){return "{\"scope\":\"native-industry-getters-without-time-advance\",\"disruptionKey\":\""+b.getDisruptedKey()+"\",\"operating\":{\"building\":"+b.building+",\"disrupted\":"+b.isDisrupted()+",\"upgradeId\":"+(b.upgradeId==null?"null":"\""+b.upgradeId+"\"")+"},\"improved\":"+b.isImproved()+",\"expiresIn\":"+(double)b.market.memory.getExpire(b.getDisruptedKey())+",\"disruptedDays\":"+(double)b.getDisruptedDays()+"}";}
${scenarios}
public static void main(String[]args){${cases.map((_,i)=>'scenario'+i+'();').join('')}}
}`;
        writeFileSync(join(dir,'Oracle.java'),java);
        const compiled=spawnSync('javac',['-encoding','UTF-8','-d',dir,join(dir,'Oracle.java')],{encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true});assert.equal(compiled.status,0,compiled.stderr);
        const run=spawnSync('java',['-cp',dir,'Oracle'],{encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024,windowsHide:true});assert.equal(run.status,0,run.stderr);
        return run.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
    } finally {const target=resolve(dir),parent=resolve(tmpdir());assert.ok(target.startsWith(parent+sep)&&target!==parent);for(const file of readdirSync(target))unlinkSync(join(target,file));rmdirSync(target);}
}
