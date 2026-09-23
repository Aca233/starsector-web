import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep,delimiter} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {ORIGINAL_ADMINISTRATORS as R} from '../src/campaign/rules/OriginalAdministrator.mjs';
function block(t,s){const a=t.indexOf(s);assert.ok(a>=0,s);let i=t.indexOf('{',a)+1,d=1;for(;d&&i<t.length;i++){if(t[i]==='{')d++;else if(t[i]==='}')d--;}assert.equal(d,0);return t.slice(a,i);}
export function nativeAdministratorSnapshots(cases){
 const root=fileURLToPath(new URL('../..',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'campaign-admin-'));
 const read=p=>readFileSync(join(root,'decompiled/starfarer_obf/com/fs/starfarer',p),'utf8');
 try{
  const market=read('campaign/econ/Market.java'),person=read('rpg/Person.java');
  const java=String.raw`import java.util.*;import org.json.*;
interface PersonAPI{}
class CharacterStats{String owner;void refreshGovernedOutpostEffects(Market m){m.refreshes.add(owner);}}
class Person implements PersonAPI{String objectRef,portraitSprite;CharacterStats stats=new CharacterStats();static int created;
Person(String ignored){objectRef="generated-default";portraitSprite=StarfarerSettings.defaultPortrait;stats.owner=objectRef;created++;}void setFaction(String id){}CharacterStats getStats(){return stats;}
${block(person,'public boolean isDefault()')}
void restorePortrait(){${block(block(person,'Object readResolve()'),'if (this.portraitSprite == null)')}}
}
class StarfarerSettings{static String defaultPortrait=${JSON.stringify(R.defaultPortrait)};static String cfr_renamed_8(String a,String b){return defaultPortrait;}}
class Sector{Person player;PersonAPI getPlayerPerson(){return player;}}
class Global{static Sector sector=new Sector();static Sector getSector(){return sector;}}
class Market{Person admin;boolean playerOwned;List<String>sets=new ArrayList<>(),refreshes=new ArrayList<>();boolean isPlayerOwned(){return playerOwned;}String getFactionId(){return "test_faction";}
void setAdmin(PersonAPI p){boolean changed=admin!=p;admin=(Person)p;sets.add(admin==null?"null":admin.objectRef);if(changed&&admin!=null)admin.getStats().refreshGovernedOutpostEffects(this);}
${block(market,'public Person getAdmin()')}
}
public class Oracle{
static Person person(JSONObject p)throws Exception{Person v=new Person("steady");v.objectRef=p.getString("objectRef");v.stats.owner=v.objectRef;v.portraitSprite=p.isNull("portrait")?null:p.getString("portrait");v.restorePortrait();return v;}
static JSONObject run(JSONObject p)throws Exception{JSONObject s=new JSONObject(p.getString("skillsJSON"));JSONArray skills=new JSONArray();String[] ids=JSONObject.getNames(s);if(ids!=null)for(String id:ids)skills.put(new JSONObject().put("skillId",id).put("level",(double)(float)s.getDouble(id)));JSONObject out=new JSONObject().put("skills",skills);
JSONObject input=p.getJSONObject("identity");Market m=new Market();m.playerOwned=input.getBoolean("playerOwned");m.admin=input.isNull("administrator")?null:person(input.getJSONObject("administrator"));Person player=input.isNull("player")?null:person(input.getJSONObject("player"));if(m.admin!=null&&player!=null&&m.admin.objectRef.equals(player.objectRef))player=m.admin;Global.sector.player=player;Person.created=0;Person selected=m.getAdmin();out.put("admin",new JSONObject().put("selectedRef",selected==null?JSONObject.NULL:selected.objectRef).put("isDefault",selected==null?JSONObject.NULL:selected.isDefault()).put("created",Person.created).put("sets",new JSONArray(m.sets)).put("refreshes",new JSONArray(m.refreshes)));return out;}
public static void main(String[]args)throws Exception{Scanner in=new Scanner(System.in,"UTF-8");while(in.hasNextLine())System.out.println(run(new JSONObject(in.nextLine())).toString());}}
`;
  writeFileSync(join(dir,'Oracle.java'),java);const cp=[dir,join(root,'starsector-core/json.jar')].join(delimiter);
  const compiled=spawnSync('javac',['--release','17','-encoding','UTF-8','-cp',cp,'-d',dir,join(dir,'Oracle.java')],{windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:4000000});assert.equal(compiled.status,0,compiled.stderr);
  // Run with the actual bundled Java17, not the machine's potentially different default JDK.
  const run=spawnSync(join(root,'jre/bin/java.exe'),['-Djava.awt.headless=true','-cp',cp,'Oracle'],{windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:5000000,input:cases.map(c=>JSON.stringify(c)).join('\n')+'\n'});assert.equal(run.status,0,run.stderr);
  return run.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
 }finally{const parent=resolve(tmpdir()),target=resolve(dir);assert.ok(target.startsWith(parent+sep)&&target!==parent);for(const f of readdirSync(target))unlinkSync(join(target,f));rmdirSync(target);}
}