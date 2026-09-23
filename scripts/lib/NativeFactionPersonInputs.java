/** Public source import only: installed CSV parser + actual HashMap/JSONObject order, no engine bootstrap. */
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;
import com.fs.starfarer.loading.G;
public class NativeFactionPersonInputs {
    static Map<String, Map<String, List<String>>> tables = new HashMap<>();
    static Map<String,List<String>> table(String gender, String usage) {return tables.computeIfAbsent(gender+"/"+usage,k->new HashMap<>());}
    static void add(String gender,String usage,String category,String name){table(gender,usage).computeIfAbsent(category,k->new ArrayList<>()).add(name);}
    static JSONObject picker(List<String> items,List<Float> weights) throws Exception {
        JSONArray names=new JSONArray(),values=new JSONArray();float total=0;
        for(int i=0;i<items.size();i++){float w=weights.get(i);if(w<=0)continue;if(!Float.isFinite(w))throw new IllegalArgumentException("Non-finite weight");names.put(items.get(i));values.put(w);total+=w;}
        return new JSONObject().put("items",names).put("weights",values).put("total",total).put("random",JSONObject.NULL);
    }
    static JSONObject weights(JSONObject source) throws Exception {
        List<String> items=new ArrayList<>();List<Float> values=new ArrayList<>();String[] keys=source==null?null:JSONObject.getNames(source);
        if(keys!=null)for(String key:keys){items.add(key);values.add((float)source.getDouble(key));}return picker(items,values);
    }
    static JSONObject portraits(JSONArray source) throws Exception {
        List<String> items=new ArrayList<>();List<Float> values=new ArrayList<>();if(source!=null)for(int i=0;i<source.length();i++){items.add(source.getString(i));values.add(1f);}return picker(items,values);
    }
    public static void main(String[] args) throws Exception {
        JSONObject input=new JSONObject(new String(System.in.readAllBytes(),StandardCharsets.UTF_8));JSONArray rows=G.o00000(input.getString("csv"));
        Set<String> seen=new HashSet<>();int accepted=0;
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);String key="";boolean empty=true;
            for(String field:new String[]{"name","gender","usage","category"}){String v=row.getString(field);key+=v+" | ";empty&=v.isEmpty();}if(empty)continue;
            if(!seen.add(key))throw new IllegalArgumentException("Duplicate person CSV key");accepted++;
            String name=row.getString("name"),usage=row.getString("usage").trim(),gender=row.getString("gender").trim();
            boolean first=usage.isEmpty()||usage.contains("f"),last=usage.isEmpty()||usage.contains("l"),male=gender.isEmpty()||gender.contains("m"),female=gender.isEmpty()||gender.contains("f");
            for(String raw:row.getString("category").split(",")){String category=raw.trim();if(male&&first)add("MALE","FIRST",category,name);if(male&&last||first&&last)add("MALE","LAST",category,name);if(female&&first)add("FEMALE","FIRST",category,name);if(female&&last||first&&last)add("FEMALE","LAST",category,name);}
        }
        JSONObject names=new JSONObject();for(String gender:new String[]{"MALE","FEMALE"}){
            JSONObject byUsage=new JSONObject();for(String usage:new String[]{"FIRST","LAST"}){
                Map<String,List<String>> t=table(gender,usage);JSONArray order=new JSONArray();JSONObject lists=new JSONObject();
                for(String key:t.keySet()){order.put(key);lists.put(key,new JSONArray(t.get(key)));}
                byUsage.put(usage,new JSONObject().put("order",order).put("lists",lists));
            }names.put(gender,byUsage);
        }
        JSONObject factions=new JSONObject(),raw=input.getJSONObject("factions");for(String id:JSONObject.getNames(raw)){
            JSONObject f=raw.getJSONObject(id),p=f.getJSONObject("portraits"),v=f.optJSONObject("voices");
            JSONObject voices=new JSONObject();for(String importance:new String[]{"LOW","MEDIUM","HIGH"})voices.put(importance,weights(v==null?null:v.getJSONObject(importance)));
            factions.put(id,new JSONObject().put("nameCategories",weights(f.getJSONObject("names"))).put("portraits",new JSONObject().put("MALE",portraits(p.optJSONArray("standard_male"))).put("FEMALE",portraits(p.optJSONArray("standard_female")))).put("voices",voices));
        }
        System.out.print(new JSONObject().put("names",names).put("factions",factions).put("rows",accepted).toString());
    }
}
