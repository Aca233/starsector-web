> 后续更新：本页记录的是**单独 I/O Worker**旧候选的 HOLD。后续已与接收消费窗口成对接入；当前状态、混合模式复测和限制见 [组合方案](lan-receiver-credit-2026-09-19.md)。本页原始测量/拒绝原因保留，不改写成通过。

# LAN 网络 I/O Worker：候选已验证，混合模式门禁未过（2026-09-19）

## 发布结论

**暂不默认接入，也没有出新桌面包。** 三个新模块 LanSocket.ts、LanSocketShared.ts、lan-socket.worker.ts 目前未被正式 protocol.ts 引用。0.2.4 完整测试包与 3005 未替换、未重启。不能将以下结果当成用户物理局域网 300ms 或 Steam 原生断连已经修好。

## 做了什么

- 私有 LanSocket 适配器，不替换全局 WebSocket；实际 WebSocket 在独立 I/O Worker 中收发，世界快照仍由原 authority Worker 生成/编码。**不是 AI 多 Worker**，不克隆整个世界图去编码。
- SAB 原子总计数维护待发与 native bufferedAmount，防止渲染主线程收到 drain 通知太晚；有积压时每 4ms 采样，空闲不轮询。
- 出入站分别 32MiB / 8192 条上限；预留后 post，接收 finally 释放；binary transfer 前复制调用者数据，禁止 detach 游戏持有的 buffer。
- 控制、输入、状态不合并；连接初始化未发 connect 时才允许安全 fallback；发出 connect 后的未知故障不得透明换链/重放。取消、错误、关闭有界终止。
- 不可用 SAB/隔离/Worker 时保留 native 路径。正是这个兼容分支暴露了下面的混合性能回退，不能忽略。

## 完整绘制结果

冻结同一份 0.2.4 前端源，baseline/candidate 只差适配器接入；两者均加相同的只读 socket 观察回调。独立 Chromium、D3D11 正常绘制，同机 loopback，32 舰 / 20秒 / 94个真实 DOM 键盘边沿。并非两台实体电脑或真实 Steam。中间穿插了独立功能验证，并非无间隔恒定机器负载的实验室 ABBA。

| 32舰排列 | 实收 Hz | 输入累计确认均值 ms | P95 ms |
|---|---:|---:|---:|
| A1 原生两端 | 29.84 | 91.99 | 145.55 |
| B1 两端 I/O Worker | 31.29 | 66.27 | 108.64 |
| B2 两端 I/O Worker | 38.94 | 60.85 | 93.18 |
| A2 原生两端 | 30.78 | 98.50 | 154.00 |
| 房主 Worker / 客机 native fallback | 36.94 | **118.56** | **218.33** |
| 房主 native fallback / 客机 Worker | 26.64 | 89.16 | 138.15 |

所有以上正式轮完整收到94次输入的累计确认，无恢复，物理约60Hz，AI owners为0。fallback性能轮通过在指定端 Worker构造前抛错触发真实安全fallback；不是伪造 crossOriginIsolated，也不冒充实际旧设备。普通远端 HTTP 页面确可能不支持 SAB，因此不能把反例当不存在。

低负载8舰：native 59.40Hz / ACK24.54ms，双Worker 59.81Hz / ACK22.24ms；各56边沿全部确认、零恢复。**32舰实收仍不是60Hz，不能把目标60写成实收60。** ACK是同一客机时钟上的键盘边沿至收到累计确认，非显示/GPU时延或物理ping；send返回仅为入队。

## 功能与边界

- 40项确定性 mock 通过：并发计数交接、双限额、FIFO、close参数、初始化fallback、连接后不重放、异常释放。
- 13项真实 WebSocket / 浏览器检查通过：文本/binary/Blob/view、终局send-close、异常断开、取消、重复清理、worker加载失败及open后故障、实际无COOP/COEP页面nativefallback、入/出站上限。
- 首轮remote-abort断言要求独立error事件，原生对照证明Chromium可直接close(1006, wasClean=false)，修正诊断后通过，**源文件未改**。首轮失败保留。
- 8舰真实应用：连续3次客机TCP断开后恢复原席位/对局，每次只有1个live I/O Worker；刷新恢复、再移动收到主机累计ACK、房主通过UI结束、两端回房、authority Worker结束。临时浏览器与服务已关闭。
- 初版fixture因为静态server拒绝越界public junction而404，换独立自包含资产副本；未放宽服务端路径检查。初版菜单locator漏掉了快捷键可访问名，修正诊断而非改UI。失败记录均保留。
- 根源码 typecheck/lint、隔离baseline/candidate构建及candidate类型检查通过。未新增项目tests/runner；诊断仅在ignored artifacts。

## 下一步

先处理**接收端消费速度反馈和可替代状态的有界排队**：服务器/发送端不能把TCP已收走等同于客机已消费，尤其混合模式能增加收包Hz却加重操作延迟。需要明确验证不丢输入/控制/终局、快照状态可替代语义、恢复与多客机隔离。不要用降低物理速度、强开AI多Worker、加大积压或放宽失联超时掩盖。

证据总索引：artifacts/lan-network-worker-20260919/final-summary.json。
