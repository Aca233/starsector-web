/** Public-core blueprint input/factory oracle. Never boots CampaignEngine, UI, mods or saves. */
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import com.fs.util.C;
import com.fs.starfarer.api.*;
import com.fs.starfarer.api.campaign.*;
import com.fs.starfarer.api.campaign.impl.items.*;
import com.fs.starfarer.api.combat.*;
import com.fs.starfarer.api.loading.*;
import com.fs.starfarer.campaign.ui.trade.CargoItemStack;
import com.fs.starfarer.campaign.fleet.CargoData;
import com.fs.starfarer.loading.*;
import com.fs.starfarer.loading.scripts.ScriptStore;
import com.fs.starfarer.loading.specs.BaseWeaponSpec;
import com.fs.starfarer.loading.specs.FighterWingSpec;
import com.fs.starfarer.loading.specs.H;
import com.fs.starfarer.loading.specs.g;
import java.lang.String;

public class NativeBlueprintInputs {
 static final String PREFIX="com.fs.starfarer.api.campaign.impl.items.";
 static final Map<String,g> hulls=new HashMap<>();
 static final Map<String,X> specials=new LinkedHashMap<>();
 static final Map<String,H> industries=new LinkedHashMap<>();
 static final Map<String,JSONObject> rawHulls=new LinkedHashMap<>(),shipRows=new LinkedHashMap<>();
 static final Set<String> filled=new HashSet<>();
 static Object nullable(Object o){return o==null?JSONObject.NULL:o;}
 static JSONArray strings(Collection<?> c){return NativeDefaultHullRegistry.strings(c);}
 static void require(boolean ok,String message){NativeDefaultHullRegistry.require(ok,message);}
 @SuppressWarnings("unchecked") static JSONArray csv(String file)throws Exception{NativeDefaultHullRegistry.paths.add(file);JSONArray rows=LoadingUtils.Ó00000("id",file);for(Field field:SpecStore.class.getDeclaredFields())if(Modifier.isStatic(field.getModifiers())&&Map.class.isAssignableFrom(field.getType())&&field.getGenericType().getTypeName().contains("ModSpec")){field.setAccessible(true);Map<String,Object> cache=(Map<String,Object>)field.get(null);for(int i=0;i<rows.length();i++)cache.put(rows.getJSONObject(i).optString("fs_rowSource"),null);}return rows;}
 static void freshMap(Class<?> type)throws Exception{for(Field f:type.getDeclaredFields())if(Modifier.isStatic(f.getModifiers())&&Map.class.isAssignableFrom(f.getType())){f.setAccessible(true);f.set(null,new HashMap<>());}}
 static void tags(g h,JSONArray values)throws Exception{h.getTags().clear();if(values!=null)for(int i=0;i<values.length();i++){String t=values.getString(i).trim();if(!t.isEmpty())h.addTag(t);}}
 static JSONArray csvTags(String value){JSONArray a=new JSONArray();for(String t:value.split(","))if(!t.trim().isEmpty())a.put(t.trim());return a;}
 static g fillHull(String id,JSONObject input)throws Exception {
  g h=hulls.get(id);require(h!=null,"Unknown hull "+id);if(filled.contains(id))return h;
  JSONObject raw=rawHulls.get(id);
  if(raw==null&&id.endsWith("_default_D")){
   g parent=fillHull(id.substring(0,id.length()-10),input);h.setHullName(parent.getHullName()+" (D)");h.setDesignation(parent.getDesignation());h.setManufacturer(parent.getManufacturer());h.setRarity(parent.getRarity());
   h.getTags().clear();for(String t:Arrays.asList("special_allows_system_use","system_allows_special_use","auto_rec","codex_unlockable","restricted","no_autofit","no_autofit_unless_player","req_military","module_hull_bar_only","no_auto_penalty"))if(parent.hasTag(t))h.addTag(t);
  }else if(raw!=null&&raw.has("skinHullId")){
   g parent=fillHull(raw.getString("baseHullId"),input);h.setHullName(raw.optString("hullName",parent.getHullName()));h.setDesignation(raw.optString("hullDesignation",parent.getDesignation()));h.setManufacturer(raw.optString("manufacturer",raw.optString("tech",parent.getManufacturer())));h.setRarity(parent.getRarity());tags(h,raw.optJSONArray("tags"));
  }else{
   JSONObject row=shipRows.get(id);require(row!=null,"Missing ship spreadsheet row "+id);h.setHullName(row.optString("name","<missing name>"));h.setDesignation(row.optString("designation","<no designation>"));String manufacturer=row.optString("tech/manufacturer","普通");h.setManufacturer(manufacturer.isEmpty()?"普通":manufacturer);h.setRarity((float)row.optDouble("rarity",1));tags(h,csvTags(row.optString("tags","")));
  }
  // Existing storage import follows the original skin/baseValueMult/default-D calculation.
  h.setBaseValue((float)input.getJSONObject("hulls").getJSONObject(id).getDouble("baseValue"));
  require(new HashSet<>(h.getTags()).equals(new HashSet<>(toStrings(input.getJSONObject("autofitHulls").getJSONObject(id).getJSONArray("tags")))),"Hull tag cross-check "+id);
  filled.add(id);return h;
 }
 static List<String> toStrings(JSONArray a)throws Exception{List<String> r=new ArrayList<>();for(int i=0;i<a.length();i++)r.add(a.getString(i));return r;}
 static List<ShipHullSpecAPI> allShips(){List<ShipHullSpecAPI> r=new ArrayList<>();for(String id:oO0O.Ò00000())r.add(SpecStore.o00000(g.class,id));return r;}
 static List<WeaponSpecAPI> allWeapons(){List<WeaponSpecAPI> r=new ArrayList<>();for(String id:Q.Ó00000()){BaseWeaponSpec w=SpecStore.o00000(BaseWeaponSpec.class,id);if(w.getAIHints().contains(WeaponAPI.AIHints.SYSTEM)||w.getType()==WeaponAPI.WeaponType.SYSTEM)continue;r.add(w);}return r;}
 static List<FighterWingSpecAPI> allWings(){List<FighterWingSpecAPI> r=new ArrayList<>();for(String id:K.Ò00000())r.add(SpecStore.o00000(FighterWingSpec.class,id));return r;}
 static JSONObject provided(SpecialItemPlugin plugin)throws Exception{BlueprintProviderItem p=(BlueprintProviderItem)plugin;return new JSONObject().put("kind","blueprint").put("ships",nullable(p.getProvidedShips())).put("weapons",nullable(p.getProvidedWeapons())).put("fighters",nullable(p.getProvidedFighters())).put("industries",nullable(p.getProvidedIndustries()));}
 static Object field(Object target,String name)throws Exception{Field f=target.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(target);}
 static CargoStackAPI stack(String id,String data){return new CargoItemStack(CargoAPI.CargoItemType.SPECIAL,new SpecialItemData(id,data),(CargoData)null);}
 static JSONObject factory(String id,String data)throws Exception{
  CargoStackAPI s=stack(id,data);SpecialItemPlugin p=s.getPlugin();Field f=BaseSpecialItemPlugin.class.getDeclaredField("stack");f.setAccessible(true);
  return new JSONObject().put("itemId",id).put("itemData",nullable(data)).put("type",s.getType().name()).put("size",s.getSize()).put("maxSize",s.getMaxSize()).put("roundSize",field(s,"roundSize")).put("cargoSpacePerUnit",field(s,"cargoSpacePerUnit")).put("plugin",p.getClass().getName()).put("pluginBound",f.get(p)==s).put("nullCargo",s.getCargo()==null).put("name",p.getName()).put("designType",nullable(p.getDesignType())).put("price",p.getPrice(null,null)).put("provided",provided(p));
 }
 static class CountingRandom extends Random {int draws=0;CountingRandom(long seed){super(seed);}public float nextFloat(){draws++;return super.nextFloat();}}
 @SuppressWarnings("unchecked")
 public static void main(String[] args)throws Exception{
  byte[] bytes=System.in.readAllBytes();JSONObject in=new JSONObject(new String(bytes,StandardCharsets.UTF_8));System.setIn(new ByteArrayInputStream(bytes));PrintStream output=System.out;
  try{System.setOut(new PrintStream(OutputStream.nullOutputStream()));NativeWeaponGroupInputs.main(args);}finally{System.setOut(output);}
  C resources=C.Ó00000();JSONObject settings=NativeDefaultHullRegistry.json("data/config/settings.json");
  for(String id:JSONObject.getNames(in.getJSONObject("hulls")))hulls.put(id,SpecStore.o00000(g.class,id));
  List<String> shipFiles=resources.o00000("data/hulls","ship",true),skinFiles=NativeDefaultHullRegistry.files(resources,"data/hulls/skins","skin");
  for(String p:shipFiles){JSONObject r=NativeDefaultHullRegistry.json(p);rawHulls.putIfAbsent(r.getString("hullId"),r);}
  for(String p:skinFiles){JSONObject r=NativeDefaultHullRegistry.json(p);rawHulls.putIfAbsent(r.getString("skinHullId"),r);}
  JSONArray rows=csv("data/hulls/ship_data.csv");for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i);shipRows.put(r.getString("id"),r);}
  for(String id:hulls.keySet())fillHull(id,in);
  // Fresh HashMaps and native registration events: do NOT sort keys or reuse bootstrap map capacity.
  freshMap(oO0O.class);Method register=oO0O.class.getMethod("super",String.class,g.class);Set<String> seen=new HashSet<>();JSONArray events=new JSONArray();
  for(String p:shipFiles){String id=NativeDefaultHullRegistry.json(p).getString("hullId");if(seen.add(id)){register.invoke(null,id,hulls.containsKey(id)?hulls.get(id):new g(id));events.put(new JSONArray().put("ship").put(id));}}
  for(int i=0;i<rows.length();i++){String id=rows.getJSONObject(i).getString("id");if(id.isEmpty()||!seen.contains(id))continue;String d=id+"_default_D";if(hulls.containsKey(d)&&seen.add(d)){register.invoke(null,d,hulls.get(d));events.put(new JSONArray().put("csv-D").put(d));}}
  for(String id:new ArrayList<>(seen))if(!hulls.containsKey(id)){require(!shipRows.containsKey(id),"Unexpected excluded CSV hull "+id);oO0O.Ò00000(id);seen.remove(id);events.put(new JSONArray().put("csv-remove-missing-row").put(id));}
  for(String p:skinFiles){String id=NativeDefaultHullRegistry.json(p).getString("skinHullId");if(!seen.add(id))continue;register.invoke(null,id,hulls.get(id));events.put(new JSONArray().put("skin").put(id));String d=id+"_default_D";if(hulls.containsKey(d)&&seen.add(d)){register.invoke(null,d,hulls.get(d));events.put(new JSONArray().put("skin-D").put(d));}}
  Set<String> missing=new TreeSet<>(hulls.keySet());missing.removeAll(seen);Set<String> extra=new TreeSet<>(seen);extra.removeAll(hulls.keySet());require(seen.equals(hulls.keySet()),"Hull registry coverage mismatch missing="+missing+" extra="+extra);
  Map<String,BaseWeaponSpec> weapons=new HashMap<>();for(String id:Q.Ó00000())weapons.put(id,SpecStore.o00000(BaseWeaponSpec.class,id));freshMap(Q.class);Method regWeapon=Q.class.getMethod("super",String.class,BaseWeaponSpec.class);
  for(String p:NativeDefaultHullRegistry.files(resources,"data/weapons","wpn")){String id=NativeDefaultHullRegistry.json(p).getString("id");regWeapon.invoke(null,id,weapons.get(id));}
  // Blueprint-relevant weapon fields only: full weapon spreadsheet loading requires live projectile specs.
  // Generated tags use the existing source-backed autofit extraction, without dropping any registry entry.
  rows=csv("data/weapons/weapon_data.csv");for(int i=0;i<rows.length();i++){JSONObject row=rows.getJSONObject(i);String id=row.getString("id");BaseWeaponSpec w=weapons.get(id);if(w==null)continue;w.setWeaponName(row.getString("name"));String manufacturer=row.optString("tech/manufacturer","普通");w.setManufacturer(manufacturer.isEmpty()?"普通":manufacturer);w.setTier(row.optInt("tier",1));w.setRarity((float)row.optDouble("rarity",1));w.setBaseValue(row.optInt("base value",100)*(float)settings.getDouble("shipWeaponBaseValueMult"));w.getTags().clear();for(String tag:toStrings(in.getJSONObject("autofitWeapons").getJSONObject(id).getJSONArray("tags")))w.addTag(tag);}freshMap(K.class);csv("data/hulls/wing_data.csv");FighterWingSpreadsheetLoader.o00000();
  rows=csv("data/campaign/industries.csv");for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i);if(!r.getString("id").isEmpty()){H h=new H(r);industries.put(h.getId(),h);}}
  Map<String,Class<?>> classes=null;for(Field f:ScriptStore.class.getDeclaredFields())if(Modifier.isPublic(f.getModifiers())&&Modifier.isStatic(f.getModifiers())&&Map.class.isAssignableFrom(f.getType())){classes=(Map<String,Class<?>>)f.get(null);break;}require(classes!=null,"ScriptStore class map");
  rows=csv("data/campaign/special_items.csv");JSONObject specialData=new JSONObject();
  for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i);String plugin=r.optString("plugin","");if(!Arrays.asList("Ship","Weapon","Fighter","Industry","Multi").stream().anyMatch(k->plugin.equals(PREFIX+k+"BlueprintItemPlugin")))continue;
   X s=new X();s.setId(r.getString("id"));s.setName(r.getString("name"));s.setPluginClass(plugin);s.setBasePrice((float)r.getDouble("base price"));s.setStackSize(r.getInt("stack size"));s.setCargoSpace((float)r.getDouble("cargo space"));s.setManufacturer(r.optString("tech/manufacturer",""));s.setParams(r.optString("plugin params",""));s.setSoundId(r.optString("sound id",""));s.setSoundIdDrop(r.optString("sound id drop",""));s.setDesc(r.optString("desc",""));s.setIconName(r.optString("icon",""));specials.put(s.getId(),s);SpecStore.o00000(X.class,s.getId(),s);classes.put(plugin,Class.forName(plugin));
   specialData.put(s.getId(),new JSONObject().put("id",s.getId()).put("name",s.getName()).put("plugin",plugin).put("basePrice",s.getBasePrice()).put("stackSize",s.getStackSize()).put("cargoSpace",s.getCargoSpace()).put("manufacturer",nullable(s.getManufacturer())).put("params",nullable(s.getParams())).put("soundId",s.getSoundId()).put("soundIdDrop",s.getSoundIdDrop()).put("desc",s.getDesc()).put("icon",s.getIconName()));
  }
  Global.setSettings((SettingsAPI)Proxy.newProxyInstance(SettingsAPI.class.getClassLoader(),new Class[]{SettingsAPI.class},(proxy,method,a)->{
   switch(method.getName()){
    case "getFloat":return (float)settings.getDouble((String)a[0]);
    case "getSpecialItemSpec":require(specials.containsKey(a[0]),"Unknown special");return specials.get(a[0]);
    case "getHullSpec":return SpecStore.o00000(g.class,(String)a[0]);
    case "getWeaponSpec":return SpecStore.o00000(BaseWeaponSpec.class,(String)a[0]);
    case "getFighterWingSpec":return SpecStore.o00000(FighterWingSpec.class,(String)a[0]);
    case "getIndustrySpec":require(industries.containsKey(a[0]),"Unknown industry");return industries.get(a[0]);
    case "getAllShipHullSpecs":return allShips();case "getAllWeaponSpecs":return allWeapons();case "getAllFighterWingSpecs":return allWings();
    default:throw new UnsupportedOperationException("Blueprint probe settings: "+method.getName());
   }
  }));
  JSONArray ships=new JSONArray(),weaponData=new JSONArray(),weaponSpecs=new JSONArray(),fighters=new JSONArray(),industryData=new JSONArray();JSONObject variants=new JSONObject();
  for(ShipHullSpecAPI h:allShips()){SpecialItemPlugin p=stack("ship_bp",h.getHullId()).getPlugin();ships.put(new JSONObject().put("id",h.getHullId()).put("hullSize",h.getHullSize().name()).put("size",h.getHullSize().ordinal()).put("baseValue",h.getBaseValue()).put("rarity",h.getRarity()).put("tags",strings(h.getTags())).put("name",h.getNameWithDesignationWithDashClass()).put("blueprintName",p.getName()).put("manufacturer",nullable(p.getDesignType())).put("oraclePrice",p.getPrice(null,null)));}
  for(String key:Q.Ó00000()){WeaponSpecAPI w=SpecStore.o00000(BaseWeaponSpec.class,key);SpecialItemPlugin p=stack("weapon_bp",w.getWeaponId()).getPlugin();JSONObject view=new JSONObject().put("id",w.getWeaponId()).put("size",w.getSize().ordinal()).put("type",w.getType().name()).put("aiHints",strings(w.getAIHints())).put("tier",w.getTier()).put("rarity",w.getRarity()).put("baseValue",w.getBaseValue()).put("tags",strings(w.getTags())).put("name",w.getWeaponName()).put("blueprintName",p.getName()).put("manufacturer",nullable(p.getDesignType())).put("oraclePrice",p.getPrice(null,null));weaponSpecs.put(view);if(!w.getAIHints().contains(WeaponAPI.AIHints.SYSTEM)&&w.getType()!=WeaponAPI.WeaponType.SYSTEM)weaponData.put(view);}
  for(FighterWingSpecAPI w:allWings()){SpecialItemPlugin p=stack("fighter_bp",w.getId()).getPlugin();ShipVariantAPI v=w.getVariant();variants.put(v.getHullVariantId(),new JSONObject().put("id",v.getHullVariantId()).put("hullId",v.getHullSpec().getHullId()).put("manufacturer",nullable(v.getHullSpec().getManufacturer())));fighters.put(new JSONObject().put("id",w.getId()).put("variantId",v.getHullVariantId()).put("tier",w.getTier()).put("rarity",w.getRarity()).put("baseValue",w.getBaseValue()).put("tags",strings(w.getTags())).put("name",w.getWingName()).put("blueprintName",p.getName()).put("oraclePrice",p.getPrice(null,null)));}
  for(H h:industries.values()){SpecialItemPlugin p=stack("industry_bp",h.getId()).getPlugin();industryData.put(new JSONObject().put("id",h.getId()).put("cost",h.getCost()).put("tags",strings(h.getTags())).put("name",h.getName()).put("blueprintName",p.getName()).put("oraclePrice",p.getPrice(null,null)));}
  JSONArray factories=new JSONArray();for(X s:specials.values()){String id=s.getId();if(id.equals("ship_bp"))factories.put(factory(id,"onslaught"));else if(id.equals("weapon_bp"))factories.put(factory(id,"lightmg"));else if(id.equals("fighter_bp"))factories.put(factory(id,"broadsword_wing"));else if(id.equals("industry_bp"))factories.put(factory(id,"heavyindustry"));else factories.put(factory(id,null));}
  JSONArray parser=new JSONArray();String[] params={null,"","onslaught"," {}","{}","{\"tags\":[\"rare_bp\"]}","{\"tags\":[\"no_drop\"]}","{\"tags\":[\"!no_drop\"]}","{\"tags\":[\"blueprint_probe_absent\"]}","{\"tags\":[\"rare_bp\",\"!rare_bp\"]}","{\"tier\":0}","{\"tier\":2,\"tags\":[\"rare_bp\"]}","{\"tier\":\"2.75\"}","{\"tier\":null}","{\"tags\":[7]}","{tier:2,tags:['rare_bp'],}","{\"tags\":null}"};
  for(String id:specials.keySet())for(String param:params)for(long seed:new long[]{0,1,42,123456789}){CountingRandom random=new CountingRandom(seed);JSONObject row=new JSONObject().put("itemId",id).put("params",nullable(param)).put("seed",Long.toString(seed));try{row.put("result",nullable(specials.get(id).getNewPluginInstance(null).resolveDropParamsToSpecificItemData(param,random)));}catch(JSONException e){row.put("error","JSONException");}row.put("floatDraws",random.draws).put("nextLong",Long.toString(random.nextLong()));parser.put(row);}
  JSONObject settingsData=new JSONObject();for(String key:Arrays.asList("blueprintBasePriceCapital","blueprintBasePriceCruiser","blueprintBasePriceDestroyer","blueprintBasePriceFrigate","blueprintPriceOriginalShipMult","blueprintPriceOriginalItemMult"))settingsData.put(key,(float)settings.getDouble(key));
  System.out.print("@@NATIVE_BLUEPRINTS@@"+new JSONObject().put("settings",settingsData).put("specials",specialData).put("ships",ships).put("weapons",weaponData).put("weaponSpecs",weaponSpecs).put("fighters",fighters).put("industries",industryData).put("variants",variants).put("hullRegistrationEvents",events).put("factoryOracle",factories).put("parserOracle",parser).put("paths",strings(NativeDefaultHullRegistry.paths)));
 }
}






