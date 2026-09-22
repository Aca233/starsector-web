# Phase44：明确伤痕网络视图边界（实施前）

## 当前证据和原版

上一轮为进展：排除生成循环候选，且拆出伤痕字段占3个晚期帧样本完整未压缩字节21–26%。本轮重新查当前源码消费者，不将这些字节比率当CPU或延迟改善率。

原版0.98a：重新读 `decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/String.java:159–188`（模板/stencil/alpha遮罩）、`OOoO.java:160–168`（整数热光通道）和`void.java:31–58`（.03闪光几率、计时和衰减）。原版实际画面对比因禁止桌面操作仍待核实，不声称原版实机验收。

Web：`ShipDamageState`先计算强度，`ShipDamageVisuals`只消费cellIndex/位置/opacity/intensity/size/rotationRad/kind/variant，不读heat/justHit/flash/flashElapsed/phase/pulsePeriod。`LanBattle`只应用展示快照；`MotionPrediction`明确禁止完整fixedUpdate，`LocalFirePrediction`不调用fireWeapon/fixedUpdate。当前P1快照本来就不是可恢复模拟检查点。

## 有证据后修正上轮方向

不急于把随机闪光循环挪到客机：客机当前根本不需要房主的六个动画内部变量，它只需要已计算的准确opacity/intensity。先建立显式、只读的伤痕网络/渲染视图，**不改随机、动画算法或可见精度，也不变成客机推断伤害**。

候选只在显式native且renderDamageMarks选项开启的捕获路径，对ShipDamageState.marks内默认14字段、原顺序普通记录去掉六个内部变量；保留8个呈现/身份字段及全部装甲、武器、盾、伤害、受击状态。未知布局/自定义数组/类走原完整捕获。普通capture默认保持旧完整行为，wire仍用原记录/布局，不新增不认识的marker或远端基准。每帧仍自包含，冷加入和跳帧不能依赖旧字段。

## 契约和验证（先声明，不以通过为理由临时改断言）

旧/新wire当然不再逐字节相同，因为明确不复制六个非呈现内部量。独立测试oracle必须展开旧布局/投影，**仅允许在默认伤痕记录这六个具名字段出现差异**，所有其他完整字段都逐项比较；不得只比较抽样位置/HP，也不得使用候选逻辑做oracle来掩盖其他遗漏。实际恢复后重新比较同一明确的完整P1契约；旧完整调试/非native入口不变。房主全状态和RNG在捕获前后不变。画面用同状态像素比较证明opacity/intensity/位置/纹理/角度全部保留，含冷加入/跳帧和本地显示对象重用。

功能边界必须覆盖选项开关、陌生布局、字段顺序/增删、稀疏/自定义数组和generic getter/Proxy原有行为；不得改权限、精度、Hz、预算或超时。标记本实验不是模拟状态迁移/断线接管协议。

Chromium22船3/5顺序副本A/B+B/A：完整capture+encode+所有decode/apply每组P50≤.95、P95≤1.10、生产端P50≤.85、线字节不增。通过后再Node真实delta/压缩和真正多人验证；所有阶段合格才接默认LAN/Steam。测试脚本/候选先放实验路径，不碰生涯、不用子代理、不占用桌面、不发布。

## 第一版结果后的实现修正（仍未启用）

第一版仅缩小布局，仍逐伤痕走Object.values/通用递归，Chromium完整P50改善约1.4–3.7%，生产端仅3.6–9.4%，未过门槛。下一版保持**完全相同的8字段wire**，对严格默认字段、普通数组/对象、原生Vector2和有限数值直接构造已存在的record批次；不再先捕获14字段再删6字段。一次预检失败便回旧投影，不在验证过程中污染布局表。新增与第一版逐字节相等测试和实际命中计数，避免悄悄改变契约或只测回退。仍对最初旧版比较同样门槛，不重设对照组。
