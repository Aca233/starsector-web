# 自然帧副作用与提交后私有事件（0.98a-RC8）

- 原版证据：CampaignFleet.java:773–787 仅当前 playerFleet 产生缺补给/缺船员消息；CampaignEngine.java:1442–1451 转交 CampaignUI。RepairTracker.java:357–400 仅玩家修理完成产生合并消息与 REFIT_TAB 点击目标；AccidentManager.java:127–132 区分玩家报告和调试NPC消息。SensorContactIndicatorManager.java:170–184 的接触 ping/失联声音是当前玩家感知；CampaignEngine.java:901–937 的 ping 绑定实体，并非全球广播。BaseToggleAbility 与本地已有 travel-abilities source notes 定义能力世界音/界面音及可见性门槛。
- 当前缺口：地点/引擎丢弃已实现舰队、星球、货舱的 effects 返回值，事务不能持久化实际消息。修复保持原版执行顺序，依次收集实体→地点→引擎输出，然后在同一SQLite事务中把无循环图的副作用快照写入回执/outbox。失败不发布，重试读取原回执。
- 联机披露：原版单例玩家消息只给真实 playerFleet 的已认证控制者；不切换 playerFleet、不借此宣称第二舰长独立上下文完成。感知提示保留在可信宿主结果，Web 继续使用各自 ScenePresentation 的独立接触输出，禁止重复广播单例玩家接触。新增只读私有事件接口，按服务端会话身份过滤、稳定事件ID及revision游标，隐藏事件也推进游标，不包含其它舰队图/货舱/原生引用。
- 本批不改UI布局，不新增自创通知面板。原版消息条视觉、音频生命周期、消息合并/点击仍待原版同状态画面对照，不以接口通过冒充完成。
- 验证：既有双舰队自然帧制造真实缺船员消息；验证宿主收到、SQLite提交/回滚、同ID重试、另一舰长不可见、分页空批次游标、Worker/HTTP重读、伪造玩家/旧epoch拒绝。集中一次类型检查、改动lint与既有场景。

- 本轮直接复核 BaseToggleAbility.java:80–86（世界/界面循环声音）、167–183（玩家按键音）、195–219（可见且非玩家的世界开关音）、203–204（可见实体浮字）；这些已由规则层基于真实原版玩家筛选，宿主不能改成所有舰长共同接收。

## 已实现与验收

- BaseLocation 按实体推进顺序收集 effects，CampaignEngine 保留地点顺序及真实 playerFleet 上下文。宿主转换为明确字段的无循环图快照（成员只留点击引用，不序列化整个舰队），并与 checkpoint、receipt、outbox 同事务提交。未知效果类型明确拒绝，不静默丢弃。
- 新增 native-frame-events 私有只读链路：Repository → Worker → Service → 已认证HTTP → 客户端传输函数。正文不能指定playerId；校验world/epoch/游标/页限。按真实原版玩家控制权披露，空/隐藏批次照常推进游标，事件ID跨重试/重启稳定。可信宿主的完整outbox不暴露HTTP。
- 原版感知 ping/失联音保留为 observer-scene 通道，不塞进私有消息流重复广播；已有ScenePresentation仍负责各自感知。未增加全局playerFleet轮换，未启用自动时钟或公开帧写入。
- 真实双舰队自然帧产生缺员警告，经SQLite、重启后的Worker和HTTP读取通过；另一舰长不可见；在实际消息生成后注入规则/SQL失败均不发布；暂停不产生事件，后续wasOutOfCrew阻止重复警告。原有移动、补给、离屏、事务重试仍通过。另验收修理点击引用不携带循环图、未知mod效果明确报错、原版接触不跨玩家广播。
- 最终既有场景1通过0失败、退出码0；场景71167.2882ms、进程71694.6935ms。集中类型检查发现客户端请求联合类型漏项，补齐后仅复查app类型通过；17改动文件lint通过，后续相关文件定向lint通过。首次场景失败是新增验收调用了不存在的网关函数名，改用既有listenCampaignGateway和临时端口后定向复查通过。未重跑全套。
- 日志：artifacts/campaign-native-frame-effects-types.log（初次类型错误）、artifacts/campaign-native-frame-effects-types-recheck.log（复查通过）、artifacts/campaign-native-frame-effects-lint.log、artifacts/campaign-native-frame-effects-lint-recheck.log、artifacts/campaign-native-frame-effects-scenario.log（最终通过）。
- 仍未完成：客户端自动消费/去重与原版消息条、修理消息合并/REFIT点击、音频播放/循环生命周期、所有顶层经理副作用、第二舰长独立规则上下文、完整世界与正式开局。接口测试不等于原版实机或UI验收；readyForAuthority=false、simulation.status=unavailable保持。未占用桌面，无新增代理，未暂存/提交/推送/打包/发布。整体生涯目标active。
