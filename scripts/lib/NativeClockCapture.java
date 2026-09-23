import com.fs.starfarer.campaign.CampaignClock;
import java.lang.reflect.*;
import java.util.*;

/** Local read-only import adapter: no XStream, no loading/saving a sector and no game window. */
public final class NativeClockCapture {
  static final long MIN = -62135942400000L, MAX = 253402473600000L;
  static Object field(Object value, String name) throws Exception {
    Field f = value.getClass().getDeclaredField(name); f.setAccessible(true); return f.get(value);
  }
  static String quote(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""; }
  static String date(GregorianCalendar c) {
    if (c.get(Calendar.ERA) != GregorianCalendar.AD) throw new IllegalArgumentException("BCE date is outside the imported calendar");
    return "{\"cycle\":"+c.get(Calendar.YEAR)+",\"month\":"+(c.get(Calendar.MONTH)+1)+",\"day\":"+c.get(Calendar.DAY_OF_MONTH)+",\"hour\":"+c.get(Calendar.HOUR_OF_DAY)+",\"minute\":"+c.get(Calendar.MINUTE)+",\"second\":"+c.get(Calendar.SECOND)+"}";
  }
  static String readback(long at, TimeZone zone) {
    GregorianCalendar c = new GregorianCalendar(zone); c.setTimeInMillis(at);
    return "{\"timestamp\":"+at+",\"offset\":"+zone.getOffset(at)+",\"date\":"+date(c)+"}";
  }
  public static void main(String[] args) throws Exception {
    if (args.length < 2 || args.length > 3) throw new IllegalArgumentException("timestamp secondsPerDay [explicit-test-zone]");
    long timestamp = Long.parseLong(args[0]); float secondsPerDay = Float.parseFloat(args[1]);
    if (timestamp < MIN || timestamp >= MAX || !Float.isFinite(secondsPerDay) || secondsPerDay <= 0) throw new IllegalArgumentException("Invalid clock");
    if (args.length == 3) {
      TimeZone requested=TimeZone.getTimeZone(args[2]);
      if (!requested.getID().equals(args[2])) throw new IllegalArgumentException("Unknown explicit timezone");
      TimeZone.setDefault(requested);
    }
    CampaignClock clock = new CampaignClock().createClock(timestamp);
    Field rate = CampaignClock.class.getDeclaredField("secondsPerDay"); rate.setAccessible(true); rate.setFloat(clock,secondsPerDay);
    TimeZone zone = clock.getCal().getTimeZone();
    if (!zone.getClass().getName().equals("sun.util.calendar.ZoneInfo") || ((Integer)field(zone,"rawOffsetDiff")) != 0) throw new IllegalArgumentException("Unsupported native Java zone implementation");
    long[] encoded=(long[])field(zone,"transitions"); TreeSet<Long> candidates=new TreeSet<>();
    long last=Long.MIN_VALUE;
    if(encoded!=null)for(long row:encoded){long at=row>>12;if(at>=MIN && at<MAX)candidates.add(at);last=at;}
    Method lastRule=zone.getClass().getMethod("getLastRuleInstance"); lastRule.setAccessible(true);
    SimpleTimeZone tail=(SimpleTimeZone)lastRule.invoke(zone);
    if(tail!=null && encoded!=null && encoded.length>0){
      candidates.add(last+1); // At the final table instant ZoneInfo still uses the table; immediately after it uses the tail.
      Field gfield=SimpleTimeZone.class.getDeclaredField("gcal");gfield.setAccessible(true);Object gcal=gfield.get(null);
      Method newDate=gcal.getClass().getMethod("newCalendarDate",TimeZone.class);newDate.setAccessible(true);
      Class<?> base=Class.forName("sun.util.calendar.BaseCalendar"), dateClass=Class.forName("sun.util.calendar.BaseCalendar$Date");
      Method start=SimpleTimeZone.class.getDeclaredMethod("getStart",base,dateClass,int.class),end=SimpleTimeZone.class.getDeclaredMethod("getEnd",base,dateClass,int.class);start.setAccessible(true);end.setAccessible(true);
      GregorianCalendar c=new GregorianCalendar(TimeZone.getTimeZone("UTC"));c.setTimeInMillis(last);int first=c.get(Calendar.YEAR)-1;
      for(int year=first;year<=10000;year++)for(Method method:new Method[]{start,end}){
        long at=(Long)method.invoke(tail,gcal,newDate.invoke(gcal,new Object[]{null}),year);
        if(at>last && at>=MIN && at<MAX)candidates.add(at);
      }
    }
    StringBuilder rows=new StringBuilder();ArrayList<Long> retained=new ArrayList<>();
    int offset=zone.getOffset(MIN);
    for(long at:candidates){if(at<MIN || at>=MAX)continue;int next=zone.getOffset(at);if(next==offset)continue;
      if(rows.length()>0)rows.append(',');rows.append("{\"at\":").append(at).append(",\"offset\":").append(next).append('}');retained.add(at);offset=next;}
    // A few import integrity readbacks, not a second calendar implementation.
    TreeSet<Long> probes=new TreeSet<>();probes.add(timestamp);
    long cutover=-12219292800000L;for(long delta:new long[]{-86400001L,-1L,0L,86400000L})probes.add(cutover+delta);
    if(!retained.isEmpty())for(int i:new int[]{0,retained.size()/2,retained.size()-1})for(long delta:new long[]{-1,0,1})probes.add(retained.get(i)+delta);
    StringJoiner readbacks=new StringJoiner(",");for(long at:probes)if(at>=MIN+172800000L&&at<MAX-172800000L)readbacks.add(readback(at,zone));
    StringJoiner steps=new StringJoiner(",");
    for(float amount:new float[]{0.00001f,1f/60f,0.1f,10f}){clock.advance(amount);steps.add("{\"amount\":"+Float.toString(amount)+",\"timestamp\":"+clock.getTimestamp()+",\"date\":"+date(clock.getCal())+"}");}
    System.out.println("{\"runtimeVersion\":"+quote(System.getProperty("java.runtime.version"))+",\"zoneOrigin\":"+quote(args.length==3?"explicit-zone":"bundled-jre-current-default-on-load")+",\"zone\":{\"scope\":\"expanded-java-timezone\",\"id\":"+quote(zone.getID())+",\"minTimestamp\":"+MIN+",\"maxTimestamp\":"+MAX+",\"initialOffset\":"+zone.getOffset(MIN)+",\"transitions\":["+rows+"]},\"readback\":"+readback(timestamp,zone)+",\"readbacks\":["+readbacks+"],\"steps\":["+steps+"]}");
  }
}
