# 原生技能AI按需输入：下一候选的编码前边界（2026-09-28）

## 新证据与原版对照

不是旧的相位缓存/单次导航motion复用/导航索引重新计时。`lan-current-stage-profile-result-2026-09-28.md` 得到同一冻结全关默认路径的CPU+读取需求证据：forwardPathClear调用栈647.850ms，占9045.621ms模拟wrapper样本7.162%；热120步3120次结果预计算、0读取；冷3900次/扰动754次同样0读取。原始急切查询仍执行，reference/profile/observer的完整链路校验一致。

本机0.98a-RC8 `decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipSystemAIScript.java:7-8` 为技能AI提供危险方向/目标；Web的forwardClear是额外派生建议，不是必须每技能执行一次的原版API要求。保持原技能激活、避碰和伤害顺序，不改变UI。原版实机未验收。

当前消费者源码：
- CapitalShipAI.ts 系统循环：先构造假设ACTIVE/effectLevel=1的modifiers，用speedFlat计算boostSpeed，然后急切计算forwardClear，调用advanceAI。
- EclipseProtocol.advanceAI → SystemAI.advanceWeaponBoostAI：不用forwardClear。
- GlorianaEdict.advanceAI、HyperionSystems的两个advanceAI：不用forwardClear。
- SystemAI.offensiveManeuverAllowed、advanceJetsAI会读forwardClear，必须保持实时通道计算；未知定义/未来消费者不自动继承免查询许可。

收尾时另一个任务更新了6个源码文件（尤其HyperionSystems/HullMods）。新的Hyperion两个advanceAI仍未读forwardClear，但本轮运行证据属于变更前782模块；实施时必须冻结新的完整图，不能复用旧hash/旧绩效作新结果。并发差异在current-stage-profile工件内，只保留，不覆盖。

## 方案范围

目标：只有私有data-command Worker、实际原生实例和已审核**不消费通道输入**的不可变技能定义，可以省掉整段假设modifier + boostSpeed + forwardPathClear工作。不是提高缓存命中率，不缓存导航结果，也不改变avoidCollisions、driveVelocity或武器挡线。

1. 独立默认关闭 `VITE_LAN_SYSTEM_AI_INPUT_DEMAND`。其它旧实验保持false，旧失败实现不能复活。
2. 不用ID/可写DTO布尔直接授予许可。以Registry返回的冻结定义真实身份建立独立消费需求许可，不能借用更宽的stats/AI许可。
3. host init只登记实际引擎构造对象；CombatEngine的原生updateShipAI给本次生成的TacticalWorld建立短同步授权，finally撤销。不能让全局flag把公开CapitalShipAI或任意外来world自动变成owned。
4. **未消费并不意味着计算没有副作用。** 优化前还须证明被省掉的前向扫描在当前对象/回调上纯读。普通公开对象、未知getMotionStats/phase/Vector方法、外部effect、观察器noteNavigationObstacle、未知索引/定义必须保留原计算、回调顺序和异常。需要覆盖observer/parent/系统链、原生运动漂移和模块动力读取的依赖。
5. 可以在登记时审核普通own-data描述符、原生原型和固定读者；这沿用封闭Worker合同，不是对同realm任意JS monkeypatch的安全沙箱。每次需求判定仍核对明确支持的动态替换/回调边界，新实体或未经登记替换直接回退。不得在每个目标/getter里重新加一整套资格检查；最多一次技能输入需求决策的守卫。
6. 不把true当作真实通道结论，不把公共context字段改成普遍惰性getter。已知不读的原生分支和兼容急切分支明确分开；需要此输入的技能与所有未知回调仍拿到原时机算出的布尔。原假设modifier的未知回调也不能被跳过。
7. 重入/异常/重建必须清理授权。系统回调之间可能改变状态/对象，不能把一次正许可跨回调当作仍有效。

## 预期写集（尚未写入生产代码）

- src/engine/ai/CapitalShipAI.ts：输入需求决策、兼容原路径。
- src/engine/simulation/CombatEngine.ts：只在真实owned engine创建的world里绑定/清理同步权限。
- src/network/host.worker.ts：新flag的显式登记。
- 新增 src/engine/ai/OwnedSystemAIInputs.ts：私有登记与需求/纯读判断。

如实现需要增加写集，先解释具体依赖并补备份。不得改Hyperion/Gloriana内容、其它任务WIP、ContentValidation的arkFighter修复或已有display候选。

## 集中验收与一次性能裁决

先实现一整块再一次typecheck/改动lint/相关真实host场景，失败只定向修复。初建、reinit、缺省false、公开/陌生world、未知getter/系统/父舰/效果/导航observer/索引、错误throw及重入、多个技能中间改变依赖都要保留行为与调用序。直接检验四种原生advanceAI在活跃/冷却/可激活/被拒绝/跃迁/撤退等分支不消费forwardClear。实现实际跳过数量用独立非计时探针核实。

60步扰动完整simulation→capture→encode→decode→apply，逐字wire、每步完整authority+hidden RNG/autofire、完整receiver图一致后，唯一A0→B1→B2→A3；每臂独立隐藏Node v24.13.0，150冷步+120热步，2玩家20AI、三舰循环、seed917、3200DP、60Hz。

新门槛同时检查**模拟热段**与**完整五段热段**两对各改善至少3%，不能靠无关apply/encode波动掩盖模拟退步；冷整链路每对回退≤3%，init增量≤max(10ms,10%)；wire字节及权威/隐藏/receiver完全一致。失败归档并SHA核对精确撤回本轮写集，不择优重跑。离线通过仍默认关闭，才进入修好的生产式双无头浏览器启动/输入/ACK屏障/同局重连验收。
