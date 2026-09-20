# 跨玩家分摊战斗计算：GitHub 调研（2026-09-20）

## 结论与范围
用户希望服务器尽量只中转，又不让每位玩家完整重算战场。本轮只查询公开GitHub仓库的README、许可证、源码和官方仓库内文档，并检查本项目已有AI Worker接口；没有安装运行第三方项目、复制第三方实现、部署或切换现有房间。之前下载的stdlib npm包仍仅在artifacts中，未加入package.json/package-lock.json。

关键区别：
- 确定性帧同步/回滚：主要传输入，但每个参与模拟的客户端通常仍运行完整世界。回滚还可能增加重算。
- 分布式权威：客户端各管一部分对象/任务，必须同步中间结果、状态与所有权，不能只发按键。相同输入相同输出并不能独自解决不同对象之间的交互。
- 多线程：一台电脑的CPU内核间分工，不等于多台电脑分工；SharedArrayBuffer不能通过公网共享。

找到可参考实现，但没有发现一个经本轮验证、可以直接替换现有引擎、且保证32舰密集交战跨浏览器分摊后更快的开箱方案。最难部分仍是跨拥有者的碰撞、命中、范围伤害、同帧销毁与离线接管。

## 仓库与已核实证据

### 1. Edyn — 分组物理 / 网络状态处理，MIT
- https://github.com/xissburg/edyn
- 主分支查询SHA：e1d9820a388fecfa175ca52bab4cf9c56d49c2c6；本轮未归档。
- README声明目标含多线程、网络化/分布式物理；实现基于C++17、EnTT ECS，网络部分是客户端-服务器模式，包含抖动缓冲和客户端后台外推。
- [Design / Simulation Islands](https://github.com/xissburg/edyn/blob/e1d9820a388fecfa175ca52bab4cf9c56d49c2c6/docs/Design.md#simulation-islands)说明按约束连接关系分岛，互相不能立即影响的动态物体才适合独立推进。此处岛屿并行机制不能直接当成跨公网高效负载分担证明。
- server_side.cpp包括entity_owner、client快照导入和岛屿处理。能借鉴归属、分组和快照处理，不能把其C++刚体代码直接塞进当前TypeScript舰船/护盾/武器引擎。
- 本轮没有验证其浏览器/WASM移植或密集弹幕性能；不将项目目标宣传当成现成Web能力。

### 2. Unity Netcode for GameObjects + Distributed Authority Social Hub — 归属与迁移参考
- https://github.com/Unity-Technologies/com.unity.netcode.gameobjects
- https://github.com/Unity-Technologies/com.unity.multiplayer.samples.bitesize/tree/main/Basic/DistributedAuthoritySocialHub
- Netcode查询SHA：47bd4345d582361cb3958aaf57dfc45417d0fcae。
- Social Hub README列出NetworkObject自动分配、所有权转移、Session owner迁移；示例中捡起物体会转移authority。
- [官方架构文档](https://github.com/Unity-Technologies/com.unity.netcode.gameobjects/blob/47bd4345d582361cb3958aaf57dfc45417d0fcae/com.unity.netcode.gameobjects/Documentation~/terms-concepts/distributed-authority.md)明确：通常不适合需要精确预测运动的高性能竞技游戏；对象authority分散后通常没有统一物理模拟，玩法物理要另作设计；客户端更受信任，作弊面更大。
- NetworkRigidbody通过让非authority对象kinematic来同步显示，不是保证所有电脑对跨所有者碰撞作出完全相同的物理解算。
- 有官方WebGL + WebSocket接入说明，但依赖Unity运行时/Multiplayer服务生态，不能等同于现有纯TS网页项目可直接使用。
- **Netcode和本示例为Unity Companion License（Unity-dependent projects），不是MIT。这里只参考公开设计，不往非Unity项目复制其代码。**

### 3. Networked-AFrame — 浏览器对象同步/所有权，MIT
- https://github.com/networked-aframe/networked-aframe
- 查询SHA：13c9795194e8cbbb41c7e01f45f9302d1769cf9d。
- 浏览器JS库，WebRTC/WebSocket适配、差异同步、任意A-Frame组件同步。
- src/components/networked.js有takeOwnership及ownership-gained/changed/lost事件；examples/ownership-transfer.html提供所有权示例。
- 对当前项目最有用的是对象owner、迁移事件和非owner插值的组织方式；但A-Frame是另一套前端/ECS，需要改接。该库没有替当前舰队引擎解决跨拥有者碰撞和统一伤害。

### 4. stdlib 数学实现 — 解决当前数值一致性阻碍，Apache-2.0（另保留文件内来源许可）
- https://github.com/stdlib-js/stdlib
- 具体sin实现：https://github.com/stdlib-js/math-base-special-sin/blob/main/lib/main.js
- 实际读取了index.js/main.js：本包index指向JS main；sin实现来自FreeBSD/Sun数学算法的JavaScript改写，包含kernelSin/kernelCos/rempio2，不只是包装Math.sin。
- 可作为统一sin/cos/atan2等实现的候选；应固定版本、检查整条依赖链及实际导出，防止另一入口或依赖选择native路径。不得未经验证就宣称所有运行时bit-identical。
- 本项目已复现的跨Node/浏览器差异与这类工作相关。但修好数学只服务确定性，不自动实现分摊计算。

### 5. Rapier — 确定性物理参考，Apache-2.0
- https://github.com/dimforge/rapier/tree/master/typescript
- 旧https://github.com/dimforge/rapier.js 已归档且README明确迁入上述typescript目录，不应优先采用旧仓库。
- 查询SHA：28d0ba929b460597f0959fe600c7afd65612f6f9。
- [determinism文档](https://github.com/dimforge/rapier/blob/28d0ba929b460597f0959fe600c7afd65612f6f9/website/docs/user_guides/templates/determinism.mdx)称其WASM/JS版本在同版本、同初始条件、同增删顺序/步数下跨平台确定；同时明确警告外部Math.sin/cos不保证跨平台一致，会破坏初始化条件。
- 不能推导“把碰撞换成Rapier就让本项目AI/伤害/技能/所有数学确定”。替换会影响原版碰撞和舰船规则，需要独立移植与对照，不推荐仅为联机推倒现有物理。

### 6. GGRS — 回滚参考，不是负载分担，MIT OR Apache-2.0
- https://github.com/gschup/ggrs
- Rust GGPO式回滚；有WASM+Matchbox/WebRTC路线。README当前说明托管匹配演示服务离线，不能把演示链接当成可用线上服务。
- 适合参考输入预测、存档/读档、回滚和同步测试，不会自动让每位玩家少算几艘船。重算可能提高CPU需求，当前更不能直接拿呈现快照当完整rollback存档。

### 7. geckos.io / Colyseus — 传输和房间框架，不能解算力分工
- https://github.com/geckosio/geckos.io — BSD-3-Clause，浏览器/Node WebRTC数据传输，可研究时效性数据通道；并不自动分配AI或处理分布式碰撞。公开文档要求考虑服务器公网地址及UDP端口，当前只有私有WebSocket测试入口，不能保证直接替换可达。
- https://github.com/colyseus/colyseus — MIT，Node房间框架；现有项目已具备房间、重连、权限和转发，不应为了“分担算力”先整体换框架。

## 对本项目的具体判断
已检查src/engine/ai/multicore/LanCombatMulticore.ts、Types.ts、OwnershipPool.ts：已有host-local纯AI提案分工、固定提交顺序、过期/依赖失效回退。Frame携带SharedArrayBuffer；OwnershipPool会Promise.all等待本步提案；LanCombatMulticore注释明确不是远端世界模拟。因此它能作为任务接口的设计基础，不能把Worker通信直接换成WebSocket就当完成。60Hz仅16.7ms预算，而一次真实网络往返可能已超过预算，远端同帧等待会拖慢而不是加速。

之前profile的约七成CPU属于物理+AI合计，不是七成都能外包的AI。分担收益必须重新细分测量，不能套用该比例估算。

## 建议的试验顺序（这是设计建议，尚未实现）
1. **先验证混合分担**：服务器只做房间/转发；一台较强客户端负责统一物理/命中/伤害，其他自愿参与的客户端只接可独立、能容忍延迟的AI任务；弱机只显示/操作，不加入每帧完成屏障。这样仍有较重的物理协调者，不冒充完全均匀分摊。
2. 不能为了跨网好算就悄悄降低现有AI频率/精度。先找真正可分离的任务并测量；如果必须同帧完成，则优先在协调者本机多核处理。每个任务必须带matchId/epoch/tick/worldRevision/taskId/owner/lease；过期或旧归属结果绝不提交，断线在本地兜底，不阻塞整局。
3. 若混合方案仍不满足需求，再做“局部战场归属”原型：远离且短期没有交互的组可由不同端运行；潜在跨组碰撞/弹丸/范围作用必须在确定的边界合并或统一裁决，再迁移完整状态。需要ghost边界/预警、迁移屏障、单写入者及完整内部状态，不能只搬位置血量。
4. 密集交战时互动图可能合并成一个大组，分摊收益下降甚至消失；不能承诺4个人固定每人算8艘。分布式拥有者信任玩家，不等于强反作弊服务器。

### 验收门槛
- 2/4参与端，16/32艘；分别测每端计算、协调者余量、序列化/上行下行字节、任务延迟、丢弃和本地重算成本、输入到可见反馈。
- 注入20/50/100ms RTT、丢包/乱序/断线/浏览器后台；慢端不拖住全场，迁移不重复命中/丢命中，不产生双owner或旧epoch提交。
- 开销必须小于搬走的工作；没有实测净收益就保留原路径。收益不得用合成HTTP延迟或光看服务器CPU代替。
- 若坚持“仅输入同步”，则应回到全员重算+确定性内核路线，接受每台机器完整模拟的成本。这与“各算一部分”是两种不同设计，不静默互换。

## 调研产物
原始README、许可证、源码片段和API元数据在artifacts/distributed-simulation-research-20260920。Unity/Edyn/Rapier等结论来自仓库当时可访问的内容，不是已跑过其完整示例。本轮未启动可见窗口、未操作桌面、未重启32120、未添加依赖或改动生产玩法。
