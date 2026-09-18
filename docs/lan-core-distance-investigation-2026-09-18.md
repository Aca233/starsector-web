# 当前房主计算采样与距离复用实验（2026-09-18）

## 结论

总目标仍未完成，32/100舰实时过载没有在本轮解决。本轮重新采样当前代码（含尾迹/枪口本地化），确认优先瓶颈仍是武器火控与AI。两种距离缓存均未通过性能门槛，未写入正式游戏源码，不发布实验构建，不以局部正确性冒充性能改善。上一轮为功能进展；本轮为重新采样及排除错误优化方向的证据进展。

3005（PID18988）和普通dist不动。没有修改物理dt、AI/伤害规则、舰船/特效数量、恢复预算、SnapshotPlayback或MotionPrediction。没有新增项目测试文件、测试运行器，也没有素材hash/size审计。所有诊断通过stdin/内存Vite模块执行，产物在忽略目录artifacts。

## 当前采样

冻结当前源图，seed2232494901，两真人守护者+98锤头，3200DP/初始1600DP；禁用权威连续尾迹并启用枪口事件。先推进60步，接着CDP以500µs间隔采样900个固定步，不绘制、不走网络。

带采样平均步时21.931ms、采样总墙钟约19.866秒。带Profiler计时有开销，不能直接与未采样成绩作优化百分比比较。

累计调用树（包含子调用，不能把嵌套项相加）：Ship.update约8316ms、ShipWeaponControlSystem.update约7414ms、updateShipAI约7045ms、AutofireController.aim约3247ms、preAim约1898ms、planFleetAI约1348ms。distanceTo自耗时合计约1330ms，其中preAim约491ms，舰队规划各分支约419ms。网络/渲染不参与该诊断，所以这部分不是RTT或中继延迟。

## 被拒绝的实验

1. WeakMap按向量对保存原生Math.hypot结果，每次仍读取方法及最新坐标，只在dx/dy Object.is完全相同时复用；未知距离方法或Math.hypot钩子继续原路径。
2. 以Readiness序号直接定位有界Float64Array，省去嵌套WeakMap查找；容量最多256个单位。每个格子仍按精确dx/dy验证，零初始化格子只代表hypot(+0,+0)=+0，换单位、移动和重入不能命中不同输入。该版本计时中显式变化坐标，不只测静止世界热缓存。

两者都不量化、不换sqrt公式、不改变候选/顺序/更新频率。保护与数据访问成本抵消了少算hypot的好处。第一版连重复静态调用都较慢；第二版也较慢，不继续堆缓存。

| 方案 | 舰数 | 原规划ms/次 | 新规划ms/次 | 原模拟ms/步 | 新模拟ms/步 |
| --- | ---: | ---: | ---: | ---: | ---: |
| WeakMap | 32 | 0.2332 | 0.2497 | 4.6929 | 4.6394 |
| WeakMap | 100 | 1.4695 | 1.6567 | 18.7000 | 18.8037 |
| numeric | 32 | 0.3158 | 0.3533 | 5.1229 | 5.1074 |
| numeric | 100 | 1.6652 | 1.7903 | 17.9901 | 18.2008 |

局部每项预热2轮、6轮交替先后、每轮100次调用。完整模拟同场景新/旧世界逐步交错，排除前60步预热；共享机器负载仍是未控制因素，不能用32舰约1%的单次差异覆盖局部退化及100舰无收益。这里不是生产联机FPS比较。

## 正确性与边界

每种方案40005项数值/钩子检查通过：移动、重复读取、正负零、NaN/Infinity、极大/极小值、自定义distanceTo/Math.hypot仍逐次执行且this一致、缓存命中也不跳过坐标getter读取顺序。

每版32/100舰各900步，每30步比较完整表现快照与模拟/视觉RNG，分别60个检查点一致。不是所有私有状态、所有扩展或所有种子的形式化证明。候选没有通过性能门槛，因此没有花费新的生产构建/双端部署验收，也没有声称它们可交付。

## 后续依据

现有原生多核OwnershipPool只支持受限默认攻势场景，明确拒绝externallyControlledShipIds及非对应系统/舰体；不能简单在LAN里打开开关就声称已支持百舰多核。之前完整保护版索敌格网也曾退化，见lan-acquisition-investigation-2026-09-18.md，不能重复照搬。

更值得继续定位的是火控候选枚举本身及其有效性检查成本：原生aim+preAim累计占显著模拟时间，应先证明更便宜的保守筛选/共享阶段边界，保留原候选顺序、回调语义和每步真实运动。未实现的方案不当作成果。

## 证据

- artifacts/lan-core-profile-sources.json、lan-core-current.cpuprofile、lan-core-current.json
- artifacts/lan-distance-candidate-sources.json、lan-distance-experiment.json（WeakMap实验，非正式）
- artifacts/lan-fleet-distance-candidate-sources.json、lan-fleet-distance-experiment.json（数组实验，非正式）
- artifacts/lan-core-distance-disposition.json

正式FleetTactics.ts与本轮开始的冻结原文相同，两种实验辅助文件均未加入src。诊断子进程/Vite/浏览器已结束。
