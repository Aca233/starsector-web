# 封闭Worker私有渲染记录键布局：来源与边界（2026-09-26）

## 证据和目的
本机0.98a CombatEntityAPI.java:8–9 getLocation/getVelocity、59 getHitpoints和ShipAPI.java:336 isPhased仍要求当前状态。Web图编码没有原版算法对应，以现有全字段/完整图/有效包为等价基线；不改变玩法、UI、精度、频率、实体或显示字段，不做桌面/原版实机验收。
前期真实V8采样：captureGraph自身分配约155.57MB、其Object.keys约44.46MB/60tick；采样是统计诊断，不是本轮速度证据。相位和HUD两轮后，未变的通用图编码仍逐节点枚举键。过去“签名缓存”保留了全部Object.keys且没有净收益；本候选不同，利用真正私有的固定结构记录，省去重复枚举而非在枚举后叠加通用形状缓存。

## 生产所有权
RenderShipProjection只登记其自身new/Create创建的输出记录身份（Ship/System/Weapon及select创建的零原型对象），不登记传入Ship、Vector2、数组、元数据、HUD或任意收到的DTO。独立外部projector创建的相同原型对象，也不属于Encoder内这个projector。
Encoder仅在FireControlQueryRoster登记的封闭数据命令Worker内使用布局；同一Worker不会把其私有Encoder/Projector/记录交给调用者，不是same-realm安全沙箱。普通/UI和动态对象仍走现有Object.keys。首次编码私有记录时先读取完整keys，封闭对象结构（seal，不冻结字段值），保存不外泄的冻结键列表；其后每帧仍遍历全部键并读取、校验、编码当前值。seal防止后续增加/删除键或改变原型，不以未经核实的“形状应该不变”缓存任意对象。
已核查RenderShipProjection四个构造点及其所有select/copyFields/assign：每种原生组件的字段集合固定，含可选字段；原生源对象可能替换，但新身份获新记录。共用源身份只在相同组件族/字段集合内重用，跨字段族的自定义组件alias不属于封闭Worker构造契约。未来布局代码不兼容扩展会抛错，而不是悄悄丢字段。公开可变源、私有对象越权逃逸不授权此域。

## 不变的安全与数据合同
保留每次prototype/type/simulation-class/UI/forbidden-key/value检查、live graph预算、BFS顺序、元数据、删除/重新进入、值比较和精度。只缓存不可变结构，不缓存值或跳过字段。
packet.shapes.keys仍是调用者可变数组。首次发出某shape时复制私有布局，并让该节点snapshot.keys与这份公开数组共享，保留旧实现“修改返回shape.keys后仅对应首节点下帧重新发送”的行为；不得把私有缓存直接泄漏，也不得顺手改变公共packet变更语义。

## 验证
冻结315模块，预计仅Encoder/RenderShipProjection变化。新增合同并入既有render-projection，冻结旧Encoder同一模块图逐包字节对照，覆盖owned切换、动态值/成员替换、shape.keys历史包修改、节点退休/重入、相同原型外来记录、源Vector/数据不封闭和公开动态键/异常路径。一次typecheck/lint/既有场景。短真实Worker默认模式/恢复计数确认结构缓存真正启用；一次无profile/stages固定串行200舰150预热+180测量，以完整交付净收益决定保留，失败精确回退，不择优重测。

## 实测结案
一次正式配对已完成：编码均值+30.50%、完整交付均值+8.48%、P95+8.24%，六个连续分段全部退步，候选已否决并精确撤回。完整性能报告见owned-render-layouts-performance-2026-09-26.md。没有修改前两轮相位/HUD优化。

原V1合同构建后、任何本轮测速开始前检测到并发GlorianaArmory数据更新；已原样放入V2前后两臂，仍只有两生产文件作为候选差异。原V1保留，正式使用baseline-current-sources.json/candidate-current-sources.json，未通过重测选择结果。最新舰装完整玩法/原版UI不属于本轮验收。

完整既有场景首跑exit1，因新Vector夹具误变节点类型；只修夹具并定向验证。之后补跑尚未执行的HUD合同时又修正“参考必定未优化”的测试假设，其余合同定向通过；不冒称整条原命令exit0。HUD通用oracle修正保留，并在生产回退后单独通过524项检查。

最终315个生产模块与V2基线完全一致；新候选helper、入口和插桩不再活动。原版实机及界面未操作。
