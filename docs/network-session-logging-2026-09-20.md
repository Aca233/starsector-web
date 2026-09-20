# 整次启动日志与默认 Steam 接收端优化（2026-09-20）

## 用户要求与范围

本轮同时处理“启动到关闭一个日志、增加延迟诊断内容”和继续未完成的延迟优化。用户重新明确允许子代理，因此按互不重叠文件并行实现，主代理集成/实测。未提交、推送、打包、发布，未替换已安装 0.2.4；未修改生涯。

## 桌面一次启动一个文件

- 目录：正式安装的 %APPDATA%/Starsector Web/network-logs/；开发模式为 Starsector Web Development，显式 --profile 则在对应目录。
- 文件：network-session-启动时间-随机ID.jsonl，每次普通启动新建；开始即写 session-start，不必进入战斗。
- 会话持续 append，不再按4MiB轮转，也不因660条样本淘汰而删除早期 Steam 记录。切换 LAN/Steam、换局、重连、刷新页面均追加。
- 首次切换 Steam 的既有浮层受控重启会把严格校验过的本次日志 basename 传给新进程：session-handoff → session-resume，同文件、同 sessionId、不同 processRunId。不会接收网页传来的任意路径。
- 正常退出写 session-end 和本进程段统计（接受/写入/限速丢弃/队列丢弃/写失败/导出失败/字节），最后 fsync。末条预留独立槽，不被拥堵队列或限速拒绝。
- 磁盘坏掉不拖死退出：主进程最多等待最终flush 2秒，超时或返回失败会提示到 desktop.log。强制杀进程、断电、磁盘写失败不能保证末尾完整；缺 session-end 不应被当成正常退出。
- 保留32项异步写队列、12条/秒入口限制、约16KiB样本上限；通常战斗1Hz、桌面进程采样0.2Hz。日志丢弃数不是网络丢包数。
- 不限制本次日志磁盘总长度、也不自动删旧运行；长时间运行会增加磁盘占用。不会为“完整日志”无限积压内存。

## 导出与排错

“帮助 → 导出本次完整联机日志”及现有战斗/入口导出按钮均导出同一桌面会话文件；后者通过可信本机窗口的特定 blob 下载拦截实现，没有增加 preload/通用文件 IPC。其他下载、其他页面/窗口不拦截。

导出复制排在同一个写队列上，得到完整 JSONL 行的稳定前缀；之后的新记录继续写原文件。要包含退出摘要，可先用“帮助 → 打开本次联机性能日志”定位文件，正常退出后发送该文件。两个玩家仍各自有一个日志，不能把两机墙钟差当单程延迟。

**普通浏览器仍使用原来的最近约10分钟内存缓冲。** 本轮完整运行日志针对桌面端，UI已明确区分；没有谎称页面重载后浏览器内存记录仍在。

## 新增定位信息

- sessionId/processRunId/desktopMonotonicMs/desktopReceivedAtMs；启动版本、OS架构、逻辑核心和物理内存总量。
- 后台ready及build、模式切换阶段、页面加载、画面无响应/恢复、渲染进程退出原因、后台失败、退出原因。
- 桌面主进程、渲染进程、后台进程、GPU进程的CPU百分比和工作集/私有内存；新进程第一次CPU采样为null，不伪装空闲。主进程heap/RSS、事件循环直方图、采样间隔。
- 渲染线程长任务累计次数/总时长/最长时长、可用时JS heap、1Hz采样延后量；observer随战斗卸载释放，不保留条目或每帧打日志。
- 输入发送/已确认序号、有限跟踪集合的待确认数和最老年龄、待发动作数；有限集合不是整个网络队列。
- Steam full/delta/legacy-full格式、压缩节省、接收端增量miss、基线大小、queueAckMs、输入队列字节/合并数，以及已有的消费ACK、网络ACK、SDK轮询阶段。
- LAN增量/全量、锚点、编码/原始字节、编码预算回退及已有快照流水线计数。

只采白名单数字/枚举，不写IP、Steam身份、房间号、令牌、聊天或完整战场。未知/过期为null。主进程eventLoop直方图包含20ms采样及OS定时精度，不是网络RTT；长任务累计范围是一次战斗挂载。

## 同步完成的延迟优化

默认 legacy Steam 接收链路现在：
1. full body只遍历校验一次；delta仍先校验patch、再校验完整重建结果，边界不放宽。
2. size/hash验证成功后，把已经计算过的canonicalText交给gateway本机浏览器转发，不再次JSON.stringify整个状态；文本只属于本次返回值，不加入持久基线。
3. 普通legacy-full回退仍走原有序列化，不直接透传未验证network raw text；ACK仍在WS回调成功后发送，8秒保护和完整数值精度不变。

CPU A/B采用修改前真实源码快照、独立子进程ABBA。470837B真实32舰状态，每轮400次：full接收+转发平均7.09→4.16ms CPU（约-41%），delta6.08→4.08ms（约-33%）。delta是录制状态加仅seq/tick变化的合成后继，并非连续战斗。大legacy对照2.11→2.17ms；小delta9.92→10.08μs、小legacy1.65→1.95μs未测得收益，保留完整结果不隐瞒波动/开销。

**这是局部CPU成本，不是真实ping、输入到画面延迟或客机Hz保证。** 高负载超过结构codec限制的legacy-full不受这项核心优化覆盖；此前LAN字节匹配与FIFO基线、ACK快速副本等改进继续保留。

## 验证

- 新/旧日志与schema/运行时定向41/41；CI网络组120/120。
- 默认Steam接收/转发定向28/28；完整Steam252/255，仍为原3项未过门禁：legacy9客机骤降、实验Sockets soak+停顿、实验Sockets健康9人每端40Hz。未修改门槛。
- 真实源代码Electron隐藏窗口：启动、local→LAN切后台、页面刷新、混合Steam/LAN标记、菜单导出、原blob按钮导出、正常退出末条、受控第二进程沿用文件均通过；未登录/操作Steam账号、邀请或测试跨机网络。另有真实Electron隔离测试验证iframe/非游戏URL不能注入日志。
- 应用TypeScript通过；13文件lint 0 diagnostics；隔离主入口构建通过（57.92秒，保留大chunk/资源URL提示）。隔离构建不复制public、不含campaign入口、不覆盖dist，不是发布包。

产物：artifacts/network-session-20260920/，包括network-full.log、steam-full.log、electron-smoke-final.log、console-security.log、receiver-cpu.json及receiver-baseline/current源码快照。
