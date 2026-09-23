/** Actual HeavyIndustry methods with a clock stub accepting already resolved native days, not a whole-engine advance. */
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdtempSync,readdirSync,unlinkSync,rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve,sep } from 'node:path';
import { spawnSync } from 'node:child_process';
function block(t,s){const a=t.indexOf(s);assert.ok(a>=0,s);const b=t.indexOf('{',a);let i=b+1,d=1;for(;i<t.length&&d;i++){if(t[i]==='{')d++;else if(t[i]==='}')d--;}assert.equal(d,0);return t.slice(a,i);}
export function nativeHeavyPollutionOracle(cases){
 const source=readFileSync(new URL('../../decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/HeavyIndustry.java',import.meta.url),'utf8');
 const dir=mkdtempSync(join(tmpdir(),'campaign-heavy-pollution-'));
 try{
 const java=String.raw`import java.util.*;
class SpecialItemData{}
class Clock{float convertToDays(float f){return f;}}
class Sector{Clock getClock(){return new Clock();}}
class Global{static Sector getSector(){return new Sector();}}
class Market{boolean habitable,pollution;List<String>events=new ArrayList<>();boolean hasCondition(String id){return id.equals("habitable")?habitable:pollution;}void addCondition(String id){pollution=true;events.add("{\"action\":\"add\",\"conditionId\":\"pollution\"}");}void removeCondition(String id){pollution=false;events.add("{\"action\":\"remove\",\"conditionId\":\"pollution\"}");}}
class BaseIndustry{SpecialItemData special;Market market=new Market();public void advance(float amount){}public void setSpecialItem(SpecialItemData s){special=s;}}
class HeavyIndustry extends BaseIndustry{float daysWithNanoforge;boolean permaPollution,addedPollution;
${[...source.matchAll(/public static (?:float DAYS_BEFORE_POLLUTION(?:_PERMANENT)? = [0-9.]+f|String POLLUTION_ID = "pollution");/g)].map(m=>m[0]).join('\n')}
${['public void advance(float amount)','protected void updatePollutionStatus()','public void setSpecialItem(SpecialItemData special)'].map(sig=>block(source,sig)).join('\n')}
}
public class Oracle{public static void main(String[]args){Scanner scanner=new Scanner(System.in);while(scanner.hasNextLine()){String[]x=scanner.nextLine().split("\\|");HeavyIndustry h=new HeavyIndustry();h.daysWithNanoforge=Float.parseFloat(x[0]);h.permaPollution=x[1].equals("1");h.addedPollution=x[2].equals("1");h.market.habitable=x[3].equals("1");h.market.pollution=x[4].equals("1");h.special=x[5].equals("1")?new SpecialItemData():null;if(x[6].equals("advance"))h.advance(Float.parseFloat(x[7]));else if(x[6].equals("special-item-set"))h.setSpecialItem(h.special);else h.updatePollutionStatus();System.out.println("{\"state\":{\"daysWithNanoforge\":"+(double)h.daysWithNanoforge+",\"permaPollution\":"+h.permaPollution+",\"addedPollution\":"+h.addedPollution+"},\"pollutionPresent\":"+h.market.pollution+",\"conditionEffects\":["+String.join(",",h.market.events)+"]}");}}}
`;
 writeFileSync(join(dir,'Oracle.java'),java);const c=spawnSync('javac',['-encoding','UTF-8','-d',dir,join(dir,'Oracle.java')],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(c.status,0,c.stderr);
 const input=cases.map(p=>[p.state.daysWithNanoforge,p.state.permaPollution?1:0,p.state.addedPollution?1:0,p.habitable?1:0,p.pollutionPresent?1:0,p.specialItemId===null?0:1,p.event,p.days??0].join('|')).join('\n')+'\n';
 const r=spawnSync('java',['-cp',dir,'Oracle'],{encoding:'utf8',input,windowsHide:true,timeout:30000,maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr);return r.stdout.trim().split(/\r?\n/).map(s=>JSON.parse(s));
 }finally{const a=resolve(dir),root=resolve(tmpdir());assert.ok(a!==root&&a.startsWith(root+sep));for(const file of readdirSync(a))unlinkSync(join(a,file));rmdirSync(a);}
}
