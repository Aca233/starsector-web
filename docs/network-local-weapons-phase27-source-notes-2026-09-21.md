# Phase27：本地炮塔/有限持续射击（实现前对照，2026-09-21）

## 原版证据 → 保留规则
- 本机 0.98a API：`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/WeaponAPI.java:153-181` 分开公开当前炮塔角、射界、转速、弹药和冷却；显示预测不获得修改战斗结果的权限。
- `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/trackers/oooo_0.java:106-171`：以挂点为瞄准原点、船体相对角、有限转速、反向船体旋转补偿、射界边界。与现有 `WeaponAim.advanceTurretAim` 和 `ShipWeaponControlSystem:295-365` 交叉核对。
- `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/ship/A/if.java:929-942` 冷却来自 refireDelay，转速由 tracker 提供。Web `ShipWeaponControlSystem:198-215,580-601` 使用武器时钟/系统射速倍率；未知变速周期不猜。
- 本机 `../starsector-core/data/weapons/lightac.wpn`：炮管偏移和交替炮管；`weapon_data.csv`：turn rate、damage/shot、damage/second、chargeup/burst 等参数分立。不得修改规格或权威炮管序号以“预测”。
- 原版同状态界面截图/桌面实机对照仍待许可。本轮不改资源、UI布局或原版战斗方程，不声称原版逐像素等价。

## 当前差异 → 实现边界
1. 渲染目前直接读取权威 `mount.currentAngleRad`，本舰准星改变仍等回包。新增仅本舰选中手动编组的有限角度重放/校正；存 WeakMap，不修改 WeaponMount。复用原生转速/射界方程；隐藏、失焦、相位/不可用、传送、陈旧基线、切组命令等待确认时回退。
2. 首发预测只有 rising edge。新增严格的一次性续发资格：只有上一预测弹明确匹配真实权威弹丸后，才允许同一长按的下一轮预测；每挂点最多一发未确认、每个已应用基线最多一次、250ms上限。仅无蓄力/单发/普通弹丸/常速武器，连射剩余轮次、导弹、光束、变速系统不扩展。弹药/幅能只检查和本地预留，不改真实数值；消失/未匹配不冒充命中或拒绝，不发续发资格。
3. 已有实验弹丸事件/基线链路不能直接改成默认：现阶段 visualState 仅 LAN 协商，Steam未实现；默认完整投影仍保留弹丸。必须先确认删除逐帧同步而不只是增加第三份计算，再谈启用。
4. 已有本地粒子仅支持可加性种类0/2。剩余爆炸烟雾含 source-over 混合、最长约1.8秒；现有事件窗口64步和追加显示层不满足顺序/寿命要求。不能简单放开种类3来称为全部迁移。

## 验证
真实原生世界：有限转速/射界/船体转向、10/20/60Hz回包、即时准星响应、停止/失焦/切组/传送/陈旧时清理；渲染入口真实使用弱引用显示角。续发确认资格、最小间隔、未确认/无弹丸/多候选不续发、资源预算、冷却/禁用/系统安全门。对比完整快照、RNG、弹药、幅能、炮塔角、炮管序号不变。使用 headless 浏览器/独立图像，不操作桌面。新增诊断进入会话日志，不伪造Hz/RTT。
补充证据：原版 `data/weapons/tpc.wpn` 的 autocharge 注释明确是“松开按键后仍继续蓄力”；`weapon_data.csv:168` 的 TPC chargeup=0、chargedown=0.2、burst size=1。现有 `ShipWeaponControlSystem:735-759` 对零蓄力单发在同一武器步内完成发射，没有需要跨帧猜测的蓄力阶段。因此只放开 **零蓄力、单发的 autocharge**（覆盖攻势原装TPC），仍排除正蓄力与 autocharge 连射。必须用实际 TPC 单发/持续射击和松键回归验证，而非删保护后用假规格测试。

实连新增发现（保留失败证据）：完整样式1280×720三人测试中，一个客机 predicted=4、expired=4、lastResponseMs=null。代码把 RAF 批次起点 `now` 早于刚刚由 `performance.now()` 记录的输入时间判成过期；这种同帧定时器顺序合法，不是乱序输入。修正为等到下一显示帧，而非丢弃新预测，250ms寿命上限不变。新增针对性回归并重跑原来的“每个客机实际产生续发预测”断言，不放宽断言。
