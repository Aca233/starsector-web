# 联机进一步优化空间：计数与数据审查

日期：2026-09-18。范围：在 BattleOnline 架构参考之后，核对当前 Web 实际可优化的位置。没有采用运行代码补丁，也未部署或重启用户游戏。

## 结论与优先级

还有可验证的空间，不应把所有精力继续放在通用编码器微调、增加插值或降低快照频率上。

| 优先项 | 具体目标 | 主要减少什么 | 证据强度 |
|---|---|---|---|
| A：模拟侧 | 预瞄/索敌中的重复候选访问及可共享查询输入 | 权威模拟 CPU | 冻结当前源的实际调用计数；尚无优化后耗时 |
| A：复制侧 | 第二份装甲、组件修复内部 tracker、弹丸模拟配置 | 捕获/分配/编码/解码/包体积 | 实现与消费者追踪；历史包实际字节归因 |
| B | 展示目标搜索、屏外舰体/炮塔提交、无更新帧的战损签名 | 客户端 CPU/提交量/长任务 | 静态调用路径确认；尚无局部耗时 |
| B | 静态星云捕获复用、弹丸视觉值表 | 捕获或带宽，视实现而定 | 不变量与重复值确认 |
| C | 解码/上行确认解耦、双端点批量还原 | 发布节奏与主线程任务 | 机制确认；需先量化发生频率 |
| C：架构 | 通用 AI 任务拆分、多 Worker 与跨客户端计算 | 权威 CPU 分担 | 当前限制确认；尚未实施 |

A 中两条是不同问题：精简复制可以释放共用模拟 Worker 的时间，但不能代替 AI/火控计算优化。客户端绘制优化也不能记成模拟吞吐增加。

## 1. 本轮实际调用计数：预瞄是明确的重复访问来源

方法：冻结当前 src 内 433 个 TS/TSX/MJS/JSON 文件，esbuild 生成原始及插入计数的隔离模块，用 Node 顺序运行。没有改项目源码、没有新增项目测试文件/运行器，也没有使用当前用户房间。

固定 seed 2232494901；两艘人控 guardian，其他为 hammerhead，8/32/100 舰；复用历史配装 fixture。按房主配置关闭权威尾迹，安装 HostMuzzleEvents，两名真人保持中立输入。每组运行启动后的 240 个 1/60 固定步，即 4 秒模拟时间。**这不是 4 秒墙钟测速，也不是完整交战期、浏览器 Worker 或真实网络验收。**

| 规模 | 炮座数 | aim 调用 | 实际索敌批次数 | 索敌遍历舰船条目 | preAim 调用 | 预瞄遍历舰船条目 |
|---|---:|---:|---:|---:|---:|---:|
| 8 | 90 | 18,240 | 3,427 | 27,416 | 16,071 | 92,160 |
| 32 | 282 | 64,320 | 12,209 | 390,688 | 57,461 | 1,105,920 |
| 100 | 826 | 194,880 | 37,700 | 3,770,000 | 180,266 | 9,984,000 |

百舰中，预瞄循环平均每步访问 41,600 个条目，约为普通索敌遍历量的 2.65 倍。它是无有效射击解时帮助炮塔提前转向的合法行为，**不能直接删掉或降频冒充优化**。各炮座位置、射界、目标和优先级也不同，不能整船强行共用一个瞄准解。

同一百舰窗口另有：canTarget 7,598,347 次，hasVastBulk 9,385,122 次，isPhased 10,603,718 次。计数只证明访问规模，不代表单次昂贵或对应 CPU 百分比。isPhased 涉及可变系统及外部回调，不能粗暴跨帧缓存；hasVastBulk 对受信任不可变 spec 才可能安全预计算。

候选方向：在原生、受控的同步阶段共享候选成员和不变元数据，减少同一炮座重复构建的查询输入；对不能改变结果的候选做保守提前排除。保留每炮几何、顺序、同分取舍、RNG 和回调语义。此前通用空间网格/距离缓存、端点标量化没有稳定收益，不把它们换名再称成果。

原始与计数版在每组最终检查点的完整展示投影、世界 RNG 和视觉 RNG 相同；没有验证所有中间内部状态。运行前后的冻结源无漂移。第一次计数误把友军射线循环标成 preAim，已单独保留并排除；上表来自定位修正后的重跑。两次构建配置尝试失败，未纳入数据。

证据：
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/lan-opportunity-audit-20260918/call-counts.json`
- 同目录 sources.json、original.mjs、counted-corrected.mjs 为冻结源与实际诊断模块。
- `C:/Program Files (x86)/Starsector/starsector-web/src/engine/ai/AutofireController.ts:232–256,258–301`
- `C:/Program Files (x86)/Starsector/starsector-web/src/engine/simulation/systems/ShipWeaponControlSystem.ts:358–362`
- `C:/Program Files (x86)/Starsector/starsector-web/src/engine/simulation/Ship.ts:109,669–673`

## 2. 明确多传的数据，比更换压缩算法更值得先处理

对历史 tick600 八舰样本离线复核：frame 本体 MessagePack 为 215,723 B，不含网络封装；含 90 个武器组件、50 个引擎组件、86 个弹丸；没有动态 craft 或战损贴花。

| 数据 | 字段值编码体量 | 确认与改造边界 |
|---|---:|---|
| damageDecals.armor | 14,872 B | 与主 ship.armor 重复；只裁战损对象私有引用，不能全局跳过 armor |
| 武器/引擎 healthTracker | 12,300 B | 140 个内部修复 tracker；显示使用健康/禁用/剩余时间，不需完整内部计时器 |
| 七类弹丸模拟字段 | 5,682 B | spawnLocation、sourceDamageMultiplier、三类 passThrough、mirv、proximityFuse；客端展示不执行权威命中/分裂 |
| 七类弹丸视觉配置值 | 11,046 B | 86 弹仅 5 种组合；需要显示，考虑值表，不是删除 |
| nebulaSystem 子树 | 8,745 B | 本轮场景的星云内容不随 update 变化；可以预构建捕获投影 |

**这是字段值体量，不含共享 layout 与父字段开销，不是实施后的净节省量，更不能乘成 CPU 提速百分比。**

关键根因：TS private 字段仍可枚举；pack 只避免祖先循环，并不去重非循环共享引用。因此 damageDecals 的私有 armor 又被完整展开，cells Map 与 marks 数组中共享的贴花也会再次展开。该样本贴花为空，不能据此量化战损密集时的更多冗余。

应在按类型/路径的展示投影入口避免遍历，而不是先完整 pack 再删字段。组件实际对象和权威模拟不变；保留主装甲、marks/revision/suppressed、故障显示和修复时间。弹丸的 hitpoints/flightTimeRemaining 仍影响发动机显示，不能泛化成“物理字段全部删除”。

弹丸视觉值表优先做单快照自包含字典，保持重连/丢帧可恢复；不能仅按 specId 缓存，EMP 等效果会修改导弹发动机视觉配置。静态星云缓存不能携带前一帧的 layout ID；若只复用捕获而继续随包发送，省的是捕获 CPU，不是流量。

证据：
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/lan-opportunity-audit-20260918/payload-attribution.json`
- `C:/Program Files (x86)/Starsector/starsector-web/artifacts/lan-binary-cpu-local/frame-8-t600.json`
- `C:/Program Files (x86)/Starsector/starsector-web/src/engine/simulation/ShipDamageState.ts:32–55`
- `C:/Program Files (x86)/Starsector/starsector-web/src/network/CombatSnapshot.ts:64–109`
- `C:/Program Files (x86)/Starsector/starsector-web/src/engine/simulation/systems/ComponentHealth.ts:31–65`
- `C:/Program Files (x86)/Starsector/starsector-web/src/engine/simulation/systems/weapon/WeaponComponentHealth.ts:44–54`
- `C:/Program Files (x86)/Starsector/starsector-web/src/ui/hud/AuthenticTacticalConsole.tsx:217–218`
- `C:/Program Files (x86)/Starsector/starsector-web/src/engine/visual/MissileEngineVisuals.ts:6–29`
- `C:/Program Files (x86)/Starsector/starsector-web/src/engine/extensions/ship-systems/EmpEmitter.ts:74–76`
- `C:/Program Files (x86)/Starsector/starsector-web/src/engine/simulation/systems/NebulaSystem.ts:16–63`

## 3. 客户端也有真实重复工作，不只是插值问题

### 展示目标查询

apply 的 roster 已共享，但仍逐艘 AI 舰调用 findHostile；原生查询先 filter 全名单，再判断当前目标是否有效。可研究展示路径先验证保留目标，失效才扫描。必须保留指定目标优先级、自定义方法、可见性和 getter 语义，不得将它称为已经卸载权威 AI。

证据：`C:/Program Files (x86)/Starsector/starsector-web/src/network/CombatSnapshot.ts:420–431`；`C:/Program Files (x86)/Starsector/starsector-web/src/engine/simulation/CombatEngine.ts:190–197`。

### 屏外舰体、炮塔和残骸

发动机屏外裁剪已有，但 ShipPass 入口的 isVisibleTo 是阵营视野判断，不是视口裁剪；仍可能为屏外船准备战损贴图、炮塔变换和实例数据。应加覆盖模块/偏心 pivot/伸出炮管的保守边界；不能删掉其物理模拟，也不能用剔除列表淘汰仍需保留的纹理资源。

证据：`C:/Program Files (x86)/Starsector/starsector-web/src/engine/render/webgl/passes/WebGLShipPass.ts:148–188,225–235,368–373`；`C:/Program Files (x86)/Starsector/starsector-web/src/engine/render/webgl/SpriteBatcher.ts:249–308`。

### 无新状态时的战损热光签名

资源保留和绘制阶段重复检查热光，getDamageGlowRevision 每次构建伤痕数组和字符串签名。可研究 LAN 展示 apply 后建立签名并在无更新 RAF 复用。已有纹理上传缓存，不能将其再列为未做。热量/闪烁会在基础 revision 不变时变化，失效机制不能只看 scorchMarkVersion。

证据：`C:/Program Files (x86)/Starsector/starsector-web/src/engine/render/ShipDamageVisuals.ts:29–32,50–56`；`C:/Program Files (x86)/Starsector/starsector-web/src/engine/render/webgl/passes/WebGLShipPass.ts:75–88,178–184`。

### 解码与双端点还原，先统计再改

房主上行后还要完成本机解码才回 snapshot-consumed；该门控限制下一次普通快照，不是停止物理更新。可拆分上行/展示额度，但不能只提前 ACK 造成无限积压，或把巨型对象搬进解码 Worker 再付结构化克隆代价。

播放器已最多返回两个端点，但一次 RAF 仍可能做两次完整 apply。批量路径可只取前帧插值数据、末帧完整状态；必须保留实体生命周期、离散事件和预测修正。先记录 0/1/2 次 apply 分布与单 RAF 合计成本；逐次 apply EMA 不是双 apply 帧的总耗时。

证据：`C:/Program Files (x86)/Starsector/starsector-web/src/network/LanBattle.tsx:428–451,653–662`；`C:/Program Files (x86)/Starsector/starsector-web/src/network/SnapshotPlayback.ts:44–58`；`C:/Program Files (x86)/Starsector/starsector-web/src/network/host.worker.ts:83–84,323–324`。

## 4. 多核有空间，但绝不是打开现有开关就能用

CombatMulticore 的注释与调用方式明确没有改变 LAN 同步 authority API；Eligibility 还要求 50–200 舰、原始 onslaught spec、无外部控制等条件。LAN 的玩家舰在 externallyControlledShipIds，混合舰队也不满足原始 spec 条件。

扩大它需要通用、可校验的 AI 输入/输出，而不只是删 eligibility 检查。先同机多 Worker 拆分纯决策，再评估远端客户端任务；伤害、碰撞、生成/销毁仍需要唯一裁决，迟到任务必须按 tick/generation/控制权 epoch 拒绝。多个 Worker 不保证收益大于同步、复制与验证成本。

证据：`C:/Program Files (x86)/Starsector/starsector-web/src/engine/ai/multicore/CombatMulticore.ts:6–36`；`C:/Program Files (x86)/Starsector/starsector-web/src/engine/ai/multicore/Eligibility.ts:62–94`；`C:/Program Files (x86)/Starsector/starsector-web/src/network/host.worker.ts:267–280`。

## 5. 下一轮的验收要求

优先验证明确的展示投影裁剪，同时在模拟侧对预瞄/火控共享查询做小范围消融。前者应核对 HUD/损伤/故障/分裂/重连；后者必须保持目标选择、弹道、伤害与 RNG 行为。随后分别测权威步耗时、真实时间倍率、捕获/编码、主线程长任务和客户端 apply/绘制，不能把局部百分比相加。

本轮完成的是计数、字节归因与代码审查，不是优化补丁验收。未改变 AI 频率、舰船数、数值精度、物理步长、过载保护或线上版本；没有足够证据宣称用户那场少量舰船的卡顿已定位，也没有宣称百舰实时已经解决。