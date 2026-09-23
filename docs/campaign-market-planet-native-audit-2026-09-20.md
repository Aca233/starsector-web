# 市场行星getter恢复：实现前对照（2026-09-20）

原版0.98a-RC8；本轮仅后台文件/短串行Java测试，无桌面/子代理/发布。

## 原版证据 → 预期

- starfarer_obf/.../campaign/econ/Market.java:493 getPlanetEntity遍历getConnectedEntities返回首个instanceof PlanetAPI；不是primaryEntity，也不是条件名/名称/tags推测。511返回LinkedHashSet，readResolve:630起仅将null connectedEntities重置为空集合，不把primaryEntity补进去。
- campaign/CampaignPlanet.java:36实现PlanetAPI；CustomCampaignEntity:49不是PlanetAPI。CampaignGameManager:1960、1972分别保存别名Plnt、PSDiff，CCEnt对应CustomCampaignEntity。本轮实际保存市场连接实体只有Plnt/CCEnt；其它未核实实体类须显式拒绝，不能默认为非行星。
- CampaignPlanet.readResolve:135以type新建图形Planet；spec是transient，diff非null时先clone默认spec，再PlanetSpec.updateFromDiff并交给graphics。isGasGiant:190返回graphics.isGasGiant；terrain/Planet.java:983再读spec.isGasGiant，不读gas_giant标签。
- loading/specs/PlanetSpec.java:160从planets.json以optBoolean(isGasGiant,false)初始化；类型必须确实存在。96/116使用反射将diff.data相应字段写回，未知字段或不可赋给boolean的值不能视作有效。
- PlanetSpecDiff:492起data是transient，保存的是j字段JSON字符串。readResolve重建data，Boolean原样保留；字符串true不是Boolean，null/数值也不能安全当作isGasGiant。不能把diff当成普通XStream Map解析。
- 保存中非gas相关diff含颜色/旋转/贴图等，本轮只提取气态getter所依赖的type和isGasGiant覆写、记录其余diff键，绝不声称图形资源/全部行星生命周期已恢复。

## 差异与实现计划

现有捕获有primaryEntity的未解析引用，但没捕获connectedEntities及type/diff。线轴阶段已要求显式getter，不能填false绕过。

新增来源化全原版行星type→isGasGiant目录；纯规则函数按连接对象顺序投影首个PlanetAPI。捕获解码实际连接引用/类别、type和diff.j；空/省略集合按Market.readResolve为空处理。旧capture缺planetInput仍pending，新capture将getter结果和真实条件IDs传到storage草稿的portItemContext；这里只补恢复输入，不执行假市场重算/发布。

## 验证

合成XStream验证：主实体为站但连接集合含行星、顺序变化、两行星、共享/重复引用、没有行星、type默认、diff覆盖、gas标签/条件误导、错误布尔/未知类/未知type拒绝。

抽取真实Market.getPlanetEntity、CampaignPlanet.readResolve/getSpec/isGasGiant、PlanetSpec.updateFromDiff/setField和PlanetSpecDiff.readResolve做无图形Java差分；图形初始化只为getter提供spec，不能当作视觉验证。只读重捕获当前私有保存，统计数量与source哈希一致性，输出仍仅在忽略的artifacts。

界面与原版实机行为未验收，本轮不改UI。完整市场重应用、管理员/监听器/联机/库存/任务/势力/殖民地仍未完成，authority gate不变。

## 探针澄清

原版PlanetSpecDiff.writeReplace将Java null写为字符串"null"，并非JSON null。readResolve对字符串"null"写回null，反射写boolean时报错；JSONObject.NULL及嵌套JSONObject落入未处理分支而被跳过。新解码器只接受原版boolean保存格式，显式拒绝这些不可由该boolean字段正常writeReplace产生的编码，不宣称任意JSON都与原版容错一致。差分无效值使用原版反射会实际拒绝的字符串null/true/false、数字和数组。
