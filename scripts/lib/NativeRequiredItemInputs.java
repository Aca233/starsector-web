/** Runs installed constructors and getters; no CampaignEngine, UI, or private saves. */
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import com.fs.starfarer.api.Global;
import com.fs.starfarer.api.SettingsAPI;
import com.fs.starfarer.api.campaign.*;
import com.fs.starfarer.api.campaign.impl.items.BaseSpecialItemPlugin;
import com.fs.starfarer.api.combat.HullModEffect;
import com.fs.starfarer.campaign.ui.trade.CargoItemStack;
import com.fs.starfarer.campaign.fleet.CargoData;
import com.fs.starfarer.loading.SpecStore;
import com.fs.starfarer.loading.X;
import com.fs.starfarer.loading.scripts.ScriptStore;
public class NativeRequiredItemInputs {
 static Object nullable(Object value){return value==null?JSONObject.NULL:value;}
 static Object field(Object target,String name)throws Exception{Field f=target.getClass().getDeclaredField(name);f.setAccessible(true);return f.get(target);}
 static JSONObject stack(CargoStackAPI s)throws Exception {
  SpecialItemPlugin p=s.getPlugin();Field binding=BaseSpecialItemPlugin.class.getDeclaredField("stack");binding.setAccessible(true);
  return new JSONObject().put("type",s.getType().name()).put("itemId",s.getSpecialDataIfSpecial().getId()).put("itemData",nullable(s.getSpecialDataIfSpecial().getData())).put("size",s.getSize()).put("maxSize",s.getMaxSize()).put("roundSize",field(s,"roundSize")).put("cargoSpacePerUnit",field(s,"cargoSpacePerUnit")).put("nullCargo",s.getCargo()==null).put("plugin",p.getClass().getName()).put("pluginBound",binding.get(p)==s).put("name",p.getName()).put("price",p.getPrice(null,null)).put("removeOnRightClick",p.shouldRemoveOnRightClickAction()).put("tooltipWidth",p.getTooltipWidth()).put("tooltipExpandable",p.isTooltipExpandable());
 }
 @SuppressWarnings("unchecked")
 public static void main(String[] args)throws Exception {
  JSONObject input=new JSONObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8));Map<String,X> specs=new HashMap<>();Map<String,Class<?>> classes=null;
  for(Field f:ScriptStore.class.getDeclaredFields())if(Modifier.isPublic(f.getModifiers())&&Modifier.isStatic(f.getModifiers())&&Map.class.isAssignableFrom(f.getType())){classes=(Map<String,Class<?>>)f.get(null);break;}
  if(classes==null)throw new IllegalStateException("Original script class repository missing");
  JSONObject specials=new JSONObject(),required=new JSONObject(),oracles=new JSONObject();JSONArray rows=input.getJSONArray("specials");
  for(int i=0;i<rows.length();i++){
   JSONObject r=rows.getJSONObject(i);X s=new X();s.setId(r.getString("id"));s.setName(r.getString("name"));s.setPluginClass(r.getString("plugin"));s.setStackSize(Integer.parseInt(r.getString("stack size")));s.setCargoSpace(Float.parseFloat(r.getString("cargo space")));s.setBasePrice(Float.parseFloat(r.getString("base price")));s.setManufacturer(r.getString("tech/manufacturer"));s.setParams(r.getString("plugin params"));s.setSoundId(r.getString("sound id"));s.setSoundIdDrop(r.getString("sound id drop"));s.setDesc(r.getString("desc"));s.setIconName(r.getString("icon"));
   specs.put(s.getId(),s);SpecStore.o00000(X.class,s.getId(),s);classes.put(s.getPluginClass(),Class.forName(s.getPluginClass()));
   specials.put(s.getId(),new JSONObject().put("name",s.getName()).put("plugin",s.getPluginClass()).put("stackSize",s.getStackSize()).put("cargoSpace",s.getCargoSpace()).put("basePrice",s.getBasePrice()).put("manufacturer",nullable(s.getManufacturer())).put("params",nullable(s.getParams())).put("soundId",s.getSoundId()).put("soundIdDrop",s.getSoundIdDrop()).put("desc",s.getDesc()).put("icon",s.getIconName()));
  }
  Global.setSettings((SettingsAPI)Proxy.newProxyInstance(SettingsAPI.class.getClassLoader(),new Class[]{SettingsAPI.class},(proxy,method,a)->{
   switch(method.getName()){
    case "getSpecialItemSpec":if(!specs.containsKey(a[0]))throw new IllegalArgumentException("Unknown spec "+a[0]);return specs.get(a[0]);
    case "createCargoStack":return new CargoItemStack((CargoAPI.CargoItemType)a[0],a[1],(CargoData)a[2]);
    default:throw new UnsupportedOperationException(method.getName());
   }
  }));
  JSONArray mods=input.getJSONArray("hullmods");for(int i=0;i<mods.length();i++){
   JSONObject row=mods.getJSONObject(i);HullModEffect mod=(HullModEffect)Class.forName(row.getString("script")).getDeclaredConstructor().newInstance();CargoStackAPI a=mod.getRequiredItem(),b=mod.getRequiredItem();if(a==b||a.getPlugin()==b.getPlugin())throw new IllegalStateException("Unexpected cached required item");
   required.put(row.getString("id"),new JSONObject().put("type",a.getType().name()).put("itemId",a.getSpecialDataIfSpecial().getId()).put("itemData",nullable(a.getSpecialDataIfSpecial().getData())));oracles.put(row.getString("id"),stack(a));
  }
  System.out.print(new JSONObject().put("specials",specials).put("requiredItems",required).put("factoryOracle",oracles));
 }
}
