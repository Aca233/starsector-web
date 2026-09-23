/** Public core resources only. Runs real resource ordering, B registry, legacy variants and default-module pass. */
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import com.fs.util.C;
import com.fs.starfarer.api.Global;
import com.fs.starfarer.api.SettingsAPI;
import com.fs.starfarer.api.combat.WeaponAPI;
import com.fs.starfarer.api.combat.ShipAPI;
import com.fs.starfarer.api.loading.VariantSource;
import com.fs.starfarer.loading.B;
import com.fs.starfarer.loading.Q;
import com.fs.starfarer.loading.K;
import com.fs.starfarer.loading.oO0O;
import com.fs.starfarer.loading.LoadingUtils;
import com.fs.starfarer.loading.SpecStore;
import com.fs.starfarer.loading.specs.g;
import com.fs.starfarer.loading.specs.nullsuper;
import com.fs.starfarer.loading.specs.BaseWeaponSpec;
import com.fs.starfarer.loading.specs.FighterWingSpec;
import com.fs.starfarer.loading.specs.HullVariantSpec;
public class NativeDefaultHullRegistry {
 static final List<java.lang.String> paths=new ArrayList<>();
 static JSONObject json(java.lang.String path)throws Exception {paths.add(path);return LoadingUtils.Ó00000(path);}
 static List<java.lang.String> files(C resources,java.lang.String dir,java.lang.String ext)throws Exception {
  List<java.lang.String> result=new ArrayList<>(resources.o00000(dir,ext,true));
  for(java.lang.String child:resources.Ó00000(dir))result.addAll(resources.o00000(child,ext,true));return result;
 }
 static JSONArray strings(Collection<?> values){JSONArray r=new JSONArray();for(Object v:values)r.put(v);return r;}
 static JSONArray modules(HullVariantSpec v){JSONArray r=new JSONArray();for(Map.Entry<java.lang.String,java.lang.String> e:v.getStationModules().entrySet())r.put(new JSONArray().put(e.getKey()).put(e.getValue()));return r;}
 static JSONObject row(HullVariantSpec v)throws Exception {return new JSONObject().put("hullId",v.getHullSpec().getHullId()).put("source",v.getSource()==null?JSONObject.NULL:v.getSource().name()).put("displayName",v.getDisplayName()).put("modules",modules(v)).put("emptyHull",v.isEmptyHullVariant()).put("tags",strings(v.getTags()));}
 static void require(boolean ok,java.lang.String message){if(!ok)throw new IllegalStateException(message);}
 public static void main(java.lang.String[] args)throws Exception {
  org.apache.log4j.Logger.getRootLogger().setLevel(org.apache.log4j.Level.OFF);
  JSONObject in=new JSONObject(new java.lang.String(System.in.readAllBytes(),StandardCharsets.UTF_8));
  C resources=C.Ó00000();require(resources.Ô00000().isEmpty(),"Unexpected pre-existing resource roots");
  C.class.getMethod("class",java.lang.String.class).invoke(resources,args[0]);
  JSONObject settings=json("data/config/settings.json");
  Global.setSettings((SettingsAPI)Proxy.newProxyInstance(SettingsAPI.class.getClassLoader(),new Class[]{SettingsAPI.class},(proxy,method,a)->{
   switch(method.getName()){
    case "getColor":{JSONArray c=settings.getJSONArray((java.lang.String)a[0]);return new java.awt.Color(c.getInt(0),c.getInt(1),c.getInt(2),c.getInt(3));}
    case "getFloat":return (float)settings.getDouble((java.lang.String)a[0]);
    case "getInt":return settings.getInt((java.lang.String)a[0]);
    case "getBoolean":return settings.getBoolean((java.lang.String)a[0]);
    case "getString":return settings.getString((java.lang.String)a[0]);
    default:throw new UnsupportedOperationException("Oracle settings access: "+method.getName());
   }
  }));
  Map<java.lang.String,JSONObject> raw=new LinkedHashMap<>();
  List<java.lang.String> ships=resources.o00000("data/hulls","ship",true),skins=files(resources,"data/hulls/skins","skin");
  for(java.lang.String p:ships){JSONObject r=json(p);raw.putIfAbsent(r.getString("hullId"),r);}
  for(java.lang.String p:skins){JSONObject r=json(p);raw.putIfAbsent(r.getString("skinHullId"),r);}
  JSONObject hulls=in.getJSONObject("hulls"),autofit=in.getJSONObject("autofitHulls");
  Method registerHull=oO0O.class.getMethod("super",java.lang.String.class,g.class),registerWeapon=Q.class.getMethod("super",java.lang.String.class,BaseWeaponSpec.class);
  for(java.lang.String id:JSONObject.getNames(in.getJSONObject("weapons")))registerWeapon.invoke(null,id,new BaseWeaponSpec(id));
  for(java.lang.String id:JSONObject.getNames(in.getJSONObject("wings"))){FighterWingSpec wing=new FighterWingSpec();wing.setId(id);wing.setVariantId(in.getJSONObject("wings").getJSONObject(id).getString("variantId"));K.o00000(id,wing);}
  JSONObject restoration=new JSONObject();
  for(java.lang.String id:JSONObject.getNames(hulls)){
   JSONObject h=hulls.getJSONObject(id);g spec=new g(id);java.lang.String original=id.endsWith("_default_D")?id.substring(0,id.length()-10):id;
   JSONObject source=raw.get(original);require(source!=null,"Missing public hull source "+original);
   java.lang.String base=source.optString("baseHullId",null);require(base==null||!base.endsWith("_default_D"),"Core skin inheriting a generated D-parent needs explicit native inheritance capture: "+id);spec.setBaseHullId(base);spec.setRestoreToBase(source.optBoolean("restoreToBaseHull",false));
   if(id.endsWith("_default_D"))spec.setDParentHullId(original);
   JSONObject specView=autofit.getJSONObject(id);spec.setHullSize(ShipAPI.HullSize.valueOf(specView.getString("hullSize")));
   JSONArray slots=specView.getJSONArray("slots");for(int i=0;i<slots.length();i++){JSONObject s=slots.getJSONObject(i);spec.addWeaponSlot(new nullsuper(s.getString("id"),WeaponAPI.WeaponType.valueOf(s.getString("type")),WeaponAPI.WeaponSize.valueOf(s.getString("size")),null,new org.lwjgl.util.vector.Vector2f((float)s.getJSONArray("location").getDouble(0),(float)s.getJSONArray("location").getDouble(1)),null,(float)s.getDouble("angle"),(float)s.getDouble("arc")));}
   JSONObject weapons=h.getJSONObject("builtInWeapons");if(weapons.names()!=null)for(java.lang.String key:JSONObject.getNames(weapons))spec.addBuiltInWeapon(key,weapons.getString(key));
   JSONArray mods=h.getJSONArray("builtInMods"),wings=h.getJSONArray("builtInWings");for(int i=0;i<mods.length();i++)spec.addBuiltInMod(mods.getString(i));for(int i=0;i<wings.length();i++)spec.addBuiltInWing(wings.getString(i));
   registerHull.invoke(null,id,spec);
  }
  for(java.lang.String id:JSONObject.getNames(hulls)){
   g h=SpecStore.o00000(g.class,id);restoration.put(id,new JSONObject().put("hullId",h.getHullId()).put("isDefaultDHull",h.isDefaultDHull()).put("isRestoreToBase",h.isRestoreToBase()).put("dParentHullId",h.getDParentHull()==null?JSONObject.NULL:h.getDParentHull().getHullId()).put("baseHullId",h.getBaseHull()==null?JSONObject.NULL:h.getBaseHull().getHullId()).put("defaultModuleHullId",SpecStore.o00000(h)));
  }
  // Real CSV merge/iteration, not JSON or JS property order. _default_D specs are NOT registered variants.
  paths.add("data/hulls/ship_data.csv");JSONArray csv=LoadingUtils.Ó00000("id","data/hulls/ship_data.csv");JSONArray events=new JSONArray();Set<java.lang.String> loaded=new HashSet<>();
  for(java.lang.String p:ships)loaded.add(json(p).getString("hullId"));
  for(int i=0;i<csv.length();i++){java.lang.String id=csv.getJSONObject(i).getString("id");if(id.isEmpty()||!loaded.contains(id))continue;registerEmpty(id,"ship_data",events);}
  for(java.lang.String p:skins){JSONObject r=json(p);java.lang.String id=r.getString("skinHullId");if(loaded.contains(id))continue;require(loaded.contains(r.getString("baseHullId")),"Skin precedes base hull "+id);loaded.add(id);registerEmpty(id,p,events);}
  List<java.lang.String> hullRegistry=B.o00000();
  // Real installed legacy initializer. Its non-file variants also affect HashMap capacity/bucket order.
  Class.forName("com.fs.starfarer.loading.specs.oo0o").getMethod("ÔÓ0000").invoke(null);
  List<java.lang.String> legacy=new ArrayList<>(B.o00000());legacy.removeAll(hullRegistry);
  List<java.lang.String> variantFiles=files(resources,"data/variants","variant");
  for(java.lang.String p:variantFiles){JSONObject r=json(p);java.lang.String id=r.getString("variantId");if(B.Ô00000(id))continue;HullVariantSpec v=new HullVariantSpec(r);v.setSource(VariantSource.STOCK);v.setSourcePath(p);B.o00000(v,false);events.put(new JSONArray().put("stock").put(p).put(id));}
  List<java.lang.String> order=B.o00000();JSONObject before=new JSONObject();
  for(java.lang.String id:order){HullVariantSpec v=B.o00000(id);before.put(id,row(v));require(B.Ô00000(v.getHullSpec().getHullId()+"_Hull"),"Unsafe missing HULL lookup before native pass "+id);for(java.lang.String moduleId:v.getStationModules().values()){require(B.Ô00000(moduleId),"Missing module must not trigger CampaignEngine lookup: "+moduleId);require(B.Ô00000(SpecStore.o00000(B.o00000(moduleId).getHullSpec())+"_Hull"),"Missing module HULL must not trigger CampaignEngine lookup: "+moduleId);}}
  // The installed method re-reads already registered stock IDs (skipping construction), then executes its own loop.
  // No mission specs were loaded, and its unconfigured mission folder must contribute no variants.
  SpecStore.oO0000();require(order.equals(B.o00000()),"Mission or external variants unexpectedly changed registry");
  JSONObject after=new JSONObject();for(java.lang.String id:hullRegistry)after.put(id,row(B.o00000(id)));
  System.out.print("@@NATIVE_DEFAULT_HULL_REGISTRY@@"+new JSONObject().put("method","native-C-and-CSV-order+native-B+native-oo0o+native-SpecStore.oO0000").put("paths",strings(paths)).put("events",events).put("legacyIds",strings(legacy)).put("registryOrder",strings(order)).put("before",before).put("hullsAfter",after).put("restoration",restoration).toString());
 }
 static void registerEmpty(java.lang.String id,java.lang.String origin,JSONArray events){g hull=SpecStore.o00000(g.class,id);HullVariantSpec v=new HullVariantSpec(id+"_Hull",hull);v.setSource(VariantSource.HULL);v.setVariantDisplayName(hull.getAllWeaponSlots().isEmpty()?"标准":"特装");B.o00000(v);events.put(new JSONArray().put("hull").put(origin).put(v.getHullVariantId()));}
}
