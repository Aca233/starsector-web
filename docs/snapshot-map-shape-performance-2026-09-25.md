# 大快照接收对象形状候选验收（2026-09-25）

## 结论

**候选已撤回，没有新增生产性能改动。** 普通 JS map 一次性构造完整形状，在本次64舰场景中让后续 apply 均值下降3.62%，但 decode 上升9.95%；decode+apply 只下降1.53%，P95反而上升1.18%，完整五段CPU流水线增加2.51%。不能据此宣称更流畅或更低输入延迟，不追加跑分寻找有利样本。

保留4项回归、可选冻结旧 bounded reader 的导入能力、全部原始样本和候选源码。之前接受的优化及生涯WIP没有撤回。版本仍为0.2.11；无暂存、提交、打包、发布、默认 display-v2 或完整 presentation Worker 开启。

## 候选范围

仅修改过 `src/network/BoundedSnapshotReader.mjs` 的 map 容器创建：17–256项先逐值解码为键值对，再由 Object.fromEntries 创建完整形状；小/超大map保持旧路径。意图避免逐项插入导致V8字典属性，减少下游遍历成本，而不是跳过字段或定义校验。

为保留继承赋值语义，解码每个值后检查该键是否在 Object.prototype 上；必要时立即物化先前项并改回顺序赋值。临时数组只随成功解析增长；禁止键、字典索引、container/depth/slot限制、原UTF8错误fallback、packed number只读共享契约和每帧普通对象所有权均未削弱。

该候选作用于实际 map 编码的对象；既有 `$record`/`$records` 小封装和数值数组不因此变为新布局。不是所有武器元数据都走此路径，不能将局部隐藏类假设当作全部接收热点的结论。

## 一次 ABBA 对照

冻结306个CPU入口输入，只有 BoundedSnapshotReader.mjs 不同。沿用 build-authority-cpu-probe / benchmark-authority-cpu，默认display-v1、2 Onslaught+62 Hammerhead、seed917、固定1/60、240预热+240测量tick，每tick capture→encode→decode→实际LanDisplayWorld apply。旧→新→新→旧各一个新Node进程，没有profiler；与本任务typecheck/lint/回归串行，未启动其他性能任务。未控制用户的外部系统负载。

| 阶段 | 旧均值ms | 候选均值ms | 变化 | 旧P95ms | 候选P95ms |
|---|---:|---:|---:|---:|---:|
| simulation | 12.3096 | 13.1734 | +7.02% | 20.2846 | 22.0643 |
| capture | 6.6251 | 6.8842 | +3.91% | 9.8501 | 9.8285 |
| encode | 5.2396 | 5.5067 | +5.10% | 7.3108 | 7.5693 |
| decode | 2.9811 | 3.2777 | +9.95% | 5.0326 | 5.1044 |
| apply | 16.3507 | 15.7583 | −3.62% | 20.3292 | 19.6802 |
| decode+apply | 19.3319 | 19.0360 | −1.53% | 23.5499 | 23.8273 |
| 权威三段 | 24.1743 | 25.5642 | +5.75% | 33.7199 | 35.4753 |
| 完整五段 | 43.5061 | 44.6002 | +2.51% | 56.4577 | 57.0728 |

- 旧两轮 decode+apply：19.5260 / 19.1377ms；候选：18.6560 / 19.4159ms。改善不稳定，第二候选轮比第二旧轮更慢。
- 未修改的模拟/捕获/编码也波动，不能把这些阶段变慢直接认定为候选的确定因果；但现有证据足以拒绝将其作为净优化保留。
- 这是Node CPU循环，不含浏览器渲染、Worker IPC、socket/relay、实际计时器或输入。不是FPS/RTT/输入到画面测量。

## 正确性、回退和留下的覆盖

1. 同一份非生涯图冻结666模块，CompilerHost对照的旧/新诊断都为0；其它依赖/生涯文件在第一次读时固定，两臂共享。不是宣称脏工作区全体功能已经验收。
2. 改动文件oxlint及diff空白检查通过；既有 shared-snapshot-codec 共17项通过（含4项新增）。新增用生产reader私有类的测试导出直接运行单遍reader，避免公开decoder的旧实现fallback掩盖新实现错误；旧工厂由 `BOUNDED_SNAPSHOT_BASELINE` 指定并独立载入，共享其它依赖实例。
3. 覆盖17/256等大小分支、原型/数据descriptor、重复键与整数枚举顺序、Unicode、全部128个字典键；逐字节截断、畸形key、容器/深度/slot与尾随数据、旧UTF8回退；继承setter和嵌套原型变化的执行顺序；保留帧和transfer后对象独立性。默认不传baseline时也保留明确预期/拒绝/顺序断言。
4. 四轮都是159908567 bytes，峰值320 projectile；累计wire SHA256：`7c9f3591e161caf4011df4db5e35de922b4a6d36d36571702eb99ff5d1b524e3`。完整末态接收图摘要：`51597611e81c2176766e5d68cef4b1e77eedf4c197ebecc6bd8c2f498e67d93a`。包含原型名称、数字、typed data、Map/Set、别名、循环、自有属性标志；不是所有历史中间状态或视觉等价证明。
5. 回退前核对candidate hash，保存 `.rejected.mjs` 后只还原该文件。666个非生涯生产模块全部与本轮开始hash相同，没有新增模块、没有源漂移。回退后仅定向复查新增4项，全部通过；没有再跑性能。

## 后续判断

与此前标量递归/guard重排/编码分派失败结果一致，不能靠反复调整通用对象遍历获得可靠的大收益。应优先解决整段接收恢复与渲染的线程归属，并避免Worker恢复后又把完整对象图复制回主线程；完整默认路径、生命周期和实际输入到呈现测量仍需后续实现/验收，本轮未完成或启用它。

## 产物与复现

目录：`artifacts/snapshot-map-shape-20260925/`。包含修改前/候选源码、前后CPU bundle及source map/306输入hash、666模块冻结图、四轮全部samples/result/replica图、comparison.json、typecheck/lint/check日志、restored-source.json。来源边界见 `snapshot-map-shape-source-notes-2026-09-25.md`。

单轮命令：`node <baseline或candidate-cpu.mjs> --out <新目录> --ships 64 --players 2 --steps 240 --capture lan-display --packed-numbers --apply-replica`。

定向回归：设置 `BOUNDED_SNAPSHOT_BASELINE` 为产物中的旧工厂路径，再运行 `node --test scripts/check-shared-snapshot-codec.mjs`。候选源仅作历史证据，不是当前生产实现。
