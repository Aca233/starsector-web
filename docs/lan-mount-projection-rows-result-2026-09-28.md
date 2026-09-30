# 挂点投影值行候选：不保留（2026-09-28）

## 决策
**没有保留本轮生产优化。** 唯一 ABBA 的第二对捕获仅节省 6.462%，低于事前10%门槛；同时结束时发现其它工作对13个文件的改动，源码审计失败。原始 runner exit=1，原始 abba.json 只保存四臂记录；abba-analysis.json 是对这组既有记录的后处理，不是第二次性能运行。numericGatePassed=false、sourceAuditPassed=false、passesPrescribedGate=false。

已核对完整两文件写集的绝对路径、candidate SHA 和 before SHA，先归档再精确复制恢复。回退前当前非生涯源码为 750 模块；另外 748 模块及文件集合逐项保持当时状态，所有其它任务改动保留。没有删除、提交、推送、发布，没有修改原版安装。总体大规模实时模拟/过载/输入延迟目标尚未解决。

## 试过的实现
- 新的默认关 VITE_LAN_MOUNT_PROJECTION_ROWS，只用于明确本机native display投影；不叠加display-v2、不改变协议、接收校验、数值精度、实体数、画质或Hz。
- 将投影器自有挂点scratch对象改成固定字段表和值数组，避免重复对象键枚举、Object.values、形状比较和部分动态命名属性写入。动态射程/弹速/所有挂点字段仍按原顺序每次读取；开始递归pack时slice一次，保留子回调与后续字段采样的时机。
- 本机WeakMap生命周期与原投影器一致，不缓存旧数值，不与输出帧共享可变值数组。其它组件、通用pack、fixed/recordDelta/component路径不改。
- 自定义投影器继续得到旧命名字段DTO；准入使用descriptor.value，不额外执行project getter。以上代码现在只在rejected-source和版本工件中，不是当前生产实现。

## 正确性与失败修复记录
1. 初次 typecheck、两文件lint通过。新增合同比较有限极值、±0、NaN/Infinity、undefined/function转换、先采样后递归、mapper执行/异常顺序、循环/别名、Ship引用和保留帧独立性。
2. 首次自定义读者测试误替换getMotionStats，它不属于RenderShipProjection的nativeQueries守卫，因而“应拒绝”断言失败。只修测试为真正受守卫的isVisibleTo；旧日志保留。
3. 既有v2挂点身份测试覆盖prototype.project包装器，并修改返回DTO的displayRange/displaySpeed。第一版值行忽略这些命名字段修改，确实失败550≠110；修生产入口增加原方法资格，不改该既有合同。进一步用descriptor.value避免守卫额外执行自定义getter，并新增调用次数/报文回归。
4. 一个新测试先用跨bundle deepStrictEqual比较含PackedSnapshotNumbers的原始frame，遇到不同类原型；随后V8.serialize字节比较仍不同，巨大Buffer断言诊断发生ArrayBuffer allocation failed。定向诊断证明同初始帧无枚举值/键/次序差异，20377个重复别名的位置一致，生产二进制完全相同。最终改用生产codec字节摘要比较，保留独立的精确数值和递归pack合同；不把V8内部序列化字节当成协议或规范化值语义。
5. 最终证据为6个新合同、7个既有定义/协议合同，以及最终冻结bundle的60完整固定步三路对照（真实旧版/候选开启/候选默认关闭）。只对具体失败和受修复影响的场景复查；早先通过且不受后续入口守卫影响的合同保留其版本证据，没有声称全部在每版重跑。
6. 60步每步完整authority+隐藏RNG/autofire、二进制、接收可观察值、HUD、纹理及动态range/speed相同。含技能、近距交火、排散和低血模块扰动。原退休orion_device阻断的整套native-capture没有运行，不能说全项目回归或原版实机验证全绿。

## 唯一完整五段ABBA（每步墙钟均值ms）
初始176实体734挂点、2玩家+20AI、三舰混编、seed917、3200DP。A0/B1/B2/A3各独立隐藏Node，每臂150完整五段热身+120计时。四项既有模拟实验同开，两边display-v1。Node v24.13.0；本次不与上轮Node24.13.1的绝对数字比较。无profiler，不含renderer、真实网络、IPC/调度或输入时延。

|臂|模拟|捕获|编码|解码|应用|权威三段|完整五段|
|--|--:|--:|--:|--:|--:|--:|--:|
|0 before|519.168|186.421|105.794|54.527|276.608|811.382|1142.518|
|1 after|161.931|52.084|31.037|15.402|80.186|245.052|340.640|
|2 after|74.297|24.092|15.399|8.250|38.888|113.787|160.926|
|3 before|81.041|25.756|15.972|8.593|42.775|122.770|174.138|

- 捕获节省：72.061% / 6.462%，要求两对各≥10%；第二对不满足。
- 权威三段节省：69.798% / 7.317%，要求两对各≥2%。完整五段变化记录在工件，不能独立挑它作为晋升理由。
- **未改的模拟阶段同样相差 68.809% / 8.322%。** 第一臂与最后同为旧版，但五段均值1142.518→174.138ms，显示测量环境/运行条件严重不稳定。不能将第一对约70%的差值归功于候选，也不能据第二对的其它阶段数字宣称可靠整体收益。没有为了抵消噪声择优重测。
- 四臂120帧均为150047695 bytes；wire、20/270步完整authority+hidden、接收摘要和读取资产SHA都相同。20步 bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224；270步 bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6。

## 并发工作保护与证据范围
初始740模块；最后一次修复构建时新增2个其它工作文件（AdunArkIds、AdunArkSystems），经metafile核实均不进入测量bundle，两臂共享完全相同的冻结源码。ABBA末尾检测到13个现有文件又被其它工作修改，包含Ship.ts、Registry和渲染/工作台文件。这使当前工作树验收失败，即使冻结bundle的报文一致，也不能把结果自动推广到更新后的工作树。

没有用旧冻结图覆盖这些改动。revert-preflight.json、live-pre-revert.json、revert-verification.json记录当前750模块的回退前后检查，只有LanShipProjection.ts和AuthorityCombatSnapshot.ts恢复至本轮前字节。下一轮必须检查当前新源码和场景，不能再声称当前项目还是旧740模块图或沿用旧authority SHA作为未经核实的新基线。

工件目录：artifacts/lan-mount-projection-rows-20260928。含before/candidate-v1/v2/rejected-source、三路bundle、冻结依赖、原始失败、定向修复、最终60步proof、预登记、唯一ABBA四臂逐帧数据、源码漂移及完整回退核验。本轮未做双客户端浏览器/实际LAN/WAN/输入P95测试。
