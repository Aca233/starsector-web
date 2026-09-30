# 已有纯读包络内持续武器粗筛（实施前，2026-09-27）

## 来源与边界
本机原版0.98a-RC8。重新读取 ../decompiled/starfarer_obf/com/fs/starfarer/combat/ai/private.java:249–265：逐武器射程、目标尺寸、弹速及射界参与取得目标；com/fs/starfarer/combat/entities/Ship.java:1813起的advance说明舰船更新会改变状态，不能将状态无条件跨更新复用。反编译仅为机制边界，不宣称其预测算法与Web相同；没有原版实机/界面验收，本轮不改变UI或玩法。

当前Web差异：ThreatAssessment已有保守挂点可达粗筛，第一次add后无条件关闭，即使现有WeaponThreatEnvelope已经同时审核观察舰和敌源的纯读资格。现有native/exact资格覆盖damageTakenMultiplierFor、外部damage reader、damage/phase钩子及系统定义；get(enemy)仍实时检查并且包络沿原有writer更新失效。普通未知回调不能使用该资格。

仅修改ThreatAssessment.ts，在新默认关闭VITE_AI_CONTINUOUS_THREAT_BOUNDS开关且本敌源取得现有envelope时，不再主动关闭已经启用的boundWeapons。不把false恢复成true，不增加资格遍历/索引/缓存，不更改原拒绝公式、浮点顺序、名单顺序、ETA、回调、RNG或状态写入。不复活依赖组AABB/预瞄子集/属性缓存失败方案。

既有arm-0采样供选题：preAim self3.970%、outsideAcquisition self1.876%、shipSegmentEntry在aim/preAim子树self0.321%；assessThreats inclusive13.595%。inclusive不相加，采样不是本候选提速证据。

## 预登记验证
完成后一次typecheck、改动lint及同一冻结源图的差分合同：真实host初始化/重建/default；逐舰预测（无包络、native/exact、close、失效、有限/异常horizon/位置）；未知护盾回调变更/重入/抛错与调用顺序；60完整步扰动authority+隐藏tracker/RNG；一次非计时270步实际geometry/reject计数与完整终态。

正确性和真实启用通过后仅一次隐藏独立Node A0/B1/B2/A3，每臂150热身+120无插桩完整fixedUpdate，2玩家+20AI三舰循环、seed917、3200DP、初始176实体734挂点。四个已有默认关闭实验在A/B共同开启；两组各至少省5%才保留。exit=0不代表过关，读passesPrescribedGate。不重复择优或降门槛。只有离线过关才一次既有双无头浏览器功能验收，不能把Node耗时当作稳态Hz/输入P95。失败核验整个一文件写集hash，归档精确恢复，保留同期无关改动。
