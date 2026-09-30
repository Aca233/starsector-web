# 交错威胁复用后的权威循环诊断结果（2026-09-27）

一次短冷启动CDP：2485.806ms、1748样本；四实验全开，完整176实体场景，首次过载后退出并清理，无source/harness/asset漂移。不是稳态CPU占用或AB性能。

- fixedUpdate inclusive 1852.401ms / 74.5191%。
- CapitalShipAI.update inclusive 626.074ms / 25.1860%。
- ShipWeaponControlSystem.update inclusive 595.101ms / 23.9400%。
- assessThreats inclusive 214.516ms / 8.6296%。
- captureLanDisplayCombat 162.288ms / 6.5286%；encodeProjectedBinary* 88.812ms / 3.5728%。
- GC 74.617ms / 3.0017%；idle 172.937ms / 6.9570%。

桶彼此重叠，不应相加为阶段总量。preAim inclusive253.171ms；outsideAcquisition self48.765ms/inclusive78.266ms；allSystems self88.153ms；hasNativeSystemStats self49.637ms。冷启动采样不能与旧profile直接算性能改善。

下一方向：在已有独立写入认证的interleaved段内，单舰组件推进后/发射前的纯瞄准区间，复用**仅几何**PreAimRangeIndex；不恢复失败的完整目标/阻挡资格缓存、不新增逐舰全对象反射审计、不改nativeThreatPhase或forecast。不跨ship.update复用几何索引，不删实体，所有保守命中仍逐目标做原资格/拦截/射界。先预登记新候选，再实现。

完整证据 artifacts/lan-post-interleaved-diagnosis-20260927。无有效稳态Hz/P95，未完成整体优化。
