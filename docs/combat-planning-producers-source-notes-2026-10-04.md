# 原生规划生产者契约（2026-10-04）

原版目标0.98a-RC8，core/decompiled缺失，源码/实机/UI待核实。本块不改玩法、UI、dt、频率、实体/挂点规模；以现有Web行为作strict基准。不冒充50%目标已达。

## 证据 → 预期 → 差异 → 验证
- FlightDecisionRoster.fireShips逐craft复制同team allies再按全source顺序插入一个target；scope以array identity为键，约94%重复权限mask。预期每个相同team/target有序权限集合在实际原生roster中只生产一次；不是消费端哈希/弱缓存、更不扩大craft目标权限。团队变化使craft不在capture allies时走原路径；当前target身份逐调用读取，死亡/退场资格仍live。返回readonly数组，私有Worker无可执行插件，不支持给陌生callback借出此共享列表；未来Worker插件必须撤销能力。通用fallback仍按当前数组构造。Flight roster关闭后清空目录，数组可被已经排队的本步fire world只读使用。
- ShipStepBatch的contact union逐entry重扫source。重复相同已生产的readonly数组不会改变Set第一次插入顺序。只对真正FlightDecisionRoster发布的数组及本Engine本步原生factory发布的root数组去重，generic/custom source继续逐entry原路径；每个entry仍先插入自身，再第一次访问source。标记不替代world生命周期/候选资格，所有geometry/lifecycle仍live。
- AttachedModuleMotion在create已对整个roster逐成员完成nativeMember、pure stat hooks/no combat hooks证明，但在同一个没有effects/controls/receipts写入的native规划span里又对每个module重证。新Engine实际factory入口发布world provenance；只有此路径复用本span初始member事实，并免除对同factory DTO的完整descriptors重建。普通CombatAIPhase.plan/custom worlds仍旧完整检查。每次accept仍检查parent/mount角色、原生motion边界、vector资格和NONE系统；公开unknown callback/receipt不得通过provenance。unknown AI方法在现有phase入口关闭span。关闭后所有能力失效，不跨tick缓存状态或资格，不freeze热数组。

集中验证：一次app tsc/改动文件lint，既有270步baseline/candidate/rollback严格raw+AI/防御+双RNG+tracker/per-mount RNG，权限排序/目标变化/团队变化/unknown source/close及generic world边界。之后独占ABBA，完整净成本计时，回归只撤回本块。
