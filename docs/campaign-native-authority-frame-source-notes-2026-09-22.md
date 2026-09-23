# 原生世界帧权威事务（0.98a-RC8）

## 原版证据 → 行为 → 差异 → 验证
- 原版 ../decompiled/starfarer_obf/com/fs/starfarer/campaign/CampaignEngine.java:973–1095：非暂停才增加 frame；经理/经济在时钟之前；动画、时钟、地点按原次序推进；背景地点用60槽调度。不能把经济单独推进当作完整世界，也不能由每个客户端各推进一次时钟。
- 当前真实实现 NativeCampaignRuntime.advanceNativeEngineFrame 已负责次序及共享图，但 Repository 只有玩家输入事务，advanceNativeDevelopmentNavigation 未和引擎/持久化组成一次事务。
- 本批增加仅可信本机宿主可调用的世界帧事务：校验 epoch/revision/native long frame；在同一共享图先处理控制导航，再运行现有原版引擎，原子保存 checkpoint/receipt/outbox；出错整体恢复，重试不重复推进。引擎缺失或依赖未实现照常拒绝，不重建未知历史，不切换 playerFleet。
- 服务工厂必须同步，仅在事务内部绑定当前 runtime；不能捕获上一次恢复前的图，也不能做事务外 I/O。暂停/加速策略由宿主显式传入，本批不决定多人暂停策略、不启用自动计时器、不新增HTTP tick端点，simulation.status仍unavailable。
- 本批不改UI，不操作桌面；既有用户原版截图不能证明自然帧/存储语义，无新增视觉还原主张。
- 验证：扩展现有原生人员/宿主场景，检查真实SQLite中的时间与revision、同ID重试、旧帧拒绝、部分图变更及SQL失败后的恢复。录制型外部服务只验证事务边界，不能据此宣称完整默认世界可运行。集中一次类型/lint/相关场景。

## 实现边界
- Repository.advanceNativeDevelopmentFrame 是同线程宿主入口；默认Worker/HTTP未接计时器，原生会话仍声明unavailable。它不是可用联机生涯的完成标志。
- 帧输入含明确的paused/fastAdvance/isFastForwardIteration/skipMarketAdvance；宿主单次输入限制0–1秒仅为开发事务限幅，原版内部背景地点60倍步长不变。没有新增多人暂停/离线补时规则。
- 一帧共用一条revision，与玩家指令串行；暂停帧可以修改原版暂停期间状态，因此仍提交revision，但不递增原版frame或clock。
- 测试保留外部画面/地点录制适配器及经济通知录制回调；真实引擎、调度/时钟、导航、共享对象、SQLite保存/回滚及默认势力/事件/角色状态直接运行。不能把该测试当作真实全部地点、战斗AI、月结或多人资金验收。
- 完整默认世界插件、独立玩家上下文/多地点活跃策略、正式开局仍未完成；没有切换全局playerFleet，也未把状态改成ready。

### 定向失败修正
- 现有夹具已经载入部分市场，不能再次whole-roster load；只对checkpoint.loaded之外的市场完成真实载入，不改Runtime的拒绝条件。
- CampaignState.java:1379–1394再次核实：追踪舰队是朝目标方向取750单位的目的地，追踪非舰队才直接用目标坐标。本轮修改的是错误测试期望，不把已还原的原版行为改成直达目标。
- 暂停帧暴露旧scene夹具尚未构造native player，不能跳过原版updateSpeedBonus。改为复用同场景已经在创建前绑定好真实玩家的abilityCreation.checkpoint；不加空speed回调，不改生产player指针。


## 2026-09-23：主代理完成原生世界帧的权威事务入口（仍非完整自动世界）

- 本轮未新开子代理，主代理实现 DevelopmentWorld/Repository 的可信同线程帧入口：控制导航 → 现有原版engine → checkpoint/receipt/outbox同一SQLite事务。epoch、revision、signed-long frame共同校验，暂停帧仍保存状态但不走世界时间，同ID重试和重启后的已提交重试均不重放。
- 依赖工厂每次绑定当前runtime；规则推进中异常、SQL写回失败均丢弃被改动图并从已提交状态恢复，不在旧图上修补。不切换全局playerFleet，不补造缺失engine历史，不开放玩家tick命令。
- 边界：这是内部宿主接线，不是自动世界循环。Worker/HTTP仍未启用原生时钟；完整默认地点/AI/外部经理、多人资金与独立上下文、正式开局继续待完成。readyForAuthority=false / simulation.status=unavailable不变。
- 验收：集中tsc -b通过，5个改动代码/声明文件lint通过；同一既有native personnel场景针对具体夹具失败定向复查（未重跑全套、无本轮浏览器/UI测试）。修正重复全表载入、误把舰队追踪当作直达目标、复用真实已构造玩家夹具三处问题，未放宽Runtime校验。最终1通过0失败、退出码0，场景79120.8979ms，进程79669.76ms。
- 实测真实SQLite提交/回滚/重启、真实时钟及导航；原版舰队追踪为朝目标方向750单位。测试中的画面/地点与通知仍是明确录制适配器，不声称全部地点/舰队/AI/月结自然推进已验收。
- 日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-native-authority-frame-check.log（首轮失败）；C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-native-authority-frame-scenario.log（最终通过）。来源与边界：docs/campaign-native-authority-frame-source-notes-2026-09-22.md。
- 未暂存、提交、推送、打包、发布；未操作桌面，检查进程已退出。整体目标仍active。
