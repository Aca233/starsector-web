# 本地快照索引复用：真实 Worker 结果（2026-09-25）

## 保留的生产改动
仅修改 src/engine/runtime/local/CombatPresentationEncoder.ts：
- WeakMap 身份记录携带本帧入队标记，替代每帧新建的 seen Set。
- snapshots Map 原地维护；每帧读取所有原有字段与数值，用独立帧标记识别仍可达节点，删除其余条目。不缓存可变世界状态或跨帧合法性。
- 重用上一帧已有 ids 数组保存 BFS 次序，生成 removed 时与旧实现顺序完全一致，不使用持久 Map 的历史插入顺序。
- 标记为每帧一个空对象，不依赖 tick 或可溢出的数字计数器；同 tick 重复捕获仍是独立帧。

未改变协议、属性读取顺序、身份编号规则、浮点数、武器/舰船/特效数量、AI/物理、Worker 并行成本门、捕获字段、类型/预算检查、UI 或渲染频率。不增加跨帧 payload 队列。没有 GPU compute。

## 为什么选此处
之前的真实200舰 CPU profile 中 captureDelta 含时约2053ms、自身约727ms、GC约1164ms（整段采样，不是单帧，包含时间不可相加）。本轮修改前 encoder 哈希与该轮已验证源图相同。当前代码每帧重新构建大型 Set/Map，属于实际热路径。

修改前通过既有真实 Worker 基准的新增 --build-only 选项冻结当下完整297模块源图，不额外跑一次性能测试。验收后源图只有 encoder 一个生产模块不同，所有当前源码均匹配最终测试源图；见 graph-comparison.json。测试夹具改动不进入生产模块图。

## 正确性与失败记录
- TypeScript 类型检查、修改文件 lint：通过。
- 既有 render-projection 场景的原有检查已执行通过；首轮在新增索引场景中因测试将解码器的无原型记录误写成普通对象期望而停止。没有修改解码器或放松断言迎合测试。
- 新增断言显式检查 prototype===null 后比较完整字段；只定向重跑索引场景和相关 lint，232项检查通过。
- 30个同 tick 的连续帧与冻结旧 encoder 逐包比较：所有有效二进制字节、visuals、strings、shapes、metadata、removed、计数和头字段均相等。两实现使用同一模块图/类，不通过另建 simulation realm 绕开原型与类型检查。
- 覆盖共享引用、环、Map/Set、typed arrays、Vector2、-0/NaN/Infinity、动态 getter 重读、重排后的删除次序、移除再插入同一对象、元数据离开/重入、480个临时节点退场、Map 身份复用及 liveNodeCount 一致、失败 epoch 不可重试、新 encoder 隔离。
- 首轮失败日志保留在 contracts.log；定向成功在 index-recheck.log。未重复运行整套合同测试。

## 真实200舰配对验收
环境：全新无头 Edge153、16逻辑CPU、cross-origin isolated、真实生产 local Worker 与 owner Worker。200 Onslaught，种子917，固定1/60步长，150步预热 + 180步测量。

旧源码串行参考、旧默认、新默认三个世界交替运行，不同时驱动。旧默认 tick49 退出亏损多核，新默认也为 tick49；测量窗口双方均为串行，freshBatches=0。没有通过删掉测量窗口内旧版并行开销伪造收益。

| 指标 | 修改前 | 修改后 | 本轮变化 |
| --- | ---: | ---: | ---: |
| 快照编码均值 | 22.301ms | 18.311ms | **−17.89%** |
| 快照编码 P95 | 32.275ms | 22.690ms | **−29.70%** |
| Worker 往返均值 | 79.029ms | 63.960ms | **−19.07%** |
| Worker 往返 P95 | 94.150ms | 77.255ms | **−17.94%** |
| 模拟计时均值（观测） | 56.336ms | 45.289ms | −19.61% |

模拟代码未改变，不能据该观测断言物理/AI算法本身快了19.61%。编码分配改变会影响后续GC/VM行为，但本轮未单独剖析/消融此归因；将它作为整步运行观测记录。旧串行参考模拟均值56.726ms、编码21.925ms，与旧默认较接近；仍不等于已完成跨机器或多次独立重复验证。

330个tick中，旧默认/新默认各与旧串行参考逐tick核对，共660次有效显示数据、回放witness、声音、命令回执和胜负比较；11个检查点 × 2组，22次完整权威二进制和隐藏火控跟踪器/目标/RNG比较，全部一致。

## 解释边界
- 往返包含计算、编码、transfer/回执，是本地 Worker 指标，不是公网网络RTT、玩家输入到屏幕延迟或实际FPS。
- 这是一轮固定舰队规模的交替配对，不宣称统计显著性或所有混编/模组均有相同收益；未重新运行其它规模性能矩阵。
- 模拟约45.3ms仍超过60Hz的16.67ms预算，**大规模实时率目标尚未解决**。
- 此路径是本地显示编码器，不把它冒充普通联机房主 captureLanDisplayCombat 编码链路的直接提速；上一轮联机预检改动保留不动。
- 无头测试已关闭自己的浏览器、Worker和临时服务器；未启动可见窗口、子代理，也没有提交、推送、打包发布或更换安装目录。

## 文件
证据：artifacts/presentation-index-20260925/。包括 before/、完整 baseline-sources.json / after-sources.json、graph-comparison.json、检查日志、index-recheck/contracts.json、real-worker-200/result.json、measurement-summary.json、acceptance.json。

原理与修改前契约见 docs/presentation-index-source-notes-2026-09-25.md。继续优化目标保持 active，下一步仍需处理模拟热区/接收端成本并在对应真实路径验证，不能由本次局部收益宣称整体完成。
