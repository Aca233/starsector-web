# 完整仓库货舱接线（0.98a-RC8）

## 原版证据 → 预期行为
- BaseSubmarketPlugin.java:99–104：仅 cargo==null 时构造 Cargo(true)，立即使用 submarket.getFaction().getId() 初始化封存 FleetData；未付费也不阻止 getCargo，已有 cargo 不重建。
- CargoData.java:55–71,100–124：初始 spaceUsed=50、capacity=1000/fuel=500/personnel=750、实际 credits、carryingFleet=null；仅 mothballedShips==null 时读取实际 Faction 的 shipNamePrefix/id 并 new FleetData。
- FleetData.getMembersListCopy 经同步返回非 NULL 成员；Misc.getStorageShipValue 的估值不能读取脱离实际库存的复制清单。
- CoreScript 的生产 Cargo 使用 initMothballedShips(player)，不能将该势力前缀猜为 null；生产目标是同一仓库实例。

## 当前差异 → 修改
- 旧 ensureOriginalStorageCargo 仅创建估值投影（spaceUsed=0、没有实际 credits/FleetData），不能用于交付。改为依赖实际 Cargo/FleetData 工厂，接 Runtime 已有工厂/成员服务；不额外构建可见 CampaignFleet、世界实体或 AI。
- 已有轻量历史捕获仍可估值，原样保留，不自动补造其未捕获舰长/随机数/统计。缺完整图时交付继续明确拒绝。
- 新建仓库的 cargo.mothballedShips、storage.mothballed 和 runtime roster/factory 必须是同一 FleetData，保存/恢复校验身份，不从 ref 或清单重新构造。
- 原版装配/行业和旧存档完整 FleetData 捕获仍是其它缺口，不能因此宣称自然制造或生涯完成。

## UI / 验证
- 本块仅数据与执行接线，不改变 UI；原版实机与 UI 对比待用户许可。
- 扩展既有短仓库场景检查真实构造初值、前缀、未付费 getter、重复读取、实际加舰/同步、保存恢复和旧投影拒绝；结合已有月结装配场景集中运行一次类型/lint/相关场景。

## 落地与验收
- 新建仓库默认已使用真实 CargoData 初值和 runtime FleetData 工厂/注册器；共享实际船员、credits、默认舰长和库存对象，未额外创建 CampaignFleet 或世界 AI。生产货舱也复用真实 initMothballedShips，并保留实际玩家势力命名前缀。
- 估值读取真实成员服务（同步/去 NULL 后的成员清单）；保存/恢复校验仓库与 runtime registered FleetData 的严格对象身份。旧轻量捕获可继续估值，但不能重新初始化伪装成完整图。
- 现有短仓库场景使用原版 Hermes_Hull，完整构造、入库、命名、同步、同一对象重复读取、未付费 getter、循环 checkpoint 恢复、拆分引用拒绝、缺服务/异步拒绝和旧投影拒绝均通过。该完整图库存场景没有构造完整玩家工资世界；原有月结仓储收费仍用独立历史估值夹具核对，不用空回调越过完整玩家状态。
- 中间失败均定向修复：XML 名称未转义、损坏 Hermes 的 DegradedEngines hullmod 尚未移植（换为已有支持的原版完好 Hermes）、完整图库存夹具没有工资所需玩家舰队。没有为测试伪造 hullmod 效果或放松世界校验。类型检查还修正已存在的 runtime 本地类别名、ping 返回类型限定名及过时 ai:null 契约。
- 最终类型检查退出 0、改动 lint 退出 0；已有短仓库场景 456.8625ms，和既有月结/装配场景合计 2/2 通过，总 1558.3303ms。日志 artifacts/campaign-native-storage-graph-{types,lint,lint-final,scenario-final}.log；没有全套/80秒人员场景/UI 重测。
- 未捕获的旧仓库完整成员/舰长/统计图仍待导入；未提供老存档重建、完整自动装配/制造行业产物或报告 UI。readyForAuthority=false、simulation.status=unavailable；主代理独立执行，无桌面操作、无发布。
