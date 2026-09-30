# 联机绘制尾延迟：时间线与快照恢复诊断（2026-09-26）

## 本轮结论

本轮没有新增已验收的生产提速；生产发送策略仍是撤回后的原策略，飞行按键保留修复不变，呈现Worker与display-v2定义表仍默认关闭。此次完成的是定位：**当前测试慢样本主要发生在已进入rAF回调后的快照应用，而不是忙任务结束后等待下一次rAF。LAN显示接收端的舰船记录恢复是下一优化目标。**

不能把这些带探针数字当原无探针失败的唯一因果解释，更不能据此恢复receipt-input-tail。未修改原先性能门槛，未重跑该候选的无探针四臂验收。GPU/GC/对象池并没有因为“占用率不高”就被认定为瓶颈。

## 第一层：等待还是帧内工作

两臂 current / archived-rejected，仅为原因诊断。2端、20AI（22舰）、seed917、1280×720、ANGLE D3D11、各20秒（普通10+固定DOM任务后忙70ms的10秒）；每臂40个忙输入全部匹配真实draw和唯一帧回调。

| 同一输入的忙任务结束→提交分解 | 保留策略P95 ms | 归档撤回候选P95 ms |
|---|---:|---:|
| 回调前等待 | 2.880 | 2.686 |
| 回调内工作直到WebGL提交 | 5.051 | 11.678 |
| 总尾部 | 7.299 | 11.904 |
| applyPlayback + synchronize阶段 | 0.468 | 7.159 |
| 绘制阶段（含效果处理/updateVisual/render） | 4.117 | 4.547 |

分位数不能相加；分析脚本逐输入检查 wait+work=total、各子阶段和=work。此处P95使用线性插值。主线程timeStamp对齐trace可能有亚毫秒调用偏差，精确分解依据同一realm的本地时间戳，不靠trace偏移相减。WebGL提交不是合成器完成或屏幕扫描。

保留策略两个慢apply分别8.695/9.785ms；撤回候选四个慢apply为5.100–9.545ms。对应callback前等待仅0.12–0.62ms。上述apply跨度没有已记录的主线程GC事件重叠；trace可能有观测盲区，不能据此宣称“没有任何GC/系统影响”。其它回调前较长等待与实际onmessage同步处理存在重叠，不能把整段解释成浏览器空闲。

rAF传入stamp在忙窗口普遍比回调实际执行早约60–70ms。这是额外观察，不在本轮擅自改播放时钟、跳过快照或降低完整更新频率。

## 第二层：仅保留策略进一步拆解

另一个单臂保留策略诊断，启用低频恢复阶段计时及既有CPU profiler，不与前一组做速度对比。20秒测量窗口内93次真实快照恢复；过滤测量前后采样，包含真实同步/按键、绘制、主机停顿和同局重连。

| 阶段 | 均值 ms/恢复 | P95 ms |
|---|---:|---:|
| 外层快照校验 | 0.080 | 0.120 |
| 整体restore（不含外层校验） | 8.266 | 11.300 |
| 舰船恢复合计（整体restore子集） | 6.675 | 8.605 |
| └ 布局/定义表与引用预检 | 0.199 | 0.285 |
| └ craftSpecs内容签名/查表 | 0.090 | 0.120 |
| └ 舰船身份表建立 | 0.008 | 0.010 |
| └ 舰船字段恢复及系统/武器后置校验 | **6.362** | **8.315** |
| └ 装配引用校验 | 0.016 | 0.025 |
| 世界字段（弹丸/特效/环境等） | 1.469 | 2.735 |

本表P95为sorted[floor((n−1)×0.95)]，与上一表统计定义分别明确；嵌套阶段不能重复相加。身份表建立不是“所有分配耗时”，不得据此声称完整对象池的理论上限只有0.008ms。

舰船字段阶段覆盖377个CPU采样：自耗时采样中，DisplayDefinition.visit 105次、assertDataField 90次、unpackDisplay 86次、unpackRecord 27次。样本权重不是精确计时；inclusive按函数逐样本去重，不因递归叠加成虚假占比。这些线索指向**定义的重复校验与通用逐字段恢复**，不是本次的火控模拟或GPU计算。

这是LAN的LanDisplaySnapshot/DisplaySnapshotCodec，不是此前单机Host的CombatPresentationDecoder；不可混用其Entry分配、Set遍历或已否决补丁方案的测量。

## 后续候选边界

现有display-v2确实可以共享接收端不可变定义，但此前已发现权威捕获成本、P95及可写spec兼容边界，因此**不因为本次热点就直接默认开启或改口称已通过**。下一候选需减少实际重复遍历/恢复工作，同时保留：坏包/字段能力/资源白名单、深度与节点预算、可变定义和本地扩展合并语义、挂载点根身份、所有输入/同步回执。完整权威成本和绘制尾部均须重新证明，不能只优化接收局部。

## 隔离、失败与验证

- 首次尝试在进入计时前失败：最新UI引用了不存在的combat-interface.css。完整失败工件保留，没有修补或覆盖该UI工作。
- 定向隔离使用上一轮有效四臂的原始JS/JSON，旧策略和归档候选只差三个指定文件；生产文件未被替换。原三个入口的编译CSS SHA保持5fc6efcd…77275c；另外52份raw CSS一起冻结，由Vite原导入顺序装入。此次附属CSS是本次固定字节，不冒充旧测试历史字节。
- 审计发现过去“冻结全部样式”的说法不准确：原工具只冻结index/lan/motion三个入口编译结果；其它JS导入的样式未全部冻结。保留旧拒绝结论，不将其改成通过；本次明确补齐组内样式隔离。
- 三个有效场景exit0、errors=[]、failures=[]、真实800ms主机停顿时访客ACK推进、同局重连及清理均通过；每组40个忙输入全部匹配，工具/执行图无运行中漂移。
- 原11项测量合同通过；新增5项诊断合同通过；改动工具lint exit0。最初多行锚点遇CRLF失败，只规范化测试变换并定向重跑相关合同。未改生产，未重跑或冒称全项目typecheck。
- 生产LanBattle、发送策略/声明、protocol、LanDisplaySnapshot和DisplaySnapshotCodec六个文件hash与原冻结基线相同。
- 所有测试已结束，没有待轮询进程。无子代理、桌面操作、降画质、降低模拟精度、暂存/提交/推送/打包/发布。未进行原版实机验收。优化总目标仍未完成。

## 工件

根目录：C:/Program Files (x86)/Starsector/starsector-web/artifacts/lan-post-block-timeline-20260926/

- validation.json：最终验证、源码hash和全部有效场景状态。
- isolated-source-recheck/diagnosis.json、trace-analysis.json、slow-apply-gc-check.json。
- restore-stage-diagnosis/stages-analysis.json、cpu-records-analysis.json。
- 各臂post-block-raw.json、post-block-summary.json、browser-timeline.json、presentation-submit.json；单臂另含cpu-0.json/cpu-1.json。
- run-diagnosis/analyze脚本、protocol、冻结源图/样式/执行清单、首次失败日志均保留。
