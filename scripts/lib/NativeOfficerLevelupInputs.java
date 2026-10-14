/** Installed SkillData and OfficerLevelupPluginImpl with explicit public specs/person inputs. No engine, UI or saves. */
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.awt.Color;
import org.json.*;
import com.fs.starfarer.api.*;
import com.fs.starfarer.api.characters.*;
import com.fs.starfarer.campaign.rules.Memory;
import com.fs.starfarer.api.impl.campaign.OfficerLevelupPluginImpl;
import com.fs.starfarer.api.util.SkillData;

public class NativeOfficerLevelupInputs {
 @SuppressWarnings("unchecked") static <T>T proxy(Class<T> type,InvocationHandler h){return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class[]{type},h);}
 static JSONArray strings(Collection<String> list){JSONArray a=new JSONArray();for(String s:list)a.put(s);return a;}
 public static void main(String[] args)throws Exception {
  JSONObject input=new JSONObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8));
  Map<String,SkillSpecAPI> specs=new LinkedHashMap<>();JSONArray rows=input.getJSONArray("skills");
  for(int i=0;i<rows.length();i++){
   JSONObject s=rows.getJSONObject(i);List<String> tags=new ArrayList<>();JSONArray tt=s.getJSONArray("tags");for(int j=0;j<tt.length();j++)tags.add(tt.getString(j));
   specs.put(s.getString("id"),proxy(SkillSpecAPI.class,(p,m,a)->{switch(m.getName()){
    case "getId":return s.getString("id");case "getGoverningAptitudeId":return s.getString("aptitude");case "getTier":return s.getInt("tier");case "getOrder":return (float)s.getDouble("order");case "getReqPoints":return s.getInt("reqPoints");case "isAptitudeEffect":return s.getBoolean("aptitudeEffect");case "isCombatOfficerSkill":return s.getBoolean("combatOfficer");case "hasTag":return tags.contains(a[0]);case "equals":return p==a[0];case "hashCode":return System.identityHashCode(p);
   }throw new UnsupportedOperationException("SkillSpec."+m.getName());}));
  }
  JSONObject settings=input.getJSONObject("settings");Global.setSettings(proxy(SettingsAPI.class,(p,m,a)->{switch(m.getName()){
   case "getSkillIds":return new ArrayList<>(specs.keySet());case "getSkillSpec":return specs.get(a[0]);case "getFloat":return (float)settings.getDouble((String)a[0]);case "getInt":return settings.getInt((String)a[0]);case "getBoolean":return settings.getBoolean((String)a[0]);case "getColor":{JSONArray c=settings.getJSONArray((String)a[0]);return new Color(c.getInt(0),c.getInt(1),c.getInt(2),c.length()>3?c.getInt(3):255);}
  }throw new UnsupportedOperationException("Settings."+m.getName());}));
  JSONArray aptitudes=new JSONArray();for(String id:SkillData.getAptitudes().keySet()){
   JSONArray tiers=new JSONArray();for(List<SkillSpecAPI> tier:SkillData.getSkills(id).tiers){JSONArray skills=new JSONArray();for(SkillSpecAPI s:tier)skills.put(s.getId());tiers.put(skills);}aptitudes.put(new JSONObject().put("id",id).put("tiers",tiers));
  }
  JSONArray results=new JSONArray(),cases=input.getJSONArray("cases");for(int i=0;i<cases.length();i++){
   JSONObject c=cases.getJSONObject(i),known=c.getJSONObject("known"),memory=c.getJSONObject("memory");
   MutableCharacterStatsAPI stats=proxy(MutableCharacterStatsAPI.class,(p,m,a)->{switch(m.getName()){case "getLevel":return c.getInt("level");case "getSkillLevel":return (float)known.optDouble((String)a[0],0);}throw new UnsupportedOperationException("Stats."+m.getName());});
   Memory mem=new Memory();for(Iterator<?> keys=memory.keys();keys.hasNext();){String key=(String)keys.next();mem.set(key,memory.get(key));}
   PersonAPI person=proxy(PersonAPI.class,(p,m,a)->{switch(m.getName()){case "getStats":return stats;case "getMemoryWithoutUpdate":return mem;}throw new UnsupportedOperationException("Person."+m.getName());});
   Random random=new Random(Long.parseLong(c.getString("seed")));List<String> picks=new OfficerLevelupPluginImpl().pickLevelupSkills(person,random);
   results.put(new JSONObject().put("picks",strings(picks)).put("nextFloat",random.nextFloat()));
  }
  System.out.print("@@OFFICER_LEVELUP@@"+new JSONObject().put("aptitudes",aptitudes).put("results",results));
 }
}
