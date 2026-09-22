# 固定布局舰船显示通道：首轮结果（2026-09-22）

## 决策

**保留已测得的显示切片收益；用户随后批准接入，不能因未达到 40% 就丢弃实现。** 以下数字是首轮独立 renderer 切片，不是实际 LAN 收益。后续实际接入见文末：固定武器/引擎记录已接入现有传输，但实际完整流水线中位数回退，因此保持显式试验开关，不默认启用。未提交、推送、打包；生涯工作未动。

## 实现

- `src/network/display/ShipDisplayLayout.ts`：显式必需数值/布尔字段布局，数值保持 Float64。
- `ShipDisplayBuffer.ts`：显示 facade 的只读 getter 直接读取缓冲区，换帧仅切换存储；不继承 Ship/CombatEngine，不把数值再写回模拟对象。
- `ShipDisplayLane.ts`：直接采样已有审计读集，不先构造旧 projected ship 图；包括定义缓存、已验证接收后的定义 ACK、未确认定义重发、冷重置、对象代际、源载舰引用、变长视觉尾部和输入所有权隔离。
- `shipDisplayRenderView` 是 renderer 接口适配器；其世界数据仍借用原来源，不能冒充整场已使用新传输。
- 首轮仅新建实验文件；后续接入复用了其中布局与 buffer 原语，见文末。独立 ACK API 只是切片夹具，后续若接入必须复用已有传输回执，不额外叠加生产确认层。

## 一次配对复查

原有 render 模式通用图编解码器仅在**测试构建内**移除 HUD 根和非舰船世界效果；保留原验证器。两臂读取同一 22 舰权威状态，60 tick 预热、24 个 ABBA 块、48 个计时状态；含预热共 108 次配对读集核对一致。首次运行因空 HUD 的 null-prototype 测试断言误报而未判定，修正该断言后做本次定向复查；没有放宽数据比较。

| 舰船显示采样/编码＋解码 | 旧通用图路径 | 固定布局切片 |
| --- | ---: | ---: |
| P50 | 3.2137 ms | 2.8014 ms |
| P95 | 5.2427 ms | 4.3245 ms |

本轮 P50 下降约 12.8%，P95 下降约 17.5%。24 块候选/基线比值中位数 0.837，P95 1.054，存在候选更慢的块。不据此承诺每帧更快。候选采样仍有约 1.77ms P50，解码约 0.95ms；显式视觉尾部、定义采样、验证和显示容器仍有处理成本。

**不是正式 LAN A/B，也不是 FPS/RTT。** 旧路径的 V8 对象体积代理不能当网络流量与候选的 85,632 B 包体 P50 直接比较，不能宣称网络字节下降。没有达到/证明原先约定的完整同步流水线 40% 门槛，这不否定已观察到的局部收益；是否默认启用要看实际接入后的结果。

## 功能检查与未完成项

`node scripts/check-ship-display-lane.mjs`：10 组通过。覆盖 22 舰、186 武器、132 引擎状态的 renderer 字段/查询，直接只读 getter，包所有权，跨帧身份，跳过显示帧，定义变化与漏 ACK，冷重置，同 id 新对象，carrier 显示引用，8 类坏包的原子拒绝及重复包拒绝。

尚未验证激活中的相位/传送/脉冲场景、实际 WebGL 图像、真实 3/5 人 Web 延迟和长任务。尚未实现完整 HUD/本机预测与正式网络入口迁移，不能将这个显示帧用作存档或权威恢复。

结果：`artifacts/fixed-ship-display-20260922/paired-performance.json`、`check.log`、`summary.json`。短场景结果只证明该读集的 CPU 差异，不证明整个重构目标已达成。

## 已接入实际 LAN 的窄切片（同日后续）

- 实際调用链：host.worker / Node 共用 `captureAuthorityCombat` → `CombatSnapshot` → 原 SWF3 / JSON / encoder-worker tape → `applyCombatSnapshots`。并非另起第二条显示消息。
- 复用已有固定布局、直接读 buffer 原语，把武器及引擎必需的有限数值/布尔字段从旧递归记录中移出；每帧完整数值表，批量 tuple 记录绑定到**客户端自有副本**。兼容 HUD/关键状态/炮塔及开火预测写入的本地 overlay，下一权威端点清除 overlay，不改收到的存储。未更改权威对象/频率/RNG/画质。Infinity-capable 字段、其余舰船和世界状态仍走原路径。
- 不把完整 `ShipDisplayLane` 包叠在旧整场包上；完整 renderer-only 包仍保留，尚未替代整个 LAN 舰船/HUD 图。新记录格式使用协议 28，需要同版本主机/服务器/客户端；未发布。
- 默认 **关闭**，明确设置 `VITE_LAN_FIXED_DISPLAY=true` 才走实际接入分支。旧组件写日志仍不启用。

同一 22 舰场景、ABBA 顺序、16 状态预热 + 24 状态取样（每臂 48 次），真实捕获/二进制编码/解码/单副本还原 CPU，最后针对 tuple 开销及 A/B 模式互相驱逐遍历计划缓存修正的结果：

| 完整快照 CPU | 原路径 | 固定记录 |
| --- | ---: | ---: |
| P50 | 3.2589 ms | 3.3551 ms |
| P95 | 5.8006 ms | 4.2570 ms |
| 未压缩包 P50 | 91,675 B | 90,996 B |
| 完整包 deflate 诊断 P50 | 10,228 B | 10,368 B |

**P50 慢约 3.0%，P95 降约 26.6%，不能称整体提速成功。** 完整包 deflate 不是协商后的 anchor/delta 网络流量。此前原始 Float64 块接法造成包体放大，已改为既有精确数值编码 + 短 tuple；保留每次失败/修复记录，不择优冒充结果。默认不开启是为了不再让用户使用更慢版本，不是删除实现。

验证：原 10 组 + 1 个实际 LAN 场景组通过；实际组包含整个客户端 presentation 图和 renderer 读集对照、热字段旧记录消除、冷加入、跳过帧、稳定对象、数值/布尔预测写入与还原、JSON、SWF3、state envelope、辅助编码 tape、旧快照回退、坏偏移/布尔/版本拒绝。只是预测写入兼容性，不声称已做真实控制器回放、浏览器画面或多机 RTT。证据：`artifacts/fixed-display-integration-20260922/check-plan-cache-fix.log`。

下一步方案（仅分析，未再扩实施）：完整 renderer packet 的静态及尾部 metadata 改为版本化固定 tuple，减少重复键和容器，保留既有字典 ACK/重连；但当前窄接入的主要剩余成本在 capture 与 replica getter/bind，不能再靠多开一条通道宣称解决。若继续完整舰船迁移，应先划清 HUD/预测与 renderer 的替代边界，真正去掉对应旧图。

完整 renderer 桥接的已知后续修复点：`shipDisplayRenderView` 不能仅 spread 原 view；需显式转发其非 enumerable 的预测弹丸/本地 muzzle/particles 等 getter，否则会遗漏已有视觉层。当前窄接入不调用该适配器，不受此未修复项影响。

## 共享 getter / 批量绑定与冷布局修复

后续改造用按 schema 共享的 accessor 代替每条记录的 getter/setter 闭包；仅预测可写记录走 overlay。接收端批量校验偏移/布尔值、按目标数组身份复用绑定记录。`$d/$ds` 判断移到普通 tags/arrays 之后，避免影响默认未启用路线的常规解码分派。

精简 weapon 残余字段不再匹配原生成还原布局，现补齐 7 个变体（含冷启动没有 warm-only 字段的短布局）；检查覆盖这些布局实际命中生成还原器。`check-cold-restorer-final.log`：11组通过。此前共享 accessor 后的测量只显示波动中的几个百分点，不能证明全路径改善；冷布局修复后的性能尚未成立。继续默认关闭，不将早先3.2589/3.3551ms与最新源码混为同一次测量。

另见 `network-hz-optimization-2026-09-22.md` 的实际 authority 基线和本轮已撤回候选。尚未测得真实 guest APPLY Hz 或输入至画面改善。
