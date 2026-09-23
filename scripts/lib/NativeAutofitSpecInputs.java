/** Public-resource spec/category extraction and weaponFits truth table. No game or save access. */
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;
import com.fs.starfarer.api.combat.WeaponAPI;
import com.fs.starfarer.loading.specs.BaseWeaponSpec;
import com.fs.starfarer.loading.specs.FighterWingSpec;
import com.fs.starfarer.loading.specs.nullsuper;
public class NativeAutofitSpecInputs {
  static JSONArray strings(Iterable<?> input) { JSONArray out=new JSONArray(); for(Object value:input)out.put(value.toString()); return out; }
  static JSONObject weapon(JSONObject input) throws Exception {
    BaseWeaponSpec spec=new BaseWeaponSpec(input.getString("id"));
    JSONArray tags=input.getJSONArray("tags"),hints=input.getJSONArray("aiHints");
    for(int i=0;i<tags.length();i++)spec.addTag(tags.getString(i));
    for(int i=0;i<hints.length();i++)spec.getAIHints().add(WeaponAPI.AIHints.valueOf(hints.getString(i)));
    spec.setMaxAmmo(input.getInt("maxAmmo"));
    return new JSONObject().put("autofitCategory",spec.getAutofitCategory()==null?JSONObject.NULL:spec.getAutofitCategory())
      .put("autofitCategories",strings(spec.getAutofitCategoriesInPriorityOrder())).put("aiHints",strings(spec.getAIHints())).put("usesAmmo",spec.usesAmmo());
  }
  public static void main(String[] args) throws Exception {
    JSONObject input=new JSONObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8));
    JSONArray weapons=new JSONArray(),fighters=new JSONArray();
    for(int i=0;i<input.getJSONArray("weapons").length();i++)weapons.put(weapon(input.getJSONArray("weapons").getJSONObject(i)));
    for(int i=0;i<input.getJSONArray("fighters").length();i++){
      JSONObject row=input.getJSONArray("fighters").getJSONObject(i); FighterWingSpec spec=new FighterWingSpec();
      JSONArray tags=row.getJSONArray("tags");for(int j=0;j<tags.length();j++)spec.addTag(tags.getString(j));
      fighters.put(new JSONObject().put("autofitCategory",spec.getAutofitCategory()).put("autofitCategories",strings(spec.getAutofitCategoriesInPriorityOrder())));
    }
    JSONArray types=new JSONArray(),sizes=new JSONArray();for(WeaponAPI.WeaponType t:WeaponAPI.WeaponType.values())types.put(t.name());for(WeaponAPI.WeaponSize s:WeaponAPI.WeaponSize.values())sizes.put(s.name());
    StringBuilder fits=new StringBuilder();
    for(WeaponAPI.WeaponType slotType:WeaponAPI.WeaponType.values())for(WeaponAPI.WeaponType mountType:WeaponAPI.WeaponType.values())
      for(WeaponAPI.WeaponSize slotSize:WeaponAPI.WeaponSize.values())for(WeaponAPI.WeaponSize weaponSize:WeaponAPI.WeaponSize.values())for(int restricted=0;restricted<2;restricted++)for(int system=0;system<2;system++){
        nullsuper slot=new nullsuper("probe",slotType,slotSize,null,null,null,0f,360f);BaseWeaponSpec spec=new BaseWeaponSpec("probe");
        spec.setType(WeaponAPI.WeaponType.ENERGY);spec.setMountType(mountType);spec.setSize(weaponSize);spec.setRestrictToSpecifiedMountType(restricted!=0);if(system!=0)spec.getAIHints().add(WeaponAPI.AIHints.SYSTEM);
        fits.append(slot.weaponFits(spec)?'1':'0');
      }
    System.out.print(new JSONObject().put("weapons",weapons).put("fighters",fighters).put("compatibility",new JSONObject().put("types",types).put("sizes",sizes).put("bits",fits.toString())).toString());
  }
}
