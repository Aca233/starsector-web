# LAN主机接通已有相位读取路径：实现前（2026-09-27）

## 已核实证据
本机0.98a-RC8，再次查看`../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Ship.java:5006`，isPhased直接读取实时字段；此前ShipAPI和PhaseCloakStats证据见owned-phase-reads-source-notes-2026-09-26。本轮不改状态/精度/时钟，不改UI，无桌面/实机验证。

`local-combat.worker.ts`在init和restore后已经调用`enableWorkerOwnedPhaseReads`。`network/host.worker.ts`同样持有私有引擎，只收structured-clone数据，init重建每个epoch并登记FireControlQueryRoster所有权，却没有启用该相位读取路径；这与联机启动CPU中allSystems临时数组热点相符，不代表事先知道收益。

已有实现只优化零/单战术槽：先快照主、防御两引用，再按原短路顺序读相位；多技能（休伯利安）、自身allSystems覆盖、派生类回原路径；外部效果Map、parent、shield实时读取，不保留动态缓存。本轮只接线，不扩大读域、不改getter实现。

## 方案和固定门槛
- host.worker init在构造和所有权登记后调用既有enable函数；`VITE_LAN_OWNED_PHASE_READS=false`供对照关闭，默认拟启用。不可从网络消息开启/关闭权限。Worker终止释放realm，所有init/重连重建都会执行。
- 新测试以原host.worker同源编译，仅在测试bundle尾部导出原handleMessage与engine；真实init消息两次均ready且有tick0快照，证明初建和重建接线。测试同步fixedUpdate不运行真实网络定时器；这一点不能算浏览器联机通过。
- 对照旧路径/现路径的真实176实体、动态相位/父舰/多系统回退与外部Map短路。逐步权威、隐藏火控/RNG一致，技能激活、排散、近距开火和隔舱回退仍覆盖。
- 唯一一次ABBA，每臂150热身+120计时，两个相邻配对整fixedUpdate累计均至少省3%，四终态全hash一致；不要求/不宣称纯相位微基准等于端到端收益。两臂root exact-threat保持true（同上一已知房间），本轮已撤回的authored-fire-query保持不存在。
- 集中一次typecheck、改动lint、新合同；门槛通过后沿用既有176实体、20秒（普通＋70ms压力）双浏览器房间，冻结完整原CSS和资产，仅叠加host.worker一个文件（原根舰候选保持原样）。停顿ACK、重连、过载保护和所有资产检查不放松。
- 默认启用须正确性与性能门槛通过；真实场景若仍过载，则只可保留显式实验启用，不能称联机可玩/延迟改善。若离线性能不达标，恢复本轮一文件修改，保留工件，不择优重测。
