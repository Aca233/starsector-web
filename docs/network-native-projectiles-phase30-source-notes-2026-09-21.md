# Phase30 原生弹丸捕获替换：编码前对照（2026-09-21）

## 原版证据与本轮边界
已重新查看本机 0.98a API `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/DamagingProjectileAPI.java`：source/weapon、elapsed、damage、didDamage、fading和tail分别存在。`../starsector-core/data/weapons/proj/tpc_shot.proj`定义移动射线长度100、fadeTime0.3、颜色与纹理；不能为了压缩去掉伤害状态或用弹头位置替代尾端。本轮不改轨迹/玩法/UI/材质，原版实机逐像素检查仍未获得桌面操作许可。

当前原生capture每行递归pack，随后compactProjectileColumns逐组比较packed值，重复构造和遍历共享的颜色/规格子树。接收端逐字段恢复，保留身份/向量与每帧覆盖语义。Phase29本地预测没有减少这段工作。Phase28并行字段包保留旧递归管线后总成本未达标，不重复那种叠加方式。

## 先完成的最小替换
在**显式nativeCapture、原生数组和纯数据native行**路径，按现有投影键序和spec分组：首行依然用旧pack建立layout/发现ship引用；后续字段只有能证明原生值与首行等价时才复用首行已捕获值，否则走原pack。分组结果直接生成原有列模板，不再完整pack每行后重扫。所有量仍是原double，不增加有损量化、协议或ACK链；generic/custom捕获保留原顺序和读语义。

接收端只有在精确等价和有收益时才替换共用模板处理；不能因“固定”就假定上一帧对象未被renderer/mod修改、跳过恢复，不能让接收对象别名到模板。

**这是实际替换重复捕获的第一段，不是已经完成弹丸事件流或birth-only同步。** 全量帧/成员列表及权威命中删除合同仍保留，因此不会把“少capture”宣传成“少网络字节”或“主机已不模拟弹丸”。

## 验收（先定再测）
- 字段/顺序/ship引用、完整SWF2字节与旧实现一致；生命周期、新建删除、跳帧/重连、嵌套可变值、+0/-0/NaN/Infinity、fallback均覆盖。捕获不改源状态/RNG；还原不共享viewer嵌套对象。
- 配对同一原生22舰轨迹，完整世界（不只舰船切片）经现有binary+可靠delta+相同deflate/inflate到3/4/5接收副本，含capture、encode、传输表示、decode、apply；复用原模块/同源冻结bundle，A/B→B/A→A/B。离线副本不是实际玩家/RTT。
- 默认启用要求：弹丸捕获P50每对至少降低15%；完整管线总CPU的三对中位至少降低5%，且单对P95不恶化超过10%；全部wire字节不增加（同字节目标）；严格语义验证通过。空/小弹丸组要求功能一致且不引入昂贵新管线。若门槛没过保留负结果，不宣称已优化。
- 再验证共同默认入口、现有network/shared/Steam检查，真实无头测试固定D3D11硬件后端和同等负载；不能拿软件/硬件后端差异当代码收益。
## 负结果后的独立小范围尝试：字节扫描（编码前，2026-09-21）
原Phase30捕获门槛不变：v1/v2均失败，生产捕获/固定模板还原关闭，测试保留。v2配对3副本完整管线约34ms，其中捕获弹丸约1ms；profile-cost.mjs同150帧8轮显示motion reference约2576ms、binary decode约1801ms。CPU profile的热点是reference skip与binary preflight，而不是本轮共享字段。
另作独立的**扫描实现替换**：用固定tag宽度表跳过已知标量、字典key直接读整数，保留每个byte/node/depth/map-key/CRC检查、未知tag拒绝和完整解析顺序。不得因为新路径快而放松恶意输入预算。不增加协议、状态、默认开关或接收缓存。先冻结当前两模块源文件用于A/B。
独立门槛：相同完整22舰轨迹，A/B→B/A→A/B，各3/4/5离线接收副本。每对接收恢复+binary解码P50至少降低15%；每副本数3对完整管线P50比率中位≤.95；每对总P95≤1.10；wire完全一致。合法和畸形输入与冻结旧实现对照，保留全部失败。该实验不能把原捕获实验的失败改写成通过，不能称作事件流、RTT改善或真正5人验收。
扫描修订v3还移除严格二元$vector解析中的回调/单键Set，并把validator剩余元素计数留在局部变量；全部预算和失败条件保持。v3前三对decode改善约13%，仍未达预设15%，不改门槛。下一修订把parser内部运动行固定为同一字段形状，避免对每一行动态建立不同对象形状；这些内部行不输出、不用于游戏模拟、不改变字段读取顺序或运动算式，完整bytes对照仍为必需。
v5/v6完整管线已有稳定收益，但分别有一对decode只降14.93%/14.87%，仍按FAIL保留，不通过四舍五入过门槛。接收decode计时也包含LAN delta的全包CRC；检查发现当前为slice-by-4。下一修订仅将同一IEEE CRC32做slice-by-8，保留尾部4/1字节和所有CRC验证；不改变任何码流。增加0..边界长度、非对齐view及Node zlib CRC对照，并检查小包无昂贵准备。
## 最终集成边界
原生弹丸捕获/固定模板还原实验的imports、开关、options和逐字段分支已从生产CombatSnapshot移除，仅由`scripts/lib/native-projectile-codec-test.mjs`注入测试bundle；不留下“关闭了但每字段仍判断”的额外热路径。失败原始bundle/日志保留。最终扫描路径无需额外开关，不改变网络协商和同步频率。
扫描v7在9对完整轨迹测试全部通过，随后针对清除实验hook后的最终源码再冻结、复测；最终报告以`scanner-benchmark-final`为准。小包CRC不分配DataView（<8字节）；table仅模块加载时构造。Binary预检仍先于分配世界图、逐个危险key检查和CRC错误重置均保留。
