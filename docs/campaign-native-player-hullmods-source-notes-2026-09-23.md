# 玩家可用插件与物品管理对照（2026-09-23）

## 原版证据 → 规则
- 0.98a-RC8 CharacterStats.java:759–768：遍历实际技能及其效果；HULLMOD_UNLOCK看governingSkill当前等级>0，再按每个解锁项等级过滤，不使用效果的requiredSkillLevel门槛。SkillSpec.java:415–459,537–543按等级/原版插件displayName排序解锁，构造过程可能合并效果，必须提取安装类的真实结果。
- CampaignState.java:2687–2700：新HashSet先加技能解锁，再按实际SpecStore插件列表插入非hidden的alwaysUnlocked，再加CharacterData.hullMods；CharacterData/Person缺失时直接空结果。Faction.java:575–579再次new HashSet(Collection)，不能用JS插入序Set替代两次Java桶次序。
- PlayerCharacterData.java:41–42,96–109,129–136：已学插件是HashSet，增删不修改技能解锁；真实XML缺hullMods时原版readResolve新建空集合。旧Web检查点缺本字段不等于原版XML缺字段，仍须拒绝未知历史。
- SpecStore.java:1945–2041：从hull_mods.csv保留实际已加载顺序，unlocked/hidden缺省false。仅已安装公开资源，不读私人存档。
- HullModItemManager.java:27–75,78–117,125–261：SectorMemory单例，首次构造注册RefitScreenListener；TITLE/null成员/null变体/无必需品/无玩家舰队分别有真实提前返回。差异按active插件扣除舰体内建，ListMap.getList是会分配空列表的读取；数量按每份货舱先round再相加；安装先取舰队、后仓库，返还使用当时保存的item对象，不能换成当前规格新对象。

## 实施与边界
- 补真实插件解锁元数据、Java字符串HashSet顺序/容量与玩家存档字段；默认势力player插件getter和学习模块可用规则共享同一来源。树化碰撞未实现时须明确拒绝并允许替换，不静默按JS顺序输出。
- 补插件物品管理规则与真正单例/注册路径；缺世界经理/存储/规格必需品服务时明确拒绝，不因NPC空成员路径而假造世界。
- 不改UI、不操作桌面；原版实机/完整玩家改装界面仍未验收。

## 验证
- 公开资源的无头安装类/Java集合提取；集中类型、改动lint与一个既有短月结场景。保持readyForAuthority=false/simulation.status=unavailable，无提交或发布。

## 本块落地与验收
- 新公开资源导入器/无头安装类helper提取129个插件标志、58个技能的27条实际解锁效果及16组Java HashSet构造/增删/复制顺序。先修正helper的SkillEffectType真实包名后提取成功；没有启动游戏或读取私人存档。
- 玩家已学插件直接从PlayerCharacterData.hullMods原版XML提取，保留Java集合容量/桶序；真实XML缺字段按原版readResolve初始化。旧Web检查点缺字段仍保持未知，不补造。技能解锁/非隐藏默认解锁/已学插件共同进入CampaignUI结果，再按Faction.getKnownHullMods的集合构造返回。
- Runtime玩家插件读写、固定player势力getter及默认inflater已接真实知识；全套规则和元数据可显式替换。未实现树化碰撞会明确拒绝，不把JS插入序当Java桶序。
- HullModItemManager已实现真实SectorMemory单例/RefitScreenListener注册、ListMap读取分配、待确认差异、库存按货舱round、舰队优先扣取再仓库、保存确认与原始item退回、在用品货舱。Runtime默认自动配装必需品检查/改装保存监听器/遭遇战经理读取接同一实例；原版默认getRequiredItem=null已覆盖，自定义必需品实现未猜测。
- 首次集中类型/lint均退出0且无警告；同一个短月结场景发现旧检查点用例删除路径写错，定向修正。随后发现真实经理错误复用FleetData.serial破坏未初始化类的检查点约束，已改为独立保留的world.hullmodItemSerial（仅Web对象身份分配，不伪造原版业务历史）。
- 最终受影响文件lint退出0、同一短场景1通过0失败，963.8982ms/总1495.5312ms；验证真实玩家XML、long-lived集合容量、16组Java集合oracle、技能解锁、旧字段拒绝、真实货舱物品流转、经理/监听器/内存共享身份及Runtime循环检查点恢复。没有全套、大型人员或UI测试。
- 日志：artifacts/campaign-native-player-hullmods-types.log、-lint.log、-lint-final.log、-scenario-final.log。

## 剩余边界
- 原版六个自定义getRequiredItem（fragment/shrouded系列）的特殊物品插件初始化尚未移植，遇到它们必须提供真实服务；不返回占位物品或假定无要求。
- 尚缺既有世界RefitScreenListener/经理图的完整捕获、实际玩家改装UI/按钮动作与后台回执、Codex解锁通知、模块/空变体/DModManager和生产String工厂等。当前不是完整制造闭环或完整生涯；用户原版界面实机尚未补验。
- readyForAuthority=false/simulation.status=unavailable，整体目标active；无子代理、桌面操作、暂存/提交/推送/打包/发布。
