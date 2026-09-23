# 真实管理员身份与有序技能捕获：实现前核对（2026-09-20）

原版0.98a-RC8；仅后台，无桌面/子代理/提交发布，UI未验收。

- Market.getAdmin:337：null时新建steady默认人物并setAdmin；玩家拥有且admin.isDefault时setAdmin(null)，直接改为playerPerson，再refreshGovernedOutpostEffects。不能用是否命名/是否AI猜isDefault，不能把playerOwned的自定义管理员一律改为玩家。
- Person.isDefault:152严格比较portraitSprite与settings.graphics.misc.default_portrait；Person.readResolve:160将null portrait补为默认。缺失stats创建CharacterStats。CampaignEngine.getPlayerPerson→characterData.getPerson。
- CharacterStats.readResolve:416：技能列表从s字段JSON读JSONObject.getNames顺序，再设置float等级；不是JSON文本顺序或字母顺序。之后人物技能/事件刷新仍须执行，捕获列表不冒充完整人物恢复。
- 安装包jre/release确认Zulu Java17.0.10。原版json.jar字节码确认JSONObject无参创建默认HashMap，keys使用map.keySet.iterator。核对本机JDK17 src.zip HashMap：容量16/load0.75，String.hashCode xor高16位，按bucket递增，链表尾插，resize稳定分成lo/hi。
- 所有已加载58个skill ID，在容量16/32/64/128的最大可能bucket分别7/5/3/2；故任何子集/排列均不会触发treeify或其提前resize。可对这个经过验证的封闭名称域精确计算原版getNames顺序，而不能伪装为任意Java HashMap实现。
- 实存档65个市场均有admin；其skill保存含工业规划与超越认知等。只读检查未复制名称/人物描述/无关技能属性。市场stats.dynamic.mods的combat_fleet_size_mult/ground_defenses_mod采用SBonus保存结构；不能误读dynamic.stats。

## 实现

新增来源目录与身份选择计划/有序技能恢复模块。身份输出只计划原版选择及所需生命周期操作，不悄悄改people/CommDirectory/AdminData；NPC缺admin必须明确需要新建默认人物，不能用空技能假充完整管理员。

保存读取实际Person/CharacterStats引用、默认头像比较结果、AI ID、有序skill等级和两份市场dynamic mods；捕获→storage草稿生成显式administratorReadback与governedSkillsDraft，用于下一阶段真实重应用。人物技能刷新/监听器/fromOther仍pending，不能发布为完整world。

## 验证

使用安装包Java17和json.jar对照不同技能子集/排列的getNames及float等级；抽取原版Market.getAdmin/Person.isDefault验证已有/缺失/玩家默认/自定义/AI身份分支，记录必要生命周期而非执行世界操作。合成保存验证共享身份/省略字段/别名/错误类型；将真实捕获技能接到已实现governed规则和港口/稳定性输入。私有结果仅artifacts，原保存哈希前后必须一致。

补充核对：CharacterStats.writeReplace会从非玩家副本移除零级aptitudes/skills；readResolve/setAptitudeLevel和缺失stats构造会补回aptitude effect skills。故新字段命名savedSkills，表示s字段恢复顺序，不冒充完整人物技能列表。用于本阶段的governedSkills只筛选实际8个GOVERNED效果所属的3个skill；四个aptitude skill不含此类效果，补回/更新它们不会改变该投影的顺序或等级。全部人物/事件恢复继续pending。

验证补充：DynamicStats.mods为非typed map值；仅接收已审计SBonus别名或显式cl=SBonus，不能把MutableStat/未知别名按空StatBonus吞掉。JSON对象字段排列不属于人物身份，比较采用规范JSON；技能数组顺序仍严格保留。
