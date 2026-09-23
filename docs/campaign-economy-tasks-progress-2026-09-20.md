# 生涯经济任务与商品缓存进展（2026-09-20）

## 本轮结果

按本机 Starsector 0.98a-RC8 源码/安装包字节码先核实，再实现；对照见 campaign-economy-tasks-native-audit-2026-09-20.md。仅后台文件、串行无头测试和隐藏 Java 子进程，没有桌面操作、游戏/浏览器启动或 UI 改动。

1. **经济任务执行器**：OriginalEconomyTasks 支持 forced 与 scheduled 两个原版入口；主任务、再次重放市场、人口推进、完成通知按原版顺序执行。保留列表快照时机、经济分组、同 tier 稳定顺序、重复监听器、过期移除、库存开关和 UI-only 人口差异。不把 withIncomeAndUpkeep 错当成跳过产业 apply 的开关。
2. **可替换可信运行时**：任务依赖通过强类型同步 runtime 注入；缺失/异步操作或回调异常立即失败，失败执行器不可恢复以跳过未完成阶段。对外副作用必须处在可回滚的权威事务草稿里，执行器不自行提交任何账户/库存。
3. **每市场商品缓存引用**：OriginalCommodityCache 保留惰性创建、当前完整组共享对象、改组后旧引用、已移除调用方反复构造但不获得绑定；出口收入 getter 不主动构造网络，用旧份额和读取时的新收入/玩家倍率。内部引用在 apply 失败时恢复；这不等于外部运行时的通用回滚。
4. **补足原版蓝龙虾分支**：完整目录有33个规格/19个经济商品，不能删除 lobster 让编排通过。主商品构造复制需求及合法性给同类变体，但不绑定变体网络；变体自身刷新清零需求、保留 demandLegal，也不产生惰性产业 demand 条目。其网络/生产份额可计算，但 exportValue 留空加载为0。旧主商品库存价格接口仍严格限制，不冒充已支持变体价格循环。
5. **可组合验证**：两市场测试宇宙使用完整原版商品目录组合现有本地产业/环境/财务/流通、商品缓存及人口内核，跑非月末 scheduled 迭代。这是测试适配器，不是正式世界经济运行时，也不是逐 getter/管理员技能/监听器的完整引擎重现。
6. **后台安全**：复核回归中的 Java 启动调用，为3个旧可选探针脚本的6处 java/javac 启动补上 windowsHide，避免后续启用探针时弹窗口。

## 当前验证证据

| 检查 | 结果 / 证据 |
| --- | --- |
| 原版来源锁定 | reference-economy-tasks.json，15份 SHA-256；包含安装 jar、任务/缓存源码、规格加载器、设置及 CSV；import --check 通过 |
| 专项 | node --test scripts/check-campaign-economy-tasks.mjs：18/18，通过；artifacts/campaign-economy-tasks-targeted.log |
| 原版任务差分 | 96组动态 forced/scheduled trace；实际任务方法、nextStep、createTasks，引擎效果为记录调用的桩 |
| 原版缓存/数值差分 | 162组主/非主商品 maxima、128组实时出口收入 getter、1条对象生命周期；实际 getter/maxima 方法，网络构造为仅实时组绑定的身份桩 |
| 原版变体财务差分 | 32组蓝龙虾份额/排序/收入；复用财务源码探针，消费已计算网络输入，**不是完整 constructor 数值差分** |
| 全生涯回归 | node --test --test-concurrency=1 scripts/check-campaign-*.mjs：633项，628通过，0失败，5项既有可选探针跳过；artifacts/campaign-economy-tasks-regression.log |
| 类型 | tsc -p tsconfig.campaign.json、tsc -b 均 exit 0；artifacts/campaign-economy-tasks-types.log；包括新增严格 runtime/缓存/不可变结果契约 |
| 静态检查 | 21个相关实现/声明/测试脚本定向 oxlint exit 0；artifacts/campaign-economy-tasks-lint.log；不宣称整个仓库或旧契约文件全量 lint 无警告 |
| Git | 暂存区为空；tracked diff --check 无错误（已有 LF/CRLF 提示）；生涯文件多为 untracked，另作定向空白检查 |

原版实机操作、原版/Web同状态 UI 截图比较均未执行；用户仍在使用电脑，不占用前台，不用测试通过代替 UI 验收。

## 尚未完成与下一步

- 缺正式的逐 getter/产业/管理员技能/监听器市场运行时，以及完整 sector 来源加载和其余产业/物品插件。
- 商品缓存 capture 要提供真实、完整、同一事务草稿的组输入；市场/监听器标识须保持捕获对象身份，不能删除后复用同一个句柄来指代不同对象。测试适配器不是上述上游依赖的替代品。
- 原版 final iteration 对同 demandClass 的所有商品反复处理库存/价格；主商品及变体的不同随机种子与阶段顺序还需实现，然后接入月末任务，不得把非月末测试成功扩称为月末价格已可用。
- 日历调度、月账结算、正式世界人口增长驱动、权威市场发布仍未贯通；Corvus 继续保留 industrySimulation: not-executed，不伪造库存或刷新证明。
- 原版 UI、殖民地/势力与自创势力、任务/战斗结果及各自/加入合作的完整生涯端到端仍需完成。

下一条关键路径是补同类商品库存/价格执行，再把任务 runtime 接入真实权威市场状态；不要不断扩大测试夹具后把它称作正式玩法。完整目标保持进行中。未暂存、提交、推送、打包或发布；不改无关引擎/LAN/桌面/发布工作。
