import java.awt.Color;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import org.json.*;
/** Public resource extraction only: no CampaignEngine, save files, display or OpenGL. */
public class NativeCampaignViewInputs {
 @SuppressWarnings({"unchecked","rawtypes"}) public static void main(String[] args)throws Exception {
  JSONObject input=new JSONObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8));
  Class<?> spec=Class.forName(input.getString("className")),style=Class.forName(input.getString("className")+"$o"),custom=Class.forName(input.getString("className")+"$Oo"),node=Class.forName("com.fs.starfarer.loading.specs.W");
  Constructor<?> ctor=spec.getConstructor(node,style,float.class,float.class,float.class),styleCtor=custom.getConstructor(JSONObject.class,String.class);
  Method setter=spec.getMethod("o00000",custom),make=spec.getMethod("o00000",boolean.class);
  JSONArray queries=input.getJSONArray("queries"),out=new JSONArray();JSONObject styles=input.getJSONObject("styles");
  for(int i=0;i<queries.length();i++){
   JSONObject q=queries.getJSONObject(i);String name=q.getString("style");Object type;
   try{type=Enum.valueOf((Class)style,q.optBoolean("forceCustom")?"CUSTOM":name);}catch(IllegalArgumentException e){type=Enum.valueOf((Class)style,"CUSTOM");}
   Object slot=ctor.newInstance(null,type,10f,20f,180f);
   if(((Enum)type).name().equals("CUSTOM")){
    String id=q.optString("styleId",name);JSONObject config=q.has("styleId")?styles.getJSONObject(id):q.optJSONObject("styleSpec");if(config==null)config=styles.getJSONObject(id);setter.invoke(slot,styleCtor.newInstance(config,id));
   }
   Object engine=make.invoke(slot,true);Class<?> cls=engine.getClass();Color a=(Color)cls.getMethod("getColor").invoke(engine),b=(Color)cls.getMethod("getContrailColor").invoke(engine);
   JSONObject row=new JSONObject();row.put("color",new JSONArray(new int[]{a.getRed(),a.getGreen(),a.getBlue(),a.getAlpha()}));row.put("contrailColor",new JSONArray(new int[]{b.getRed(),b.getGreen(),b.getBlue(),b.getAlpha()}));out.put(row);
  }
  System.out.print(out.toString());
 }
}
