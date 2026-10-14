/** Installed PlaythroughLog with explicit in-memory sector/clock/listener fixtures. No engine, UI, saves. */
import java.lang.reflect.*;import java.util.*;import org.json.*;
import com.fs.starfarer.api.*;import com.fs.starfarer.api.campaign.*;import com.fs.starfarer.api.campaign.listeners.*;import com.fs.starfarer.api.fleet.*;
import com.fs.starfarer.api.impl.campaign.plog.*;import com.fs.starfarer.campaign.rules.Memory;
public class NativePlaythroughLogInputs {
 @SuppressWarnings("unchecked") static <T>T proxy(Class<T> type,InvocationHandler h){return (T)Proxy.newProxyInstance(type.getClassLoader(),new Class[]{type},h);}
 static Object field(Object o,String name)throws Exception {for(Class<?> c=o.getClass();c!=null;c=c.getSuperclass())try{Field f=c.getDeclaredField(name);f.setAccessible(true);return f.get(o);}catch(NoSuchFieldException e){}throw new NoSuchFieldException(name);}
 static JSONArray entries(PlaythroughLog log)throws Exception {JSONArray out=new JSONArray();for(PLEntry e:log.getEntries())out.put(new JSONObject().put("kind","text").put("text",e.getText()).put("timestamp",Long.toString(e.getTimestamp())).put("story",field(e,"story")==null?JSONObject.NULL:field(e,"story")));return out;}
 public static void main(String[] args)throws Exception {
  final long timestamp=86400000L;Memory memory=new Memory();List<Object> listeners=new ArrayList<>();
  CampaignClockAPI clock=proxy(CampaignClockAPI.class,(p,m,a)->{if(m.getName().equals("getTimestamp"))return timestamp;throw new UnsupportedOperationException("Clock."+m.getName());});
  ListenerManagerAPI manager=proxy(ListenerManagerAPI.class,(p,m,a)->{if(m.getName().equals("addListener")){listeners.add(a[0]);return null;}throw new UnsupportedOperationException("ListenerManager."+m.getName());});
  Global.setSector(proxy(SectorAPI.class,(p,m,a)->{switch(m.getName()){case "getClock":return clock;case "getMemoryWithoutUpdate":return memory;case "getListenerManager":return manager;}throw new UnsupportedOperationException("Sector."+m.getName());}));
  BasePLEntry.offset=0;PlaythroughLog log=PlaythroughLog.getInstance();JSONObject out=new JSONObject().put("timestamp",timestamp).put("sameInstance",log==PlaythroughLog.getInstance()).put("registrations",listeners.size()).put("listenerIdentity",listeners.get(0)==log).put("memoryIdentity",memory.get(PlaythroughLog.KEY)==log).put("stats",new JSONArray(log.getStats().keySet())).put("biggestBought",field(log,"biggestBought").toString()).put("selectedGraphs",new JSONArray(log.getUIData().selectedGraphs)).put("initialSMods",log.getSModsInstalled().size());
  log.addEntry("ordinary");log.addEntry("story",true);log.addEntry("explicit false",false);out.put("entries",entries(log)).put("nextOffset",Long.toString(BasePLEntry.offset));
  BasePLEntry.offset=Long.MAX_VALUE;PlaythroughLog overflow=new PlaythroughLog();overflow.addEntry("wrap before");overflow.addEntry("wrap after");out.put("overflowEntries",entries(overflow)).put("overflowOffset",Long.toString(BasePLEntry.offset));
  SModRecord record=new SModRecord(null);out.put("smodDefault",new JSONObject().put("timestamp",record.getTimestamp()).put("spSpent",record.getSPSpent()).put("bonusXPFractionGained",record.getBonusXPFractionGained()).put("smods",new JSONArray(record.getSMods())).put("memberRef",JSONObject.NULL));
  FleetMemberAPI member=proxy(FleetMemberAPI.class,(p,m,a)->{if(m.getName().equals("getId"))return "public-fixture-member";throw new UnsupportedOperationException(m.getName());});record.setMember(member);out.put("memberIdentity",record.getMember()==member);record.setMember(null);out.put("clearedMember",record.getMember()==null);
  log.addOfficerSkillRecord(new OfficerSkillGainRecord("person","helmsmanship",false));log.addOfficerSkillRecord(new OfficerSkillGainRecord("person","helmsmanship",false));log.addOfficerSkillRecord(new OfficerSkillGainRecord("person","helmsmanship",true));log.removeOfficerSkillRecord("person","helmsmanship",false);out.put("remainingOfficerRecords",log.getOfficerSkillsLearned().size()).put("remainingElite",log.getOfficerSkillsLearned().get(0).isElite());
  System.out.print("@@PLAYTHROUGH@@"+out);
 }
}
