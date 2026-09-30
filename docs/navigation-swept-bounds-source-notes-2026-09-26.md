# 避碰扫掠范围预拒绝：来源与候选边界（2026-09-26）

## 原版证据 → 预期 → 差异 → 验证

重新读取本机0.98a-RC8的 decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEntityAPI.java:15–32（位置、速度、朝向、半径）与 starfarer_obf/com/fs/starfarer/combat/ai/movement/BasicEngineAI.java:16–65（desiredFacing/desiredHeading分离与避碰状态）。当前TacticalNavigation是显式Web策略，不冒充完整原版BasicShipAI。本轮不修改策略、8段积分、最多12次风险评估的候选集合、候选顺序、阈值、RNG、精度或UI；无原版实机/截图验收。

## 证据与计划

最新真实Worker CPU诊断 collisionRisk self65.144/inclusive83.164ms（60tick），仅说明值得检查；不是收益数字。不引入候选间/帧间位置缓存或对象池。原逻辑在每段的相对起点(rx,ry)、位移(dx,dy)上求t∈[0,1]，再排除最近点坐标超出rejectRadius的障碍。候选先检验同一坐标的两端是否都严格位于范围同一侧；若是，就可省去点积、除法和最近点计算。仍遍历全部原障碍，原来的精确计算/风险累加在其余分支逐字保留。

## 数值与可观测边界

IEEE754有限数下，乘以[0,1]再相加对参数单调；不能重组beforeX-o.x-o.vx*time等表达式。直接比较rx和rx+dx两端，严格不等式覆盖舍入边界；不以大epsilon改变风险。NaN端点比较为false；NaN t原来不贡献risk；Infinity/溢出与负半径须用旧实现对照。

在每段完成所有舰船/desired/stat读取之后检查max/min/abs/hypot仍是加载时核实过的原生函数；非原生时不提前拒绝。检查点之后只有内部Obstacle数字记录和这些无回调intrinsic操作，不跨下一次desired.length/getter复用资格。仍遵循项目既有非同realm恶意全局篡改沙箱边界，不削弱Worker权限/资格校验。

## 一次集中验证

既有simulation-hotpaths增加可选冻结前collisionRisk逐位对照与测试构建计数；覆盖相交/分离/掠边、signed zero、极大极小/非有限值、调用顺序与替换数学函数，以及实际avoidCollisions全部返回值。集中typecheck、改动文件oxlint、该既有场景，然后一次无profiler的200舰150+180步真实Worker串行配对；每tick显示/权威/隐藏火控/RNG一致。仅保留稳定收益，否则按本轮备份精确撤回并保留失败证据。

新基线320模块已包括其他任务新增GlorianaBuiltins内容（HullMods/GlorianaPack注册变更）；未覆盖其文件。前后臂用完整显式冻结源图，防并发修改混入。

## 已完成的集中检查

TypeScript一次通过（13964ms）；既有simulation-hotpaths一次通过（4020断言），新增1826合同。新增合同全部156584障碍段仍被访问，原精确求解156584次、候选53842次；这不是运行时速度比例。动态desired/stat读者顺序、替换max/min/abs/hypot回调、预测中途替换Math.max的逐段回退均与冻结前代码一致；有限/极值/非有限、ULP边界结果使用deepStrictEqual而非近似容差。

初次lint启动器把.cmd路径以正斜杠传给cmd，oxlint未启动；仅改用原生PowerShell路径定向运行lint，通过，没有重跑类型或场景。更早源文件修改脚本因CRLF与LF锚点不匹配，在写生产代码前assert停止；按原CRLF写出修复，未触发测试。两项均记录在工件，没有掩去失败记录。

正式配对前其他任务又修改GlorianaPack/HullMods/GlorianaBuiltins/GlorianaEdict。本轮生产候选仍只有TacticalNavigation.ts；前后两臂显式使用同一320模块基线，只替换该单一文件，工具hash检查无漂移。
