# LAN 固定字段词典：SWF2（2026-09-19）

## 范围与接入

生产改动仅为 `src/network/BinarySnapshot.mjs`、`BinarySnapshot.d.mts` 和新增 `KeyDictionary.mjs`。保留以前的投影单遍编码、JSON fallback、legacy MessagePack 解码和普通 `encodeBinaryFrame` 语义。

新 `encodeProjectedBinaryFrame` 发出 4 字节 SWF2 前缀，然后使用固定 128 项 map-key 词典。只把常见**字段名**替换为 0..127 fixint，字符串值和所有标量编码不变；未知字段名照旧为字符串。每个完整状态都自包含，不依赖前一帧、重连缓存或差分基线。SWB1 外层 matchId/seq 信封不变。

词典是线协议的一部分：不得在 SWF2 下改条目或重排；必须另立 magic 才能换表。双方和 relay 要完整同 build 更新，不能只替换前端/后端某一个文件。旧解码器不能读 SWF2；已有 build 身份检查用于拒绝混装。新版仍可读 legacy 帧。

仅 SWF2 map-key 位置允许数字词典索引，必须是 0..127 的整数。原型键拒绝、预检深度、16MiB 总预算、容器长度/标签、UTF-8 fallback 语义保留；前缀也计入预算。每个编码结果独占其缓冲区，可 transfer，不共享后续帧的工作内存。

## 离线验证

`artifacts/lan-key-dictionary-20260919/` 保存独立原型、检查和原始结果，没有新增项目 tests/runner。

- 三份实际32舰包，每帧每 codec 1280 次编码（160轮交替AB/BA）；7920个包含预热的结果均逐包 JSON.stringify 精确还原、确定性字节一致、缓冲区独占。
- 包体 294025→185926、328418→206737、519476→339502 B，减小34.65–37.05%，新大小含SWF2前缀。
- Node编码均值分别1.601→1.262、1.819→1.438、2.945→2.359ms（约快20–21%）。不等同浏览器帧率收益。
- 20组边界校验通过，包括全部128索引、超范围/错误键、legacy、截断、原型污染、非法tag、深度、UTF-8 fallback和transfer。

## 完整双端 ABBA 验证

同一冻结源树分别构建旧/新codec。双独立 Edge、正常D3D11绘制、同32舰配置和种子、每轮20秒/94个按键边沿；输入具体物理tick仍受真实调度影响。AI owners均0，未改 visibility/focus、物理dt、目标60Hz、队列或断线保护。

| 运行顺序 | 实收Hz | 输入首次累计ACK均值 / P95 | 物理Hz |
|---|---:|---:|---:|
| 旧 A1 | 24.34 | 118.43 / 185.10ms | 59.82 |
| 新 B1 | 32.53 | 88.25 / 141.82ms | 59.89 |
| 新 B2 | 32.93 | 86.73 / 141.12ms | 59.88 |
| 旧 A2 | 25.43 | 106.43 / 170.63ms | 59.76 |

四轮全部输入有ACK、无Worker恢复；场景检查通过。均值合并约24.88→32.73Hz、112.43→87.49ms，仅是同机短时实测，不能承诺用户300ms按相同比例降低，更不能称32舰已60Hz实收。操作ACK含排队/权威处理/返回，不是物理线路RTT或GPU呈现延迟。

原始报告在 `artifacts/lan-worker-latency/key-dictionary-{baseline,candidate}[-repeat]-32.json`。主线程/Worker credit归因见 `lan-uplink-queue-2026-09-19.md`。

源码 TypeScript、lint、生产构建通过；原有大chunk构建提示保留。没有开AI多Worker、降低舰船数、去掉绘制或增加积压阈值。

## 桌面包边界

0.2.4为本地完整测试包，不自动覆盖安装、不发布。以已验收0.2.3 LAN/桌面后台为底，带新前端和SWF2；Steam模块选取已保留的v3差分包，而不混入当前另任务仍有失败门禁的共享上行实验源码。原生产工作区Steam修改原样保留。两端必须使用完整同一包重建房间。

集成的真实localhost WebSocket + 模拟Steam300ms通道验证了512B、512KiB、16MiB首帧到达并恢复控制，没有断开；这仍不是Steam原生SDK双账号跨网验收，不能宣布用户开战断线已修好。

### 0.2.4 成品检查

- 构建ID `2026-09-18T19:47:22.462Z`，本地ZIP `artifacts/Starsector-Web-0.2.4-network-test.zip`。
- 13项打包EXE直接入房/本地origin/配装存储/重连/刷新/日志入口及renderer隔离检查通过，无renderer异常；仅开启并关闭测试自有隐藏窗口。
- 8舰成品前后端正常双端战斗：12秒56输入边沿全部ACK、实际59.56Hz、物理59.98Hz、平均操作确认20.95ms；没有恢复，AI owners0。
- 成品8个联机代码文件与本次LAN来源及保留v3 Steam来源逐字节一致，确认不含未验收的snapshot-host-budget模块。未做素材hash/size审计。
- 包是完整替代测试目录，而不是一个应单独拷贝的EXE。旧0.2.3/v3包和工作区的并行Steam候选均未覆盖，也未改当前安装或公开发布。
