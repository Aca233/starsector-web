# 战斗重构第一阶段：独占入口与派生属性试验

日期：2026-09-23。状态：**可执行的独立入口已实现；属性缓存未通过稳定收益门槛，默认不启用。正式游戏入口未切换。**

## 实际交付

- `src/engine/runtime/owned/OwnedCombatSession.ts`：复用完整 `LocalCombatKernel` 的新入口。ECMAScript 私有字段持有内核，外部只能提交数据配置/控制/增援命令、推进固定步和获取脱离权威对象的显示包。配置与命令复制；输入沿现有 kernel 复制；内容版本改变时拒绝继续运行；关闭后拒绝推进。
- `src/engine/simulation/OwnedNativeSystemModifiers.ts`：只对经过核实的六种原生定义提供逐实例派生属性复用。NONE、冲刺推进、加速填弹器、高能聚焦、机动推进器、堡垒护盾。复用原函数，不复制一套近似公式。未激活时直接返回空贡献；激活时按实际依赖复用，保留有符号零，OUT 保留强度、容量改变均立即可见。
- `src/engine/simulation/ShipSystem.ts`：增加一次性显式接入方法；每实例的派生闭包不枚举、不进入快照。旧 `modifiers()` 热路径保持原样，不额外加入每次查询的缓存分支或反射检查。
- 辅助系统、临时 runtime modifiers 仍逐次实时组合；高级系统继续执行既有完整逻辑，而不是简化实现。新生成单位首次处理可走旧路径，下一步才接入缓存，不跳过游戏逻辑。

**不是完整 ECS，也不是新的列式权威状态库。** 权威数据仍在既有引擎对象里，只是新入口不再向调用方暴露它们。本阶段没有重写寻敌、空间索引、火控调度、伤害事件顺序、AI 频率或渲染器。

## 使用边界

加载既有战斗内容后，可以从 TypeScript 中调用：

```ts
import { OwnedCombatSession } from './src/engine/runtime/owned/OwnedCombatSession';
const combat = new OwnedCombatSession({
  playerHull: 'onslaught', enemyHull: 'paragon', seed: 917,
  // 默认 'reference'。只有明确进行试验时才设 'native-cache'。
  derivedStats: 'reference',
});
combat.step({ autopilot: true, blocked: false, keys: {}, aim: [0, 0],
  firing: false, mouseSteering: false, pointerActive: false });
const displayPacket = combat.capturePresentation(); // 与 simulation step 分开计费
combat.dispose();
```

- 尚未接到 UI 或 Worker，用户正常游戏仍使用原入口。本轮没有窗口、键鼠或可见浏览器操作。
- 此 API 的“独占”是应用协作边界，不是对同 realm 恶意原型修改/插件的安全隔离。既有全局内容注册表尚未迁移为逐世界定义库；因此检测内容 revision 改变并拒绝续跑。
- 新入口暂不接收 encounter、deployment、内容安装或 replay；明确报错，不伪造成功。现有入口的相关功能保持不变。
- 显示包沿用既有 strict encoder 并复制，不是全新零拷贝通道；没有承诺浏览器 FPS、端到端输入延迟或网络 Hz 提升。
- 已知光束友伤/小行星、战机零幅能加速、CR 装甲命中强度问题仍未修复。原版 BurnDrive 在提前取消时保留加速度，与现有 Web 固定 OUT=200 也可能有差异；本轮只保持旧规则，不将等价回归误报为完全原版等价。

## 验证及结果

原版源码证据、预期语义及验收范围见 `artifacts/owned-combat-core-20260923/source-notes.md`。

- 最终类型检查：通过。三份改动源码 scoped oxlint：退出码 0。
- 现有 `scripts/check-combat-ai.mjs`：38/38 通过。
- 最终缓存版本：11,122 组属性对照通过，并检查原版关键常数/OUT、容量、辅助贡献、临时效果、非原生 fallback、构造函数未执行的投影对象、输入/输出不别名和关闭/内容变更边界。
- 实际混编：Onslaught、Hammerhead、Eagle、Paragon、Odyssey；22 艘主舰，含正常生成的舰载机最高 38 个作战单位；最高 207 发弹丸、34 条光束。
- 冻结原始 641 份源码；对照同一个新入口的 reference / native-cache，原始系统逻辑来自冻结源码。3 组配对，每组 600 步，240 步预热 + 360 步计时，交替调用顺序。计时包含新入口的准入扫描及输入边界，不包含显示发布；初始化及首次发布单列记录。
- 1,800 步 RNG/单位数量比较一致，63 个全量 authority 二进制快照检查点逐字节一致。这不是完整隐藏状态证明，更不是原版实机验证。

| 最终版本指标 | reference | native-cache | 变化 |
|---|---:|---:|---:|
| 平均整步 CPU 时间 | 11.3943 ms | 11.2607 ms | -1.17% |
| P50 | 11.0200 ms | 10.8727 ms | -1.34% |
| P95 | 15.6654 ms | 15.4610 ms | -1.30% |
| P99 | 17.8473 ms | 18.2269 ms | +2.13% |

三组平均耗时变化约 -2.56%、-1.36%、+0.71%；方向仍不完全一致。共享进程 JIT/GC 和后台负载未完全隔离；不将约 1% 差异宣传为稳定性能提升。首次显示发布（包含复制）约 26–45 ms，也没有被掩盖进“模拟优化收益”。它是冷启动发布样本，不能推断持续帧耗时。

第一版连 idle 都验证缓存键：平均仅 -0.46%，P95 变差；已保留 `v1-*` 结果。发现具体无效工作后做一次定向修改与复测，没有扩大成全量测试工程。

**决策：保留新入口及可选缓存实现作为下一阶段基础，默认 reference，不晋升正式入口。** 测量包记录的是明确传入两种模式的代码；随后唯一策略调整为默认 reference，未覆盖测量包及其哈希。

## 后续应优先做什么

1. 在这一完整混编场景中按整步阶段归因，优先找 AI / 火控的重复候选遍历和重复几何查询，而非根据对象数量继续铺 ECS。
2. 将共享查询结果的所有者、有效期和失效点明确化：几何/阵营/名单与活性、护盾、幅能、死亡、瞬移不同；不能用“一帧有效”抹掉同 tick 因果。
3. 实现一个具体共享查询域后继续使用冻结 reference 做完整战斗对照。只有完整 step 稳定改善且发布/延迟不退化，才迁移默认入口与 Worker。

未暂存、提交、推送、打包或发布；未改生涯功能和其它既有 WIP。
