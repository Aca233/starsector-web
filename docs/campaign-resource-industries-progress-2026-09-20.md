# 资源产业供需推进（2026-09-20）

## 已实现，不等于全局经济完成

- 数据：`src/campaign/data/reference-resource-industries.json` 从本机原版导入24种资源条件、AI/改善常量，锁定9份源码 SHA256。
- 计算：`OriginalResourceIndustries.mjs` 支持 farming、aquaculture、mining 的 **commodity 方法**，不是完整 Industry 生命周期。
- 上游：资源条件 → 有插入顺序的具名供给修正 → 机械缺口 → 行业有效产需 → 既有 `resolveOriginalIndustryAmounts` / `resolveOriginalMarketEconomyPass`。Corvus 的三个已定义经济市场已用于来源链测试；这些测试没有给运行世界写库存或价格。
- 持久数据是 JSON，返回值深度只读。模块与数据、市场价格规则分离；未注册一个“已经完成经济模拟”的假服务，也没有变更默认规则锁或迁移旧存档。

## 方法合同与顺序

```ts
newOriginalResourceIndustry('farming' | 'aquaculture' | 'mining')
validateOriginalResourceIndustry(state)
applyOriginalResourceDeposit({conditionId, modId, marketSize, industries})
applyOriginalResourceIndustry({state, marketSize, operating, available, modifiers})
originalResourceIndustryOutput(state, {commodityId, illegal})
```

- `new...` 只可用于明确新建的产业；不能把既有产业未知的供需当作空白状态导入。
- state 包含 `schemaVersion,industryId,supplyBonus,demandReduction,supply,demand`。每个 stat 是 `{base,modifiers:{flat,percent,mult}}`，modifier 为有顺序的 `{id,value}` 数组。保留负产需、显式中性修正及 modifier presence，不按“值为0”清空整个 stat。
- `operating` 必须明确 `{disrupted,building,upgradeId}`；原版升级期间仍 functional，受扰期间不是。
- deposit 输入的 `industries` 是资源产业子集，每项 `{state,operating}`；返回 `{industries,targetIndustryId}`。**只调用一次已勘探且未压制的条件 apply**。外层必须检查原版 surveyed/suppressed 状态与完整市场条件顺序；不能把此函数当作整个市场的 reapplyConditions。
- modifier ID 是真实 condition modification ID，不一定等于 condition spec ID；不同 ID 可共存。资源条件不做去重合并。food/lobster 优先 farming，即使它非 functional；只有不存在 farming 才回退 aquaculture。
- 原版 resource condition 的 unapply 不删除 commodity flat；本模块不自行杜撰清理逻辑。停工时 condition.apply 只移除自己的两个 flat，随后行业 apply 的非 functional 分支才清空 supply。
- industry 的 `available` 目前仅 `{heavy_machinery: int}`；采矿毒品需求保留，但毒品短缺对 immigration 的影响尚未实现，不谎称它已执行或把它当作生产缺口。
- `modifiers` 必须明确 AI核心、improved、`adminSupplyBonus/adminDemandReduction`、两个 `...FromOther` stat、`specialItemId`。管理员来源/技能解析属于上游待实现内容。其他修正复制列表不复制 base；相同源 ID 替换且保留原位置。
- `specialItemId` 当前必须为 null；物品效果未知则拒绝，不忽略。市场 size 支持0..10，行业 stat有效量/可用量支持±65536，所有捕获输入必须是原生 float 可表示值，超界/字段缺失/未知行业/重复源明确拒绝。
- 条件阶段读取**此前**的 supplyBonus；industry.apply 再重建 bonus。正向 supply/demand 调用才刷新 ind_sb/ind_dr，负值/零值不刷新。因而更换AI后一次 apply 不保证条件产量立刻反映新bonus；真实顺序必须由经济任务执行器维护，不能循环到“看起来正确”再伪造快照。
- `originalResourceIndustryOutput` 的 legality 必须来自真实 CommodityOnMarket.isIllegal 上游；不猜测势力政策。它只给既有最大值聚合器输入，不产生 `asOfTick`、inventory、可交易权限或经济任务完成凭证。
- 对照保留 gameplay 数值与源 ID，不保存原版 modifier.desc 文案。产业详情、hazard、发展、收入/维护等其他副作用仍未实现，不能由这个 commodity 模块推断。

## 验证范围

原版先读的证据与编码前差异见 `campaign-resource-industries-native-audit-2026-09-20.md`。

- 专项14项通过：原版数据导入一致性、实际 Corvus authored 来源链、农业/水产回退和机械短缺、采矿、龙虾例外、具名条件叠加、AI/改善/管理员/其他修正、float和截断、停工/在建/升级、既有价格内核的输入集成、不可变及错误边界。
- Java CLI oracle：抽取原版 ResourceDepositsCondition、Farming、Mining、BaseIndustry 相关方法；编译完整原版 MutableStat 和 StatBonus（只移除 package/import 路径）。24种条件共144组，每组9步，**1296个状态快照及有效产需 float 全部一致**。外部 Market/Admin 环境使用测试桩；BaseIndustry.apply 桩只调用真实 updateSupplyAndDemandModifiers，剔除非 commodity 副作用，物品为 null。不是原版实机或全经济验证。
- 严格 campaign 类型检查、全项目 `tsc -b` 与本轮三份JS的 `oxlint --deny-warnings` 已通过。
- 本轮未改 UI，未做新的原版窗口操作、桌面截图或视觉验收。

## 下一步

继续原版人口/太空港/驻军等 Corvus 产业及影响 commodity 的条件（包括自由港/合法性），再推进真实经济任务编排和完整网络流通性。不得只更新 stock snapshot 时间戳、填产能、强行把未执行阶段标成完成。

完成生涯模式仍需全经济、原版市场交互、航行/传感器/地图、任务与战斗结算、势力/自建势力/殖民地以及完整多人接入，当前不满足完成门槛。

### 最终后台回归

`node --test --test-concurrency=1 scripts/check-campaign-*.mjs`：529项，524通过、0失败、5项既有可选原版探针跳过。日志：`artifacts/campaign-resource-industries-regression.log`。测试进程已正常退出。所有本轮 Java 子进程设 windowsHide，未使用子代理；未运行发布打包命令或Git提交/推送操作。

### 后续接入（同日）

共享commodity状态运算已抽到`OriginalIndustryState.mjs`，资源公开API不变。新增18种常规行业的commodity计算及有序市场组合，见`campaign-civic-industries-progress-2026-09-20.md`；旧1296状态oracle继续通过。全经济任务仍不宣称完成。
