# 差量解码只读补丁覆盖层：否决（2026-09-26）

## 结论与当前状态

**不保留本轮候选。** 省掉常规稀疏补丁的整行slice，并没有带来真实Host净收益：显示接收均值+8.91%、P95+7.51%，六个连续30tick段全部变慢；完整Host交付均值+0.51%。不能因复制操作减少、未改动的模拟侧均值下降或交付P95略好就接受。

已按本轮before原字节恢复Decoder及check-render-projection测试入口，将新边界合同移入candidate工件。未回退Git HEAD。317模块相对本轮基线的最终漂移为[]；上一接受ObjectPatch的Decoder/Wire/Encoder/协议四文件hash全部匹配，原有收益和并发舰装工作仍在。

## 候选边界

详见decoder-patch-overlays-source-notes-2026-09-26.md。只改Decoder一个生产模块，不改Encoder/Wire/协议15或任何玩法、模拟频率、精度、实体/字段、字段写入、图校验/预算。

- 稀疏补丁用index/tag/normalized-value三元组；常规apply借用内部accepted row为只读base，验证与显示写入两遍线性合并。
- 所有字段仍逐个验证和写入，引用/metadata边仍完整重建，可达图/根/view/展开预算全部保留；String仍是实际值而非包内索引。
- 在全部显示写入和retained typed-array父节点重绑成功后，才写回内部历史。嵌套apply用复制base回退，try/finally维护重入深度。
- 不复活Entry复用、keys共享、公开显示对象池等既已否决的组合。

## 集中验证与定向修复

- typecheck通过（9631ms），三处改动oxlint通过（125ms）。
- 既有ObjectPatch合同先通过，包含24包与12错误包、消费者未变字段覆盖、特殊数值、metadata/ref、布局/退休重入、正常typed-array别名及UI字节路径。
- 新增边界组初次失败在一个过强的测试断言：冻结旧Decoder在重绑setter抛错后重试，也不保证恢复之前已部分重绑的全部显示别名。因此本轮只承诺保留旧行为，不能声称显示对象完全事务回滚。
- 只修测试断言，未改生产实现；仅定向复跑新增边界组与改动测试lint，均通过。旧组/typecheck不重复运行。保留初始失败日志。
- 新边界组82379 checks、13次双Decoder成功应用、12次拒绝（包括重入后抛错）、4次嵌套调用。覆盖root/view自己为ObjectPatch及畸形覆盖值、早期patch写成功但后部setter抛错、retained typed重绑抛错、同包重试、嵌套成功/失败及完整已接受历史对照。

说明：无效包在显示写入前拒绝；实际setter抛错可能留下旧版同样的部分显示修改，接受索引/历史不提前提交。setter内成功嵌套apply的提交不因外层抛错回滚。不支持直接修改Decoder私有row或全局内建集合的行为。

## 唯一正式性能运行

真实production LocalWorkerHost，200舰（onslaught/onslaught）、150预热+180测量；三个串行臂逐tick交替。无性能/阶段/计数插桩，完整包和图审计在计时外。317模块全冻结，两臂仅Decoder不同；measured图与candidate图逐项一致，测量结束生产源码与工具hash均无漂移。没有重跑挑样本。

| 指标 | before均值ms | after均值ms | 均值变化 | before P95ms | after P95ms | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| simulationMs | 34.442 | 33.832 | -1.77% | 41.620 | 40.930 | -1.66% |
| encodeMs | 16.866 | 16.933 | +0.40% | 20.660 | 20.220 | -2.13% |
| roundTripMs | 51.664 | 51.138 | -1.02% | 62.685 | 60.770 | -3.05% |
| hostPresentationMs | 9.389 | 10.226 | +8.91% | 12.120 | 13.030 | +7.51% |
| deliveredMs | 61.082 | 61.393 | +0.51% | 74.065 | 73.195 | -1.17% |

| 30tick段 | Host显示接收变化 | 完整Host交付变化 |
|---|---:|---:|
| 1（151–180） | +9.54% | -0.54% |
| 2（181–210） | +7.37% | -1.90% |
| 3（211–240） | +7.99% | +1.68% |
| 4（241–270） | +7.84% | -0.54% |
| 5（271–300） | +9.04% | +0.99% |
| 6（301–330） | +11.43% | +2.88% |

未改Worker模拟代码，simulation均值-1.77%不能作为本候选的提速证据；也不以端到端混合噪声掩盖显示接收的六段一致退化。额外合并/分支/小数组可能抵消slice减少，但无分配/GC/指令采样，本轮不能断言具体成本归因。结论限于此实现无净收益，不泛化为所有缓存或对象池无效。

## 正确性、范围与工件

- 660次witness/原始有效包/回执对照，662次完整显示图、18,103,234节点、11个权威检查点均通过；freshBatches/invalidated为0。
- 三臂Host结束均ready、pendingTransactions=0、tick=330；正式命令exit0。
- hostPresentationMs包括生产Host解码和map/deployment/string处理；deliveredMs包含输入复制/排队/ACK/回放日志/Promise交付，不是纯Decoder时间，也不是实际网络、渲染或input-to-photon延迟。
- 不跨不同轮次报告比较绝对毫秒；本轮没有GPU收益结论。
- 工件目录：artifacts/decoder-patch-overlays-20260926。保留before/candidate源码、三份冻结图、decision-policy、验证失败与修复日志、原始结果、performance-analysis、restoration与final-verification。
- 未操作桌面、未用子代理、未暂存/提交/打包/发布。总优化目标仍未完成。本轮不再原样尝试只读行补丁overlay。
