/** Installed SavedVariantData getter oracle, public resources only; no CampaignEngine or desktop. */
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import com.fs.util.C;
import com.fs.starfarer.loading.SpecStore;
import com.fs.starfarer.loading.specs.g;
import com.fs.starfarer.api.combat.ShipVariantAPI;
import com.fs.starfarer.coreui.refit.auto.SavedVariantData;
public class NativeSavedVariantInputs {
 static boolean populated(JSONObject row,String key){Object value=row.opt(key);return value instanceof JSONArray?((JSONArray)value).length()>0:value instanceof JSONObject&&((JSONObject)value).length()>0;}
 public static void main(String[] args)throws Exception{
  byte[] bytes=System.in.readAllBytes();JSONObject input=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
  System.setIn(new ByteArrayInputStream(bytes));PrintStream output=System.out;try{System.setOut(new PrintStream(OutputStream.nullOutputStream()));NativeDefaultHullRegistry.main(args);}finally{System.setOut(output);}
  C resources=C.Ó00000();JSONObject hulls=input.getJSONObject("hulls"),autofit=input.getJSONObject("autofitHulls");
  // Exact compatibility flags from ShipHullSpecLoader's public skin input branches.
  for(String file:NativeDefaultHullRegistry.files(resources,"data/hulls/skins","skin")){
   JSONObject skin=NativeDefaultHullRegistry.json(file);String id=skin.getString("skinHullId");if(!hulls.has(id))continue;
   boolean compatible=!skin.optBoolean("incompatibleWithBaseHull");
   JSONArray removed=skin.optJSONArray("removeWeaponSlots"),baseSlots=autofit.getJSONObject(skin.getString("baseHullId")).getJSONArray("slots");Set<String> slotIds=new HashSet<>();for(int i=0;i<baseSlots.length();i++)slotIds.add(baseSlots.getJSONObject(i).getString("id"));
   if(removed!=null)for(int i=0;i<removed.length();i++)if(slotIds.contains(removed.getString(i)))compatible=false;
   for(String key:new String[]{"removeBuiltInMods","removeBuiltInWings","removeBuiltInWeapons","builtInWings","builtInWeapons","weaponSlotChanges"})if(populated(skin,key))compatible=false;
   if(skin.has("incompatibleWithBaseHull")&&!skin.getBoolean("incompatibleWithBaseHull"))compatible=true;
   SpecStore.o00000(g.class,id).setCompatibleWithBase(compatible);
  }
  SavedVariantData data=new SavedVariantData();JSONObject bases=new JSONObject(),targets=new JSONObject();
  for(String id:JSONObject.getNames(hulls)){
   g hull=SpecStore.o00000(g.class,id);String base=SavedVariantData.getBaseHullId(hull);bases.put(id,base);
   if(!targets.has(base)){JSONArray ids=new JSONArray();for(ShipVariantAPI variant:data.getTargetVariants(id))ids.put(variant.getHullVariantId());targets.put(base,ids);}
  }
  System.out.print("@@NATIVE_SAVED_VARIANTS@@"+new JSONObject().put("baseHullIds",bases).put("stockTargets",targets).put("paths",NativeDefaultHullRegistry.strings(NativeDefaultHullRegistry.paths)));
 }
}
