# Phase45：伤痕出生配方，本地固定样式重建（实验边界）

2026-09-22。此前Phase44两版没有达到门槛，不能当作默认基线。本阶段仍对照实际Phase38/41生产路径。

## 原版证据 → 行为 → 差异 → 验证

重新读取本地0.98a反编译：`../decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/String.java:159–188`为舰体模板/透明度裁剪；`OOoO.java:160–168`为热光整数通道；`void.java:31–58`为随时间随机闪烁。保持现有渲染器及权威热光，不将不同客户端自己的随机数替代权威动画。原版桌面实机同屏对照待许可，本轮不操作桌面。

当前 `ShipDamageState.onCellDamage` 生成伤痕时连续消耗6个visualRandom样本：kind两次、variant、rotation、size、pulsePeriod。`Ship.ts`传入视觉随机源。使用 `reserveSamples(0)`记录原游标，原6次调用顺序与权威advance不动。ArmorGrid几何及出生时的cell坐标决定localPos。预期：相同8项可见值，出生配方代替固定样式重复复制；动态opacity/intensity仍为原始float64。

## 设计边界

出生记录只在实验/协商明确启用时记录，使用WeakMap，绝不作为可枚举模拟字段。仅native图允许配方；非native/关闭选项完全保留旧捕获。严格标准14字段、原生Vector2、有限数值、几何和出生样式未变才用配方，否则整个marks回旧路径。每帧自包含几何和每行 `[geometry, cellIndex, birthCursor, opacity, intensity]`，冷加入/丢帧不依赖事件重放。接收端仅缓存可重新计算的固定样式，FIFO容量受限，无网络基准。缓存与接收对象不得共享可变向量/记录。

新 `$damageMarks` 标记不能给旧接收端。实验阶段不接默认路径；只有完整门槛通过后才做LAN/Steam能力协商及真实多人验收，不把实验打包成能用版本。

## 预声明验收

沿用Phase44：独立旧快照oracle只容许6个权威动画内部量省略，其他全部P1字段及8可见伤痕值严格相等；捕获前后权威/RNG不变。使用实际ShipDamageVisuals做像素对照；自包含恢复、未知对象回退、异常包大小/数字/索引、缓存有界与所有权需覆盖。

Chromium同22船，3/5顺序接收副本，A/B及B/A：总P50≤.95、总P95≤1.10，生产端P50≤.85，逐帧未压缩字节不增。不降低Hz/精度/预算/恢复门槛。额外比较同轨迹双权威模拟（出生记录关闭/开启），记录新增physics成本及包含physics的总成本，不只测捕获。通过后才进入真实delta/压缩与多人集成。若收益不足停止该候选，不调松门槛。
