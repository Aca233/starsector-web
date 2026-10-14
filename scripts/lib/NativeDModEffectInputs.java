/** Isolated numeric oracle: real installed API hullmods and compiled public data hullmods.
 * No Global, game launch, private saves, HullSpec placeholders or afterCreation callbacks.
 * The explicit stats proxy only supplies API MutableStat/StatBonus and the two dynamic namespaces.
 */
import com.fs.starfarer.api.combat.*;
import com.fs.starfarer.api.combat.MutableStat.StatMod;
import com.fs.starfarer.api.combat.ShipAPI.HullSize;
import com.fs.starfarer.api.util.DynamicStatsAPI;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

public class NativeDModEffectInputs {
 static final class StatsContext implements InvocationHandler {
  final Map<String,Object> stats=new LinkedHashMap<>();
  final Map<String,MutableStat> dynamicStats=new LinkedHashMap<>();
  final Map<String,StatBonus> dynamicMods=new LinkedHashMap<>();
  final DynamicStatsAPI dynamic=(DynamicStatsAPI)Proxy.newProxyInstance(DynamicStatsAPI.class.getClassLoader(),new Class[]{DynamicStatsAPI.class},(proxy,method,args)->{
   String name=method.getName();
   if(name.equals("getStat"))return dynamicStat((String)args[0]);
   if(name.equals("getMod"))return dynamicMod((String)args[0]);
   if(name.equals("getValue"))return args.length==1?dynamicStat((String)args[0]).getModifiedValue():dynamicMod((String)args[0]).computeEffective((Float)args[1]);
   throw new UnsupportedOperationException("Uncaptured dynamic service: "+method);
  });
  MutableStat dynamicStat(String key){return dynamicStats.computeIfAbsent(key,k->new MutableStat(1f));}
  StatBonus dynamicMod(String key){return dynamicMods.computeIfAbsent(key,k->new StatBonus());}
  public Object invoke(Object proxy,Method method,Object[] args){
   if(method.getName().equals("getDynamic"))return dynamic;
   if(method.getParameterCount()!=0||!method.getName().startsWith("get"))throw new UnsupportedOperationException("Uncaptured stats service: "+method);
   String key=method.getName().substring(3);key=Character.toLowerCase(key.charAt(0))+key.substring(1);
   if(method.getReturnType()==MutableStat.class)return stats.computeIfAbsent(key,k->new MutableStat(1f));
   if(method.getReturnType()==StatBonus.class)return stats.computeIfAbsent(key,k->new StatBonus());
   throw new UnsupportedOperationException("Uncaptured stats service: "+method);
  }
  MutableShipStatsAPI shipStats(){return (MutableShipStatsAPI)Proxy.newProxyInstance(MutableShipStatsAPI.class.getClassLoader(),new Class[]{MutableShipStatsAPI.class},this);}
  JSONObject snapshot(String id)throws Exception {
   JSONObject out=new JSONObject();
   for(Map.Entry<String,Object> e:stats.entrySet())capture(out,e.getKey(),e.getValue(),id);
   for(Map.Entry<String,MutableStat> e:dynamicStats.entrySet())capture(out,"dynamicStats."+e.getKey(),e.getValue(),id);
   for(Map.Entry<String,StatBonus> e:dynamicMods.entrySet())capture(out,"dynamic."+e.getKey(),e.getValue(),id);
   return out;
  }
 }
 static void capture(JSONObject out,String key,Object stat,String id)throws Exception {
  if(stat instanceof MutableStat){MutableStat s=(MutableStat)stat;add(out,key+".flat",s.getFlatMods(),id);add(out,key+".percent",s.getPercentMods(),id);add(out,key+".mult",s.getMultMods(),id);}
  else{StatBonus s=(StatBonus)stat;add(out,key+".flat",s.getFlatBonuses(),id);add(out,key+".percent",s.getPercentBonuses(),id);add(out,key+".mult",s.getMultBonuses(),id);}
 }
 static void add(JSONObject out,String key,Map<String,StatMod> mods,String id)throws Exception {StatMod mod=mods.get(id);if(mod!=null)out.put(key,(double)mod.value);}
 public static void main(String[] args)throws Exception {
  JSONObject input=new JSONObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8)),effects=input.getJSONObject("effects");
  Set<String> markers=new HashSet<>();JSONArray markerArray=input.getJSONArray("markerScripts");for(int i=0;i<markerArray.length();i++)markers.add(markerArray.getString(i));
  JSONArray results=new JSONArray(),samples=input.getJSONArray("samples");
  for(Iterator<?> it=effects.keys();it.hasNext();){
   String script=(String)it.next();JSONObject row=effects.getJSONObject(script),constants=row.getJSONObject("constants");Class<?> clazz=Class.forName(script);
   for(Iterator<?> ci=constants.keys();ci.hasNext();){String key=(String)ci.next();Field field=clazz.getDeclaredField(key);field.setAccessible(true);float actual=field.getFloat(null),expected=(float)constants.getDouble(key);if(Float.floatToIntBits(actual)!=Float.floatToIntBits(expected))throw new IllegalStateException("Source/native constant divergence: "+script+"."+key);}
   if(markers.contains(script))continue;
   BaseHullMod plugin=(BaseHullMod)clazz.getDeclaredConstructor().newInstance();String id=row.getString("id");
   for(HullSize size:new HullSize[]{HullSize.FRIGATE,HullSize.DESTROYER,HullSize.CRUISER,HullSize.CAPITAL_SHIP})for(int i=0;i<samples.length();i++)for(float maintenance:new float[]{-1f,0f,.25f}){
    StatsContext context=new StatsContext();boolean implicit=samples.isNull(i);float effect=implicit?1f:(float)samples.getDouble(i);
    if(!implicit)context.dynamicStat("dmod_effect_mult").modifyMult("probe-input",effect);
    context.dynamicMod("dmod_reduce_maintenance").modifyFlat("probe-input",maintenance);
    plugin.applyEffectsBeforeShipCreation(size,context.shipStats(),id);
    results.put(new JSONObject().put("id",id).put("size",size.name()).put("effect",implicit?JSONObject.NULL:(Object)(double)effect).put("maintenance",(double)maintenance).put("modifiers",context.snapshot(id)));
   }
  }
  System.out.print(results.toString());
 }
}
