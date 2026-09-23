import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseFactionText } from './import-campaign-factions.mjs';
import { ORIGINAL_GOVERNED_SKILLS as R } from '../src/campaign/rules/OriginalGovernedSkills.mjs';
function block(t,s){const a=t.indexOf(s);assert.ok(a>=0,s);let i=t.indexOf('{',a)+1,d=1;for(;d&&i<t.length;i++){if(t[i]==='{')d++;else if(t[i]==='}')d--;}assert.equal(d,0);return t.slice(a,i);}
export function nativeGovernedSkillSnapshots(cases) {
 const root=fileURLToPath(new URL('../..',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'campaign-governed-skills-'));
 const read=p=>readFileSync(join(root,'decompiled',p),'utf8');
 try {
  const api='starfarer.api/com/fs/starfarer/api/',obf='starfarer_obf/com/fs/starfarer/';
  for(const name of ['MutableStat','StatBonus'])writeFileSync(join(dir,name+'.java'),read(api+'combat/'+name+'.java').replace(/^package .*;\r?\n/m,'').replace(/^import com\.fs\.starfarer\.api\.combat\..*;\r?\n/gm,''));
  const stats=read(obf+'campaign/CharacterStats.java'),dynamic=read(obf+'util/DynamicStats.java');
  const classes=['Hypercognition','PlanetaryOperations','SpaceOperations'].map(name=>{const text=read(api+'impl/campaign/skills/'+name+'.java'),effects=R.effects.filter(e=>e.script.startsWith(name+'$'));return 'class '+name+'{'+text.split('\n').filter(l=>/public static (?:final )?(?:int|float) /.test(l)).join('\n')+effects.map(e=>{const nested=e.script.split('$')[1],body=block(text,'public static class '+nested);return 'static class '+nested+' implements MarketSkillEffect{'+block(body,'public void apply(')+block(body,'public void unapply(')+'}';}).join('\n')+'}';}).join('\n');
  const skills=R.knownSkillIds.map(id=>parseFactionText(readFileSync(join(root,'starsector-core/data/characters/skills',id+'.skill'),'utf8')));
  const setups=skills.map(s=>{const effects=s.effectGroups.flatMap(g=>g.effects.map(e=>({type:e.type,script:e.script,level:g.requiredSkillLevel??1})));return '{SkillSpec s=new SkillSpec('+JSON.stringify(s.id)+');'+effects.map(e=>'s.effects.add(new SkillSpec.SkillEffectSpec('+JSON.stringify(s.id)+',SkillEffectType.'+(e.type==='GOVERNED_OUTPOST'?'GOVERNED_OUTPOST':'OTHER')+','+e.level+'f,'+(e.type==='GOVERNED_OUTPOST'?'new '+e.script.replace('com.fs.starfarer.api.impl.campaign.skills.','').replace('$','.')+'()':'null')+'));').join('')+'SpecStore.specs.put(s.id,s);}';}).join('\n');
  const java=String.raw`import java.util.*;import org.json.*;
interface MarketSkillEffect{void apply(MarketAPI m,String id,float level);void unapply(MarketAPI m,String id);}
enum SkillEffectType{GOVERNED_OUTPOST,OTHER}
class DynamicStats{Map<String,StatBonus>mods=new HashMap<>();${block(dynamic,'public StatBonus getMod(')}}
class MutableMarketStats{DynamicStats dynamic=new DynamicStats();DynamicStats getDynamic(){return dynamic;}}
class MarketAPI{StatBonus accessibility=new StatBonus();MutableStat stability=new MutableStat(0);MutableMarketStats stats=new MutableMarketStats();StatBonus getAccessibilityMod(){return accessibility;}MutableStat getStability(){return stability;}MutableMarketStats getStats(){return stats;}}
${classes}
class SkillSpec{String id;List<SkillEffectSpec>effects=new ArrayList<>();SkillSpec(String id){this.id=id;}String getId(){return id;}List<SkillEffectSpec>getEffects(){return effects;}
static class SkillEffectSpec{String governing;SkillEffectType type;float required;MarketSkillEffect effect;SkillEffectSpec(String g,SkillEffectType t,float r,MarketSkillEffect e){governing=g;type=t;required=r;effect=e;}String getGoverningSkill(){return governing;}SkillEffectType getType(){return type;}float getRequiredSkillLevel(){return required;}MarketSkillEffect getAsMarketEffect(){return effect;}}}
class SpecStore{static Map<String,SkillSpec>specs=new LinkedHashMap<>();static Set<String>\u00d400000(Class<?>c){return specs.keySet();}static SkillSpec o00000(Class<?>c,String id){return specs.get(id);}}
class SkillLevel{SkillSpec skill;float level;SkillLevel(SkillSpec s,float l){skill=s;level=l;}SkillSpec getSkill(){return skill;}float getLevel(){return level;}}
class CharacterStats{List<SkillLevel>skills=new ArrayList<>();static Map<String,List<o>>cache=new HashMap<>();static Map<String,List<o>>getEffectCache(){return cache;}
static class o{SkillSpec.SkillEffectSpec o00000;String effectId;o(SkillSpec.SkillEffectSpec e,String id){o00000=e;effectId=id;}}
${['public float getSkillLevel(String', 'public List<o> getOutpostEffects()', 'public void applyGovernedOutpostEffectsToMarket(', 'public void refreshGovernedOutpostEffects('].map(s=>block(stats,s).replaceAll('.new','.effectId')).join('\n')}
}
public class Oracle{
static void fill(StatBonus s,JSONObject p)throws Exception{for(String ch:new String[]{"flat","percent","mult"}){JSONArray a=p.getJSONArray(ch);for(int i=0;i<a.length();i++){JSONObject m=a.getJSONObject(i);String id=m.getString("id");float v=(float)m.getDouble("value");if(ch.equals("flat"))s.modifyFlatAlways(id,v,null);else if(ch.equals("percent"))s.modifyPercentAlways(id,v,null);else s.modifyMultAlways(id,v,null);}}}
static void fill(MutableStat s,JSONObject p)throws Exception{for(String ch:new String[]{"flat","percent","mult"}){JSONArray a=p.getJSONArray(ch);for(int i=0;i<a.length();i++){JSONObject m=a.getJSONObject(i);String id=m.getString("id");float v=(float)m.getDouble("value");if(ch.equals("flat"))s.modifyFlatAlways(id,v,null);else if(ch.equals("percent"))s.modifyPercentAlways(id,v,null);else s.modifyMultAlways(id,v,null);}}}
static JSONArray mods(Map<String,MutableStat.StatMod>m)throws Exception{JSONArray a=new JSONArray();for(MutableStat.StatMod v:m.values())a.put(new JSONObject().put("id",v.source).put("value",(double)v.value));return a;}
static JSONObject bonus(StatBonus s)throws Exception{return new JSONObject().put("flat",mods(s.getFlatBonuses())).put("percent",mods(s.getPercentBonuses())).put("mult",mods(s.getMultBonuses()));}
static JSONObject mutable(MutableStat s)throws Exception{return new JSONObject().put("base",(double)s.getBaseValue()).put("modifiers",new JSONObject().put("flat",mods(s.getFlatMods())).put("percent",mods(s.getPercentMods())).put("mult",mods(s.getMultMods())));}
static JSONObject run(JSONObject input)throws Exception{MarketAPI m=new MarketAPI();JSONObject state=input.getJSONObject("state"),stability=state.getJSONObject("stability");fill(m.accessibility,state.getJSONObject("accessibility"));m.stability=new MutableStat((float)stability.getDouble("base"));fill(m.stability,stability.getJSONObject("modifiers"));String[] names={"combatFleetSize","groundDefenses"},keys={"combat_fleet_size_mult","ground_defenses_mod"};for(int i=0;i<2;i++)if(!state.isNull(names[i]))fill(m.stats.dynamic.getMod(keys[i]),state.getJSONObject(names[i]));CharacterStats c=new CharacterStats();JSONArray skills=input.getJSONArray("skills");for(int i=0;i<skills.length();i++){JSONObject s=skills.getJSONObject(i);c.skills.add(new SkillLevel(SpecStore.specs.get(s.getString("skillId")),(float)s.getDouble("level")));}c.refreshGovernedOutpostEffects(m);return new JSONObject().put("accessibility",bonus(m.accessibility)).put("stability",mutable(m.stability)).put("combatFleetSize",bonus(m.stats.dynamic.getMod(keys[0]))).put("groundDefenses",bonus(m.stats.dynamic.getMod(keys[1])));}
public static void main(String[]args)throws Exception{${setups}Scanner scan=new Scanner(System.in,"UTF-8");while(scan.hasNextLine())System.out.println(run(new JSONObject(scan.nextLine())).toString());}}
`;
  writeFileSync(join(dir,'Oracle.java'),java);
  const cp=[dir,join(root,'starsector-core/json.jar')].join(delimiter);
  const compiled=spawnSync('javac',['-encoding','UTF-8','-cp',cp,'-d',dir,join(dir,'MutableStat.java'),join(dir,'StatBonus.java'),join(dir,'Oracle.java')],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4000000});assert.equal(compiled.status,0,compiled.stderr);
  const run=spawnSync('java',['-Djava.awt.headless=true','-cp',cp,'Oracle'],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8000000,input:cases.map(p=>JSON.stringify(p)).join('\n')+'\n'});assert.equal(run.status,0,run.stderr);
  return run.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
 }finally{const parent=resolve(tmpdir()),target=resolve(dir);assert.ok(target.startsWith(parent+sep)&&target!==parent);for(const file of readdirSync(target))unlinkSync(join(target,file));rmdirSync(target);}
}