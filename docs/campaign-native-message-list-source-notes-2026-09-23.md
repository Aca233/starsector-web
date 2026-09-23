# 原版消息条与已提交事件消费（0.98a-RC8）

- 已查看用户截图 C:/Users/Aca/Downloads/QQ20260919-165600.png：左下无卡片背景、图标在文字左侧，新消息在下；截图展示情报/发现消息，不证明缺员/修理的悬停和点击行为。
- CampaignState.java:375–376 定位 x=10、bottom=287、初始1024×400；515–539普通字符串也是MessageIntel进入同一V3列表。comms/super.java:63–70 最新插头、从底部排起、PAD=3，并pack；不能误把400当作固定裁剪上限。
- comms/C.java:30–85：文字宽400，图标高40且保留宽高比，图文间10；无图标行宽400、文字高度+10，有图标行宽450、高max(40,文字高度+10)；淡入.125秒/淡出1秒。110–121：elapsed>15开始淡出；125–133：鼠标移动到图标上forceIn，不重置elapsed。CampaignState.advance:646–648 UI单帧dt上限.033333335，不随世界暂停跳过screenPanel.advance。
- MessageIntel.java createIntelInfo 使用defaultFont；settings.json:1062 是insignia15LTaa。原版贴图/中文字库已在项目内。O0OO和settings textEnemyColor=[255,100,0,255]（默认非色盲）；Misc.getBasePlayerColor固定player势力baseUIColor，不取控制舰队所属势力。
- RepairTracker.java:368–400扫描现存repair消息合并计数，不挪到列表底部；替换点击对象为最新member，elapsed=0、forceIn，计数highlight。comms/super.java:174–180 点击REFIT_TAB带实际FleetMember。当前原生REFIT页未接，因此显示真实修理图标和合并结果，但点击明确禁用，不跳去另一套参考世界的改装页。
- 网络结构：新连接从已认证session的当前revision开始，不重播整段历史；同一挂载期间跨epoch继续已确认cursor，分页成功才推进；失败保留cursor重试，重复页不新增消息。消息模型与纯消费器可替换，React只负责原版位置和字体。音效/事故窗口/能力持续音生命周期仍待接，不用错误时机播放历史loop。
- 验证：同一个既有native personnel场景加入消息计时/修理合并/重试游标断言；使用真实SQLite拥有者+真实HTTP页面连接后推进舰队，后台无头验证实际缺员文字、不会重复、1920×1080消息条位置/截图与原版布局对照。不得操作桌面；未正式开局，不做整体生涯完成声明。

## 实现及验证结果

- 实际接入 NativeCampaignApp：原版普通消息与修理合并模型、已认证私有流、逐页原子消费、500ms轮询/追赶、Abort卸载与失败保留游标。没有消息时不重绘列表。字体错误与同步错误分别保留，成功轮询不会抹掉字体失败。
- 修理快照现在记录固定 player 势力真实 specBaseUIColor，缺来源不猜颜色；旧修理事件若缺颜色会明确失败，本轮没有补造旧历史。新连接/刷新从session当前revision开始；没有跨刷新恢复临时UI列表。
- 模型场景验证修理合并不移位/更新实际成员引用、计数高亮、重复页忽略、后半页无效时整页不消费、空页游标推进、严格elapsed>15才淡出、UI dt上限和hover不重置年龄。
- 实际页面验证使用同一真实SQLite拥有者的异步facade+HTTP，不另起抢占epoch的Worker，也不新增公开tick。页面先连接revision0，再推进真实双舰队自然帧；丢弃第一份真实消息HTTP响应后原游标重试，只显示一次“没有足够的船员让所有舰船做好战斗准备”。最终游标3无重复，pageerror为空。原有Worker重启/权限/回滚断言在同一场景仍通过。
- 1920×1080无头截图：artifacts/campaign-native-message-list-1920.png；实际DOM x=10、bottom=287、文字区宽400、行高27、透明背景、无边框/阴影、body原版位图字体就绪。已查看截图并与用户原版截图对照区域结构；夹具是明确的无背景新地点，仅证明消息组件，不是完整星区截图。原版参考是情报消息而非同状态缺员实机，因此不宣称像素完全等价。
- 本轮集中类型检查通过；改动lint首次两个React ref-render警告已按具体位置修复，定向复查组件lint与app类型均退出0，日志为lint-final/types-final。既有native personnel场景一次1通过0失败，83101.6996ms（总83833.7081ms），未跑全套。日志：artifacts/campaign-native-message-list-{types,lint,scenario}.log。
- 仍未完成：消息音效、原生REFIT与图标点击（明确禁用）、事故报告/能力视听生命周期、完整长文本断行。当前换行基于实际字体advances/kerning及400宽，拉丁词边界等完整原版断行仍待实机核对，不宣称等价。
- 原生自动完整世界/第二舰长独立上下文/正式开局仍未开放，readyForAuthority=false / simulation.status=unavailable。未提交、发布或操作桌面。
