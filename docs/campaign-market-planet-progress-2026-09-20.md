# 市场行星getter与真实保存桥接（2026-09-20）

原版证据先行：campaign-market-planet-native-audit-2026-09-20.md。本轮仅后台文件与短串行无头测试，无桌面操作/子代理/提交/推送/发布。

## 已实现

- 新增reference-market-planets.json与导入器：从8份原版来源提取全部45种行星类型（2种气态）、可反射spec字段与已核实实体类别。捕获时校验目录来源哈希，防止配置已变却用旧type定义恢复。
- OriginalMarketPlanet按Market.getConnectedEntities的原始有序集合选择第一个PlanetAPI。primaryEntity、gas_giant标签/条件不参与判定；集合缺失/空时明确得到null，不自动把主实体补进去。
- 保存解码读取Plnt.type与PlanetSpecDiff.j，处理布尔isGasGiant覆写，正确保留false而非回退到气态类型默认true。保留其它diff字段名，不复制无关私有内容或冒充恢复颜色/资源/整个行星。
- 连接引用保持身份/顺序，按LinkedHashSet去重并忽略null。未知实体类、未知type、错误布尔/字段、过期序列化transient spec/graphics/data均拒绝，不猜测。
- 捕获新增可选planetInput。旧capture没有该字段时，产业草稿继续标为market-planet-getter待恢复；新capture生成planetReadback，并将getter与实际condition IDs构成线轴portItemContext。installed-item-runtime和全市场重应用仍明确pending，未发布假库存。
- capture格式来源证据由14增加至20项（新增父类/行星/自定义实体/图形spec链及planets.json）。

## 验证证据

- 5个定向测试文件串行执行 **42/42通过，无跳过**：市场行星、保存捕获、产业storage、运行getter、线轴。
- 新增 **540组原版Java getter差分**：全部45类型×3种覆写×4种连接顺序，抽取真实Market.getPlanetEntity、CampaignPlanet.readResolve/getSpec/isGasGiant、PlanetSpec反射更新与PlanetSpecDiff.readResolve；原始planets.json在Java侧提供spec基底。另有6组真正被原版反射拒绝的非布尔值验证。
- 探针不建立OpenGL/可见窗口；图形构造和父类的无关状态不模拟。原版BaseCampaignEntity的旧PlanetConditionMarket转换不属于本次已支持的0.98a注册Market捕获。本轮不是原版实机/视觉验收。
- 合成XStream覆盖站为主实体、多个行星先后、引用重复/null、无行星、type/保存diff、原版标签误导、缺失证据、错误编码与捕获→storage→线轴access实际调用。
- 明确区分合法保存格式与任意JSON：原版writeReplace把Java null写成字符串null；新解码器拒绝JSON null/对象等不受支持编码，未将其宣称为原版任意JSON容错的等价实现。
- 严格类型通过；13个相关文件单线程oxlint零诊断。
- 日志位于被Git忽略的artifacts/campaign-market-planet-{regression,types,lint,real-capture}.log。

## 真实保存结果（仅汇总，无私有名称/ID）

- 65个注册市场均取得明确getter：48个有连接行星，17个没有行星；该保存点气态市场数为0。
- 30份非气态相关视觉diff仍仅记录为未完整恢复，不用它们证明完整世界就绪。
- 346个产业storage继续正确初始化，225份非空旧供给bonus保留。
- 1个已安装线轴取得真实portItemContext，其原版三条要求均满足；没有通过把未知getter默认false绕过校验。
- 源保存与上轮SHA一致，捕获过程也复核读前/读后字节一致。私有结果只写入已验证被Git忽略的4份artifacts JSON文件。

## 尚未完成

65个市场完整重应用仍待执行，readyForAuthority仍false。管理员/技能/fromOther、事件和监听器、经济网络、月结/库存/世界发布及完整生涯玩法和UI验收仍未完成。规则锁、Corvus未执行标记、发布边界均不变。

下一步应继续恢复原版产业管理员/技能输入及其它市场getter，将已核实的保存状态送进完整重应用链；不能以本次getter恢复代替整个生涯目标。
