/** Public definition import helper: exact installed JSONObject.names() order, no game/save loading. */
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;
public class NativeJsonOrder {
    private static void visit(Object value, String path, JSONArray result) throws Exception {
        if (value instanceof JSONObject) {
            JSONObject object = (JSONObject) value;
            JSONArray names = object.names();
            if (names == null) names = new JSONArray();
            JSONArray row = new JSONArray(); row.put(path); row.put(names); result.put(row);
            for (int i=0; i<names.length(); i++) {
                String key=names.getString(i);
                visit(object.get(key), path+"/"+key.replace("~", "~0").replace("/", "~1"), result);
            }
        } else if (value instanceof JSONArray) {
            JSONArray array = (JSONArray)value;
            for (int i=0; i<array.length(); i++) visit(array.get(i),path+"/"+i,result);
        }
    }
    public static void main(String[] args) throws Exception {
        String input = new String(System.in.readAllBytes(), StandardCharsets.UTF_8);
        JSONArray result=new JSONArray(); visit(new JSONObject(input),"",result); System.out.print(result.toString());
    }
}
