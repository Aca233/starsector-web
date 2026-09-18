# BattleOnline 对 Web 联机优化的参考价值

日期：2026-09-18。性质：静态架构审查，不是原版 Mod 与 Web 的性能实测。

## 范围与结论

检查了 `C:/Program Files (x86)/Starsector/mods/BattleOnline/mod_info.json` 指定的当前 `jars/BattleOnline.jar`（0.2.5-P3），不是 `jars/old` 中的历史版本。用 CFR 0.152 反编译，关键序列号判断另用 javap 字节码核对；没有运行 Mod/DLL、读取 player_data.json、修改 Mod 或重启游戏服务。

反编译结果位于 `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled`。下文 Java 行号均指这份本地结果，不是作者原始源码行号。反编译时不完整的原版依赖及未做运行实验，限制了对实际表现的判断。

**有参考价值，主要是按舰归属分摊 AI、显式精简的同步字段、舰船配置与动态状态分离，以及远端开火的本地重现。不是换成 UDP 就能修好慢模拟，也不能整套直接搬入。**

作者使用说明允许其他 Mod 作者参考源码，并允许修改为 SubMod；这不等同于证明任意跨项目源码再发布都采用标准宽松许可证。本次只提取架构观察，不向 Web 运行源码复制作者实现。

## 1. 实际架构

### 1.1 房主维护房间，战斗状态全互联 UDP

- `BOConnectManager.sendMessageToAll` 遍历所有 peer 并直接向其 IP/端口发包，不经过房主统一中转。
- 房主负责入房、心跳、玩家名单与地址发现；不能因此称房主拥有全部战斗计算权。
- `BOConnector` 使用 DatagramSocket；接收缓冲为 1048 字节。状态批包按约 1024 字节拆分，单舰记录超过限制会抛错，不会自动拆成实体分片。
- 专用线程收 UDP，房间线程处理控制消息；战斗发送由 `advance()` 调用线程同步执行，不是独立发送 Worker。
- 每人负责自己的流量 R 时，对 N 人发送需复制 N−1 份。固定总战场原始状态量 S 时，总状态发送量约为 (N−1)S；只有固定每人舰队、增加人数时才能描述为 O(N²)。

证据：
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/connect/BOConnectManager.java:67–129`
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/connect/BOConnector.java:28–51`
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/connect/BOGlobalProcessor.java:157–310`

对我们：保留轻量中继也能采用同样的精简状态设计。浏览器不能直接使用任意 UDP socket；WebRTC 或桌面 UDP 是另一个传输改造，不应与模拟优化捆绑。

### 1.2 每个客户端负责自己登记的舰船，不是一个人计算所有 AI

- 用 `myShipMap` / `otherShipMap` 区分本地登记舰船与远端副本；实体 ID 包含所属玩家。
- 本地新舰根据 `BoSpawnedFrom`、`BoFollowHost` 等标记决定归属，发送自己的舰船状态。
- 收到远端舰船的生成信息后创建原版舰船对象，安装空 AI，并清空武器组自动火控插件。
- 远端仍有原版实体、引擎运动、武器、弹体等本地推进，不代表整场物理成本按玩家数平均除掉。
- 这也不是自动按 CPU 负载平衡：若多数 AI 舰都归房主，房主仍承担多数决策。

证据：
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/combat/BOCombatSynchronizer.java:902–946,2421–2464,2704–2726`
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/combat/BOCombatUtils.java:169–174`
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/combat/BOEmptyAI.java:19–40`

### 1.3 明确字段的二进制状态，不是递归打包整棵对象树

动态舰船记录包含位置、角度、速度、角速度、存活/玩家舰标志、目标、HP、幅能/护盾、引擎状态、系统状态、炮塔角和开火状态。它仍会周期性发送这些状态，不应称为完整跨帧增量协议。

- 位置等使用 float32；炮塔角与开火/禁用标志压入 16 位，其中角度 14 位。
- 船型、武器等使用各端本地排序生成的小整数 ID；舰体配置在生成消息中传，不是每次动态状态都重新发送。
- 字段顺序明确，但包含变长部分，并非每船/每包固定字节数。
- ID 映射依赖两端装载相同内容，不能替代我们现有的版本校验或配装 revision。

证据：
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/combat/BOCombatSynchronizer.java:1368–1520,1734–1829`
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/loading/BOIDMaps.java:99–213`

### 1.4 默认本地重现开火和弹体，不精确同步所有小实体

`settings.json` 中 accurate_sync_missiles / accurate_sync_ballistics / accurate_sync_fighters 默认均为 false。远端收到武器开火状态后调用 `setForceFireOneFrame(true)`，由本机原版引擎生成和推进相关对象。

这主要是“开火状态 + 本地重现”，不是带全局事件 ID、确定性随机种子及 exactly-once 保证的开火事件日志；也不是确定性锁步。开启精确同步后，代码会追踪、生成并纠正相应小实体，其 CPU/流量代价随之增加。

默认 combat_sync_frame_interval=1 是每次战斗 advance 的帧间隔，并不保证每秒 60 次，更不保证对端有效收到 60 次。

证据：
- `C:/Program Files (x86)/Starsector/mods/BattleOnline/settings.json`
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/combat/BOCombatPlugin.java:44–83`
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/combat/BOCombatSynchronizer.java:549–578,2468–2498`
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/combat/BOCombatUtils.java:335–337`

## 2. 不能照搬的代价与问题

1. **结果一致性是妥协，不是完全解决。** 接收方写入远端 HP；若远端副本已死、所属端却仍报告存活，会发 reminder kill，接收者据此杀死自己的船。未见此路径同步完整装甲网格。不能移植成“每个人独立决定命中和死亡”。证据：同步器 379–405、1047–1054。
2. **同批次多包序列号有静态可确认的冲突。** 发送一批舰船时只取一次 serial，并在约 1 KiB 处分包；同发送者同类型的接收 counter 在首包更新，后续同 serial 的 `isNewer` 为 false，因此这些包里的位姿等字段不应用。并非整包完全丢弃：开火等未受此标志保护的逻辑仍能执行。大规模分包不能照抄。证据：同步器 1830–1924、329–405；`C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/connect/BOSequence.java:22–32`（已核对字节码）。未做原版运行复现。
3. **只有专用消息补偿，不是通用可靠 UDP。** 未知舰船请求生成；移除通知有 ACK，但 ACK 按玩家清掉当前待确认集合，不关联具体事件批次。没有完整的可靠有序事件流。证据：同步器 408–410、1022–1044。
4. **控制线程存在忙循环。** 全局线程不停调用 advance；未连接时不停尝试 JOIN，未见此路径的重试退避。不要把它当作高性能线程模型。证据：`C:/Program Files (x86)/Starsector/starsector-web/artifacts/battleonline-inspection/decompiled/fw/battleonline/connect/BOGlobalProcessor.java:64–108,415–418`。
5. **断线不是接管。** 对方退出战斗或连接丢失会清理其舰船；未实现无缝权威迁移。证据：同步器 2612–2658。使用说明也不推荐战斗中途重入。
6. **可信局域网原型边界。** 接收器未保留实际源地址，身份取自包内字段；未见会话认证/消息认证。不能替代我们的权限、输入约束和版本校验。
7. **原版引擎及玩法有差异。** Mod 使用原版 Java 引擎、取消联机暂停、改变时流处理并移除部分残骸；阵营映射中有原版 0/1 阵营翻转。不能直接证明 Web 百舰性能，也不能以此替换现有三队/个人战模型。

`BOMessageBuilder` 文本拼接和部分标为 Deprecated 的同步函数不在当前主调用路径；没有用这些遗留代码推断现用协议。

## 3. 与现有 Web 实现的准确对照

| 项目 | 当前 Web | BattleOnline 可参考之处 |
|---|---|---|
| 权威计算 | 房主一个 Worker 推进全场 AI、舰船与战斗物理 | 舰船归属明确、远端关闭 AI，提示应研究分摊决策 |
| 快照生产 | 捕获和编码与模拟共用 Worker | 显式字段可减少递归捕获、分配与编码工作 |
| 客端 | 主线程解码/apply/渲染；房主也走展示副本 | 更轻的记录可以减少复制链路成本 |
| 静态配置 | 已排除很多 spec，但 craftSpecs 仍随帧组表发送 | 将动态实体配置做可靠登记与 revision 缓存 |
| 数据压缩 | MessagePack、帧内 layouts/$record/$records | 不是还没二进制化；下一步是减少数据与遍历，不是再换编码名字 |
| 本地效果 | 已有本地尾迹、炮口粒子事件 | 不是重新实现尾迹；评估弹体外观本地推进与纠正 |
| 服务器 | 解码/校验/摘要后复用原包转发，不算战斗物理 | 主要收益目标是房主与复制成本，不是凭空卸载服务器物理 |

Web 证据：
- `C:/Program Files (x86)/Starsector/starsector-web/src/network/host.worker.ts:83–117,188–244,269–272`
- `C:/Program Files (x86)/Starsector/starsector-web/src/network/CombatSnapshot.ts:8–109,268–321,375–400`
- `C:/Program Files (x86)/Starsector/starsector-web/src/network/LanBattle.tsx:399–464,653–705`
- `C:/Program Files (x86)/Starsector/starsector-web/server/lan-server.mjs:425–426,966–983`
- `C:/Program Files (x86)/Starsector/starsector-web/src/network/HostMuzzleEvents.ts:49–78`

Web 快照档位当前为 2/5/10/20Hz，还受模拟余量、快照成本、上行拥塞与消费确认制约；模拟步长仍是 1/60。增加发送次数本身不会增加模拟吞吐。证据：`C:/Program Files (x86)/Starsector/starsector-web/src/network/SnapshotPolicy.ts:19–40`。

## 4. 建议采用的改造顺序（尚未实施）

### A. 先精简复制层，不改变战斗规则

- 为舰船/武器/战机/弹体定义明确的展示字段；保留原有数值精度，不能顺便默默量化。
- 配置登记与动态状态分离：新增可靠定义消息、实体 generation、配装 revision、缺失定义请求及重连完整状态。
- 定义包与生命周期事件可靠到达；可替换动态状态允许合并。跨帧增量必须明确 baseline、丢帧恢复和关键帧，不能直接依赖上一收到的任意帧。
- 房间校验、三队/FFA、配装/战术 UI、模块、战机及重连行为保持。

收益目标：减少捕获/编码/解码/apply及传输；捕获编码与物理共线程，所以能释放模拟时间，但不直接减少 AI 与碰撞算法成本。

### B. 扩大本地表现，不分散命中裁决

- 尾迹/炮口本地化已有，不重复算作新成果。
- 对适合的弹体，用唯一 ID、出生 tick、初始位置/速度及必要随机信息在本地推进外观；命中/消失以权威结果纠正。
- 导弹转向、光束端点、战机与复杂战术系统不能一概按直线弹处理。
- 粒子和弹体外观可以局部不一致，伤害、装甲、幅能、死亡不可以各端说了算。

收益目标：减少复制量和权威纯视觉工作；不会自动消除权威命中计算。

### C. 真正慢模拟另走计算拆分路径

- 借鉴按舰归属，但首先把可独立的 AI/火控决策任务拆出；跨舰碰撞、命中、伤害仍有唯一裁决者。
- 同机多 Worker 可先验证；再评估让其他客户端承担有明确输入/输出的计算任务，不能假定远端机器无限快或可信。
- 任务携带 tick、实体 generation、控制权 epoch；迟到结果拒绝，断线有接管，不能把过时决策套到新状态。
- 当前展示快照排除了部分 AI/RNG 状态，不是可精确续算或迁移的权威检查点。
- 现有单机实验性 AI owners 不等于 LAN 已支持全舰种分摊，接入前需单独验证。

## 5. 验证标准与当前状态

不承诺读完 Mod 就能给出性能百分比。后续每项改造应在固定舰船/配装/种子条件下，分别测：权威单步耗时及真实时间倍率、捕获/编码、relay/解码/apply、实际收包率、渲染长帧，并验证伤害与实体生命周期不变。

上一轮小规模与百舰诊断不能混为一谈：小规模样例接近实时，并不证明用户那场卡顿已定位；百舰样例仍过载。原版 Mod 的默认低精度小实体同步，也不能当作相同规则下的公平性能对照。

本轮只新增本报告和本地反编译检查材料，未修改 Web 运行代码、现有测试、Mod 或正在运行的服务。方案中的改造尚未实现，更未部署到 3005。