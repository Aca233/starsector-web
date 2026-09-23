# 原生殖民地管理联通：本轮主线

- 原版证据入口：BaseIndustry.buildNextInQueue、Misc.getNumIndustries/getMaxIndustries，原生管理UI与建造交易调用；各实现代理记录对应原版函数/截图对照。主线保留现有CoreScreens管理页结构和D快捷键，不另造卡片导航。
- 当前差异：NativeCampaignApp核心页签全禁用，DevelopmentWorld只有fleetControllers，未有殖民地披露/授权；Runtime有真实队列但没有客户端命令。
- 预期：可信host显式绑定{marketId,playerId,financeDataRef}，不从playerOwned或势力自动推断舰长；只给本人绑定殖民地投影。null=未配置，[]=明确空，不互相混淆。旧world版本继续可读且不能越权修改。
- 原版单玩家经济上下文暂仅支持真实native player fleet，其他舰长的独立市场可以显式绑定/读取，但修改必须拒绝尚未实现的资金上下文；绝不切换全局playerFleet。此限制不是多人殖民地最终设计，也不将全局资产当共享资产。
- 命令复用现有worker单写者、epoch/revision、requestId幂等回执与SQLite失败回滚，payload不能指定playerId/credits/cost或拿任意marketRef越权。不开放全量市场graph。
- 验证：集中一次tsc、改动lint、一个既有原生HTTP场景，覆盖两舰长隔离、失效请求、重试仅扣一次、回滚/重连。界面需headless观察，不启动桌面；未核实原版界面状态不能编造。

- 本轮补证：Economy.java:195-224 tripleStep=三次nextStep；每次先updatePrevStability，flags为income=false/stockpile=true/immigration=true/forceNonUIStep=false。ReachEconomy.java:152-174依次刷新实际管理员character/governed效果，再完整经济任务。独立runner不改已有scheduled游标。
- CharacterStats.java:1113-1122 玩家刷新遍历本人原版outpost，重施ALL_OUTPOSTS、governed、条件/产业；当前0.98a技能effect目录无ALL_OUTPOSTS类型（colony_management.scope不是effect.type）。新增该类型时必须拒绝或实现，不能静默跳过。
- 已查看用户acc5b25f原版截图：管理页左表格右摘要、D底部页签；不改变世界暂停。BaseIndustry.java:362,810,821,829,1571核实成本、名称、可建、隐藏状态；缺历史hiddenOverride不默认猜测。

- 联通验收暴露：旧网络capture可能没有playerStats，但运行图已有完整实际PlayerPerson。强制刷新从当前已恢复角色dynamicStats绑定 commodity_export_credits_mult+id 句柄；缺键按已核实DynamicStats.getValue默认1（保留null，不创建stat）。不是把旧capture缺失标记硬改成true或注入假乘数；未恢复完整角色仍拒绝。依据既有native-live-network audit的CommodityMarketData.getExportIncome:426。

## 已落盘集成（验收结果另记）

- NativeCampaignApp 开放 D/综合管理并统一处理 Escape/关闭；打开时拦截航行和舰队能力，不自行暂停多人世界。管理界面、候选表和队列均消费服务端实际投影。
- inspect-build 是显式revision事务，因为原版枚举真实候选会消耗构造器状态；纯GET不执行枚举。客户端只确认expectedCost，服务端重新计算真实成本。报价绑定市场/epoch/revision，变化后禁用，不能用specCost付款。
- build/cancel-construction(此UI动作仅代表待建取消)/swap-construction映射为原版build/cancel-queued/swap-queued；不开放正在建造产业的拆除或升级取消。后两者未有完整物品返还/生命周期，不伪装已实现。
- 原版tripleStep使用独立forced runner，三次各更新previousStability；UI-only immigration，不推进nativeClock、不结月费，也不替换已有scheduled任务游标/计数。失败由Repository恢复整个已提交graph，不能只撤销账本。
- constructionQueueItem使用已持久化Sector UID分配引用；不是Date.now/random临时ID。候选图片按实际原版size/planet/item分支读取；缺所需planet/context仍拒绝，不拿保存的过期缓存冒充实际world。
- pending在发送前保存，同requestId/epoch/expectedRevision重试；收到并处理有效回执后才清除。此流程与原有能力/货物操作共用，不创建第二套网络事务。
- UI仍有明确边界：所获原版截图仅为空殖民地列表；已核实的建设表内容暂嵌于详情区域，原版全息弹层/部分字段/分类设施/管理员分配尚未完成。


## 2026-09-22：原生殖民地管理页面 → 权威建设交易联通（开发态）

- 三个代理的原版规则/只读披露/UI代码已收齐，主代理完成Runtime、权限、HTTP、页面、回执和持久化接线；代理已结束，不保留空转任务。
- 服务端显式保存市场→舰长→付款舰队绑定（envelope v3）；旧v1/v2归属保持未知null。只披露本人市场，不从同势力/组队推断共享资产。当前修改仍要求实际native player treasury；其他舰长独立资金上下文未接，明确拒绝，不切换全局playerFleet。
- D/管理按钮、Escape/关闭已可用；页面→inspect真实候选→原版价格确认→建造入队扣款→待建取消退款接通。队列交换接原版payload交换规则；正在建造产业取消、升级/拆除/物品返还不在本次开放范围。
- 建造与首项队列编辑运行实际三次forced经济任务：管理员/角色/治理、条件/产业、商品网络/价格/监听器、UI-only人口。当前角色出口乘数绑定真实dynamicStats，保留原版缺键默认1。未推进世界时钟或冒充完整world tick。
- 联机仍复用SQLite revision事务、epoch和requestId；页面保留未知结果待重试，旧报价失效。实际场景断言本人披露/越权拒绝、伪造价格回滚、真实扣款退款、同id幂等及版本冲突。
- 验收：tsc -b通过；18个改动代码文件lint零警告零错误；具体修复后5文件定向lint同样通过。仅运行既有native personnel场景并针对具体失败定向重查；最终1通过0失败，场景115900.9824ms、进程116853.52ms。修正旧能力列表/历史Memory夹具、真实出口统计接线、夹具势力闭包，以及Web候选按钮无障碍名称和关闭按钮被连接栏遮挡的问题。
- 无头Web使用真实HTTP/Worker/SQLite，不伪造session/receipt：D打开、选择市场/候选、点击建造、取消退款、Escape和关闭按钮通过；无pageerror。1920×1080实际截图已查看：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-colony-management-34952.png。此为合成开发世界，不是原版实机或正式开局验收。
- 汇总日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-colony-management-1790087792131.log；最终场景日志：C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-colony-management-scenario.log。
- 未完成：完整world tick/正式开局、独立多人资金、管理员分配、分组建设/空间站等插件、动态类型工期维护费与全局管理汇总、原版全息建造弹层及同状态实机画面对照。现有建设表只按已核实原版列/流程嵌入详情，不宣称像素一致。
- readyForAuthority=false、simulation.status=unavailable保留；未暂存、提交、推送、打包或发布；未操作桌面输入；本轮验收进程已退出。整体生涯目标仍active，本次只是可操作建设链路进展。
