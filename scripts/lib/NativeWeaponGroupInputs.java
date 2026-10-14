/** Public-core grouping inputs and installed HullVariantSpec V2 oracle. No desktop or saves. */
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import com.fs.util.C;
import com.fs.starfarer.api.combat.WeaponAPI;
import com.fs.starfarer.api.combat.DamageType;
import com.fs.starfarer.api.loading.WeaponGroupSpec;
import com.fs.starfarer.loading.B;
import com.fs.starfarer.loading.LoadingUtils;
import com.fs.starfarer.loading.SpecStore;
import com.fs.starfarer.loading.specs.BaseWeaponSpec;
import com.fs.starfarer.loading.specs.Oo0O;
import com.fs.starfarer.loading.specs.J;
import com.fs.starfarer.loading.specs.g;
import com.fs.starfarer.loading.specs.L;
import com.fs.starfarer.loading.specs.nullsuper;
import com.fs.starfarer.loading.specs.HullVariantSpec;
public class NativeWeaponGroupInputs {
 static JSONObject weapons=new JSONObject();
 static JSONObject specimen(String name,HullVariantSpec v)throws Exception {
  JSONArray entries=new JSONArray(),groups=new JSONArray();for(Map.Entry<String,String> e:v.getWeapons().entrySet())entries.put(new JSONArray().put(e.getKey()).put(e.getValue()));
  v.autoGenerateWeaponGroups();for(WeaponGroupSpec group:v.getWeaponGroups())groups.put(new JSONObject().put("type",group.getType().name()).put("autofire",group.isAutofireOnByDefault()).put("slots",NativeDefaultHullRegistry.strings(group.getSlots())));
  return new JSONObject().put("name",name).put("hullId",v.getHullSpec().getHullId()).put("weapons",entries).put("fluxVents",v.getNumFluxVents()).put("fluxCapacitors",v.getNumFluxCapacitors()).put("groups",groups);
 }
 public static void main(String[] args)throws Exception {
  byte[] bytes=System.in.readAllBytes();JSONObject in=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
  System.setIn(new ByteArrayInputStream(bytes));PrintStream output=System.out;try{System.setOut(new PrintStream(OutputStream.nullOutputStream()));NativeDefaultHullRegistry.main(args);}finally{System.setOut(output);}
  C resources=C.Ó00000();Map<String,JSONObject> rows=new HashMap<>();NativeDefaultHullRegistry.paths.add("data/weapons/weapon_data.csv");JSONArray csv=LoadingUtils.Ó00000("id","data/weapons/weapon_data.csv");for(int i=0;i<csv.length();i++)rows.put(csv.getJSONObject(i).getString("id"),csv.getJSONObject(i));
  com.fs.starfarer.loading.Q.Ò00000();
  Method register=com.fs.starfarer.loading.Q.class.getMethod("super",String.class,BaseWeaponSpec.class);
  for(String file:NativeDefaultHullRegistry.files(resources,"data/weapons","wpn")){
   JSONObject raw=NativeDefaultHullRegistry.json(file);String id=raw.getString("id"),kind=raw.getString("specClass");JSONObject row=rows.get(id);NativeDefaultHullRegistry.require(row!=null,"Missing CSV row "+id);
   BaseWeaponSpec w; if(kind.equals("beam"))w=new com.fs.starfarer.loading.specs.Object(id);else if(kind.equals("pulse"))w=new J(id);else {NativeDefaultHullRegistry.require(kind.equals("projectile"),"Unknown class "+kind);w=new Oo0O(id);}
   w.setSize(WeaponAPI.WeaponSize.valueOf(raw.getString("size")));w.setType(WeaponAPI.WeaponType.valueOf(raw.getString("type")));w.setDamageType(com.fs.starfarer.loading.String.o00000(row,"type",DamageType.class,DamageType.OTHER));w.setWeaponGroupTag(row.optString("groupTag",""));
   w.setMaxRange((float)row.optDouble("range",250));w.setMaxAmmo(row.optInt("ammo",Integer.MAX_VALUE));for(String hint:row.optString("hints","").split(","))if(!hint.trim().isEmpty())w.getAIHints().add(WeaponAPI.AIHints.valueOf(hint.trim()));
   JSONObject r=new JSONObject().put("id",id).put("specClass",kind);
   if(w instanceof Oo0O){Oo0O p=(Oo0O)w;p.setInterruptibleBurst(raw.optBoolean("interruptibleBurst"));p.setChargeTime((float)row.optDouble("chargeup",0));p.setEnergyPerSecond((float)row.optDouble("energy/second",0));p.setEnergyPerShot((float)row.optDouble("energy/shot",0));p.setBurstSize(row.optInt("burst size",1));r.put("interruptibleBurst",p.isInterruptibleBurst()).put("chargeTime",p.getChargeTime()).put("energyPerSecond",p.getEnergyPerSecond()).put("energyPerShot",p.getEnergyPerShot()).put("burstSize",p.getBurstSize());}
   else {com.fs.starfarer.loading.specs.Object b=(com.fs.starfarer.loading.specs.Object)w;float burst=(float)row.optDouble("burst size",0);if(burst>0){b.setBurstBeam(true);b.setBurstDuration(burst);}b.setChargeupTime((float)row.optDouble("chargeup",0));b.setEnergyPerSecond((float)row.optDouble("energy/second",0));r.put("burstBeam",b.isBurstBeam()).put("burstDuration",b.getBurstDuration()).put("chargeupTime",b.getChargeupTime()).put("energyPerSecond",b.getEnergyPerSecond());}
   r.put("size",w.getSize().name()).put("type",w.getType().name()).put("damageType",w.getDamageType().name()).put("maxRange",w.getMaxRange()).put("maxAmmo",w.getMaxAmmo()).put("groupTag",w.getWeaponGroupTag()).put("aiHints",NativeDefaultHullRegistry.strings(w.getAIHints()));weapons.put(id,r);register.invoke(null,id,w);
  }
  JSONObject hulls=in.getJSONObject("autofitHulls"),flux=in.getJSONObject("hullFlux");for(String id:JSONObject.getNames(hulls)){
   g h=SpecStore.o00000(g.class,id);JSONObject reactor=flux.getJSONObject(id);h.setReactorSpec(new L((float)reactor.getDouble("fluxCapacity"),(float)reactor.getDouble("fluxDissipation")));
   // The registry helper leaves mount enums unset because its own getters never use them.
   JSONArray slots=hulls.getJSONObject(id).getJSONArray("slots");List<nullsuper> actual=h.getAllWeaponSlots();NativeDefaultHullRegistry.require(actual.size()==slots.length(),"Slot list mismatch");for(int i=0;i<slots.length();i++){String mount=slots.getJSONObject(i).getString("mount");actual.get(i).setSlotType(nullsuper.o.values()[mount.equals("TURRET")?0:mount.equals("HARDPOINT")?1:2]);}
  }
  Field settingsField=com.fs.starfarer.settings.StarfarerSettings.class.getDeclaredField("õØ0000");settingsField.setAccessible(true);settingsField.set(null,NativeDefaultHullRegistry.json("data/config/settings.json"));
  JSONArray oracle=new JSONArray();JSONArray ids=in.getJSONArray("oracleVariantIds");for(int i=0;i<ids.length();i++){String id=ids.getString(i);NativeDefaultHullRegistry.require(B.Ô00000(id),"Unknown stock "+id);oracle.put(specimen(id,B.o00000(id).clone()));}
  // Installed weapons, explicit scenario hull/slots; separate from default reference registry.
  JSONArray cases=in.getJSONArray("cases");for(int i=0;i<cases.length();i++){
   JSONObject c=cases.getJSONObject(i);g h=new g(c.getString("name"));JSONObject reactor=c.getJSONObject("hull");h.setReactorSpec(new L((float)reactor.getDouble("fluxCapacity"),(float)reactor.getDouble("fluxDissipation")));JSONArray slots=c.getJSONArray("slots");
   for(int j=0;j<slots.length();j++){JSONObject s=slots.getJSONObject(j);h.addWeaponSlot(new nullsuper(s.getString("id"),WeaponAPI.WeaponType.valueOf(s.getString("type")),WeaponAPI.WeaponSize.SMALL,nullsuper.o.values()[s.getString("mount").equals("HARDPOINT")?1:0],new org.lwjgl.util.vector.Vector2f(),null,(float)s.getDouble("angle"),(float)s.getDouble("arc")));}
   HullVariantSpec v=new HullVariantSpec(c.getString("name"),h);v.setNumFluxVents(c.getInt("fluxVents"));v.setNumFluxCapacitors(c.getInt("fluxCapacitors"));JSONArray entries=c.getJSONArray("weapons");for(int j=0;j<entries.length();j++)v.getWeapons().put(entries.getJSONArray(j).getString(0),entries.getJSONArray(j).getString(1));oracle.put(specimen(c.getString("name"),v).put("slots",slots).put("hull",reactor));
  }
  JSONObject settings=NativeDefaultHullRegistry.json("data/config/settings.json");System.out.print("@@NATIVE_WEAPON_GROUPS@@"+new JSONObject().put("weapons",weapons).put("settings",new JSONObject().put("fluxPerCapacitor",settings.getDouble("fluxPerCapacitor")).put("dissipationPerVent",settings.getDouble("dissipationPerVent"))).put("oracle",oracle).put("paths",NativeDefaultHullRegistry.strings(NativeDefaultHullRegistry.paths)));
 }
}
