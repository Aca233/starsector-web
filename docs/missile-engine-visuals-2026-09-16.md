# 火箭尾焰修正 · 2026-09-16

## 原因

旧 WebGLProjectilePass 将发动机画成两张高亮矩形（第二张白色），轮廓 alpha 约 0.9–0.95；喷口再叠加接近不透明的大星芒。未指定 glowSizeMult 时使用 36×视觉配置倍率的固定光斑，导致窄火箭也像大号白色灯泡。

## 修复

- MissileEngineVisuals.ts 从导弹自身 engineSlots 对应数据计算几何；不按舰船/武器 ID 调倍率，也不再套 MISSILE 视觉配置放大光斑。
- MissileEngineRenderer.ts 复用已有 drawEnginePlume，以六层低 alpha 彩色羽流、透明尖端和一层淡轮廓替代两张高亮矩形。
- 原版稳态参数：羽流亮部 100/255，轮廓 50/255，喷口辉光 alpha 0.6×0.75=0.45；小白色星芒仍保留，不是直接删掉火光。
- 无 glowSizeMult 时正确使用默认 1；显式倍率及 glowAlternateColor 用于外层辉光，白色核心仍为白色。
- 歼灭者火箭稳态外层辉光贴图直径从 41.76 降至 29.28 世界单位；白色核心从 18.792 降至 10.98。源码的 30×4 羽流、喷口位置和烟雾数据保持不变。
- 全部导弹羽流一起提交网格批次，避免逐枚导弹开始/结束网格通道。

没有修改弹速、伤害、射程、命中、AI 或烟雾尾迹；没有重新导入资源，没有新增测试代码文件。

## 原版只读依据

相对于 decompiled/starfarer_obf/com/fs/starfarer/：
- combat/entities/G.java:234–422：标准发动机几何、六层羽流、100/255 亮部、50/255 轮廓、导弹辉光半径分支、0.45 稳态 alpha、0.75 倍白色核心尺寸。
- loading/specs/EngineSlot.java：glowSizeMult 默认 1，alternateColor 默认空。
- combat/entities/Missile.java:797–805：弹体与引擎分别渲染。
- 原始 data/weapons/proj/annihilator_rocket.proj：喷口 (-11,0)，width=4，length=30，engineColor=[255,125,25,255]。

本轮对齐的是当前 Web 持续加速导弹的稳态发动机外观，未完整移植原版发动机升温、熄火抖动、Omega 引擎、所有多喷口布局和动态扩散状态。无 engineSlots 数据的自定义内容仍使用明确的几何回退，不声称该回退就是原版规格。其他导弹的原始大辉光倍率保留，不一刀切缩成同样大小。

## 验证

- 9 项内存检查通过：歼灭者数据/尺寸、透明度、无 ID/阵营特判、自定义辉光倍率与颜色、现有四种导弹有限值、零辉光倍率、普通炮弹/空雷/诱饵/过期实体排除、零尺寸、批处理次数/喷口位置/无状态修改。
- npm run typecheck / lint / build 通过。
- 隔离正式包中，种子 1337 的典范对攻势在相同 120 个物理步、同一视角分别截图检查修改前后：喷口白团和泛光缩小，保留细彩色尾焰与小星芒；浏览器无页面脚本或控制台错误。未操作用户原有页面。
