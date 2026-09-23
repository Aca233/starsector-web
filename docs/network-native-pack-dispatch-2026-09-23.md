# 原生快照打包：移除重复分派

## 改动前边界与证据
本块只改序列化执行成本，不改模拟、AI频率、画面或玩法。沿用 docs/network-guest-direct-restore-2026-09-23.md / docs/network-damage-view-2026-09-23.md 的原版读集核实。当前 CombatSnapshot.pack 对每个递归对象先做 Ship instanceof，再调用 packFresh 重复该检查；packFresh 在同一祖先栈未变化的路径上两次 seen.includes。

仅 locally-owned nativeCapture 且关闭 mutation journal 时直接分派到 packFresh。组件模式及generic/自定义调用的读取顺序保持不变。祖先栈必须仍在任意子对象遍历前检查，不缓存对象值、不跳过状态更新、不减少频率。

## 预先声明验收
使用既有22舰、3/5个顺序客机、正反顺序的全链路场景，对比本轮冻结源与改动源。双方使用同一当前parser/restore/投影字段；逐帧编码、实际delta、压缩字节和客机恢复状态必须完全相同。只按capture P50合并有下降且全链路P50合并不回退保留（不要求5%）；若单臂总耗时P50/P95超过旧版10%，必须调查，不能只报局部快。离线CPU收益不等于真实Hz/RTT提升。

## 结果：撤回
类型/lint、5项边界及4组逐帧全链路等价通过，但capture P50几何均值+3.73%，全链路+0.54%。因此不保留此分派改写；CombatSnapshot.ts已按冻结基线完整恢复，既有直接还原/武器和伤痕裁剪全部保留。V8可能已优化原重复检查，不能据源码操作数宣称CPU提升。CAPTURE_BASELINE对照能力与原始负结果保留，不改变其他历史验收标准。
