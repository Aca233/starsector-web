/** Trusted native API constant import only. No engine, save, desktop, or fleet is started. */
import java.lang.reflect.Field;
import org.json.JSONArray;
import org.json.JSONObject;
public class NativeFleetCompositionConstants {
    public static void main(String[] args) throws Exception {
        Class<?> type=Class.forName("com.fs.starfarer.api.impl.campaign.fleets.FleetFactoryV3");
        JSONObject out=new JSONObject();
        for(String name:new String[]{"BASE_COUNTS_WITH_4","MAX_EXTRA_WITH_4","BASE_COUNTS_WITH_3","MAX_EXTRA_WITH_3"}) {
            int[][] matrix=(int[][])type.getField(name).get(null); JSONArray rows=new JSONArray();
            for(int[] row:matrix){JSONArray cells=new JSONArray();for(int cell:row)cells.put(cell);rows.put(cells);}out.put(name,rows);
        }
        for(String name:new String[]{"FLEET_POINTS_THRESHOLD_FOR_ANNOYING_SHIPS","MIN_NUM_SHIPS_DEFICIT_MULT","BASE_QUALITY_WHEN_NO_MARKET"}) {
            Field field=type.getField(name);out.put(name,field.get(null));
        }
        System.out.write(out.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }
}
