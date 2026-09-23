/** Public specs and java.util.HashSet oracle only; no CampaignEngine, window, or save access. */
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import com.fs.starfarer.loading.SkillSpec;
import com.fs.starfarer.loading.SpecStore;
import com.fs.starfarer.loading.specs.O00O;
import com.fs.starfarer.api.characters.SkillEffectType;
public class NativePlayerHullmodInputs {
 static JSONArray strings(Collection<String> list){JSONArray result=new JSONArray();for(String id:list)result.put(id);return result;}
 public static void main(String[] args)throws Exception{
  JSONObject input=new JSONObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8));JSONArray mods=input.getJSONArray("hullmods"),flags=new JSONArray(),skills=new JSONArray(),sets=new JSONArray();
  for(int i=0;i<mods.length();i++){JSONObject row=mods.getJSONObject(i);O00O spec=new O00O();spec.setId(row.getString("id"));spec.setDisplayName(row.getString("name"));spec.setHidden(row.getBoolean("hidden"));spec.setAlwaysUnlocked(row.getBoolean("alwaysUnlocked"));SpecStore.o00000(O00O.class,spec.getId(),spec);flags.put(new JSONObject().put("id",spec.getId()).put("hidden",spec.isHidden()).put("alwaysUnlocked",spec.isAlwaysUnlocked()));}
  JSONArray raw=input.getJSONArray("skills");for(int i=0;i<raw.length();i++){JSONObject value=raw.getJSONObject(i);SkillSpec skill=new SkillSpec(value);JSONArray rows=new JSONArray();int index=0;for(SkillSpec.SkillEffectSpec effect:skill.getEffects()){if(effect.getType()==SkillEffectType.HULLMOD_UNLOCK){JSONArray unlocks=null;if(effect.getHullModUnlocks()!=null){unlocks=new JSONArray();for(SkillSpec.o entry:effect.getHullModUnlocks())unlocks.put(new JSONObject().put("id",entry.o00000).put("level",entry.Ò00000));}rows.put(new JSONObject().put("index",index).put("governingSkill",effect.getGoverningSkill()).put("requiredLevel",effect.getRequiredSkillLevel()).put("unlocks",unlocks==null?JSONObject.NULL:unlocks));}index++;}skills.put(new JSONObject().put("id",value.getString("id")).put("effects",rows));}
  JSONArray cases=input.getJSONArray("setCases");for(int i=0;i<cases.length();i++){JSONObject row=cases.getJSONObject(i);ArrayList<String> entries=new ArrayList<>();JSONArray initial=row.getJSONArray("entries");for(int j=0;j<initial.length();j++)entries.add(initial.getString(j));HashSet<String> set;if(row.getBoolean("collection"))set=new HashSet<>(entries);else{set=new HashSet<>();set.addAll(entries);}JSONArray ops=row.getJSONArray("operations");for(int j=0;j<ops.length();j++){JSONArray op=ops.getJSONArray(j);if(op.getString(0).equals("add"))set.add(op.getString(1));else set.remove(op.getString(1));}sets.put(new JSONObject().put("entries",strings(set)).put("copy",strings(new HashSet<>(set))));}
  System.out.print(new JSONObject().put("hullmods",flags).put("skills",skills).put("setResults",sets));
 }
}
