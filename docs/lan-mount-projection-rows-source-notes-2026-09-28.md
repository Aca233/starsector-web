# 挂点显示投影值行：源码边界及唯一性能预登记（2026-09-28）

## 来源与差异
- 原版只读 API：../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/WeaponAPI.java:157–175，当前扩散/角度/射程/弹速/弹药/冷却都是实时读取，存在 setter。不得缓存旧显示值。原版实机及视觉本轮未验，不修改玩法/UI。
- 现有完整流水线 profile（artifacts/lan-authored-pipeline-cost-20260927）：capture 占13.963%，其中 nativeCaptureShape self13.82%，LanShipProjection.pick self11.38%。这是全部捕获对象归因，不是挂点优化的保证上限。
- 已排除历史通用融合写入、tape、定义片段驻留及泛化对象遍历候选；本次仅把本机投影器自有的挂点临时对象改为字段表＋值数组。它仍经过原递归 pack / dictionary / binary / receiver，不融合编码，不去掉定义检查。
- 写集仅 src/network/display/LanShipProjection.ts、src/network/AuthorityCombatSnapshot.ts；before.json 记录绝对路径/SHA，740模块启动前与最近冻结图完全相同。其它工作不动，不提交/发布。

## 精确范围
- 新开关 VITE_LAN_MOUNT_PROJECTION_ROWS 默认关闭。仅 native、displayOnly、非fixedDisplay/recordDeltas/componentMode、capture plans开启的捕获使用。兼容与其它实验走旧路径。
- 首先原 render.supports 准入，按原挂点字段顺序每帧 Reflect.get，再按原顺序读取 spec / range / speed / angle；不增加跨挂点数值缓存，不重排系统/相位/引擎等采样。
- WeakMap 随投影器/引擎回收；行不出本机。每次开始 pack 时 slice 当前值，等价于旧 Object.values 的本次采样，递归仍按原字段顺序，保留函数省略、非有限数、引用发现、别名展开及祖先环。快照和布局属于本帧，不泄露可变scratch。
- 不使用客户端输入来推断可信形状；接收预算/坏包拒绝/协议/数值宽度全部不变。

## 集中正确性
一次 typecheck、两文件 lint；使用真实前版、候选开启、候选默认关闭三个冻结 bundle。60完整固定步扰动比较所有权威状态+隐藏RNG/autofire、逐帧二进制相同、完整接收/HUD/纹理/动态range-speed。额外合同覆盖默认未命中、v1/v2、连续帧独立、live字段/函数转换/数值边界、映射回调顺序和本机行值采样独立、自定义读者拒绝及对其它模式回退。不要盲跑已有退休fixture阻断的整套native-capture。

## 唯一无插桩ABBA
- 仅正确性通过后；A0/B1/B2/A3各独立隐藏Node。每臂150完整五段热身+120计时，2玩家+20AI、三舰混编、seed917、3200DP，176初始实体734挂点，固定1/60；四项既有模拟实验同开，两边display-v1。
- 门槛：两对 capture 均至少节省10%；authority三段各至少节省2%；完整五段每对不得回退超过1%。这是捕获专项门槛，不等价于完整流水线提速5%。
- 两对未压缩字节、wire SHA、20/270步authority+hidden SHA、完整接收摘要、资产SHA必须全同。唯一性能目录 exclusive 创建，禁止择优复跑/事后变更门槛。
- 失败归档并按完整写集candidate SHA预检后精确回退；通过也不因此晋升默认或宣称实际Hz/FPS/输入P95改善。没有真实浏览器/网络测量，本轮不占桌面。
