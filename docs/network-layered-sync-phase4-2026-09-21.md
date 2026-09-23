# 第四阶段：高密度导弹的视觉字段残差协议（2026-09-21）

## 状态：仍未完成优化，不启用生产路径

这轮继续处理完整世界过旧的根因：必须减少需要频繁传输的战斗数据，而不是再调低 bulk Hz。新增 **SVP1 视觉整数列 + 残差修订**，没有把它接到 LAN/Steam 生产会话，也没有从完整世界删除 projectiles。前一阶段低带宽下约 0.9 秒的完整世界滞后，不能因本轮字节测试变好而宣布解决。

实验分层开关仍默认关闭。没有修改伤害/碰撞/导引、模拟 Hz、网络适配器/n2n、防火墙或生涯模式。没有提交、打包、推送、发布。原版精确版本、原版实机和 GPU 像素对照仍未核实。

## 1. 原因及试验选择

先重新检查本机 `DamagingProjectileAPI.java` 的 `didDamage/getElapsed/getBrightness/getTailEnd`，再核对当前 `WebGLProjectilePass`、`MissileEngineVisuals`、`MissileContrails` 的消费者。编码前对照已追加在 `network-projectile-stream-source-notes-2026-09-21.md`。

旧 22 舰录制第一帧含 **147 MISSILE、17 BALLISTIC、8 BALLISTIC_AS_BEAM**。持续导引让绝大多数导弹的速度/角度持续变化，所以“只发出生后一直直线飞”不成立。

同一录制、20Hz 实际 deflate(level1/mem7)，均不计首基线：

|方案|平均压缩 B/更新|判断|
|完整精确弹体实体记录|12676.08|对照，非整个世界大小|
|只保留所核对的视觉字段|9353.40|仍过大|
|上述字段量化为可压缩的浮点数|7201.09|仍过大|
|视觉轨迹锚点 + 误差超限才校正|9065.11|10Hz 反而比精确视觉字段更大，CPU 更高；不用|
|紧凑整数列，未做预测残差|6472.93|还需进一步减少变化量|
|**整数列 + 运动/时钟参考 + 小整数残差**|**2452.05**|保留此方向，须继续网络/呈现接入|

被否定的锚点实现已移到 `scripts/lib/projectile-visual-anchor-probe.mjs`，只用于复现实验，不在生产模块内伪装为已完成特性。比较脚本为 `scripts/benchmark-projectile-visuals.mjs`，旧策略结果分别存于 `projectile-visuals-exact/quantized/anchors/columns/residual.json`。

## 2. 当前保留实现及精度合同

- `ProjectileVisualProjection.mjs`：消费者字段白名单。未覆盖矿雷 FX、目标指示、光束、爆炸/盾击，所以**不能据此从 bulk 删除全部 projectiles**。
- `ProjectileVisualColumns.mjs`：17 个可选动态数值列，坐标/速度/尾端等步长 1/64（每分量误差至多 1/128 世界单位），角度/时钟/淡出步长 1/65536（相应每分量至多 1/131072）。矢量欧氏误差上限是每分量上限的 √2 倍，不是零误差。显示数值 -0 归一为 +0；实体 float64 ID 不量化，原样保留。
- `ProjectileEventStream.mjs`：原 SPE1 精确记录模式保持默认；新增显式 SVP1 magic 和 visual-columns 模式。整数运动/时钟参考只是**编码预测**，每列的目标整数都由残差精确校正并经完整目标 CRC 校验，不会把猜测当成新收到的帧。新旧协议族不能在同一个 revision chain 中途互换。
- `ProjectileVisualCodec.mjs`：专用发送/接收封装。只接受 SVP1；投影验证在提交基线之前完成。支持实体建立、删除、重排、规格外观变更、可选列出现/消失、epoch reset、prepare/commit 隔离。消费的仍是显示数据，不能传给碰撞/伤害/AI 或当作完整世界 ACK。
- 残差有列掩码、宽度、整数幅度、原/目标 CRC 和 epoch/revision 边界；继承 SPE1 的包、实体、模板、递归/展开上限。未协商的生产路径不读取这类包。

量化只用于新显示协议，没有改变 `CombatSnapshot` 中的权威坐标、HP、伤害、随机数或存档。上述误差单位不是屏幕像素；不同 zoom/渲染条件须实测，不能称肉眼无损或原版像素等价。

## 3. 最终封装实测

所有代码门槛结束后独立运行：

```
node scripts/benchmark-projectile-visuals.mjs artifacts/network-latency-phase5-20260920/frames22 artifacts/network-stream-20260921/projectile-visuals-wire-final.json --wire-only
```

|取样频率|平均压缩 B/更新|弹体显示 B/s/客机|封装 prepare P50/P95 ms|decode+unpack P50/P95 ms|
|---|---:|---:|---:|---:|
|60Hz|1973.33|118399.50|5.08 / 6.34|3.43 / 4.24|
|20Hz|2452.05|49041.00|4.83 / 5.76|2.96 / 4.42|
|10Hz|2876.18|28761.75|4.83 / 5.62|3.03 / 4.95|
|5Hz|3226.50|16132.50|5.04 / 5.73|3.15 / 5.30|

20Hz 相比完整精确弹体事件记录减少约 **80.7%**，相比精确视觉字段减少约 **73.8%**。这是对子集施加有界显示量化后的编码收益，**不是同语义无损世界压缩、Steam 总流量、游戏延迟或实际客机 Hz**。

最终 prepare 计时包含字段选择/整数列转换；decode 包含视觉列还原。二者都不含原生 capture、zlib、实际传输和 GPU。早期候选比较的 prepare 计时不含字段投影，不能直接拿早期 3.8ms 与最终 4.8ms 宣称性能退化/提升。录制只长4秒，仍含旧插值端点，不能和第二阶段其它配对场景跨表相加。

CPU 仍需优化：若给每位客机单独做 20Hz 编码，这个准备成本会随人数放大，不能直接放在权威主线程中再造一次 Hz 瓶颈。下一步必须选择共享参考/共享编码、worker 及有界缺帧重同步策略，并验证总出口，而不是只把新流叠在旧大包上。

## 4. 验证结果

- 新增显示协议测试 **9/9**；加原精确实体流测试共 **16/16**。包括逐字节截断、非法掩码/残差/CRC/魔数、字段越权、模式切换、回滚不提交、来源/解码视图不可污染基线、float64 ID、空值转换、seeded 生命周期/导引扰动 fuzz。
- 当前 workflow 网络门槛 **307/307**，`network-gate-phase4.log`。已加入新协议测试。
- 原生 capture/receiver/绘制依赖 **9/9**，`native-capture-phase4.log`。
  - 新测试使用真正原生模拟中的 **1915 个投射物样本、14629 条绘制调用**，覆盖 MISSILE、BALLISTIC、BALLISTIC_AS_BEAM。
  - 未量化的视觉子集对比真实消费者调用，结构/非数值相同；原生 lerp(a,b,1) 与新端点 lerp(b,b,1) 的数值舍入差限制 ≤1e-10。
  - 量化数据通过真实 codec 收发，逐列检查误差边界，重新调用绘制路径，确认不改权威对象/RNG。
  - GPU 和 texture dimensions 是 stub，**不是图像/像素等价测试**；未完整覆盖 PLASMA、FLARE、矿雷 FX、目标指示和自定义内容。
- app TypeScript、聚焦 oxlint 通过。Steam gate 本轮未重跑：本轮没有接入 Steam；上一轮结果仍是 **324/326**，两项 Sockets 压测失败未解决。

## 5. 下一步与未完成项

1. 高密度导弹的 20Hz 显示流与舰船快状态共用有限出口；完整世界用于低频校验/未迁移字段，但 HP/护盾/命中事件不能继续等 bulk。
2. 独立显示视图必须避免通过 `CombatEngine.projectiles` 的委托 setter 写回权威 weapon system；只读视图/明确数据接口，不用 `Object.create(engine)` 假装隔离。
3. 多客机编码共享或 worker，不按客机数线性堆主线程 CPU；掉帧、重连、晚加入需要有界 rebase，不保留无限事件历史。
4. 短寿命弹体/命中/尾迹、矿雷 FX、光束和指示器合同，真实 renderer 和像素核对；不能只验证导弹主 sprite。
5. LAN/n2n、Steam 实际 3–5 人共享网络回放与真实多机验收；保持 Hz、权威模拟、完整更新、FPS、输入回显分别记录。

总体目标仍在进行。本轮拿到了有效的数据量下降和可验证新协议，不是已经上线的联机延迟改善。
