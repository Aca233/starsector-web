# 舰队source内range/motion复用：拒绝并撤回

## 结果
- 一次app tsc/改动3文件lint通过。初版270步全raw/双RNG、20790 AI防御、195934 autofire tracker及rollback一致，但实际prepared=0，不能当新路径验收。
- 定向发现原生parentShip默认null（Ship.ts:123），初版门禁只允许undefined；仅修正空parent表示，定向lint与8项boundary复查通过。unknown motion/scalar/table/modifier callback、runtime、无battery、异常finally及generic无provider的读序保持。
- 修正后的native覆盖每步3个source；120计数窗口20807请求，仅360次准备/实际复用（约1.73%），其余20447 fallback（含上下文已关闭后的拒绝，不意味着重复深层审计）。没有为覆盖率扩大parent/child/carrier/unknown callback权限。
- 修正版150warm/120timed ABBA：整步 **33.341 → 34.653 ms**（恶化3.94%），AI **11.933 → 13.118 ms**。4份ABBA最终raw快照/双RNG一致；修正版未再次做270逐步memory全对照，因为性能失败直接拒绝，不冒充该路径已完整行为验收。

## 为什么拒绝
source局部表复用方向没有被此结果否定，但这套运行时资格/依赖认证、生命周期上下文及provider调用仅覆盖3个source，准备成本未赚回。不能把规则重复输出等同于安全复用，也不能把prepared少量成功等同于净收益。继续在可变对象API外堆反射不是本场景根治。

## 撤回范围
- CombatEngine.ts、FleetTactics.ts 恢复本块冻结baseline逐字节内容；未覆盖其它原有修改。
- 本块新增FleetSourceModifierPreparation.ts先保存到rejected-source，再移除生产文件；没有删除其它文件。
- artifacts/combat-fleet-source-modifiers-20261003/rollback-source-check.json核实恢复与accepted nearest两文件hash未变。
- 保留全部source-notes、boundary/logic/timing证据与拒绝源码，不发布/提交/触碰生涯。最终生产仍是已严格验证并测量过的native nearest版本。

## 后续结构边界
需把真实writer、系统组合依赖、只读consumer阶段明确化，由实际producer建立有证明的规则读面；未知回调继续原路径。不能只凭Worker标记、definition冻结或同tick相等出具持久有效证书；classification审计发现advanceCombat/system event/recoil/world hook仍取得live Ship/WeaponMount且不通知revision。现有范围组合也含owner/runtime/parent/模块可用性变化。原版0.98a-RC8来源和实机/UI均待核实，没有原版等价或60Hz已解决结论。
