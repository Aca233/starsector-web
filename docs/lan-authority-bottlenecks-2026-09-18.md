# 联机权威计算瓶颈与保守射界优化（2026-09-18）

## 结论

继续优先处理联机卡顿/慢动作，不扩大功能范围。已接受的改动只在 ShipCombatProfile 的射界评分循环：保守排除确定不命中的候选，仍用原三角函数精算其他候选。**不能据此宣布 32/100 舰实时联机已修复。**

3005 常驻服务没有关闭、重启或替换；所有生产复测使用独立临时端口。没有改变物理 dt、AI/伤害规则、舰船/特效数量、输入预测、播放缓冲、安全校验、协议 v22 或恢复次数。没有添加项目测试文件/运行器；诊断脚本通过 stdin/内存模块运行，证据放在忽略的 artifacts。

## 已接受改动

文件：src/engine/ai/ShipCombatProfile.ts。

- bearing/base 都来自 signedAngle，范围为 [-PI, PI]（异常数值则为 NaN）。
- 在计算 abs(signedAngle(bearing-base)) 之前，使用绝对差与两端绕回边界，只排除一定在射界以外的候选。
- 原 1e-8 射界容差之外另留 1e-12 保守余量；边界附近、绕回附近、NaN 等仍走原始三角函数。
- 不用取模近似替代角度，不量化，不缓存跨帧角度，不删除候选；仅跳过该候选中明确不贡献分数的炮座。候选顺序、同分取舍、累加顺序和最终有效炮座列表不变。
- 所有提前判定只读取函数内部新建的普通 arc 对象，没有跳过外部系统/武器回调。

### 正确性

- 508,316 组随机和边界输入，252,535 次提前排除，没有排除原判定认为有效的射界。包含正负 PI/零、极小数、容差两侧、环绕、负射界、NaN/Infinity。
- 同一冻结依赖图：32/100舰分别以 新→旧→旧→新 运行600物理步，每30步比较完整快照、战斗随机数和视觉随机数的状态摘要；各场景的四轮检查点全部一致。
- 这是上述场景和边界的验证，不是所有扩展内容及每帧私有状态的穷举证明。

### 局部性能

已演进世界中交替调用原/新 combatProfile，各8批：

| 场景 | 原每次评分 ms | 新每次评分 ms | 局部减少 |
| --- | ---: | ---: | ---: |
| 32舰 | 0.01239 | 0.01032 | 16.6% |
| 100舰 | 0.01546 | 0.01205 | 22.1% |

**这不是总帧率提升，也不是联机容量增长。** 整体模拟计时受共享机器负载/JIT影响，不能将局部百分比当作整场收益。

## 本轮定位：不是仅靠降低同步频率

真实双端、seed2232494901、两真人守护者，其余锤头，battleSize3200 / initialDeploymentLimit1600：

- 32舰原自适应同步：约11.12秒、错误tick613；强制2Hz：约15.07秒、错误tick849。都在两次恢复后结束，强制降频未解决。
- 100舰原自适应：约2.07秒、错误tick61，只有4张快照；不能归结为网络快照洪泛。
- 180步一次性预热：32舰仍在错误tick848结束；100舰额外等待约5.99秒后仍在错误tick71结束。昂贵预热未采用。
- 内部插入计时标记而不改方法身份：100舰tick13→43窗口，AI约11.55ms/步、舰船更新约15.27ms/步；舰队规划2.66ms、舰体碰撞1.55ms、特效0.02ms。不要继续优先优化小额粒子/碰撞分配。
- 进一步划分 AI 威胁评估、火力朝向、导航、系统决策及自动瞄准/预瞄/安全射击。原生CPU采样也指向舰船/武器更新、索敌、射界与导航；计时器版本自身有开销，不作为性能收益基准。

## 未采用的实验

1. **评分结果 Map 缓存**：保留候选比较顺序后状态一致，但局部基准没有稳定收益，未落地。
2. **独立快照编码 Worker**：保持消费ACK和最终快照先于结算，32舰仍约11.23秒过载（相邻基线9.50秒）；100舰约1.83秒过载（相邻基线2.18秒）。没有足够整体收益，正式代码不增加编码线程。
3. **生产编译目标 es2022**：确认可保留原生类字段，但32/100舰真实双端仍过载。不能用开发探针速度替代生产验收；受控编译对照另有记录，未据单次成绩修改兼容性配置。

实际房间 match 与既有隔离 fixture 已核对：除房间/玩家随机ID和显示名外相同。独立生产Worker（不渲染/不转发）也能过载，说明房主计算瓶颈并不依赖其他客户端渲染。直接Worker诊断第一次忘记发送 start，只得到tick0；已补开战消息重新测量，不能把第一次静止结果记作通过。

## 最终复测

隔离生产构建：artifacts/lan-arc-bound-candidate-preview，build ID **2026-09-18T06:44:10.409Z**。typecheck、lint、构建通过（仍有既有大 chunk 提示）。

| 规模 | 观测窗口 | 服务端最后 tick | 结果 |
| --- | ---: | ---: | --- |
| 8舰 | 20.03秒 | 1201 | 0.99923×，仍运行，0恢复/Worker error/pageerror |
| 32舰 | 15.78秒 | 849 | Worker在tick867第三次过载，结束 |
| 100舰 | 1.95秒 | 49 | Worker在tick55第三次过载，结束 |

**32/100舰仍明确失败，不算联机问题解决。** 不把单次结束时间与前几轮噪声数据比较成整场加速百分比。8舰的最初输入探针误读了不存在的 throttleInput（真实字段是 throttle），此诊断错误保留在原始输出；另行修正字段后重新测试输入。

构建和场景使用冻结图；验证期间其他任务又修改了若干 studio UI 文件，未覆盖这些改动，也不声称它们已纳入本轮冻结构建。

修正字段，并在切换浏览器窗口后等待重新同步/可操控再按键，真实双端输入复核通过：

- 房主按下W：权威tick1336、ack505、throttle=1，位置确实推进；释放tick1426、throttle=0。
- 客机按下W：权威tick1609、ack789、throttle=1，位置确实推进；释放tick1699、throttle=0。
- 最终服务器running、tick1723、双方loaded，无Worker error/pageerror。
- **这次复核出现过1次361ms自动恢复（tick619）**，所以不能把它描述成完全无卡顿。此前一轮20.03秒窗口为0恢复，两者分别保留；没有隐藏重试。
- 中间一次输入探针未等待切换窗口后的同步恢复，客机断言失败；增加“HUD不再inert且窗口聚焦”的等待后重新测量，未为使探针通过修改游戏输入逻辑。

## 证据

- artifacts/lan-arc-bound-candidate-sources.json、lan-arc-bound-differential.json、lan-arc-bound-boundaries.json
- artifacts/lan-cadence-current.json、lan-warmup-experiment-live.json
- artifacts/lan-stage-profiler-live.json、lan-logic-profiler-live.json、lan-cpu-profile.json
- artifacts/lan-profile-score-differential.json、lan-encoder-worker-live.json
- artifacts/lan-native-fields-live.json、lan-fields-differential.json、lan-production-worker-isolated.json
- artifacts/lan-arc-bound-live-final.json、lan-arc-bound-controls-final.json、lan-arc-bound-controls-focus.json
- artifacts/lan-bottleneck-disposition.json

诊断候选源码/构建留在 artifacts 只供复现，不代表已交付功能；正式源码不会包含预热、阶段计时标记、评分缓存或独立编码线程。


## 后续：武器提示分类

后续的[扫描内不可变提示分类优化](lan-missile-classification-2026-09-18.md)保留原实时属性读取顺序；局部查询有小幅收益，但最终 32 舰延长复核和 100 舰双端仍过载，不能将此处问题标记解决。
