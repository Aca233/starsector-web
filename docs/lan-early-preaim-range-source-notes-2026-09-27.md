# 私有 Worker 预瞄提前范围拒绝（2026-09-27，编码前）

## 来源、现状与差异
本机原版 0.98a-RC8；本轮重新读取 `../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:237–266`：原版候选须经过目标资格、阵营、可见性、武器角色、距离/预测/射界，且指定目标优先。反编译代码不直接复制。Web 现有 preAim 使用 1.5 倍射程、最近有效目标与原序平局，本轮全部保持，不声称该算法与原版完整相同。无 UI 改动，原版实机待许可。

最新短启动 profile（lan-post-motion-diagnosis）中 preAim inclusive 367.829ms、canTarget 291.791ms、isPhased 238.355ms。包含/重叠桶不可相加；不是稳态性能验收。普通可变调用者的资格/几何读取时序不能重排。

## 候选与证明范围
仅在 host.worker 私有数据命令域且显式 `VITE_LAN_EARLY_PREAIM_RANGE=true` 时启用。默认关闭，不改变旧 phase-read、nativeThreatPhase 或 queryRoster 资格。对单次 preAim 的每个候选，先作实时纯读门槛：目标及父舰无 externalPhaseEffects/runtimeModifiers，全部实际系统槽的定义属于已审计无副作用的 stats/isExecuting 集，目标原生盾心方法及不可变舰船 metadata。该门槛不保存值、不跨候选/挂点/舰船/tick 复用，也不扩大已否决的全名单 roster。

门槛通过才将**同一个** outsideAcquisition 保守谓词移到 canTarget 前；明显超范围时提前拒绝，否则仍执行原 canTarget、精确拦截与射界。只把求解函数拆分成原范围门槛和余下同序计算，避免对近距离重复计算范围谓词。未知定义、外部相位回调、runtime效果、非原生盾心全部保留原路径。普通/未启用 Worker 路径不运行新资格检查。所有原目标名单、指定目标优先、距离运算及排序、RNG、发射、实体、效果、频率不变。

闭合 Worker 保证字段/原型由原生构造器拥有，不能用于允许同域任意 monkeypatch 的插件沙箱。若以后给 Worker 暴露插件或可变引用，必须重新审计。注册新定义不自动获得许可。读门槛中检查的父舰依赖只是本次读取，不是家族状态缓存。

## 先定验收门槛
以**最新工作树**冻结全图作为共同基底，纳入其它任务的新同尺寸装配规则和 XL 射程修饰；保留当前内容迁移，不恢复旧生成目录。A 为本轮三个生产文件精确 before 源，B 为候选；root exact-threat 与 motion-read 两臂均 true，其它设置相同。

1. 真实三舰、2玩家+20AI、seed917、3200DP，必须仍为176实体；初建/重建及默认关闭验证。逐挂点比较预瞄结果，近远/盾心偏置/高速/非有限/平局/指定目标；未知系统回调（含抛错）、父舰回调、runtime效果的调用顺序和异常保持。
2. 60次完整 fixedUpdate 权威状态＋隐藏 tracker/RNG 每步完全一致。
3. 完整实现后集中一次 typecheck、改动 lint、相关合同。一次 ABBA，每臂150预热+120计时；完整终态hash相同，**两组整步均至少降低3%**才保留候选。不能择优重跑或以调用数代替速度。若正确性失败，仅定向修复失败项后再开始尚未执行的性能测试；若性能失败，hash核对后精确回撤生产文件。
4. 离线通过才运行一次既有无头真实联机场景（完整CSS、实体与资源冻结）；仍过载则不宣称输入P95或稳态60Hz收益，实验默认关闭。不打包、暂存、提交、发布。

## 定向修复记录
首次typecheck/lint通过，但候选在导入阶段触发既有循环依赖：host.worker的首个AutofireController import使ShipWeaponControlSystem的原型见证在类初始化前访问。A正常初始化；全部合同未进入行为测试，ABBA门闩阻止计时。仅将新import移到原有FireControlQueryRoster导入后，不改变算法或门槛；首版快照/日志保留。对全部此前未能执行的合同定向重跑一次。

定向导入修复后全部5项合同通过；唯一ABBA两组整步下降4.132%/12.016%，满足预设3%门槛。A/B/默认都成功初始化176实体、734挂点，新的同尺寸规则已共同纳入。浏览器验收前重新编译当前完整CSS并冻结，不与旧样式运行时间做配对比较。下一步一次既有真实场景；不重跑离线性能。
