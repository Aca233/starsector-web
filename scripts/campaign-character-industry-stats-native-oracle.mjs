import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {parseFactionText} from './import-campaign-factions.mjs';
import {ORIGINAL_CHARACTER_INDUSTRY_STATS as R} from '../src/campaign/rules/OriginalCharacterIndustryStats.mjs';
function block(t,s){const a=t.indexOf(s);assert.ok(a>=0,s);let i=t.indexOf('{',a)+1,d=1;for(;d&&i<t.length;i++){if(t[i]==='{')d++;else if(t[i]==='}')d--;}assert.equal(d,0);return t.slice(a,i);}
export function nativeCharacterIndustrySnapshots(cases){
 const root=fileURLToPath(new URL('../..',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'campaign-char-industry-'));
 const api='starfarer.api/com/fs/starfarer/api/',obf='starfarer_obf/com/fs/starfarer/';const read=p=>readFileSync(join(root,'decompiled',p),'utf8');
 try{
  for(const name of ['MutableStat','StatBonus'])writeFileSync(join(dir,name+'.java'),read(api+'combat/'+name+'.java').replace(/^package .*;\r?\n/m,'').replace(/^import com\.fs\.starfarer\.api\.combat\..*;\r?\n/gm,''));
  const stats=read(obf+'campaign/CharacterStats.java'),dynamic=read(obf+'util/DynamicStats.java'),planning=read(api+'impl/campaign/skills/IndustrialPlanning.java');
  const callbacks=R.effects.map(e=>{const name=e.script.split('$')[1],body=block(planning,'public static class '+name);return 'static class '+name+' implements CharacterStatsSkillEffect{'+block(body,'public void apply(')+block(body,'public void unapply(')+'}';}).join('\n');
  const setups=R.knownSkillIds.map(id=>{const s=parseFactionText(readFileSync(join(root,'starsector-core/data/characters/skills',id+'.skill'),'utf8'));return '{SkillSpec s=new SkillSpec('+JSON.stringify(id)+');'+s.effectGroups.flatMap(g=>g.effects.map(e=>'s.effects.add(new SkillSpec.SkillEffectSpec('+JSON.stringify(id)+',SkillEffectType.'+(['CHARACTER_STATS','FLEET'].includes(e.type)?e.type:'OTHER')+','+(g.requiredSkillLevel??1)+'f,'+(R.effects.some(x=>'com.fs.starfarer.api.impl.campaign.skills.'+x.script===e.script)?'new '+e.script.replace('com.fs.starfarer.api.impl.campaign.skills.','').replace('$','.')+'()':'new Noop()')+'));')).join('')+'SpecStore.specs.put(s.id,s);}';}).join('\n');
  const java=String.raw`import java.util.*;import org.json.*;
interface MutableCharacterStatsAPI{DynamicStats getDynamic();}
interface CharacterStatsSkillEffect{void apply(MutableCharacterStatsAPI s,String id,float level);void unapply(MutableCharacterStatsAPI s,String id);}
class Noop implements CharacterStatsSkillEffect{public void apply(MutableCharacterStatsAPI s,String id,float level){}public void unapply(MutableCharacterStatsAPI s,String id){}}
// Other callbacks/listeners intentionally do not model fleet, officer or world effects in this four-channel projection probe.
class IndustrialPlanning{${planning.split('\n').filter(l=>/public static (?:final )?(?:float|int) /.test(l)).join('\n')}${callbacks}}
enum SkillEffectType{CHARACTER_STATS,FLEET,OTHER}
class DynamicStats{Map<String,StatBonus>mods=new HashMap<>();${block(dynamic,'public StatBonus getMod(')}${block(dynamic,'public float getValue(String string2, float f2)')}}
class SkillSpec{String id;List<SkillEffectSpec>effects=new ArrayList<>();SkillSpec(String id){this.id=id;}String getId(){return id;}boolean isAptitudeEffect(){return false;}String getGoverningAptitudeId(){return "unused";}int getTier(){return 0;}List<SkillEffectSpec>getEffects(){return effects;}
static class SkillEffectSpec{String governing;SkillEffectType type;float required;CharacterStatsSkillEffect effect;SkillEffectSpec(String g,SkillEffectType t,float r,CharacterStatsSkillEffect e){governing=g;type=t;required=r;effect=e;}String getGoverningSkill(){return governing;}SkillEffectType getType(){return type;}float getRequiredSkillLevel(){return required;}CharacterStatsSkillEffect getAsStatsEffect(){return effect;}CharacterStatsSkillEffect getAsFleetEffect(){return effect;}}}
class SpecStore{static Map<String,SkillSpec>specs=new LinkedHashMap<>();static Set<String>\u00d400000(Class<?>c){return specs.keySet();}static SkillSpec o00000(Class<?>c,String id){return specs.get(id);}}
class SkillLevel{SkillSpec skill;float level;SkillLevel(SkillSpec s,float l){skill=s;level=l;}SkillSpec getSkill(){return skill;}float getLevel(){return level;}}
class Aptitude{String \u00f800000(){return "unused";}}class AptitudeLevel{Aptitude getAptitude(){return new Aptitude();}void setMaxTier(Integer i){}}
class Fleet{CharacterStats getStats(){return null;}}
class ListenerUtil{static int before,after;static void reportAboutToRefreshCharacterStatEffects(){before++;}static void reportRefreshedCharacterStatEffects(){after++;}}
class CampaignEngine{static final CampaignEngine instance=new CampaignEngine();static CampaignEngine getInstance(){return instance;}CharacterStats getPlayerStats(){return null;}}
class CharacterStats implements MutableCharacterStatsAPI{DynamicStats dynamic=new DynamicStats();public DynamicStats getDynamic(){return dynamic;}boolean skipRefresh;Fleet fleet;List<AptitudeLevel>aptitudes=new ArrayList<>();List<SkillLevel>skills=new ArrayList<>();static Map<String,List<o>>cache=new HashMap<>();static Map<String,List<o>>getEffectCache(){return cache;}
static class o{SkillSpec.SkillEffectSpec o00000;String effectId;o(SkillSpec.SkillEffectSpec e,String id){o00000=e;effectId=id;}}List<o>getFleetEffects(){return new ArrayList<>();}void refreshAllOutpostsEffectsForPlayerOutposts(){}
${['public float getSkillLevel(String','public List<o> getStatsEffects()','public void refreshCharacterStatsEffects(boolean bl)'].map(s=>block(stats,s).replaceAll('.new','.effectId')).join('\n')}
}
public class Oracle{
static void fill(StatBonus s,JSONObject p)throws Exception{for(String ch:new String[]{"flat","percent","mult"}){JSONArray a=p.getJSONArray(ch);for(int i=0;i<a.length();i++){JSONObject m=a.getJSONObject(i);String id=m.getString("id");float v=(float)m.getDouble("value");if(ch.equals("flat"))s.modifyFlatAlways(id,v,null);else if(ch.equals("percent"))s.modifyPercentAlways(id,v,null);else s.modifyMultAlways(id,v,null);}}}
static JSONArray mods(Map<String,MutableStat.StatMod>m)throws Exception{JSONArray a=new JSONArray();for(MutableStat.StatMod v:m.values())a.put(new JSONObject().put("id",v.source).put("value",(double)v.value));return a;}
static JSONObject bonus(StatBonus s)throws Exception{return new JSONObject().put("flat",mods(s.getFlatBonuses())).put("percent",mods(s.getPercentBonuses())).put("mult",mods(s.getMultBonuses()));}
static JSONObject run(JSONObject p)throws Exception{CharacterStats s=new CharacterStats();s.skipRefresh=p.getBoolean("skipRefresh");String[]names={"supplyBonus","demandReduction","fuelSupplyBonus","customProduction"},keys={"supply_bonus","demand_reduction","fuel_supply_bonus","custom_production_mod"};JSONObject input=p.getJSONObject("modifiers");for(int i=0;i<4;i++)if(!input.isNull(names[i]))fill(s.getDynamic().getMod(keys[i]),input.getJSONObject(names[i]));JSONArray skills=p.getJSONArray("skills");for(int i=0;i<skills.length();i++){JSONObject x=skills.getJSONObject(i);s.skills.add(new SkillLevel(SpecStore.specs.get(x.getString("skillId")),(float)x.getDouble("level")));}ListenerUtil.before=ListenerUtil.after=0;s.refreshCharacterStatsEffects(true);JSONObject out=new JSONObject(),state=new JSONObject(),values=new JSONObject();String[]getterNames={"adminSupplyBonus","adminDemandReduction","adminFuelSupplyBonus"};for(int i=0;i<3;i++)values.put(getterNames[i],(double)s.getDynamic().getValue(keys[i],0f));for(int i=0;i<4;i++)state.put(names[i],s.getDynamic().mods.containsKey(keys[i])?bonus(s.getDynamic().mods.get(keys[i])):JSONObject.NULL);return out.put("modifiers",state).put("industryInputs",values).put("beforeListeners",ListenerUtil.before);}
public static void main(String[]args)throws Exception{${setups}Scanner in=new Scanner(System.in,"UTF-8");while(in.hasNextLine())System.out.println(run(new JSONObject(in.nextLine())).toString());}}
`;
  writeFileSync(join(dir,'Oracle.java'),java);const classpath=[dir,join(root,'starsector-core/json.jar')].join(delimiter);
  const compiled=spawnSync('javac',['--release','17','-encoding','UTF-8','-cp',classpath,'-d',dir,join(dir,'MutableStat.java'),join(dir,'StatBonus.java'),join(dir,'Oracle.java')],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:5000000});assert.equal(compiled.status,0,compiled.stderr);
  const run=spawnSync(join(root,'jre/bin/java.exe'),['-Djava.awt.headless=true','-cp',classpath,'Oracle'],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:8000000,input:cases.map(c=>JSON.stringify(c)).join('\n')+'\n'});assert.equal(run.status,0,run.stderr);return run.stdout.trim().split(/\r?\n/).map(l=>JSON.parse(l));
 }finally{const parent=resolve(tmpdir()),target=resolve(dir);assert.ok(target.startsWith(parent+sep)&&target!==parent);for(const f of readdirSync(target))unlinkSync(join(target,f));rmdirSync(target);}
}
