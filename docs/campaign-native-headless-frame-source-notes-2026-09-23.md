# 原生无头引擎帧默认依赖（0.98a-RC8）

## 编码前最小对照
- CampaignEngine.java:973–1012先tooltip/intel/event/people/UI，再经济通知、记忆/势力；未暂停后才走动画/时钟/地点。campaign/OOoO.java:73–78输入严格null立即return，不读取或清除tooltip状态；非null（包括空输入列表）是不同路径，不能被当作无头直接吞掉。
- 当前NativeCampaignRuntime已实际实现IntelManager、暂停市场、动画、时钟、地点等默认服务，但还强制options.services对象，底层调度器强制tooltip callback；现有SQLite宿主场景用记录函数替代tooltip和暂停市场，并绕开真实中继范围。
- CoreScript.java:844–853自定义生产只有gatheringPoint为null时无条件直接返回；有汇集点就必须执行真实制造/储存，不能用空回调冒充。原生FactionProduction保存实际nullable gatheringPoint，不能把未捕获production当null。
- Economy调度的原生接收者/共享月报/人员/工资/资源收费已存在，应直接选择native-receivers；缺通知名册/历史明确拒绝，不创造空名册，不从external-adapter静默切所有权。殖民地行业名/有汇集点制造等缺失仍要求真实实现。
- CampaignFleet视图推进依赖真实CombatViewport矩形，不等于所有东西都在屏幕内。允许宿主传原有OriginalCampaignViewport纯数据，绑定既有可见性算法，禁止捏造无限视口；外部替换服务保留但同名两种输入拒绝。

## 实施/验证计划
- 原版input=null分支内置；非null必须真实tooltip服务。runtime允许不传空services对象，真实viewport数据绑定到实际地点/舰队推进；经济默认走已存在原生接收者，仍不开放自动循环/多人世界。
- 在既有personnel场景追加独立显式新世界夹具：复用真实SQLite事务、native ledger、真实默认intelligence/paused-market/动画/运动/后勤链，不注入记录或空管理器。确认运动、自然消耗、暂停、持久化，以及缺历史/非null输入回滚。
- 本轮无UI布局改动，沿用已查看原版航行截图与原生HUD；不伪称原版实机/自动世界完成。一轮类型、改动lint、同一相关场景。

补查：loading/specs/FactionProduction.java:288–305的getGatheringPoint不是纯字段读取：原值null或isInEconomy=false时，选择玩家拥有且daysInExistence最大的市场，平龄保留名单首个并写回。Market.java:322–324按经济中的市场ID存在判定。必须先移植此选择器，禁止把原始null直接当成没有殖民地；未知市场年龄仍报错。

## 实施与验证结果
- OriginalCampaignEngine 内置campaign/OOoO的null输入分支；非null（含[]）缺真实tooltip manager仍拒绝，不清掉任何未捕获tooltip历史。保留显式可替换实现。
- NativeCampaignRuntime.advanceNativeEngineFrame允许不提供空services对象；viewport纯数据绑定到原有真实可见性逻辑，与readFleetViewport同时提供拒绝。缺经济覆盖时默认调用现有native-receivers，不构造空通知名册，不切换原有external-adapter的所有权。
- CoreScript无汇集点分支经真实FactionProduction.getGatheringPoint getter判断，而非直接读null：补齐最老玩家殖民地自动选择、平龄保留首个、有效已有汇集点保持（即使所有权改变）、离开经济后重选。NativeRuntime使用真实经济名单和市场frame年龄。缺历史或非null汇集点的制造/交付服务仍明确失败，不完成虚假订单。
- 类型检查通过。首次lint发现新增测试正则斜杠转义错误，修复后的测试文件lint通过。场景首跑停在测试夹具写文件函数名fs未定义（源码原有writeFile为具名导入）；修复后仅复查测试文件lint并重跑同一场景，没有全套。
- 最终既有personnel场景1通过0失败，107170.7875ms，总107880.1372ms，进程退出0。真实SQLite宿主事务只传viewport数据，不给tooltip/intel/paused-market/economy recording callbacks：原生通知管理器完成月末rollover；按原版每船员10、每月10次迭代检查工资增加量；共享资金按月报真实净额扣款；非零时间真实运动，LogisticsModule自然扣补给（prepare里没有手动扣费）；暂停不前进位置/库存/时钟，恢复推进；checkpoint恢复保持native-receivers归属与月报。
- 非null输入缺tooltip、双视口定义、缺通知历史均拒绝；SQLite双视口失败后checkpoint字符串一致。所有原有同场景回滚/权限/Worker断言仍通过。新增完整图断言使用现有allowCycles编码后的字符串，不deepEqual循环巨图。
- 该独立夹具显式构造core-only通知注册、无玩家殖民地、实际系统坐标并沿用真实舰队/账簿；不是从旧存档补空历史，不是正式星区/多人独立经济已完成。仅测试数据保存artifacts/campaign-native-headless-frame-input.json，未读取私人存档。
- 本轮不改UI布局，不启动浏览器/桌面，不开代理、不暂存/提交/推送/打包/发布；readyForAuthority=false与simulation.status=unavailable保持。没有添加公开tick路由或自动计时循环。

## 下一步真实缺口
有殖民地时的行业当前名称/自定义制造与交付，未知Intel/实体/脚本插件、正式开局星区、长期自然经济多周期以及多人各舰长的独立规则/财务上下文仍需完成。不能用本次无殖民地默认帧通过替代这些工作。
