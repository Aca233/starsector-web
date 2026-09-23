# 势力装备知识与蓝图时序对照（2026-09-23）

## 原版证据 → 预期行为
- 原版0.98a-RC8 Faction.java:115–142,474–537,575–595,632–662,955–956,1803–1841：已知/优先装备为LinkedHashSet，蓝图时间是LinkedHashMap<String,Long>；保持实际插入次序与Java long精度。isKnownAt在时间戳更晚时拒绝，等时可用；缺该项时间并不等于缺全表，仍以当前known集合为准。
- addKnown重复调用直接返回，不更新时间和优先；首次学习先记录或删除时间，再加入known并按autoEnable设优先；removeKnown同时清时间/known/priority。玩家且非readResolve阶段、codex_unlockable装备需要真实SharedUnlockData通知，不能空回调。
- Faction.isPlayerFaction使用固定spec id=player，不使用FactionManager.playerFaction关系别名。玩家getKnownHullMods读取CampaignUI可用插件，再构造HashSet；CampaignState.java:2687–2700来自实际CharacterStats、alwaysUnlocked且非hidden规格、CharacterData已学插件，不能取Faction私有knownHullMods替代。
- DefaultFleetInflater.java:255–310,640–644按势力实际known、时间过滤和priority构建候选池。本块连接同一保留势力对象，不切换全局玩家上下文。

## 当前差异 → 本块实施
- Runtime缺默认势力装备getter，测试回调代供候选池。补独立规则、实际历史状态校验与绑定、学习/遗忘/优先修改及checkpoint引用恢复，并接默认inflater getter；状态缺失必须拒绝，不能从静态.faction配置编造游玩后蓝图历史。
- 玩家插件联合集合/Java HashSet次序仍须真实服务提供最终getKnownHullMods结果，本块不虚造CharacterData、物品经理或Codex全局状态；明确服务缺口，不以NPC集合代替。
- 不修改UI；无新的原版实机证据，不启动可见窗口或读取私人存档。自建夹具仅证明规则/运行连接，不证明正式开局已具备完整势力捕获。

## 验证方法
- 一次类型检查、改动lint和既有短月结场景：long边界、等时/未来、已知与优先独立、重复学习/遗忘/再学顺序、玩家Codex/插件服务拒绝、Runtime循环checkpoint与inflater池。
- 保持readyForAuthority=false、simulation.status=unavailable；不暂存/提交/推送/打包/发布。

## 来源摘要
- `../decompiled/starfarer_obf/com/fs/starfarer/campaign/Faction.java` SHA256 `9803ee657a0a696bfb2968f1ba13e88936c5fd614e2ed8138dbea5ec42610853`
- `../decompiled/starfarer_obf/com/fs/starfarer/campaign/CampaignState.java` SHA256 `dd08ca36cc84b8c23763ab8c164b07124e0425da99c911fcfefec881b63ff0cd`
- `../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/campaign/fleets/DefaultFleetInflater.java` SHA256 `bd44d4cee14edef814880fb61d4fb287342c492f48e1e8a3cbb85651c5f1d128`

## 本块实现与验收
- 独立OriginalFactionEquipment规则保留实际集合/时间图、共享Faction身份与更新开关；Runtime可绑定/读取、学习/遗忘和修改优先装备，学习时间默认取实际世界时钟。checkpoint恢复验证同一Faction引用，旧缺失状态不自动补空。
- DefaultFleetInflater默认已连接known武器/战机/NPC插件、long精度时间过滤、优先装备；同一个既有inflater测试去掉了七个知识/优先回调，改由真实规则构建候选池，未来蓝图不会提前进入配装。规格/拟合/世界构造等该旧夹具原有外部契约仍保持明确标注。
- 类型退出0；首次lint仅负向类型用例的故意越界数字触发精度警告，改为普通number保持类型拒绝，定向复查lint退出0且无警告。一个既有短月结场景1通过0失败，761.1107ms/总1344.8742ms，未跑其它场景或全套。
- 覆盖实际时钟学习、重复学习不重新计时/加优先、删除/再学习次序、优先与known独立、null/大于2^53/Java long边界、固定player ID而非关系别名、玩家Codex服务和缺历史拒绝、断点恢复后继续学习及循环图一致性。
- 日志：artifacts/campaign-native-faction-equipment-types.log、-lint.log、-lint-final.log、-scenario.log。
- 仍未完成：正式开局/保存的势力装备捕获及初始化、玩家可用插件联合集合及HashSet次序的默认服务、Codex共享解锁副作用、物品经理、模块/变体/DModManager、生产工厂。测试显式构造的完整历史不能冒充已捕获用户真实世界，完整制造/UI/生涯仍未交付。
