/** Real public loading order, DropGroupRow pickers, and Java17 Gaussian oracle. */
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.json.*;
import com.fs.starfarer.api.Global;
import com.fs.starfarer.api.SettingsAPI;
import com.fs.starfarer.api.combat.WeaponAPI;
import com.fs.starfarer.api.impl.campaign.procgen.DropGroupRow;
import com.fs.starfarer.api.util.WeightedRandomPicker;
import com.fs.starfarer.loading.*;
import com.fs.starfarer.loading.specs.BaseWeaponSpec;
import com.fs.starfarer.loading.specs.FighterWingSpec;
public class NativeSalvageInputs {
 static JSONArray strings(Collection<?> values){return NativeDefaultHullRegistry.strings(values);}
 static java.lang.Object field(java.lang.Object obj,java.lang.String key)throws Exception{Field f=obj.getClass().getDeclaredField(key);f.setAccessible(true);return f.get(obj);}
 static JSONObject row(DropGroupRow r)throws Exception{
  JSONObject result=new JSONObject().put("commodity",r.getCommodity()).put("group",r.getGroup()).put("freq",r.getFreq()).put("percent",field(r,"percent")).put("multiValued",r.isMultiValued()).put("tier",field(r,"tier")).put("tags",strings((List<?>)field(r,"tags"))).put("weaponType",field(r,"weaponType")==null?JSONObject.NULL:field(r,"weaponType").toString()).put("weaponSize",field(r,"weaponSize")==null?JSONObject.NULL:field(r,"weaponSize").toString());
  if(r.isSpecialItem()){result.put("specialItemId",r.getSpecialItemId()).put("specialItemData",r.getSpecialItemData()==null?JSONObject.NULL:r.getSpecialItemData());if(r.isMultiValued()){JSONObject p=new JSONObject(r.getSpecialItemData());result.put("params",p.toString()).put("nestedParams",p.has("p")?p.getJSONObject("p").toString():"{}");}}
  return result;
 }
 public static void main(java.lang.String[] args)throws Exception{
  byte[] bytes=System.in.readAllBytes();JSONObject in=new JSONObject(new java.lang.String(bytes,StandardCharsets.UTF_8));System.setIn(new ByteArrayInputStream(bytes));PrintStream out=System.out;try{System.setOut(new PrintStream(OutputStream.nullOutputStream()));NativeWeaponGroupInputs.main(args);}finally{System.setOut(out);}
  SettingsAPI previous=Global.getSettings();JSONObject autofit=in.getJSONObject("autofitWeapons");Map<java.lang.String,JSONObject> weaponCSV=new HashMap<>();JSONArray csv=LoadingUtils.Ó00000("id","data/weapons/weapon_data.csv");for(int i=0;i<csv.length();i++)weaponCSV.put(csv.getJSONObject(i).getString("id"),csv.getJSONObject(i));
  JSONArray weapons=new JSONArray();for(java.lang.String id:com.fs.starfarer.loading.Q.Ó00000()){
   BaseWeaponSpec w=SpecStore.o00000(BaseWeaponSpec.class,id);JSONObject a=autofit.getJSONObject(id),c=weaponCSV.get(id);w.setWeaponName(c.getString("name"));w.setTier(a.getInt("tier"));w.setRarity((float)c.optDouble("rarity",1));w.setBaseValue((float)in.getJSONObject("weapons").getDouble(id));JSONArray tags=a.getJSONArray("tags");for(int i=0;i<tags.length();i++)w.addTag(tags.getString(i));
   if(w.getAIHints().contains(WeaponAPI.AIHints.SYSTEM)||w.getType()==WeaponAPI.WeaponType.SYSTEM)continue;
   weapons.put(new JSONObject().put("id",id).put("tier",w.getTier()).put("tags",strings(w.getTags())).put("type",w.getType().name()).put("size",w.getSize().name()).put("rarity",w.getRarity()));
  }
  NativeDefaultHullRegistry.paths.add("data/hulls/wing_data.csv");csv=LoadingUtils.Ó00000("id","data/hulls/wing_data.csv");K.o00000();for(int i=0;i<csv.length();i++){JSONObject c=csv.getJSONObject(i);java.lang.String id=c.getString("id");if(id.isEmpty())continue;JSONObject a=in.getJSONObject("autofitFighters").getJSONObject(id);FighterWingSpec w=new FighterWingSpec();w.setId(id);w.setVariantId(in.getJSONObject("wings").getJSONObject(id).getString("variantId"));w.setTier(a.getInt("tier"));w.setRarity((float)c.optDouble("rarity",1));w.setBaseValue((float)in.getJSONObject("wings").getJSONObject(id).getDouble("baseValue"));JSONArray tags=a.getJSONArray("tags");for(int j=0;j<tags.length();j++)w.addTag(tags.getString(j));K.o00000(id,w);}
  JSONArray fighters=new JSONArray();for(java.lang.String id:K.Ò00000()){FighterWingSpec w=SpecStore.o00000(FighterWingSpec.class,id);fighters.put(new JSONObject().put("id",id).put("tier",w.getTier()).put("tags",strings(w.getTags())).put("rarity",w.getRarity()));}
  NativeDefaultHullRegistry.paths.add("data/campaign/special_items.csv");JSONArray specials=new JSONArray();csv=LoadingUtils.Ò00000("id","data/campaign/special_items.csv",true);for(int i=0;i<csv.length();i++){JSONObject c=csv.getJSONObject(i);java.lang.String id=c.getString("id");if(id.isEmpty())continue;X spec=new X();spec.setId(id);spec.setRarity((float)c.optDouble("rarity",1));for(java.lang.String tag:c.optString("tags","").split(","))spec.addTag(tag.trim());specials.put(new JSONObject().put("id",id).put("rarity",spec.getRarity()).put("basePrice",(float)c.optDouble("base price",0)).put("tags",strings(spec.getTags())));}
  NativeDefaultHullRegistry.paths.add("data/campaign/procgen/drop_groups.csv");Method merged=LoadingUtils.class.getMethod("super",List.class,java.lang.String.class,boolean.class);csv=(JSONArray)merged.invoke(null,Arrays.asList("commodity","group"),"data/campaign/procgen/drop_groups.csv",true);
  List<DropGroupRow> drops=new ArrayList<>();Map<java.lang.String,JSONObject> encoded=new LinkedHashMap<>();for(int i=0;i<csv.length();i++){JSONObject c=csv.getJSONObject(i);if(c.getString("commodity").startsWith("#"))continue;DropGroupRow r=new DropGroupRow(c);drops.add(r);encoded.put(r.getCommodity()+"_|_"+r.getGroup(),row(r));}
  Global.setSettings((SettingsAPI)Proxy.newProxyInstance(SettingsAPI.class.getClassLoader(),new Class[]{SettingsAPI.class},(proxy,m,a)->{
   if(m.getName().equals("getAllSpecs")&&a[0]==DropGroupRow.class)return drops;
   if(m.getName().equals("getFighterWingSpec"))return SpecStore.o00000(FighterWingSpec.class,(java.lang.String)a[0]);
   try{return m.invoke(previous,a);}catch(InvocationTargetException e){throw e.getCause();}
  }));
  JSONObject groups=new JSONObject();for(DropGroupRow r:drops)if(!groups.has(r.getGroup())){WeightedRandomPicker<DropGroupRow> p=DropGroupRow.getPicker(r.getGroup());JSONArray values=new JSONArray();for(int i=0;i<p.getItems().size();i++)values.put(new JSONObject().put("row",encoded.get(p.getItems().get(i).getCommodity()+"_|_"+r.getGroup())).put("weight",p.getWeight(i)));groups.put(r.getGroup(),new JSONObject().put("entries",values).put("total",p.getTotal()));}
  NativeDefaultHullRegistry.paths.add("data/hullmods/hull_mods.csv");JSONArray hullmods=new JSONArray();csv=LoadingUtils.Ò00000("id","data/hullmods/hull_mods.csv",true);for(int i=0;i<csv.length();i++){JSONObject c=csv.getJSONObject(i);java.lang.String id=c.getString("id");if(id.isEmpty())continue;JSONObject h=in.getJSONObject("hullmods").getJSONObject(id);hullmods.put(new JSONObject().put("id",id).put("tier",c.optInt("tier",0)).put("rarity",(float)c.optDouble("rarity",1)).put("hidden",h.getBoolean("hidden")).put("hiddenEverywhere",h.getBoolean("hiddenEverywhere")).put("tags",h.getJSONArray("tags")));}
  JSONArray gaussian=new JSONArray();for(java.lang.String seed:Arrays.asList("1","17","-9223372036854775808","0","456789123456")){Random random=new Random(Long.parseLong(seed));JSONArray values=new JSONArray();for(int i=0;i<20;i++){double value=random.nextGaussian();values.put(new JSONObject().put("value",value).put("state",((AtomicLong)field(random,"seed")).get()+"").put("haveNextGaussian",field(random,"haveNextNextGaussian")).put("nextGaussian",field(random,"nextNextGaussian")));}gaussian.put(new JSONObject().put("seed",seed).put("values",values));}
  JSONObject settings=NativeDefaultHullRegistry.json("data/config/settings.json");System.out.print("@@NATIVE_SALVAGE_INPUTS@@"+new JSONObject().put("groups",groups).put("hullmods",hullmods).put("weapons",weapons).put("fighters",fighters).put("specials",specials).put("gaussian",gaussian).put("easySalvageMult",settings.getDouble("easySalvageMult")).put("paths",strings(NativeDefaultHullRegistry.paths)));
 }
}
