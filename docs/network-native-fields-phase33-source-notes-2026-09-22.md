# Phase33 主机捕获字段读取：编码前对照（2026-09-22）

## 证据与边界
已重新查阅本机 `../decompiled/starfarer.api/com/fs/starfarer/api/combat/DamagingProjectileAPI.java`（getDamageAmount/getBaseDamageAmount/didDamage/isFading）以及 `../starsector-core/data/weapons/proj/tpc_shot.proj`（BALLISTIC_AS_BEAM、length100、fadeTime0.3）。本轮只替换网络捕获内部遍历，不改这些玩法/视觉字段，也不宣称原版实机/UI等价；原版版本沿用既有核实，未额外核实安装版本。无需占用桌面。生涯和其他任务的AI修改不在写入范围。

Phase32真实5人loopback：物理约60Hz，produced约27–35Hz且uploaded基本跟随，不能据此归因于Steam或n2n。当前代码snapshot只在完成物理tick后发布，catch-up可合并tick；不能删除背压或强行每tick额外捕获来虚增Hz。

新采样 `artifacts/network-stream-20260922/phase33/producer.cpuprofile`：22舰同源轨迹，180tick每tick捕获/编码8次，均值capture2.878ms/encode2.074ms（诊断用，不是实战吞吐）。pack自采样1878，其中计划字段 `value[keys[i]]` 392、标量/递归push341、function检查133；说明动态逐字段读取是值得实验的CPU热点，不证明一定收益。

## 实验
仅显式nativeCapture且已通过现有shape检查的本机构造无Proxy/无自定义访问器图，可一次Object.values取出自有可枚举字段，再按缓存raw索引投影/递归；避免每个字段按字符串动态查找。索引由完整Object.keys顺序验证，新增/删除/重排字段仍使shape失效；函数值变化、SKIP、路径级省略、精度、布局顺序、undefined、循环和引用发现保持。所有输出仍为帧私有。generic/custom原路径不动。若更慢，不接生产。

## 预设门槛
- 对照为本轮开始的当前WIP，而非git HEAD或pre-Phase32；两臂均保留Phase32有界解码和nativeProjection恢复。
- 22舰、3/5离线接收副本、30预热+120实测tick，A/B与B/A，比较capture/encode/delta/compress/inflate/decode/apply。每对capture P50至少改善10%，总CPU P50不恶化超过3%，总P95不恶化超过10%。本轮针对单个生产端瓶颈，不复用上一轮接收端5%总收益数字。
- 完整二进制、delta、压缩字节完全一致，恢复结果一致。形状变化、函数值切换、稀疏数组、循环、特殊数值、拥有权和泛型读取次序专项回归。
- 通过后默认接线并跑回归，冻结源码实际LAN无头3/5人；尽可能成对测新旧，不把多本地浏览器争CPU等同远端Steam/n2n。若不能到60Hz明确剩余限制。
- 不改目标Hz/精度/接收窗口，不开启旧负收益serializer或Phase31胶囊，不提交/推送/发布，不启动可见窗口。

## 补充验证（多人对照进行中、Chromium测试前记录）
实际3人连续测试出现较大波动，不能将Node捕获收益直接视为Chromium/桌面Worker收益。新增纯Chromium同权威状态生产端A/B、B/A验证：两臂共同场景、同tick、同浏览器VM，每臂capture+encode，逐帧字节比对；30预热+120实测tick。不占GPU渲染、不测RTT。它补充引擎差异证据，不替代真实联机、也不降低已有门槛；实际Hz趋势不稳定就明确报告未证实。

## 二次候选：同次捕获内原位投影（测试前记录）
关闭Vite隐式全仓依赖扫描后，纯Chromium首个候选有一方向capture仅改善7.6%，未过新增的每对10%门槛，结果保留为负例，不降低阈值。下一候选复用**本次Object.values新分配数组**作为输出values，按单调递增raw索引就地写回packed值，去掉第二个values数组以及push扩容。写入位置永远不大于当前读取位置，后续字段不会被覆盖；遍历后裁剪长度。没有复用跨帧数组/对象，没有写authority图，函数过滤、SKIP及递归顺序不变。重新跑完整字节/回归、Node全管线和Chromium门槛才接受。
