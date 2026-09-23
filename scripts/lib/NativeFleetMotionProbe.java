/** Calls installed 0.98a-RC8 motion classes, never boots the engine or reads saves.
 * Misc's static settings are backed by the installed public settings.json only.
 * Compile against starsector-core/*; run with -noverify -Djava.awt.headless=true and core path. */
import java.awt.Color;
import com.fs.graphics.util.Fader;
import java.lang.reflect.Proxy;
import java.nio.file.*;
import org.json.*;
import org.lwjgl.util.vector.Vector2f;
import com.fs.starfarer.api.*;
import com.fs.starfarer.campaign.fleet.*;
import com.fs.starfarer.prototype.Utils;
public class NativeFleetMotionProbe {
  static JSONArray bits(float... values) { JSONArray a=new JSONArray(); for(float v:values)a.put(Integer.toUnsignedLong(Float.floatToRawIntBits(v))); return a; }
  static JSONObject movement(float a,float max,boolean smooth,float[] p,float[] v,float[] target,float[] tv,float dt,float hard,Float delegate,int steps) throws Exception {
    SmoothMovementModule m=smooth ? new SmoothMovementModule(a,max,delegate==null?null:()->delegate) : new SmoothMovementModule(a,max);
    m.getLocation().set(p[0],p[1]); m.getVelocity().set(v[0],v[1]); m.setHardSpeedLimit(hard);
    ((Vector2f)m.getAccelVector()).set(7,8);
    Object loc=m.getLocation(),vel=m.getVelocity(),accel=m.getAccelVector();
    for(int i=0;i<steps;i++)m.advance(null,new Vector2f(target[0],target[1]),new Vector2f(tv[0],tv[1]),dt);
    return new JSONObject().put("bits",bits(m.getLocation().x,m.getLocation().y,m.getVelocity().x,m.getVelocity().y,m.getAccelVector().getX(),m.getAccelVector().getY()))
      .put("sameVectors",loc==m.getLocation()&&vel==m.getVelocity()).put("sameAccel",accel==m.getAccelVector());
  }
  static JSONObject facing(float acceleration,float max,float initial,float rate,float target,float dt,int steps) throws Exception {
    SmoothFacingModule m=new SmoothFacingModule(acceleration,max);m.setFacing(initial);m.setTurnRate(rate);
    for(int i=0;i<steps;i++)m.advance(target,dt);
    return new JSONObject().put("bits",bits(m.getFacing(),m.getTurnRate()));
  }
  static String stripHashComments(String text) {
    StringBuilder result=new StringBuilder();boolean quoted=false,escaped=false,comment=false;
    for(char c:text.toCharArray()) {
      if(comment) {if(c=='\n'||c=='\r'){comment=false;result.append(c);}continue;}
      if(!quoted&&c=='#'){comment=true;continue;}
      result.append(c);
      if(escaped){escaped=false;continue;}
      if(quoted&&c=='\\'){escaped=true;continue;}
      if(c=='"')quoted=!quoted;
    }
    return result.toString();
  }
  static JSONObject fadeState(Fader f) throws Exception {return new JSONObject().put("bits",bits(f.getBrightness(),f.getDurationIn(),f.getDurationOut())).put("state",f.getState().name()).put("in",f.isFadedIn()).put("out",f.isFadedOut());}
  static void probeFader() throws Exception {
    JSONArray rows=new JSONArray();Fader f=new Fader(0,.25f,.5f,true,true);rows.put(fadeState(f));
    f.fadeIn();rows.put(fadeState(f));for(float dt:new float[]{.25f,5f,.25f,.25f,9f,0}){f.advance(dt);rows.put(fadeState(f));}
    f.forceIn();rows.put(fadeState(f));f.forceOut();rows.put(fadeState(f));
    f.setDurationIn(0);f.fadeIn();rows.put(fadeState(f));f.setDurationOut(0);f.fadeOut();rows.put(fadeState(f));
    f=new Fader(0,.25f);f.fadeIn();f.advance(.25f);rows.put(fadeState(f));f.advance(.25f);rows.put(fadeState(f));
    f=new Fader(.5f,.25f);f.fadeIn();f.advance(-1);rows.put(fadeState(f));System.out.println(rows);
  }
  public static void main(String[] args) throws Exception {
    if(args.length>0&&args[0].equals("fader")){probeFader();return;}
    JSONObject settings=new JSONObject(stripHashComments(Files.readString(Path.of(args[0],"data/config/settings.json"))));
    Global.setSettings((SettingsAPI)Proxy.newProxyInstance(SettingsAPI.class.getClassLoader(),new Class[]{SettingsAPI.class},(proxy,method,argv)->{
      String key=(String)argv[0];
      switch(method.getName()) {
        case "getFloat":return (float)settings.getDouble(key);
        case "getInt":return settings.getInt(key);
        case "getBoolean":return settings.getBoolean(key);
        case "getColor": JSONArray c=settings.getJSONArray(key);return new Color(c.getInt(0),c.getInt(1),c.getInt(2),c.length()>3?c.getInt(3):255);
        default:throw new UnsupportedOperationException(method.getName());
      }
    }));
    float[] zero={0,0},far={1000,0};
    if(args.length>1&&args[1].equals("travel60")) {System.out.println(movement(200,200,true,zero,zero,far,zero,1f/60,-1,null,60));return;}
    JSONObject moves=new JSONObject();
    moves.put("first",movement(200,200,true,zero,zero,far,zero,1f/60,-1,null,1));
    moves.put("brake",movement(200,200,true,zero,new float[]{120,0},zero,zero,1f/60,-1,null,1));
    moves.put("overspeed",movement(200,200,true,zero,new float[]{400,0},far,zero,1f/60,-1,null,1));
    moves.put("diagonal",movement(200,200,true,zero,zero,new float[]{1000,1000},zero,1f/60,-1,null,1));
    moves.put("movingTarget",movement(170,260,true,new float[]{13,-29},new float[]{100,-33},new float[]{300,25},new float[]{80,40},.13f,-1,null,1));
    moves.put("hardBelow",movement(20,1000,true,zero,new float[]{10,0},far,zero,.1f,100,null,1));
    moves.put("hardAfterSmooth",movement(200,200,true,zero,new float[]{400,0},far,zero,.125f,100,null,1));
    moves.put("hardAfterClamp",movement(200,200,false,zero,new float[]{400,0},far,zero,.125f,100,null,1));
    moves.put("delegate",movement(200,7,true,zero,new float[]{185,0},far,zero,.125f,-1,180f,1));
    moves.put("negativeDt",movement(200,200,true,zero,new float[]{50,0},far,zero,-.1f,-1,null,1));
    moves.put("underflowDt",movement(200,200,true,zero,new float[]{50,0},far,zero,0x1.0p-80f,-1,null,1));
    moves.put("noAcceleration",movement(0,200,true,zero,new float[]{50,0},far,zero,.1f,-1,null,1));
    moves.put("arrival600",movement(200,200,true,zero,zero,far,zero,1f/60,-1,null,600));
    JSONObject facing=new JSONObject();
    facing.put("initial",facing(150,100,90,0,180,1f/60,1));
    facing.put("negativeTurn",facing(1040,720,90,0,0,1f/60,1));
    facing.put("positiveSnap",facing(10,100,0,20,1,.1f,1));
    facing.put("negativeNoSnap",facing(10,100,0,-20,359,.1f,1));
    facing.put("wrap",facing(1040,720,359,0,1,1f/60,1));
    facing.put("negativeDt",facing(1040,720,90,10,180,-.1f,1));
    facing.put("zeroDt",facing(1040,720,450,900,180,0,1));
    facing.put("zeroAcceleration",facing(0,100,90,5,180,.1f,1));
    facing.put("arrival120",facing(1040,720,90,0,180,1f/60,120));
    JSONArray angles=new JSONArray();
    for(float[] v:new float[][]{{0,0},{1,0},{0,1},{-1,0},{0,-1},{1,1},{1,2},{-3,4},{-3,-4},{3,-4},{1e-40f,1e-40f},{123.456f,.125f}})
      angles.put(bits(Utils.Ó00000(new Vector2f(v[0],v[1]))).get(0));
    System.out.println(new JSONObject().put("movement",moves).put("facing",facing).put("angles",angles));
  }
}
