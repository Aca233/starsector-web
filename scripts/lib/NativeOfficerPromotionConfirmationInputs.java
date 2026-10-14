/** Actual stock promotion delegate with explicit API receivers. No UI, save files or engine constructor. */
import java.lang.reflect.*;import java.nio.charset.StandardCharsets;import java.awt.Color;import java.util.*;import org.json.*;
import com.fs.starfarer.api.*;import com.fs.starfarer.api.campaign.*;import com.fs.starfarer.api.characters.*;import com.fs.starfarer.api.ui.*;import com.fs.starfarer.api.impl.campaign.intel.*;
public class NativeOfficerPromotionConfirmationInputs {
 @SuppressWarnings("unchecked") static <T>T proxy(Class<T> c,InvocationHandler h){return (T)Proxy.newProxyInstance(c.getClassLoader(),new Class[]{c},h);}
 static void set(Object o,String key,Object value)throws Exception{for(Class<?> c=o.getClass();c!=null;c=c.getSuperclass())try{Field f=c.getDeclaredField(key);f.setAccessible(true);f.set(o,value);return;}catch(NoSuchFieldException e){}throw new NoSuchFieldException(key);}
 public static void main(String[] args)throws Exception {
  JSONObject settings=new JSONObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8));
  Global.setSettings(proxy(SettingsAPI.class,(p,m,a)->{switch(m.getName()){case "getBonusXP":return (float)settings.getJSONObject("bonusXP").getDouble((String)a[0]);case "getFloat":return (float)settings.getDouble((String)a[0]);case "getInt":return settings.getInt((String)a[0]);case "getBoolean":return settings.getBoolean((String)a[0]);case "getColor":JSONArray c=settings.getJSONArray((String)a[0]);return new Color(c.getInt(0),c.getInt(1),c.getInt(2),c.length()>3?c.getInt(3):255);}throw new UnsupportedOperationException(m.getName());}));
  List<String> events=new ArrayList<>();int[] crew={0};PersonAPI person=proxy(PersonAPI.class,(p,m,a)->{if(m.getName().equals("setPostId")){events.add("post:"+a[0]);return null;}throw new UnsupportedOperationException(m.getName());});
  CargoAPI cargo=proxy(CargoAPI.class,(p,m,a)->{if(m.getName().equals("getCrew"))return crew[0];if(m.getName().equals("removeCrew")){crew[0]-=(Integer)a[0];events.add("crew:"+a[0]);return null;}throw new UnsupportedOperationException(m.getName());});
  FleetDataAPI data=proxy(FleetDataAPI.class,(p,m,a)->{if(m.getName().equals("addOfficer")){if(a[0]!=person)throw new IllegalArgumentException("split person");events.add("add:same-person");return null;}throw new UnsupportedOperationException(m.getName());});
  CampaignFleetAPI fleet=proxy(CampaignFleetAPI.class,(p,m,a)->{switch(m.getName()){case "getCargo":return cargo;case "getFleetData":return data;}throw new UnsupportedOperationException(m.getName());});
  Global.setSector(proxy(SectorAPI.class,(p,m,a)->{if(m.getName().equals("getPlayerFleet"))return fleet;throw new UnsupportedOperationException(m.getName());}));
  PromoteOfficerIntel intel=new PromoteOfficerIntel(null);set(intel,"person",person);set(intel,"ended",null);set(intel,"ending",null);crew[0]=10;
  StoryPointActionDelegate d=intel.getButtonStoryPointActionDelegate(PromoteOfficerIntel.BUTTON_PROMOTE);JSONObject result=new JSONObject().put("points",d.getRequiredStoryPoints()).put("bonusFraction",d.getBonusXPFraction()).put("sound",d.getConfirmSoundId()).put("logText",d.getLogText()).put("nullPanel",d.getTextPanel()==null).put("nullTitle",d.getTitle()==null).put("withDescription",d.withDescription()).put("withSPInfo",d.withSPInfo()).put("unknownButtonIsNull",intel.getButtonStoryPointActionDelegate("other")==null);
  d.preConfirm();events.add("spend:caller");d.confirm();intel.storyActionConfirmed(PromoteOfficerIntel.BUTTON_PROMOTE,proxy(IntelUIAPI.class,(p,m,a)->{if(m.getName().equals("recreateIntelUI")){events.add("recreate:ended="+intel.isEnded());return null;}throw new UnsupportedOperationException(m.getName());}));
  result.put("events",new JSONArray(events)).put("crewAfter",crew[0]).put("ended",intel.isEnded());System.out.print("@@PROMOTION_CONFIRMATION@@"+result);
 }
}
