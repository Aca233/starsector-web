# Phase29 普通弹丸客机显示推进：编码前对照（2026-09-21）

## 来源与边界
- 本机 0.98a API `../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/DamagingProjectileAPI.java`：`didDamage`、`isFading`、`getElapsed`、`getTailEnd` 独立；尾端仅供 ballistic/moving ray，不能把命中、消退和存在性混为一谈。
- 反编译 `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/BallisticProjectile.java:162-178`：elapsed、damage multiplier、trail advance 分开。反编译只作佐证，不复制异常符号。
- 原资源 `../starsector-core/data/weapons/proj/tpc_shot.proj`：BALLISTIC_AS_BEAM，length100、fadeTime0.3。仅平移 head 会错误处理 growing tail。
- 当前 `SourceProjectileLifecycle.ts` 已实现 BALLISTIC/PLASMA/MovingRay 的 sourceVelocity、sourceMoveSpeed、tail 和 fade 顺序，本轮复用而不更改权威规则。
- 原版实机/截图逐像素对照未做：无桌面操作许可。本轮不改 UI 布局、材质、大小或发射规则。无头 WebGL 检查只能证明 Web 绘制路径。

## 当前差异 → 最小改动
完整快照之间，已确认弹丸只有旧→新端点插值；本地第一发 ghost 已能先画，但确认后又回到延迟端点。增加独立 render-only flight poses：每个完整权威端点重置，固定 1/60 步长复用原轨迹，显示帧余量只写 scratch，不反复积分余量；最多预测100ms、快照陈旧250ms后回退。绝不外推到已知射程以外，不预测命中、消退、删除、音效或烟雾。

仅支持已知普通 BALLISTIC/PLASMA/BALLISTIC_AS_BEAM；排除火箭/制导/水雷/flare/mote/旋转系统弹/引信/MIRV/已命中消退/未知生命周期。其它仍按原快照显示，不删实体或屏外信息。

同一 LAN/Steam LanBattle 默认入口接入。独立 projectileVisualLayer 实验开启时让路，绝不利用该层承载新推进而关闭 LocalFirePrediction。ghost→authority correction 与 flight pose 合成且不画两次。单人/host authority/协议/目标Hz/浮点精度不变。

## 验证与不作的承诺
- 单测 native trajectory/tail 对照、不同RAF频率、100ms/250ms界限、范围/生命周期、fractional ID、乱序/删除/reset/失焦、与开火handoff组合；capture与RNG不变。
- 真实资源/无头WebGL检查实际像素改变和权威清除；共同LAN连接检查启用统计。
- 测新增 receive+render CPU（多弹丸、三/五显示端），报告开销而非伪装为节省。若成本不合适则不默认接入。
- 本轮不是弹丸事件流迁移：完整快照、主机模拟和传输字节不减少，不能称为RTT或完整状态Hz提升。
