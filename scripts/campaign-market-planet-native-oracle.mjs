import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseFactionText } from './import-campaign-factions.mjs';
function block(text, signature) { const start=text.indexOf(signature);assert.ok(start>=0,signature);let end=text.indexOf('{',start)+1,depth=1;for(;depth&&end<text.length;end++){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;}assert.equal(depth,0);return text.slice(start,end); }
/** Actual getter/readResolve/diff methods; renderer side effects are intentionally not emulated. */
export function nativeMarketPlanetSnapshots(cases) {
 const root=fileURLToPath(new URL('../..',import.meta.url)),dir=mkdtempSync(join(tmpdir(),'campaign-planet-getter-'));
 const read=p=>readFileSync(join(root,'decompiled/starfarer_obf/com/fs/starfarer',p),'utf8');
 try {
  const market=read('campaign/econ/Market.java'),planet=read('campaign/CampaignPlanet.java'),spec=read('loading/specs/PlanetSpec.java'),graphics=read('combat/entities/terrain/Planet.java'),colors=read('loading/String.java');
  const diff=block(spec,'public static class PlanetSpecDiff');
  const fields=spec.slice(spec.indexOf('    public float tilt'),spec.indexOf('    private ModSpecAPI sourceMod'));
  const gasInit=spec.split('\n').find(l=>l.includes('this.isGasGiant = jSONObject.optBoolean("isGasGiant", false);'));assert.ok(gasInit);
  const java=String.raw`import java.util.*;import java.awt.Color;import java.lang.reflect.Field;import org.json.*;import org.lwjgl.util.vector.*;
interface PlanetAPI{boolean isGasGiant();}
class SectorEntityToken{String objectRef;}
class BaseCampaignEntity extends SectorEntityToken{protected Object readResolve(){return this;}}
class ColorReader{${block(colors,'public static Color cfr_renamed_2(')}}
class PlanetSpec implements Cloneable{
${fields}
PlanetSpec(JSONObject jSONObject)throws Exception{${gasInit}lightPosition=new Vector3f();}
${['public boolean isGasGiant()', 'public PlanetSpec clone()', 'public static void updateFromDiff(', 'public static void setField('].map(s=>block(spec,s)).join('\n')}
static class PlanetSpecDiff{Map<String,Object>data=new HashMap<>();String j;${block(diff,'protected Object readResolve()').replaceAll('String.cfr_renamed_2(', 'ColorReader.cfr_renamed_2(')}}
}
class SpecStore{static Map<String,PlanetSpec>specs=new HashMap<>();}
class Planet{PlanetSpec spec;Planet(String type,float radius,float ignored,Vector2f loc){spec=SpecStore.specs.get(type);if(spec==null)throw new IllegalArgumentException("Unknown planet type");}void setAngle(float f){}void setCloudAngle(float f){}void setSpec(PlanetSpec p){spec=p;}PlanetSpec getSpec(){return spec;}${block(graphics,'public boolean isGasGiant()')}}
class CampaignPlanet extends BaseCampaignEntity implements PlanetAPI{String type;float radius,angle,cloudAngle;Planet graphics;PlanetSpec spec;PlanetSpec.PlanetSpecDiff diff;
${['protected Object readResolve()', 'public PlanetSpec getSpec()', 'public boolean isGasGiant()'].map(s=>block(planet,s)).join('\n')}
}
class Market{SectorEntityToken primaryEntity;Set<SectorEntityToken>connectedEntities=new LinkedHashSet<>();
${['public Set<SectorEntityToken> getConnectedEntities()', 'public PlanetAPI getPlanetEntity()'].map(s=>block(market,s)).join('\n')}
}
public class Oracle{
static JSONObject run(JSONObject p)throws Exception{Map<String,SectorEntityToken>entities=new HashMap<>();JSONArray es=p.getJSONArray("entities");for(int i=0;i<es.length();i++){JSONObject e=es.getJSONObject(i);SectorEntityToken t;if(e.getString("classAlias").equals("Plnt")){CampaignPlanet b=new CampaignPlanet();b.type=e.getString("type");if(e.has("diff")&&!e.isNull("diff")){b.diff=new PlanetSpec.PlanetSpecDiff();b.diff.j=e.getJSONObject("diff").toString();b.diff.readResolve();}b.readResolve();t=b;}else if(e.getString("classAlias").equals("CCEnt"))t=new SectorEntityToken();else throw new IllegalArgumentException("Unknown entity");t.objectRef=e.getString("objectRef");entities.put(t.objectRef,t);}
Market m=new Market();if(!p.isNull("primaryEntityRef"))m.primaryEntity=entities.get(p.getString("primaryEntityRef"));JSONArray order=p.getJSONArray("connectedRefs");for(int i=0;i<order.length();i++){if(order.isNull(i))m.connectedEntities.add(null);else m.connectedEntities.add(entities.get(order.getString(i)));}PlanetAPI found=m.getPlanetEntity();JSONObject out=new JSONObject();out.put("planetEntityRef",found==null?JSONObject.NULL:((SectorEntityToken)found).objectRef);out.put("planetType",found==null?JSONObject.NULL:((CampaignPlanet)found).type);out.put("planetIsGasGiant",found==null?JSONObject.NULL:found.isGasGiant());return out;}
public static void main(String[]args)throws Exception{Scanner scan=new Scanner(System.in,"UTF-8");JSONObject types=new JSONObject(scan.nextLine());for(String id:JSONObject.getNames(types))SpecStore.specs.put(id,new PlanetSpec(types.getJSONObject(id)));while(scan.hasNextLine()){try{System.out.println(run(new JSONObject(scan.nextLine())).toString());}catch(Exception ex){System.out.println(new JSONObject().put("error",ex.getClass().getSimpleName()).toString());}}}
}`;
  writeFileSync(join(dir,'Oracle.java'),java);
  const cp=[dir,join(root,'starsector-core/json.jar'),join(root,'starsector-core/lwjgl_util.jar')].join(delimiter);
  const compiled=spawnSync('javac',['-encoding','UTF-8','-cp',cp,'-d',dir,join(dir,'Oracle.java')],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4000000});assert.equal(compiled.status,0,compiled.stderr);
  const types=parseFactionText(readFileSync(join(root,'starsector-core/data/config/planets.json'),'utf8'));
  const run=spawnSync('java',['-Djava.awt.headless=true','-cp',cp,'Oracle'],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:4000000,input:[types,...cases].map(p=>JSON.stringify(p)).join('\n')+'\n'});assert.equal(run.status,0,run.stderr);
  return run.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line));
 }finally{const parent=resolve(tmpdir()),target=resolve(dir);assert.ok(target.startsWith(parent+sep)&&target!==parent);for(const file of readdirSync(target))unlinkSync(join(target,file));rmdirSync(target);}
}