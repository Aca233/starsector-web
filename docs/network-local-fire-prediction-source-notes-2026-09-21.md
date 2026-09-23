# Phase 16：本地首发弹丸预测—实现前对照（2026-09-21）

## 范围
用户同意客户端预测＋房主权威校正的方向。第一步仅在 LAN/Steam 共用显示端，为手动 LINKED 编组、无蓄力的普通弹丸武器预测一次新按下扳机的首发。持续射击/连射余下轮次、光束、导弹、交替编组、自定义每帧插件、独立实验弹丸流暂不预测，保留既有权威路径。不是完整战场 rollback，更不是所有客机自行判定伤害。

## 本机原版证据 → 保留行为
- 本机 0.98a API：`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/WeaponAPI.java:158-200`，枪口位置、炮口朝向、弹速、弹药、冷却和瘫痪是独立属性。
- `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/A/if.java:344-349` 的 startedChargeup 检查弹药、过载/排散、剩余幅能；同文件 getFirePoint 使用挂点/炮管偏移。反编译仅作为旁证，与 API、配置及现有已移植 fireWeapon 交叉验证，不运行反编译代码。
- `../starsector-core/data/weapons/lightac.wpn`：turretOffsets [10,0]、hardpointOffsets [15,0]，原始粒子与贴图参数；`proj/lightac_shot.proj`：BALLISTIC、20×5.5、fadeTime .15、pixelsPerTexel 5、原始炮弹贴图。
- Web `ShipWeaponControlSystem` 保留原有开火条件、原生枪口变换；`WeaponAim.manualFireSlots` 保留手动编组选择语义，不能新增“准星未对齐就绝对不开火”的规则；`SourceProjectileLifecycle` 是现有实弹/移动射线寿命算法。
- 本机原版的相同场景实机/截图逐像素比较仍待许可；用户当前不允许可见窗口或桌面输入。本轮不改变 HUD、资源样式、原版伤害机制或布局，不声称原版视觉已实机等价。

## 当前差异 → 最小实现
现有 MotionPrediction 仅改变本舰表现姿态；LocalMuzzleEffects 只回放已确认枪口事件。客机不开 weapon/fixedUpdate。新的首发预测必须独立 WeakMap 显示层，不能进入 engine.projectiles、伤害/碰撞/AI、快照、武器状态和世界 RNG。

输入只有本地发送成功后才可预测；最多 32 发待确认、250ms 寿命与有限权威数据年龄。同一按键长按不重复预测，未确认挂点不重复发射。暂停、隐藏、模态框、切组/系统命令、失同步、离开或换舰清理。弹药/幅能/冷却/禁用/相位门槛只读取已知权威数据，未知或不支持时回退，不猜命中。

应用到客机的完整世界携带输入 ACK 后再清理对应首发；同源/同挂点/同规格且非旧基线里的权威弹丸仅用于视觉交接匹配。没有匹配不能冒充“命中”或“房主拒绝”，可能是弹丸已死亡。暂不提前播放音效/枪口粒子，避免与已确认事件双播。预测散布只能是独立显示估计，不能消耗权威随机流。异常或过大偏差回到权威显示，不无限外推。

## 验证
- 使用实际 Ship/Weapon、原生资源创建世界，比对预测前后的完整权威快照、RNG、弹药/幅能/冷却和音频队列不变。
- 输入边沿/重复/未发送、ACK 与 displayed frame 的关系、丢包/超时/重同步、禁用/缺弹/过载/相位/混合编组等边界。
- 10/20Hz 权威更新与 50/100/200ms 模拟回包下，预测首帧响应和可靠交接；必须注明是确定性测试，不把它称为真实公网 RTT 改善。
- 实际渲染通道检查与无头浏览器验证；原版实机视觉待许可。新指标记录真实预测/匹配/超时/无弹丸解析数量，而不篡改 HUD 的网络 Hz/RTT。

源码核实追加：ShipWeaponControlSystem.advanceWeaponLifecycle 的非中断连射在首发前预留整个 burst 的幅能。因此可以预测无蓄力 burst 的第一发（如原生 hammerhead 的 heavymortar，burstSize=2），但须按完整 burst 预算校验，不自行生成后续轮次；超过 32 的特殊 burst 回退。
