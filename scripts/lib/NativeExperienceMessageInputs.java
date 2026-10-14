/** Installed Misc presentation constants/DecimalFormat, using explicit public Settings; no engine or UI. */
import java.lang.reflect.*;import java.nio.charset.StandardCharsets;import java.awt.Color;import java.util.Locale;import org.json.*;import com.fs.starfarer.api.*;import com.fs.starfarer.api.util.Misc;
public class NativeExperienceMessageInputs {
 static JSONArray color(Color c){return new JSONArray().put(c.getRed()).put(c.getGreen()).put(c.getBlue()).put(c.getAlpha());}
 public static void main(String[] args)throws Exception {
  JSONObject input=new JSONObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8)),settings=input.getJSONObject("settings");Locale.setDefault(Locale.SIMPLIFIED_CHINESE);
  Global.setSettings((SettingsAPI)Proxy.newProxyInstance(SettingsAPI.class.getClassLoader(),new Class[]{SettingsAPI.class},(p,m,a)->{switch(m.getName()){case "getFloat":return (float)settings.getDouble((String)a[0]);case "getInt":return settings.getInt((String)a[0]);case "getBoolean":return settings.getBoolean((String)a[0]);case "getColor":{JSONArray c=settings.getJSONArray((String)a[0]);return new Color(c.getInt(0),c.getInt(1),c.getInt(2),c.length()>3?c.getInt(3):255);}}throw new UnsupportedOperationException(m.getName());}));
  JSONArray cases=new JSONArray(),numbers=input.getJSONArray("numbers");for(int i=0;i<numbers.length();i++){String n=numbers.getString(i);cases.put(new JSONObject().put("value",n).put("text",Misc.getWithDGS((float)Long.parseLong(n))));}
  System.out.print("@@XP_MESSAGES@@"+new JSONObject().put("story",Misc.STORY).put("highlight",color(Misc.getHighlightColor())).put("storyColor",color(Misc.getStoryOptionColor())).put("numberLocale","zh-CN").put("numbers",cases));
 }
}
