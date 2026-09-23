# LAN轻量展示迁移：严格只读通道

## 实施前核实
原版0.98a-RC8：重新查看 decompiled/starfarer.api/com/fs/starfarer/api/combat/WeaponAPI.java:49 的getRange以及 starfarer_obf/com/fs/starfarer/combat/CombatEngine.java:1185–1200 权威空间网格。显示读值与权威模拟不是同一能力。本块不改变射程、护盾、相位或空间网格规则，沿用 docs/render-projection-source-audit-2026-09-22.md 已审核读集。原版实机未操作，画面等价只以既有Web契约验证，不宣称桌面验收。

当前render模式遇到不支持的扩展会整个epoch退回native Ship/Shield/System等原型；因此不能把它直接称为“客机不还原模拟图”。新增render-strict模式：不支持时拒绝并要求新epoch，不默默扩大读集；编码与解码都禁止simulation类和原生system定义标签；严格解码器不会根据不可信包自己降级。现有render/compatibility行为不变。

同模式贯穿LocalWorkerHost初始化/恢复与Worker编码配置，作为未来LAN连续revision通道的必要边界。此块不是LAN迁移完成：尚缺per-seat视角、玩家预测覆盖、传输背压/有序revision/重连epoch，以及LanBattle真实renderer/HUD/deployment接入。当前公开LAN仍用已优化的snapshot路径，不额外双发流。不能把本块契约通过报告成CPU、Hz、RTT收益。

## 本轮边界验证
`tsc -b`、四个改动文件的 oxlint、既有 check-render-projection 场景通过（2669 项断言）。新增严格模式拒绝原生模拟类/可执行system标签、拒绝缺失投影根、坏包不修改既有展示对象、修订/epoch恢复和禁止默默fallback契约。只验证LocalWorkerHost配置传递的类型路径，未做实际Worker或LAN通道接入，不主张性能收益。
