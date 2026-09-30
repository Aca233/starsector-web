# 组件 base64 接收优化：实现前记录（2026-09-25）

## 原版证据与边界
本次重新查看本机0.98a-RC8的 `../starsector-core/data/config/settings.json:8-9`（vsync/60fps）与 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEntityAPI.java:16-24,48`（位置、速度、朝向、角速度、生命值）。只优化Web字节恢复，不改这些数值、模拟频率、协议、游戏规则、UI和资源。没有原版网络等价假设，不启动原版实机或桌面；UI实机核验不适用于此次无UI变化，也不声称已验证原版UI等价。

## 当前差异 → 预期行为
MotionFrame、CriticalCombatState、ProjectileVisualPacket、AuthorityComponents在保留完整输入长度/alphabet约束后，均用 atob + Uint8Array.from(每字符回调)生成字节。普通主线程、呈现Worker以及Node接收都会经过这些函数。大快照SWB1本身不是本次对象，不能将组件收益冒充完整snapshot恢复提速。

共用小型 decodeBase64Bytes：有 Uint8Array.fromBase64 时用默认loose规则，避免显式binary-string和JS逐字符回调；无此特性时继续 atob，但用已知长度Uint8Array和索引循环。不能使用strict尾块模式：现有atob接受非零未使用padding位，悄悄收紧会改变既有协议接受集。各调用者原有type/编码长度/alphabet/解码长度/fragment/schema/CRC检查必须保留。缓冲区每次独立，不加池或跨调用payload缓存。编码端不改。

## 验证计划
先冻结全部非生涯源码，后仅合入这6个生产文件（4修改、mjs+d.mts新增）。扩展既有 check-motion-display-browser 场景，不新建测试工程：原241帧恢复/运动姿态回归；实际浏览器原生分支及强制fallback与冻结旧源码逐字节/组件结果/错误接受集比对，覆盖padding、特殊数字、非法UTF8/CRC、视觉分片/上限与缓冲区所有权；使用同一真实舰船捕获的motion/combat及有效visual夹具交替配对计时，保留所有轮次。类型检查、相关lint、这一既有场景集中进行；具体失败或复查修复才定向重跑。

未测到净改善不保留候选，不用单个局部毫秒数声称模拟/FPS/网络延迟提高；不默认切换Worker，不改功能协商/.env，不暂存提交发布，保留所有其他WIP。当前完整snapshot恢复仍是独立大开销。

## 验证夹具范围调整（测试启动前）
原计划复用的241帧motion-display旧录制工件已不在当前工作区（原脚本引用的recipe/manifest.json缺失）。不重新生成一套历史性能录制冒充原输入；改用现存自生成的 check-battle-batching-browser Offscreen场景组件分支。沿用其实际22舰、600步预热、12个捕获点，采集有效motion/SCC1/SCC2和visual发布；SCC2若全舰武器包超过既定限额，仅测试夹具使用前4艘实际舰船并在报告记录，生产不删减。两种解码模式分别在真实恢复world上逐值比较运动姿态/战斗属性，另做统一CPU配对。没有重新跑241帧历史场景，不声明它已通过。

## 实现后
候选已保留。892次编码/值/错误接受集对照、120次恢复world比较、48个Node fallback字节检查通过；原生与fallback均有净收益。实测所有SCC2都包含22舰，未缩小测试舰队。详细数字、批次单位、报告scope元数据更正及未测边界见 component-base64-performance-2026-09-25.md。
