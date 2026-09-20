import java.awt.Color;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import org.json.*;
import com.fs.starfarer.api.*;
import com.fs.starfarer.api.combat.*;
import com.fs.starfarer.api.combat.ShipAPI.HullSize;
import com.fs.starfarer.api.loading.HullModSpecAPI;

/** Offline description-only probe. Unknown settings fail closed, never fabricated. */
public class NativeDescriptionProbe {
  static JSONObject settings;
  static JSONArray mods;
  static Object settingsCall(Object proxy, Method method, Object[] args) throws Exception {
    String name = method.getName();
    // Native codex/title baseline: no campaign commander or ship-specific bonus.
    if (name.equals("getCurrentState")) return GameState.TITLE;
    if (args != null && args.length == 1 && args[0] instanceof String && settings.has((String)args[0])) {
      String key = (String)args[0];
      if (name.equals("getFloat")) return (float)settings.getDouble(key);
      if (name.equals("getInt")) return settings.getInt(key);
      if (name.equals("getBoolean")) return settings.getBoolean(key);
      if (name.equals("getString")) return settings.getString(key);
      if (name.equals("getColor")) {
        JSONArray c = settings.getJSONArray(key);
        return new Color(c.getInt(0),c.getInt(1),c.getInt(2),c.length()>3?c.getInt(3):255);
      }
    }
    if (name.equals("getHullModSpec")) {
      for(int i=0;i<mods.length();i++) if(mods.getJSONObject(i).getString("id").equals(args[0])) return spec(mods.getJSONObject(i));
    }
    throw new UnsupportedOperationException("Unresolved settings call: " + name + " " + Arrays.toString(args));
  }
  static HullModSpecAPI spec(final JSONObject row) {
    return (HullModSpecAPI)Proxy.newProxyInstance(NativeDescriptionProbe.class.getClassLoader(), new Class[]{HullModSpecAPI.class}, (proxy,method,args)-> {
      if(method.getName().equals("getId")) return row.getString("id");
      if(method.getName().equals("getDisplayName")) return row.getString("name");
      throw new UnsupportedOperationException("Unresolved hullmod spec call: " + method.getName());
    });
  }
  public static void main(String[] args) throws Exception {
    JSONObject input=new JSONObject(new String(Files.readAllBytes(Paths.get(args[0])),StandardCharsets.UTF_8));
    settings=input.getJSONObject("settings");mods=input.getJSONArray("hullmods");
    Global.setSettings((SettingsAPI)Proxy.newProxyInstance(NativeDescriptionProbe.class.getClassLoader(),new Class[]{SettingsAPI.class},NativeDescriptionProbe::settingsCall));
    JSONObject output=new JSONObject();
    for(int i=0;i<mods.length();i++) {
      JSONObject row=mods.getJSONObject(i), result=new JSONObject();
      try {
        HullModEffect effect=(HullModEffect)Class.forName(row.getString("script")).getDeclaredConstructor().newInstance();
        effect.init(spec(row));
        for(HullSize size:new HullSize[]{HullSize.FRIGATE,HullSize.DESTROYER,HullSize.CRUISER,HullSize.CAPITAL_SHIP}) {
          JSONObject fields=new JSONObject();
          for(String field:new String[]{"desc","sModDesc"}) {
            JSONArray values=new JSONArray();
            String template=row.optString(field,"");
            int count=template.split("%s",-1).length-1;
            for(int j=0;j<count;j++) {
              try {String value=field.equals("desc")?effect.getDescriptionParam(j,size,null):effect.getSModDescriptionParam(j,size,null);values.put(value==null?JSONObject.NULL:value);}
              catch(Throwable error) {values.put(JSONObject.NULL);fields.put(field+"Error",error.toString());}
            }
            fields.put(field,values);
          }
          result.put(size.name(),fields);
        }
      } catch(Throwable error) {result.put("error",error.toString());}
      output.put(row.getString("id"),result);
    }
    Files.write(Paths.get(args[1]),output.toString(2).getBytes(StandardCharsets.UTF_8));
  }
}
