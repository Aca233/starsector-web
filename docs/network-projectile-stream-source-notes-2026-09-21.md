# 弹体实体流：来源与第一步约束（2026-09-21）

范围：把投射物从每份完整世界的大对象中拆出，先实现可恢复、可独立确认的实体建立/字段变化/销毁流。它是后续视觉轨迹事件化和 LAN/Steam 共享传输的基础，不是又一个固定 Hz 参数。

本机原版证据：
- `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/DamagingProjectileAPI.java`：`getSource/getProjectileSpecId/getSpawnType/getElapsed/getBrightness/didDamage/isFading/getTailEnd` 将出生来源、规格、年龄、命中和消退分别暴露。
- `CombatEntityAPI.java` 的 location/velocity/facing/angularVelocity 与移除状态是不同概念。不得把位置预测当作命中/消失判断。
- 原版精确版本、实机视觉和交互尚待核实；本次不更改原版画法，不启动桌面，不声明外观等价。

Web 证据：
- `WeaponSimulationSystem.update` 按实体 ID 建立/移除弹体，在实际模拟中推进 elapsedTime、prevPos、pos、armingTimeRemaining；碰撞和导引仍属于权威模拟。
- `SourceProjectileLifecycle.advanceSourceProjectile` 含子弹、等离子、移动射线不同的尾端/淡出逻辑，不能用一条直线“模拟”全部弹体。
- `WebGLProjectilePass` 消费完整的视觉属性，包括 ballisticTail、fadeProgress、elapsedTime、spec/贴图/导弹引擎。不能省略这些字段而宣称完全同步。
- `CombatSnapshot` 已有声明式投影和帧内列式压缩，但字段字典/静态规格仍随整帧重复，弹体 ID 没有成为跨帧持久实体版本。

第一步最小对照：保留投影中的所有字段和值 → 按 ID 发 create/update/remove，规格模板按需建立；明确 epoch/base revision/target revision、顺序列表和完整状态校验。接收端完整校验后才原子提交，错误/旧纪元不得改状态或释放额度。模板、实体数、深度、节点、消息及常驻状态均有上限。

编码参考最多跨 60 个固定 tick：只对明确存在的投影位置/前位置、年龄和标量倒计时做冻结 IEEE-754 基础算术，目标有任何差异仍发精确修正。该参考不是显示帧、不运行游戏逻辑、不能单独 ACK；不得因预测而删除命中/尾端/渐隐等字段。不确定/不支持的投影保留原完整同步路径。

后续才接上独立消费、静态/动态字段调度、视觉推进、完整状态省略和重同步；在真实字节与全字段恢复验证之前，不改正式版默认能力。

## 可直接省略的接收端插值端点

`applyCombatSnapshot` 在 unpack 前按舰船/弹体 ID 保存旧接收位置，随后无条件重建舰船 prevPos/prevFacingRad 和弹体 prevPos/prevBallisticTail/prevFadeProgress。主机的上一模拟 tick 不是客机上一已接收端点。因此可在 P1 投影省略这五类字段而不损失实际显示输入；保留当前 pos、tail、fade 等所有权威值。默认和 native 快路径都采用相同投影，不把该省略扩散到其它嵌套对象。验证必须比较首次恢复和跨帧/重排/删除/瞬移的实际显示端点，而不仅是包大小。

另外，Web `ShipWeaponControlSystem` / `MissileGuidanceHandler` 使用 random.next() 的 float64 弹体 ID，不能误当安全整数或量化。实体流保留原 ID，只在单个已知基线内以稠密序号引用实体。
## 第四阶段最小对照：只读视觉投影（编码前记录）

再次核对本机 DamagingProjectileAPI 的 didDamage/getElapsed/getBrightness/getTailEnd；只把这些接口用于确认“命中”和“显示寿命”不能混为一谈。原版版本及实机仍未核实，不改变或宣称原版联网行为。

当前 WebGLProjectilePass、MissileEngineVisuals 和 MissileContrails 读取的投射物字段，与命中、AI、MIRV/近炸、伤害监听和投射物规格中的模拟字段不同。先构造**专供这几个绘制消费者的字段集合**，仍保留推进所需来源速度/尾端/消退状态，用原有精确实体修订编码对同一录制配对量测。矿雷 FX、目标指示、光束、爆炸/护盾火花并不被这个投影覆盖；不能在完整世界中删除全部 projectiles 后声称覆盖全部效果。

预期：静态外观随实体建立/变更发送，动态显示状态独立取样。权威 projectile 对象、伤害/碰撞、随机数及存档不变。第一轮仅做精确投影测量，不默认量化，也不在生产 renderer 上切换未完成协议。必须以字节及真实原生对象绘制依赖对照确认收益，再决定协议与网络接入；仍无收益就弃用，不能只换个“视觉流”名称。

第四阶段结果与否定实验：`network-layered-sync-phase4-2026-09-21.md`。单纯的精确视觉子集/锚点仍不足；已实现有界显示量化 + 整数列运动/时钟残差 SVP1，20Hz 对该录制的弹体显示流约 2452B/更新。未接入生产、不能替代完整 world 或宣称客机实际已20/60Hz。

第五阶段编码前对照：保留同一个已验证视觉基线，以只读 fork 为参考编码所有后续“最新视图”，而非把每名客机的 ACK 变成独立编码链。新客机先收基线，慢客机可丢掉中间更新，下一更新仍从相同基线精确恢复；定期有界换基线，不保存无限历史。接收显示 tick 不得回退，旧 match/sync 不能重用基线。该方案仍需同录制实测，因为固定基线可能增加字节；不能用减少编码次数掩盖流量回退。只读显示对象不能写到 CombatEngine 的 projectiles 委托 setter。

第五阶段实录发现：固定基线下，`appearance` 顶层替换会因少量生命周期/外观字段差异重发整块静态导弹规格。对尚未接入生产的 SVP1 增加显式 `visual-columns-a1` 消息体标记和独立 appearance 字段补丁；SPE1 保持原格式。appearance 中每个属性仍精确补齐/删除，不修改权威对象或显示量化边界。须重测完整基线流量，验证坏补丁不提交。

第五阶段显示接入核对：复查 `LocalContrails.update` 发现除 appendMissileContrail 的依赖外，还读取 collisionDisabled/isDisarmed，已加到精确 appearance 门控。显示层只进入 WebGLProjectilePass 和 LocalContrails 的读取，不改原生武器系统、随机数或碰撞；原完整快照继续保留尚未覆盖的 mine/beam/target/hit 效果。依据上一阶段 native 实录扩展实际 renderer 调用对照，GPU/原版实机仍未核实。结果与未完成边界见 `network-layered-sync-phase5-2026-09-21.md`。

## 第六阶段编码前对照：去除已覆盖的重复弹体投影

本轮重新读本机 `decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Missile.java:780-788`：识别层排除友方/flare/明确禁用 renderTargetIndicator；`MissileRenderDataAPI.java` 将规格、位置、朝向、亮度视为显示数据。原版版本仍未独立核实，本轮不改原版玩法/布局，未操作桌面。

审计现有 Web 消费者：WebGLProjectilePass、LocalContrails 已读取独立层；WebGLIdentificationPass 还读 engine.projectiles，依赖 teamId/isPlayer/renderTargetIndicator，须加入精确 appearance 并改为独立层读取。空雷 sprite/glow 实际来自 engine.mines（mineSystem），保留完整 world.mineSystem；识别年龄仍从此查表，缺项使用弹体 elapsedTime。CombatAssetClosure 的动态贴图闭包也要读取独立层。其它 projectiles 使用点是 authority simulation/AI 或计数，不在客机运行。

预期最小改动：只对同 sync 且已消费足够新视觉数据的协商客户端，发送显式 projectileVisuals=1 的紧凑 world 变体（projectiles=[]，其它 world/ships/crafts/events 完全不变）。原完整快照仍供初次加载、旧客户端、视觉断流/失败、失去控制通道及重同步回退；不能把视觉缺包等同于空弹体。客户端区分完整弹体 world tick 与紧凑 world tick，防止新 bulk 将独立层清空或较旧 full 将已移除实体复活。各变体都走自己的正确 per-peer delta base、消费信用和字节计量，不共用错误字节缓存。先做同录制字段/压缩量测，再接入和弱网总量回放。
