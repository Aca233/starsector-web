# 系统 AI 输入依赖执行层（2026-10-03）

## 原版证据 / 边界
目标原版版本 0.98a-RC8；C:/starsector-core、C:/decompiled 缺失。原版源码与实机/UI 仍待核实。本块仅等价重写现 Web 内部数据准备，不宣称原版 AI 等价，不改 UI、不改玩家操作。

## 最小对照
- 证据：combat-low-level-logic-audit-2026-10-03.md 及 system-input-consumption.json；3120 次 eager forwardPathClear，四个已核实 advanceAI 对 forwardClear 的读取为 0。
- 源码：EclipseProtocol.advanceAI → SystemAI.advanceWeaponBoostAI；GlorianaEdict.advanceAI；HyperionSystems.createHyperionYamato/createHyperionJump.advanceAI。四者不消费 forwardClear。SystemAI.offensiveManeuverAllowed、advanceJetsAI 仍消费，不能放入免查询集合。
- 预期：依赖按注册后不可变 definition 身份认证，不按 hull ID / 函数字符串猜测。只有真实 worker 的原生同步 effects 输入跨度可按依赖准备；没有认证或未知世界/回调仍保持旧 eager 查询与读取顺序。
- 当前差异：effects 无条件构造净空，即使消费者不需要；模块机动 actor 混用、完整威胁预测的组合复杂度另列未解决，不以本块冒充整体根治。
- 实现边界：独立 effects 权限，不延长 plan-time 几何/数值缓存；每个调用仍读 live 系统与生命周期。未消费字段提供真实惰性查询，不伪造 true；原 modifiers/boostSpeed 读序保留。权限在异常、跨度关闭和未知 after 回调前撤销。
- 验证：集中 app 类型检查、修改文件 lint、既有 standard heavy authority 场景（seed917、2玩家+20AI、734挂点）的同窗 ABBA，完整终态/RNG与冻结基线对照；逐步对照、回滚、关闭、未知回调/世界边界定向检查。无桌面、无发布。性能和调用次数插桩分开。
