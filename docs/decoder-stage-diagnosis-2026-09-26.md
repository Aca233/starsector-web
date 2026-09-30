# 真实Host显示解码阶段诊断（2026-09-26）

## 结论与下一步
在当前315模块冻结源图上补充一次真实LocalWorkerHost诊断，不修改生产源码。单个解码器apply均值约8.470ms，其中完整可达图校验2.239ms、字段写入1.845ms、packed visuals提交1.707ms、解析计划1.432ms；分配Entry/显示容器阶段仅0.321ms。**证据不支持优先继续堆叠Entry对象池**。

每帧平均15215.65个唯一节点，却有18627.5次pending访问（额外3411.85次）；需要验证的完整引用边19430.5条，元数据引用4083.8条。下一候选选为“有序Set即工作队列”，只去除独立重复队列和显式membership操作，保持原首次发现BFS顺序及全部校验。不复活之前的条目复用/共享keys组合，也不从本诊断推算节省比例。

## 运行边界
新无头Edge153，200 Onslaught、seed917、固定1/60步长，150tick预热+60tick（151–210）测量；原有serial/default两个世界逐tick交替。测量段两臂freshBatches=0、invalidated=0，全部诊断计数逐tick相同。开启host-stages和新的decoder-stages，包含计时/计数开销及可能的GC暂停；不是无插桩性能基准，不能与此前运行相减声称提速。

| 解码阶段 | serial均值ms | P95 ms |
|---|---:|---:|
| headerShapesVisualValidationMs | 0.804 | 1.335 |
| metadataRemovalsMs | 0.015 | 0.025 |
| parsePlansMs | 1.432 | 1.855 |
| envelopeMs | 0.007 | 0.010 |
| reachabilityMs | 2.239 | 2.560 |
| allocateMs | 0.321 | 0.435 |
| writeValuesMs | 1.845 | 2.320 |
| rebindMs | 0.001 | 0.005 |
| commitMs | 0.094 | 0.120 |
| graphTotalMs | 6.759 | 8.335 |
| visualsMs | 1.707 | 2.135 |

graphTotalMs包含上面的所有graph子阶段，不能重复相加；visualsMs在applyGraph外。逐行核算子阶段总和与graphTotal差值最大0.005001ms；graphTotal+visuals与Host decodeApplyMs差值最大0.015001ms（含计数结果整理和调用边界）。默认臂graphTotal均值6.708ms、visuals 1.721ms，阶段排序接近；不据此声称多核收益。

计划数平均3689.42，变更Object计划2061.82，需要写入的对象键43014.87，shape29.12；重绑replacements均为0。因此本场景不能量化typed-array重绑优化，也不能以这些计数冒充实际分配字节或GC减少。

## 工具与验证
- benchmark-real-workers新增--decoder-stages，要求--host-pipeline。没有flag时不转换Decoder、不收集或输出其阶段统计；原host-stages保持独立。
- benchmark-decoder-stages.mjs只按唯一锚点插入计时/计数，不替换任何验证、遍历、赋值或提交；benchmark-local-host只转交测试构建的阶段结果。
- 一次typecheck（10900ms）、3个工具文件lint（145ms）、脚本语法通过；一次真实场景exit0。
- 210次witness等有效帧比较、211次完整显示图（4,653,851节点）比较通过；7个权威/隐藏状态/RNG检查点，Host journal、tick、对象计数检查通过。
- 315个冻结生产模块在诊断核对时与磁盘完全一致，无生产改动。measured-tools保留这次实际工具字节及hash；后续为候选Set工作队列兼容的诊断适配不回写这些工件。

本诊断不验证原版实机/UI、渲染耗时、网络RTT或input-to-photon；没有桌面、子代理、提交或发布。优化总目标仍未完成。

工件：artifacts/decoder-stage-diagnosis-20260926/run/result.json、analysis.json、measured-sources.json、validation-status.json、measured-tools/。
