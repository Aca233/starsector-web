# 原版自动配装规格注册器与默认连接（2026-09-23）

## 原版证据 → 行为
- 原版 0.98a-RC8，`WeaponSpecLoader.java:126–163,260–262`：type / mountTypeOverride 分离；restrictToSpecifiedMountType 仅 projectile/pulse 读取。`WeaponSpreadsheetLoader.java:82–126,218–266`：有序 tags、ammo 默认 Integer.MAX_VALUE、tier 默认 1；空 tags 才按尺寸、等级、PD/STRIKE、beam、伤害类型及射程生成分类。
- `BaseWeaponSpec.java:647–714` 与 `FighterWingSpec.java:239–310`：按 tags 中数字求等级，稳定降序分类；武器最高等级初值 0（全 0 或无数字时主分类仍 null），机翼初值 -1（无分类为 ""）。2026-09-23 直接 javap 安装 jar 交叉确认 getLevel 的反编译 finally 是异常处理误译，正常数字须返回解析结果，不是一律 -1。
- `loading/specs/nullsuper.java:92–116,164–175,313–361`：各槽位标志由 type/mount 决定；weaponFits 使用 mountType、SYSTEM 提示及限制标志；相同类型最多小一号，跨兼容类型必须同尺寸。位置取 locations 第一对，不取显示 position。
- `ShipHullSpreadsheetLoader.java:109–129`、`ShipHullSpecLoader.java:99–148,167–178,218–226`、`g_0.java:835–839`：护盾 type/arc 和 defense id 来自 CSV，皮肤继承护盾、按皮肤重建 tags；自动 D 型只保留原版列出的标签。phase 使用 PHASE hint 或 PHASE shield + phasecloak defense。既有 fleet-sync / storage / fleet-view 已提供已核查的尺寸、内建装备、皮肤槽位覆盖。

## 当前差异 → 本块实施范围
- 自动配装 doFit 已存在；默认装备/spec/槽位服务缺失。本块新增可复现原版资源导入、稳定对象身份的独立注册器、真实槽位兼容计算及 Runtime 默认连接；服务可整体替换以支持大改。未知 ID 或不完整自定义规格明确拒绝，不猜安装类型。
- 不替代真实 OP 可变属性、物品管理、蓝图时间戳、空变体工厂、DModManager；不把静态注册器冒充完整自然生产。
- 本块不新增或调整 UI，原版界面/用户截图布局不变；不启动原版、不操作桌面、不读私人存档。

## 验证计划
- 导入公开资源并记录哈希；原版二进制小范围核实分类/槽位规则。
- 集中一次生涯类型检查、改动 lint、既有短月结场景，追加实际原版规格/皮肤/D 型/兼容边界与运行时默认接线断言；不重跑 personnel 大场景或全套。
- 保持 readyForAuthority=false、simulation.status=unavailable；不暂存、提交、推送、打包或发布。

- 集中检查发现原版 heron.ship 存在同名 WS 010（ENERGY 与 SYSTEM）。已核对 g_0.java:615–648：槽位实际是 ArrayList，允许重复、按 ID 查找首项；注册器保留原列表而非去重或拒绝。

## 已落地与验收
- 已新增 reference-autofit-specs.json、可重现导入器及 NativeAutofitSpecInputs.java；163 个武器、31 个联队、532 个舰体/皮肤。categories、优先顺序、AI EnumSet 顺序、usesAmmo 直接由安装 jar 的规格实例提取。空 tags 的自动填充分支依据 WeaponSpreadsheetLoader，未启动游戏或读取存档。
- 新 OriginalAutofitSpecRegistry 提供稳定只读规格对象、复制槽位列表、严格未知 ID 拒绝和可独立替换的注册器；Runtime 默认读取真实 weapon/fighter/hull/slot spec 与 weaponFits，调用方不再必须逐项提供这些静态服务。原生皮肤清空标签、自动 D 型标签过滤、原版重复槽位均保留。
- 默认规则与安装 jar 的 WeaponSlot.weaponFits 在全部 5184 个类型/尺寸/限制/SYSTEM 组合一致。真实 Hermes 槽位和 lightmg 分类经 doFit 装入，护卫舰通量上限各 10，最终 26/27 OP（保留 1 点，未强行填满）。此配装场景的 OP/机库服务仍仅是明确的无技能/无 OP 插件 base-only 探针，不是生产默认 OP 属性生命周期。
- 集中类型检查=0、改动 lint=0；既有短月结场景最终 1/1 通过，533.2168ms，总 1051.7222ms。只对原版重复 ID 校验及过满 OP 测试预期进行了定向复查，没有大型人员、全套、浏览器或原版实机测试。
- 证据：artifacts/campaign-native-autofit-specs-types.log、campaign-native-autofit-specs-lint.log、campaign-native-autofit-specs-lint-final.log、campaign-native-autofit-specs-scenario-final.log。
- 未完成：默认真实 OP cost-stats/影响 OP 插件生命周期、势力已知装备/优先/蓝图历史、空变体/模块工厂与 DModManager、生产 String/name/boolean 舰队构造/行业交付等；完整生涯/UI/开局/联机世界不因此变为可交付。无子代理、无桌面操作、无暂存/提交/推送/打包/发布。
