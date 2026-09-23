# Phase42：私有数字块捕获/编码纵向实验（实施前）

## 证据与原版边界
重新读取0.98a ArmorGridAPI.java:10–35：完整逐格装甲值及getGrid均独立存在，不得压成一个总血条或有损精度。本轮不改格子、玩法、武器、HUD或权威物理。原版实机画面对比因桌面限制未进行；这不是借用原版网络算法。

Phase39 CPU profile的pack位置采样经同一冻结源码Vite转换重建，所有pack入口行精确对齐213；最高位置136样本在typed Array.from行，其次Object.values124、递归写入115。这里只是位置采样，不将样本比例换成CPU毫秒。Phase42原生22船计数：44个Float32Array，tick0为4104值；tick600/1200为5400值、21600字节；数组最大252。此前固定属性读取没有解决这些数组的重复装箱和编码。

## 最小结构性替换
保留旧captureCombat/default API的可修改完整投影。仅测试新的私有packet捕获入口：对严格原生、非共享/非自定义iterator的Float32Array逐个原始32bit比较；不能只信dirtyVersion，因为cells公开且存在直接set。未改变的数字块复用私有不可修改的完整MessagePack数组字节，而不是每帧Array.from再逐值编码。变化时重建，与原float64/整数线表示逐字节相同；不删字段、不改wire、不建立远端基准。旧帧不会读活模拟数组，JSON回退通过生成独立普通数组保持现有JSON，通用/异常/自定义类型走旧路径。

缓存必须定量有界，源对象弱持有；编码字节不能通过输出transfer/toJSON修改到缓存；标记不能由外部普通对象伪造；仍做depth/length/budget校验。纯数字不可变块的已验证字节只省重复验证，不授权跳过普通数据校验。原接收端、ACK、重连、保护保持。

## 门槛
先保证完整帧binary/JSON等价、变化/旧快照所有权/特殊数字与自定义迭代器回退、缓存上限、深度/危险键/transfer边界。Chromium与Node完整现有delta+压缩管线都以相同轨迹3/5顺序副本做A/B、B/A；每对完整P50至少减少5%、P95不恶化超过10%、wire字节不增，且producer(capture+encode)至少减少15%。候选codec成本必须计入candidate，不能用同一新codec给control隐藏开销。全部合格再实际5人默认路径对照；不合格不启用，不降低门槛。未发布、不碰生涯。
