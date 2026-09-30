# 显示编码按记录预留缓冲区：修改前对照（2026-09-25）

上一目标回合属于进展：真实200舰对照表明形状缓存交付均值收益仅0.47%且连续区间不稳定，已精确撤回生产候选，保留回归证据。本轮重新读AGENTS和源码；当前301模块与该轮baseline逐hash相同，无正在等待的旧测试。独立执行，不使用子代理、可见窗口或OS键鼠。

## 来源与预期

本机原版0.98a-RC8：重新读取`../starsector-core/data/config/settings.json:8–9`（vsync/60fps）、`../decompiled/starfarer.api/com/fs/starfarer/api/combat/CombatEntityAPI.java:16–20`（位置/速度/朝向）。原版没有Web Worker显示图协议；这里只优化内部编码，严格保留当前字段、浮点数、顺序、数量、频率及校验，不修改玩法或UI，不声称原版实机已核实。

当前encoder与已采样的captureGraph热点源码相同。上一回合200舰默认Worker编码均值约21.85ms，模拟约46.53ms。捕获阶段已先完整读取一个节点的所有字段，知道其数值区长度at，但写出阶段仍对每一个Float64调用write，重复执行预算和容量检查，巨大节点还可在同一行内多次分配/复制逐级扩容的中间数组。

## 候选

保留完整字段读取与变化判断、BFS身份/退休顺序、字符串和shape首次出现顺序、metadata/visuals；只在写一个变化节点前，按确切header+payload长度一次性校验及预留容量，随后直接填充Float64Array。

- 根引用2项；Vector为2+at；Typed为4+at；Object/Array/Map/Set为3+at。没有任何字段省略或比较缓存。
- `fullUnits`仍按全部活节点检查；节点数、类型、禁用属性、元数据和失败epoch验证不变。reserve自身仍校验VALUE_LIMIT，不取消预算。
- 容量使用原有倍增及VALUE_LIMIT封顶规则，计算最终目标后一次分配，省掉巨行的中间扩容。有效数据、最终容量、旧buffer复用及同tick多次捕获保持一致。
- 超预算/异常仍使整个epoch失败；失败调用的recycled缓冲区是不可发布的临时工作内存，不承诺其部分写入痕迹。

## 验收

先使用既有benchmark-real-workers build-only冻结301模块并保存旧encoder。扩展既有render-projection场景覆盖各种节点布局、多个容量边界、不同recycled容量、一次跨多级扩容、增长/缩小/同tick/Getter/环/别名、异常后epoch失效；同模块图旧encoder逐包全部字段及有效二进制字节对照。一次类型/改动lint/既有场景后，真实200 Onslaught/seed917/150预热+180测量tick逐tick交替配对，无profiler或探针，不择优重跑。无稳定净收益则按hash仅恢复本轮encoder，保留测试与证据。

## 最终状态

4459合同检查及真实Worker状态对照通过，但交付均值+0.49%，未保留生产候选。按hash精确恢复唯一encoder，301模块等于本轮baseline；新增边界测试保留。详见同日performance文档与acceptance.json。
