# 原版世界帧动画与 Ping 生命周期（0.98a-RC8）

## 原版证据 → 行为 → 差异 → 验证
- 已读 ../decompiled/fs.common_obf/com/fs/graphics/anim/AnimationManager.java:22–30,83–120：真实paused、added/starting/animations/removing四列表；先started入活动队列，再前置checkFinished，再advance，再removeAll显式删除，再后置checkFinished。显式删除不调用finished；回调新增推迟到下一帧；经理暂停完全不消费队列。
- 同目录BaseAnimation.java:11–61：Java float elapsed/progress/frame，循环跨多周期仅currLoop++一次；非循环完成时currFrame固定numFrames-1（即使reverse），finished只派发after，started只派发before。未知动画/任务必须由真实服务执行，不能当成普通计时器或空完成。AnimationChain存在需要单独核实的末尾推进问题，本批不猜实现。
- ../decompiled/starfarer_obf/com/fs/starfarer/campaign/ActionIndicator.java:29–53,110–112：保存实际entity/custom/pingType/colorOverride与Fader；以duration淡入，isFadedIn才清除，达到亮度1和进入idle存在原Fader的一帧差异。
- 同目录PingScript.java:27–100：构造立即firePing；当前地点才发声音，但无论是否当前地点都添加indicator；numLeft--、timeLeft=delay。advance每次最多发一个ping，扣回超时余量，不使用catch-up循环；runWhilePaused=false。
- CampaignEngine.java:973–1100：动画在时钟之前，仅非暂停时推进；普通帧推进/清理pings，fastAdvance不推进pings，但引擎scripts仍按自身paused规则执行。
- 当前引擎已有真实调度顺序，但Runtime无动画/ActionIndicator/PingScript默认服务，测试动画部分用record回调。本批给新引擎建立真实动画状态、既有引擎缺历史保持缺失并要求明确绑定；默认服务走实际状态，保留自定义动画/任务/图形副作用显式扩展，未知类型照常失败。不启用整体自动世界。
- 界面：上轮已查看用户QQ20260919-165600.png和Web消息截图；截图没有展示该动画/ping的完整时间过程，本批不据此声称图形等价，也不操作桌面。此批更改世界运行状态，不另造UI。
- 验证：沿用既有native personnel场景，检查真实Manager队列/循环/停顿/删除、PingScript首发/多次/余量/位置上下文、Runtime默认引擎路径、SQLite回滚/重试/重启；一次集中类型/lint/场景，不跑全套。

## 本轮实现与证据

- 新增 OriginalCampaignAnimations.mjs/.d.mts，真实BaseAnimation和四队列Manager；默认advanceNativeAnimations已接Engine非暂停分支。新引擎构造真实空manager，旧checkpoint缺manager不自动补造，必须由可信来源明确bind。after/before任务与未知子类要求实际同步服务，缺失直接失败；没有假成功的空回调。
- 新增 OriginalCampaignPings.mjs/.d.mts以及15种原版ping参数；来源包括pings.json、CampaignPingSpec、SpecStore和默认颜色设置。自定义spec可无id，custom与resolved spec保留同一对象。ActionIndicator按原Fader推进/回收，PingScript首发/最多一发/余量结转/当前位置声音判断均执行实际逻辑。
- Runtime新增可信内部addNativeCampaignPing与实际脚本推进；引擎脚本返回的声音intent按原顺序并入frame.effects，经既有FrameEffects快照和SQLite事务。声音仍属于observer-scene，不广播给所有舰长；初次创建返回的音效intent需由调用者纳入自己的交易，本批未新增玩家ping命令。
- 既有native personnel事务场景移除advanceAnimations记录适配器。真实自然帧推进实际动画和带custom spec的PingScript；首帧音效进入已提交effects，暂停保留计时/次数；第二成功帧结束脚本并保留独立Indicator生命周期，checkpoint恢复共享fleet/spec/animation引用。既有规则失败/SQL失败/重试/Worker重启和私有事件隔离断言全部通过。
- 同场景额外检查：paused保留added队列；started/finished与回调新增下一帧执行；显式移除不finished；多循环单次currLoop增量；reverse非循环终帧；未知动画明确报错；原版new_sensor_contact超时不catch-up连发、off-location仍创建indicator却不发声音、fader亮度1后再一次advance才可清除。
- 一次集中验收全通过：tsc -b退出0；9个代码/声明改动文件oxlint退出0，零警告；只跑既有native personnel场景1通过0失败、73418.7919ms（总74104.93ms），无失败重跑。日志为artifacts/campaign-native-engine-transients-{types,lint,scenario}.log。没有新增浏览器/原版实机验收，因为本批未改变画面呈现；未操作桌面。
- 未完成：具体DelayedFlash/Battle匿名动画的完成任务、AnimationChain疑点核实与适配、ping绘制/真正声音播放/多观察者各自播放时序、tooltip/help等其余默认经理、完整NPC和自动世界。禁止把计时/事务通过说成完整视觉效果或完整生涯；readyForAuthority=false、simulation.status=unavailable保持。
