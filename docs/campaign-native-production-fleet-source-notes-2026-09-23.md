# 制造用空舰队工厂与模块AI（0.98a-RC8）

## 编码前最小对照
- CampaignEngine.java:2046–2064：FactionAPI重载仅构造并可设aiMode；String/name重载查真实Faction，构造后始终new ModularFleetAI（aiMode=false也如此），setAI、setName，最后设置指挥官factionId。不能复用前者却漏AI。
- ModularFleetAI.java:88–106：依次pick Navigation/Assignment/Strategic/Tactical，已知null才创建默认模块；这用ModAndPluginData而非GenericPluginManager。ModAndPluginData.java:201–214,432–451按非null插件id替换、null id可重复、返回最高ordinal，同分经稳定排序取最后一个。
- Engine.java:289新构造真实空ModAndPluginData.plugins；旧Web缺插件历史不可补空。CoreCampaignPluginImpl.java:77–83,736–742的真实id/非transient及DefaultFleetInflater选择需显式注册，不能假定历史已有Core。
- 四模块构造保留真实fleet/ai循环引用。Strategic IntervalUtil(0.5,1.5)先消耗一次Math.random；Tactical IntervalTracker(0.05,0.1)再消耗一次，forceIntervalElapsed只令elapsed=currInterval，latch仍false。Navigation和Assignment无随机构造。
- CoreScript.java:904–915使用player/temp/true，然后setCommander(playerPerson)，再Misc.getInflater(p)安装；原运行时缺String工厂，且不能始终强制默认Inflater跳过CampaignPlugin。
- CampaignFleet.setAI/setName及Person.setFaction仅赋值；临时生产舰队不添加世界location，不冒称已执行战略/战术AI。

## UI与边界
本块不改界面；制造订单/交付报告原版实机仍待核实，保留既有布局。后台源码/原版jar构造探针和一个既有短场景验证，禁止桌面和私人存档。缺模块帧/插件执行服务必须拒绝，不做空advance或全局玩家切换。readyForAuthority=false、simulation.status=unavailable，生涯不暂存/提交/推送/打包/发布。

- 补充阻塞定位：SettingsAPI.getHullIdToVariantListMap → StarfarerSettings.java:2087–2088 → 默认ShipRoles O0Oo.java:44–105。按原生JSON角色/条目遍历，仅显式variant候选加入，按hull分组去重；不是全部库存变体，也不是按名字排序。ListMap.java:24–33 get未知key会创建并保留空列表，CoreScript会原地填_Hull。复用已提取的reference-ship-selection默认角色顺序，新增独立当前可变表，旧checkpoint不补历史。

- CoreCampaignPluginImpl.java:736–742 显式 instanceof DefaultFleetInflaterParams：制造接线先构造带原版类标记的参数对象；普通对象不匹配。各候选DefaultFleetInflater保留同一个参数实例，不复制参数历史。
- BaseIndustry.java:904–906、1853–1859确认默认标题就是当前spec name；Runtime校验实际行业/来源类并复用原版名称。行业默认产出接入市场当前对象，TechMining非空打捞依赖尚缺时明确拒绝，详见本日行业产出source-notes。
- 实际订单贯通暴露并修复旧Runtime质量读取错误：CoreScript.java:896–899 是两个StatBonus.computeEffective(0f)，不是MutableStat.getModifiedValue；对原共享bonus以base=0求值后float32相加。
