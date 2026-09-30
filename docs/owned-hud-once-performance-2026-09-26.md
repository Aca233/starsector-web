# 封闭Worker HUD帧内单次投影：实测与验收（2026-09-26）

## 结论：保留
只修改CombatPresentationEncoder，在已有全帧原生显示支持检查之后，为登记的封闭Worker调用既有captureReadonly。同一Ship被player/weapon/target/多个名单重复引用时，本次capture仅填充一次原有HudContactRecord，各槽位、细节和别名都保留。公开可变引擎仍逐次读取，UI路径不变；没有新增跨帧状态缓存。
正式固定串行配对：显示编码均值减少8.96%（节省1.698ms）、P95减少11.54%；Host完整交付均值减少2.77%（节省1.764ms）、P95减少1.14%。六个连续30tick分段的编码和交付均更快。模拟均值-0.02%，不宣称本轮有模拟算法提速；模拟P95+2.25%、Host呈现处理P95+1.84%也原样列出，不能隐去不利指标。

## 依据与并发工作保护
先前V8分配采样定位了HUD contact的重复投影；相关源码在上一轮相位优化中未改，该采样仅用于选热点，不是本轮性能基线。来源/行为边界见owned-hud-once-source-notes-2026-09-26.md。没有重试被否决的graph shape/标量快路径。
冻结前检测到其他工作新增GlorianaArmory及JSON，并修改ModManager/GlorianaPack/DesignModel。完整保留，通过build-only重冻315模块；前后臂均含同一份舰装更改，因此不把它们当优化差异。正式前后仅Encoder有变化；当前315模块与候选完全一致；上一轮Ship.ts/Worker相位优化原hash均保留。

## 集中验收
一次typecheck（9701ms）、5个改动代码/测试文件oxlint（131ms）、一次既有render-projection（4853ms）均exit0，没有失败重跑或lint警告。
完整场景84274检查通过。新增HUD合同468项、64个新旧有效包/全部packet字段/二进制对照、56个owned帧，覆盖Onslaught/Paragon、Doom/Harbinger、Astral/Sunder、Gloriana模块；每次capture（含同tick）重读移动、装甲、弹药、CR、幅能、相位/系统、目标、退场、模块手动控制、重复槽位及同id不同实例。普通引擎custom getter读取次数/顺序、异常时点、失败epoch均与冻结旧实现一致。既有形状/标量/索引/解码/容量/回收缓冲/别名和真实UI projector合同不变。
1790次reference contact与806次owned contact来自不同计数帧范围，故不直接相除算性能；真实Worker逐帧计数见下一节。没有UI结构/内容更改，不以这些检查宣称原版实机、画面或双设备联机验收。

## 默认自动模式激活/恢复（非性能实验）
200 Onslaught、0预热+55tick、--decode --fire-query-audit，真实Worker初始化56个readonlyFrames、genericFrames0、contacts11200（200/帧）；新Worker重放恢复只捕获最后1帧，readonlyFrames1、genericFrames0、contacts200。确认实际启用，不把静态源码推断当证据。
55次witness、56次完整显示图（831879节点），恢复witness/权威+隐藏状态/显示均一致。默认自动臂19个fresh batch、invalidated=0；仍由现有budget决定Owner使用，没有更改并行策略。所有计数只在测试构建，耗时不用于提速结论。

## 正式真实Host配对：仅一次、无profile/stages/计数插桩
`node scripts/benchmark-real-workers.mjs --host-pipeline --serial-pair --count 200 --warm 150 --steps 180 --baseline artifacts/owned-hud-once-20260926/baseline-sources.json --candidate artifacts/owned-hud-once-20260926/candidate-input-sources.json --freeze artifacts/owned-hud-once-20260926/measured-sources.json --out artifacts/owned-hud-once-20260926/host-serial-pair-200`

200 Onslaught、seed917、固定dt、150tick预热+180测量；独立无头Edge153，16逻辑CPU，cross-origin isolated/SAB。三臂逐tick交替，比before/after；都固定串行，freshBatches=0、invalidated=0。保存全段样本，不筛掉慢帧、不择优重测。

| 阶段（ms） | 旧均值 | 新均值 | 均值变化 | 旧P95 | 新P95 | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 模拟 | 34.004 | 33.996 | -0.02% | 41.095 | 42.020 | +2.25% |
| 显示编码 | 18.948 | 17.250 | -8.96% | 23.955 | 21.190 | -11.54% |
| Host发起→原始ACK | 53.360 | 51.670 | -3.17% | 64.105 | 63.410 | -1.08% |
| Host呈现处理 | 10.192 | 10.121 | -0.70% | 12.750 | 12.985 | +1.84% |
| Host完整交付 | 63.584 | 61.819 | -2.77% | 75.455 | 74.595 | -1.14% |

P95从所有原始样本按floor((n−1)×0.95)重算并与runner完全核对。hostPresentationMs包含decoder.apply和Host地图/部署/字符串处理；deliveredMs是Host.step到promise完成的复制/排队/ACK/日志，不含渲染、网络、rAF节拍、input-to-photon。本轮不能与上一轮不同运行的均值直接拼接宣称累计百分比。

| 连续tick | 模拟均值变化 | 编码均值变化 | 完整交付均值变化 |
|---|---:|---:|---:|
| 151–180 | +0.62% | -7.78% | -2.06% |
| 181–210 | -1.78% | -9.85% | -4.14% |
| 211–240 | +2.05% | -6.74% | -1.11% |
| 241–270 | -0.78% | -11.45% | -3.58% |
| 271–300 | -2.11% | -11.46% | -4.64% |
| 301–330 | +2.16% | -5.94% | -0.85% |

这些是同一运行的相关分段，不是六次独立复现，不宣称所有设备/舰型显著性。660次witness、662次完整显示图（18,103,234节点）、11个完整权威/隐藏火控/RNG检查点通过。三个Host均ready，pendingTransactions0、tick330、journalEntries1、epoch1、sequence331。

## 工件和当前状态
工件artifacts/owned-hud-once-20260926包含原始文件备份、315模块前/后/实测源图、类型/lint/场景结果、激活/恢复计数、原始性能样本与分块分析。raw激活图314模块，仅缺LocalWorkerHost.ts，全部与候选一致；正式Host315项完全相同。没有新增堆采样，因此不报告GC时间或分配字节降低百分比。
保留生产改动。总体继续优化目标active；未暂存/提交/推送/打包/发布、未操作桌面或启动子代理。
