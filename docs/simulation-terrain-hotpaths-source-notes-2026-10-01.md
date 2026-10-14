# 战斗小行星热路径优化 — 来源与边界（2026-10-01）

## 原版证据 → 保留行为

- 本机 ../starsector-core/starsector.log:1：Starsector 0.98a-RC8。
- ../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:9–48：位置、速度、碰撞半径、质量、精确轮廓与护盾是独立物理属性。
- ../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEngineAPI.java:52、140、506：战斗物理小行星列表与生成 API。
- ../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/terrain/Asteroid.java:53–78：构造设置 ASTEROID 碰撞类别、半径、速度、质量；反编译存在未加载依赖，只用 API 与构造交叉确认属性，不推断原版的空间索引或精确碰撞顺序。
- ../starsector-core/data/config/settings.json:1395 起：原版小行星图片资源；本轮不修改资源或外观。

本轮是 Web 内部实现优化，不移植新玩法，不声称原版等价。保留当前 78 颗布局、公开视野、引力、固定 60 Hz、伤害、随机序列、数组处理顺序与最近弹丸交点。无界面修改，原版实机与同状态画面对照待许可，不操作用户桌面。

## 当前差异与最小方案

现有船体远距预检只复用深冻结轮廓，运行时可变轮廓会进入逐边检测。对当前碰撞阶段建立临时的保守 L1 外包范围；每次接触及相关回调后清空，下一 tick 重建，防止修改轮廓/换装后的陈旧范围。范围只拒绝必不相交的远处对象，边界、异常数值及近处继续原精确算法。位置与朝向不缓存。

小行星相互碰撞仍按 i/j 顺序，远处先做带数值余量的单轴预检；近处保持原向量长度与反冲公式。弹丸扫掠用同顺序的标量点积替代临时向量，不改二次方程、t 并列规则或退化段规则。

## 追加的机动属性热点（用户提供消融后核实）

当前 runtime 核实 web_zhuyuan / web_sc2_hyperion / web_gloriana 的 hasNativeThreatPhaseHooks 均 false，hasExactThreatPhaseHooks 均 true，主/防御系统 hasNativeStats 均 true。Registry.ts 中 nativeStatDefinitions 不包含这些后注册系统；originalStatDefinitions 与 hasExactThreatPhaseAI 已单独审计 Eclipse/Edict/Yamato/Jump 等只读统计。

TacticalNavigation.obstacles 原先把机动统计复用绑在原生威胁/索引许可上，导致每颗小行星重复 getMotionStats。现在只借用现有精确统计许可，在同一次同步扫描中懒计算 maxSpeed 一次。原生索引与远距剪枝仍沿用原门控；不扩大 nativeStatDefinitions，不启用任何 phase/forecast 实验开关。自定义 getMotionStats、导航 recorder、自定义自身距离/长度读取继续旧路径。结果不跨扫描或 tick 保存，系统激活/flux/推进状态改变后下一次扫描立即重新读取。当前未启用的 zhefeng 未扩大到此精确 AI 许可，不能声称也已覆盖。

用户报告的镜像消融结果作为定位线索，未混入本机混编场景的前后性能表。追加回归只在同一个既有 terrain/visibility 场景验证单次扫描调用数、下一扫描重算、observer 与自定义 reader 回退；随后冻结原工作区做整场对照。

## 基线与验证方法

复用 scripts/benchmark-simulation-latency.mjs 的真实 LocalCombatKernel 场景，种子 917，24 艘 web_zhuyuan/web_sc2_hyperion，60 tick 预热、180 tick 计时。旧基准的原版 onslaught 已不在当前启用内容里；改用当前内容，不添加替代数据。修复基准的 ?raw 文本加载与冻结图解析，不改生产内容。

带 CPU 采样基线：simulation 均值 33.00 ms/步。fixedUpdate 累计采样 6941 ms，resolveShipCollisions 538 ms（约 7.8%，getHullCircleContact 467 ms），chooseCombatVelocity 263 ms，queryProjectileImpact 12 ms，advanceGravityFields 2 ms。采样包含预热，不是精确函数计时；未解释剩余仿真开销，不能把小行星称为整场慢速主因。

冻结修改前源码做逐 tick 前后交错对照：回放/RNG witness、隐藏火控、显示读值，每 30 tick 与末尾比较完整权威帧。完成实现后集中类型检查、改动文件 lint 和既有 simulation-visibility 场景；在该场景补充接触、边界、移动与回调修改轮廓等针对性断言。CPU 基准不含渲染、真实 Worker IPC、rAF 或网络，不换算为实机 TPS/FPS。

## 完成后的集中验收

- 原工作区冻结图与最终生产图仅有 TacticalNavigation.ts / AsteroidSystem.ts 两项变化，其他既有改动均保留。
- npm run typecheck（tsc -b）：通过；追加避障功能后的 tsconfig.app.json --noEmit：通过；改动生产/基准/场景文件 oxlint：通过。
- check-simulation-visibility.mjs：287 项通过，pageErrors 为 []；地形仍 78 颗小行星 + 1 个独立星云。沿用真实 WebGL/HUD/地图验收，附加旋转/超出 collisionRadius 的可变轮廓、换装、接触回调编辑轮廓、同 tick 移动、160 组扫掠向量旧算法对照、退化/切线/并列/已伤害/死亡/极值、逐对反冲与视觉 RNG、单扫描机动读取复用及自定义 reader/recorder 回退。
- 本地 Playwright 不在项目 node_modules；使用已有 Codex 捆绑运行库的 NODE_PATH 定向重跑场景，没有安装依赖，没有打开可见窗口。
- 真实 LocalCombatKernel 固定种子 917、24 艘 web_zhuyuan/web_sc2_hyperion、60 tick 预热、180 tick 测量。前后每 tick 交错顺序，240 tick 的回放/RNG witness、隐藏火控、舰船/武器显示值严格相等，9 次完整权威帧字节严格相等。初始地形/公开策略相等，未减少舰船/弹丸/小行星，平均弹丸均为 169.67、P95 均为 326。

| 阶段 | 修改前 ms/步 | 修改后 ms/步 | 降低 |
|---|---:|---:|---:|
| 仿真均值 | 32.92 | 21.51 | 34.7% |
| 仿真 P95 | 42.98 | 29.11 | 32.3% |
| 仿真+显示采集+显示解码均值 | 45.63 | 34.37 | 24.7% |

显示采集/解码本轮没有优化，均值分别为 8.20→8.28 / 4.51→4.58 ms，未声称这些阶段改善。数字是一轮配对 Node CPU 测量，不含渲染、真实 Worker IPC、rAF 或网络，不换算为 FPS/TPS。最终仿真仍超过 16.7 ms，不能声称整场慢动作已完全修复；用户提供的高弹幕 Hyperion 镜像数据未冒充本轮实测。尚未进行实际多核/联机负载或原版实机验收。

产物：artifacts/simulation-terrain-perf-20261001/paired/result.json 与 visibility/verification.json。冻结前源码、CPU profile 及初始诊断均保留在同目录。

没有暂存、提交、推送、发布，也不触碰生涯改动。
