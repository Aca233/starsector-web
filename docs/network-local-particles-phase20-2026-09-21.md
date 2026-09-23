# Phase20：把两类火花的生成与运动交给客户端

日期：2026-09-21。承接 Phase19 同 tick 快照复用。本轮只实现已获同意的第一批纯表现卸载，不代表全部联机延迟问题解决。

## 1. 交付与启用情况

- 护甲受击火花（kind 0）和普通火花（kind 2）现在由每个显示客户端生成、推进和绘制，包括房主自己的显示客户端。
- 权威 Worker 不再为接受卸载的火花创建完整位置、速度、颜色、尺寸对象，不再逐步更新这些字段。它仍保留事件、标量寿命、密度占用和轻量顺序引用。
- 实际共享 LAN / Steam 的 `host.worker.ts` 默认开启，而非只写一个未调用的实现。启用条件为 `VITE_LAN_PARTICLE_RECIPES !== 'false' && VITE_LAN_LOCAL_PARTICLES !== 'false'`。
- `configureHostCosmetics` 的第四参数仍默认 false，以兼容旧测试与离线调用；真实 Worker 显式传入上述启用值。不要据此误判生产路径未启用。
- 紧急构建回退：`VITE_LAN_LOCAL_PARTICLES=false`；已有 `VITE_LAN_PARTICLE_RECIPES=false` 也关闭本轮功能。这是构建配置，不是运行时自动更新。
- 日志新增 `hud.input.localParticles`，记录 groups、particles、generated、advances、step，方便确认实战是否走到该路径。
- 未改 AI、碰撞、伤害、武器/弹药、EMP、爆炸生命周期或结算权威，未改模拟频率、网络信用或系统网络设置。

## 2. 原版证据与保持不变的约束

编码前记录见 `docs/network-local-particles-source-notes-2026-09-21.md`：

- 原版 0.98a `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/EmitterFactory.java:263-276`。
- `../decompiled/fs.common_obf/com/fs/graphics/particle/BaseParticle.java:30-70`。
- `../decompiled/fs.common_obf/com/fs/graphics/particle/SmoothParticle.java:24-62`。
- 与当前 Web `ArmorImpactVisuals.ts` 的护甲粒子参数交叉核对。普通 SPARK 是既有 Web 扩展，本轮不新增“原版等价”的承诺。

核心约束：

1. 原视觉 RNG 消耗严格保留：护甲低伤害概率分支加每粒子 5 次，普通火花每粒子 9 次；客户端使用私有 RNG 重建，不污染游戏状态。
2. 虚拟粒子仍计入原密度预算。不会因房主数组变小而额外产生效果或改变后续随机序列。
3. 用轻量统一 slot 顺序模拟原 `fastRemoveAt` 的交换删除；更新后恢复真实粒子的原有相对顺序。否则原生烟雾的 source-over 混合会产生视觉变化。
4. 不支持的时间步长（非 1/60）按原统一顺序物化虚拟粒子，再走旧路径；清空 epoch 防止客户端重复绘制，此 FX 实例不再继续卸载。
5. 不支持的自定义 RNG / 向量 / update、参数或预算超限回到原生成路径，不丢效果。此约束针对原生对象图，并非对任意修改私有对象的安全沙箱。
6. 爆炸、烟雾发生器、碎片不在本轮卸载范围。尤其 `CombatEngine.isBattleResultReady` 所依赖的舰船爆炸生命周期保持原路径。
7. 无活跃事件时不额外扫描原生粒子数组。

## 3. 传输与客户端行为

- 新增有界 v1 `particleEvents` 窗口，包含 epoch、当前 step、latest 和 `[eventId, birthStep, recipe]` 事件行。
- 单窗限制 128 组、2048 粒子预算、64 步回放。客户端历史留存最多双倍组/粒子预算，显示外推最多 15 步。
- 完整帧还原、relay 投影校验和本地接收共同验证格式。仅 kind 0/2 可进入此版本。
- 同 build 握手已有的 LAN / Steam 版本隔离继续生效。新客户端可接收不带此字段的旧帧；不承诺旧客户端可混入新 build。
- 客户端处理重复、旧窗口、迟加入、回退与重置；复制事件模板所有权，防止之后的调用方修改影响重建。
- 暂停/启动时连续 baseline reset 复用已生成组，真正年龄回退才重建，避免每 RAF 重建一整批粒子。
- 使用独立弱引用表现层接入真实 `WebGLFXPass`，不改引擎粒子数组、伤害或 RNG。
- 发布脚本按 esbuild 依赖图收集共享 `.mjs`，新校验器可被依赖图覆盖。本轮仅检查脚本，未执行打包或发布。

## 4. 局部同源 A/B 性能探针

证据：`artifacts/network-stream-20260921/phase20/paired-particle-perf-production.json`。

同一冻结 bundle 内交替执行开关两条路径：固定 seed 917、真实 2 舰世界，注入持续火花负载，平均 472.8 个存活粒子；预热 120 步、计时 480 步。包含实际 FX 更新、完整战斗快照采集、二进制编码，以及客户端解码、生产 `applyCombatSnapshots(..., {nativeTargeting:true})` 还原与本地重放。

**不执行物理推进、渲染或真实网络；不是整局 FPS / Hz / ping 测试。**

| 单步平均项目 | 旧路径 | 本地事件路径 |
| --- | ---: | ---: |
| FX 生成/更新 | 0.162 ms | 0.052 ms |
| 完整快照采集 | 3.258 ms | 0.322 ms |
| 编码 | 0.536 ms | 0.281 ms |
| 上述权威侧合计 | 3.957 ms | 0.655 ms |
| 客户端解码/还原/重放 | 3.255 ms | 0.695 ms |
| 帧字节数 | 29,009 | 24,535 |
| 房主完整粒子对象数 | 472.8 | 0 |
| 房主虚拟粒子占用数 | 0 | 472.8 |

在这一特定粒子负载探针中，权威侧相关工作均值降低约 83.4%，帧大小降低约 15.4%。最大收益来自避免重复采集/还原完整粒子状态，不是“游戏物理快 83%”或“网络延迟降 83%”。客户端也受益于增量重放而非每个完整状态重复还原粒子。

全部 600 步的视觉 RNG 和重建粒子字段一致；加法粒子数组顺序不在此字段比较范围内，烟雾顺序另有逻辑与像素测试。冻结 bundle、sourcemap 和源文件 SHA 存于 `particle-perf-production.mjs*`，收尾时依赖图与当前工作区哈希一致。浏览器整图未做同样冻结，不能把局部探针当作整局浏览器 A/B。

## 5. 画面与逻辑验收

实际生产 WebGL 渲染器，混合原生爆炸/烟雾和本地火花，RTX 5060 / D3D11，无头隔离浏览器：

- tick 0、7、20、35、59、65 共 6 个时刻，**差异像素均为 0，最大通道差均为 0**。
- 附带检查实际画出了本地粒子，不以空画布通过验收。
- 证据：`phase20/webgl/result.json`、`ordinary.png`、`offloaded.png`。
- 这是新旧 Web 路径的画面一致性，不是与原版实机的截图等价验证。原版实机补验仍待许可；没有操作桌面/占用用户键鼠。

最终测试门禁：

| 门禁 | 结果 |
| --- | --- |
| `npm run network:check` | 442 网络 + 5 武器表现 + 35 本地预测 + 15 新粒子测试通过 |
| `npm run network:check:shared` | 22 原生采集 + 11 codec/投影 + 真实多传输 authority Worker 验证 + 87 管线测试通过 |
| Steam 测试 | 342/342 通过（本地协议/模型测试，不是真实 Valve 网络） |
| TypeScript | exit 0 |
| 本轮选中文件 Oxlint | exit 0 |
| 真实 WebGL 对照 | 6/6 零像素差 |

shared 门禁运行在最后的小型“暂停复用”和回退开关联动修正之前；最终 network、类型检查及浏览器验证覆盖这些修正，不虚称所有门禁都在同一时刻执行。

15 个新增测试覆盖 RNG/字段/寿命、密度、烟雾顺序、预算回退、clear/旧格式、非原步长物化、自定义对象回退、重复乱序/迟加入、校验事务性、真实快照/codec/relay/restore、真实引擎伤害与结算、Steam binary/legacy、空闲原生路径、帧间推进及暂停 reset 复用。

## 6. 实际多人链路验证及未解决的问题

均为**一台机器上隔离的无头客户端 + 实际 Worker/LanBattle/desktop helper/WebGL，经 loopback 连接**，不是异地 Steam / n2n 实测。每组统计窗口 8 秒，输入 P95 为日志中的确认耗时指标，不等同于网络 ping，也不等同于本地预测响应耗时。

| 场景 | 物理模拟 | 客机完整状态接收率中位数 | 客机输入确认 P95 |
| --- | ---: | --- | --- |
| 3 人 / 3 舰，测试启动火花 fixture | 59.946 Hz | 60 / 59 Hz | 17.631 / 18.637 ms |
| 5 人 / 5 舰，测试启动火花 fixture | 59.924 Hz | 均 60 Hz | 15.419 / 12.669 / 16.945 / 14.606 ms |
| 5 人 / 22 舰（17 AI），自然战斗无 fixture | 59.873 Hz | 33 / 31 / 30 / 32 Hz | 115.079 / 115.844 / 156.640 / 127.113 ms |

- fixture 仅在测试 Vite transform 显式设置 `MULTIPLAYER_PARTICLE_FIXTURE=true` 时注入一次 60 火花，不写入生产初始化逻辑。3/5 人轻载验证每个座位 `generated > 0`。
- 最终 5 人轻载的累计生成约 61–62；早期 3 人结果在暂停 reset 修正前，曾重复生成约 1500，保留原始记录，不用它宣称修正后的生成开销。
- 自然 22 舰战斗也在所有客户端观察到本地粒子生成（约 3755–3943），证明不依赖测试注入。
- 三组均无测试失败/页面错误。房主主线程阻塞 800 ms 的中间 450 ms 仍分别有 27 / 27 / 17 个实际发布包，客机 ACK 前进；强制重连均留在同一场比赛且权威 tick 继续前进。
- **重载客机没有达到完整状态 60Hz，输入确认仍达 115–157ms。** 表中接近 60Hz 的是权威物理模拟，不能拿它替代客机接收率或延迟。
- 多人数据仅证明当前整链路可运行并暴露剩余瓶颈；没有冻结同源的多人开关 A/B，且工作区存在其他引擎 WIP，不能把整体数值改善归因于本轮粒子改造。
- 下一步应针对重载输入确认/控制队列和完整状态采集、分发、应用持续测量，不宜直接让客机裁决伤害或随意降低模拟速度。

## 7. 可复跑入口、失败记录与工作区边界

- 新逻辑测试：`node scripts/check-local-particle-events.mjs`。
- WebGL 对照：`node scripts/check-local-particle-events-browser.mjs`。
- 冻结性能探针：`node artifacts/network-stream-20260921/phase20/particle-perf-production.mjs`。它会写通用 `paired-particle-perf.json`；本报告对应的归档为 `paired-particle-perf-production.json`。
- 多人：`scripts/check-normal-multiplayer-browser.mjs`；设置 `MULTIPLAYER_PLAYERS`、`MULTIPLAYER_AI`、`MULTIPLAYER_MS=8000`、`MULTIPLAYER_RECONNECT=true` 和独立 `MULTIPLAYER_OUT`。轻载设 AI=0 并启用 fixture；重载 5 人设 AI=17 且不要启用 fixture。
- 修复过程保留失败记录：早期普通火花 RNG 计数少算；WebGL 初始测试缺 build ID；混合烟雾顺序导致最大 10/255 通道差。分别通过修正 RNG、隔离测试配置、统一 slot 顺序解决，未删除失败日志或放宽像素验收。
- 本轮文件列表与 SHA 见 `phase20/source-manifest.json`；门禁证据索引见 `phase20/gates-final.json`。已有文件以 Phase20 `.before` 备份为审阅基准，不能把整个 HEAD diff 当作本轮改动。
- 未触碰本轮范围以外的 AI/fire-control、CombatEngine 或生涯 WIP，未暂存、提交、推送、打包、发布，也未更新用户已安装的游戏。现有改动全部保留。
