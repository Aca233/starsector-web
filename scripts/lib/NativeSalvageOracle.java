/** Executes installed SalvageEntity.generateSalvage with actual native CargoData and public specs. */
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.json.*;
import com.fs.starfarer.api.Global;
import com.fs.starfarer.api.SettingsAPI;
import com.fs.starfarer.api.campaign.*;
import com.fs.starfarer.api.campaign.econ.*;
import com.fs.starfarer.api.impl.campaign.procgen.SalvageEntityGenDataSpec.DropData;
import com.fs.starfarer.api.impl.campaign.rulecmd.salvage.SalvageEntity;
import com.fs.starfarer.campaign.fleet.CargoData;
import com.fs.starfarer.campaign.ui.trade.CargoItemStack;
import com.fs.starfarer.loading.SpecStore;
import com.fs.starfarer.loading.X;
import com.fs.starfarer.loading.B;
import com.fs.starfarer.loading.K;
import com.fs.starfarer.loading.specs.O00O;
import com.fs.starfarer.loading.scripts.ScriptStore;
public class NativeSalvageOracle {
 static List<DropData> drops(JSONArray rows)throws Exception {if(rows==null)return null;List<DropData> result=new ArrayList<>();for(int i=0;i<rows.length();i++){JSONObject r=rows.getJSONObject(i);DropData d=new DropData();d.group=r.isNull("group")?null:r.getString("group");d.chances=r.getInt("chances");d.maxChances=r.getInt("maxChances");d.value=r.getInt("value");d.valueMult=(float)r.getDouble("valueMult");if(r.has("custom")){JSONArray entries=r.getJSONArray("custom");for(int j=0;j<entries.length();j++){JSONObject e=entries.getJSONObject(j);d.addCustom(e.getString("commodity"),(float)e.getDouble("weight"));}}result.add(d);}return result;}
 static JSONObject random(Random r)throws Exception{return new JSONObject().put("state",((AtomicLong)NativeSalvageInputs.field(r,"seed")).get()+"").put("haveNextGaussian",NativeSalvageInputs.field(r,"haveNextNextGaussian")).put("nextGaussian",NativeSalvageInputs.field(r,"nextNextGaussian"));}
 @SuppressWarnings("unchecked") public static void main(String[] args)throws Exception{
  byte[] bytes=System.in.readAllBytes();JSONObject in=new JSONObject(new String(bytes,StandardCharsets.UTF_8));System.setIn(new ByteArrayInputStream(bytes));PrintStream output=System.out;ByteArrayOutputStream capture=new ByteArrayOutputStream();try{System.setOut(new PrintStream(capture));NativeSalvageInputs.main(args);}finally{System.setOut(output);}String text=capture.toString("UTF-8"),marker="@@NATIVE_SALVAGE_INPUTS@@";JSONObject data=new JSONObject(text.substring(text.lastIndexOf(marker)+marker.length()));
  final Class<?> commodityClass=Class.forName("com.fs.starfarer.loading.OOoOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO");JSONObject commodities=in.getJSONObject("commodities");for(String id:JSONObject.getNames(commodities)){JSONObject r=commodities.getJSONObject(id);Object spec=commodityClass.getDeclaredConstructor().newInstance();commodityClass.getMethod("setId",String.class).invoke(spec,id);commodityClass.getMethod("setName",String.class).invoke(spec,r.getString("name"));for(String key:new String[]{"cargoSpace","basePrice","order"})commodityClass.getMethod("set"+Character.toUpperCase(key.charAt(0))+key.substring(1),float.class).invoke(spec,(float)r.getDouble(key));commodityClass.getMethod("setStackSize",int.class).invoke(spec,r.getInt("stackSize"));SpecStore.o00000((Class)commodityClass,id,spec);}
  Map<String,Class<?>> classes=null;for(Field field:ScriptStore.class.getDeclaredFields())if(Modifier.isStatic(field.getModifiers())&&Modifier.isPublic(field.getModifiers())&&Map.class.isAssignableFrom(field.getType())){classes=(Map<String,Class<?>>)field.get(null);break;}if(classes==null)throw new IllegalStateException("Missing native script class registry");
  JSONObject special=in.getJSONObject("specials");for(String id:JSONObject.getNames(special)){JSONObject r=special.getJSONObject(id);X s=new X();s.setId(id);s.setName(r.getString("name"));s.setPluginClass(r.getString("plugin"));s.setStackSize(r.getInt("stackSize"));s.setCargoSpace((float)r.getDouble("cargoSpace"));for(int si=0;si<data.getJSONArray("specials").length();si++){JSONObject source=data.getJSONArray("specials").getJSONObject(si);if(source.getString("id").equals(id))s.setBasePrice((float)source.getDouble("basePrice"));}s.setOrder((float)r.getDouble("order"));SpecStore.o00000(X.class,id,s);classes.put(s.getPluginClass(),Class.forName(s.getPluginClass()));}
  JSONObject mods=in.getJSONObject("hullmods");List<O00O> hullmods=new ArrayList<>();JSONArray modRows=data.getJSONArray("hullmods");for(int i=0;i<modRows.length();i++){JSONObject source=modRows.getJSONObject(i);String id=source.getString("id");JSONObject r=mods.getJSONObject(id);O00O m=new O00O();m.setId(id);m.setDisplayName(r.getString("name"));m.setBaseValue(r.isNull("baseValue")?1000f:(float)r.getDouble("baseValue"));m.setTier(source.getInt("tier"));m.setRarity((float)source.getDouble("rarity"));m.setHidden(source.getBoolean("hidden"));m.setHiddenEverywhere(source.getBoolean("hiddenEverywhere"));JSONArray tags=source.getJSONArray("tags");for(int t=0;t<tags.length();t++)m.addTag(tags.getString(t));SpecStore.o00000(O00O.class,id,m);hullmods.add(m);}
  JSONObject wingCargo=in.getJSONObject("wingCargo");for(String id:K.Ò00000())B.o00000(K.o00000(id).getVariantId()).getHullSpec().setHullName(wingCargo.getJSONObject(id).getString("hullName"));
  SettingsAPI old=Global.getSettings();final String[] difficulty={"normal"};EconomyAPI economy=(EconomyAPI)Proxy.newProxyInstance(EconomyAPI.class.getClassLoader(),new Class[]{EconomyAPI.class},(proxy,m,a)->{if(m.getName().equals("getCommoditySpec"))return SpecStore.o00000(commodityClass,(String)a[0]);throw new UnsupportedOperationException(m.getName());});
  Set<String> knownHullmods=new HashSet<>();FactionAPI playerFaction=(FactionAPI)Proxy.newProxyInstance(FactionAPI.class.getClassLoader(),new Class[]{FactionAPI.class},(proxy,m,a)->{if(m.getName().equals("knowsHullMod"))return knownHullmods.contains((String)a[0]);throw new UnsupportedOperationException(m.getName());});
  Global.setSector((SectorAPI)Proxy.newProxyInstance(SectorAPI.class.getClassLoader(),new Class[]{SectorAPI.class},(proxy,m,a)->{if(m.getName().equals("getDifficulty"))return difficulty[0];if(m.getName().equals("getEconomy"))return economy;if(m.getName().equals("getPlayerFaction"))return playerFaction;throw new UnsupportedOperationException(m.getName());}));
  Global.setSettings((SettingsAPI)Proxy.newProxyInstance(SettingsAPI.class.getClassLoader(),new Class[]{SettingsAPI.class},(proxy,m,a)->{
   switch(m.getName()){
    case "isDevMode":return old.getBoolean("devMode");
    case "createCargo":return new CargoData((Boolean)a[0]);case "createCargoStack":return new CargoItemStack((CargoAPI.CargoItemType)a[0],a[1],(CargoData)a[2]);
    case "getSpecialItemSpec":return SpecStore.o00000(X.class,(String)a[0]);case "getHullModSpec":return SpecStore.o00000(O00O.class,(String)a[0]);
    case "getWeaponSpec":return com.fs.starfarer.loading.Q.String((String)a[0]);
    case "getAllWeaponSpecs":{List<Object> r=new ArrayList<>();JSONArray list=data.getJSONArray("weapons");for(int i=0;i<list.length();i++)r.add(com.fs.starfarer.loading.Q.String(list.getJSONObject(i).getString("id")));return r;}
    case "getAllHullModSpecs":return new ArrayList<O00O>(hullmods);
    case "getAllFighterWingSpecs":{List<Object> r=new ArrayList<>();for(String id:K.Ò00000())r.add(K.o00000(id));return r;}
    default:try{return m.invoke(old,a);}catch(InvocationTargetException e){throw e.getCause();}
   }
  }));
  Global.setFactory((com.fs.starfarer.api.FactoryAPI)Proxy.newProxyInstance(com.fs.starfarer.api.FactoryAPI.class.getClassLoader(),new Class[]{com.fs.starfarer.api.FactoryAPI.class},(proxy,m,a)->{if(m.getName().equals("createCargo"))return new CargoData((Boolean)a[0]);if(m.getName().equals("createCargoStack"))return new CargoItemStack((CargoAPI.CargoItemType)a[0],a[1],(CargoData)a[2]);throw new UnsupportedOperationException(m.getName());}));
  JSONArray result=new JSONArray(),cases=in.getJSONArray("salvageCases");for(int i=0;i<cases.length();i++){JSONObject c=cases.getJSONObject(i);Random random=new Random(Long.parseLong(c.getString("seed")));difficulty[0]=c.getString("difficulty");knownHullmods.clear();JSONArray known=c.optJSONArray("knownHullmods");if(known!=null)for(int k=0;k<known.length();k++)knownHullmods.add(known.getString(k));CargoAPI cargo=SalvageEntity.generateSalvage(random,(float)c.getDouble("valueMult"),(float)c.getDouble("randomMult"),(float)c.getDouble("overallMult"),(float)c.getDouble("fuelMult"),drops(c.optJSONArray("dropValue")),drops(c.optJSONArray("dropRandom")));JSONArray stacks=new JSONArray();for(CargoStackAPI s:cargo.getStacksCopy()){JSONObject r=new JSONObject().put("type",s.getType().name()).put("size",s.getSize());if(s.isSpecialStack())r.put("itemId",s.getSpecialDataIfSpecial().getId()).put("itemData",s.getSpecialDataIfSpecial().getData()==null?JSONObject.NULL:s.getSpecialDataIfSpecial().getData());else r.put(s.isCommodityStack()?"commodityId":"itemId",s.getData());stacks.put(r);}result.put(new JSONObject().put("input",c).put("stacks",stacks).put("random",random(random)));}
  data.put("salvageOracle",result);System.out.print("@@NATIVE_SALVAGE_INPUTS@@"+data);
 }
}
