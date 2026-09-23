# 扩展移民与人口增长链进展（2026-09-20）

## 已完成的实际连接

- computeOriginalIncoming 可以接收已实现72条件；MildClimate 和 LuddicMajority 使用已有原版核函数，不再停留在“已注册但实际调用拒绝”。
- 所有权/远征倍率使用显式市场级 luddicMajorityState，同一市场的多个条件不能填互相矛盾的 getter；初始 population.advance 和增长驱动返回时都检查所有权一致。
- 真正注册的对象照原版按 permanent→transient 执行；不因为当前 suppressed/unsurveyed 而私自跳过，不在 incoming 中重新检查 Church 资格。资格变更由此前真实条件重应用处理。
- 6种已经支持的工业物品在正确产业上不再被移民及产业可达性入口一概拒绝：2种 nanoforge、synchrotron、catalytic_core、biofactory_embryo、dealmaker_holosuite。安装命令/生命周期仍有自己的前置条件，这里只消费已安装快照。
- 抽出 reapplyOriginalIndustryAccessibility：共享条件阶段后只运行人口/港口产业的原版 access 写入，不重新应用 FreeMarket/Gravity/Shipping 或其它条件。
- reapplyOriginalPopulationGrowth 现消费同一次共享条件/商品/财务结果：使用条件末尾 accessibility，返回实际更新的 suppressed 条件 roster，使用运输损失恢复后的 drug availability，接回新增条件/产业移民注册。
- 原版第一次条件循环的顺序结果得到保留：hot 在 solar 前时，本轮 hazard 仍包含 hot；新 suppressed=true 不代表立刻再补跑一次条件。增长后本次 advance 仍使用初始 incoming，不重复补贴收费。
- population 条件替换支持新增条件 roster，保留其它条件对象身份，仍给新人口条件分配新 modId。

## 本轮验证（只代表此范围）

后台串行定向回归 **57/57 通过，0跳过**（约15秒）；5个脚本：

- check-campaign-extended-incoming.mjs：10项
- check-campaign-extended-growth.mjs：5项
- check-campaign-immigration.mjs：15项
- check-campaign-market-accessibility.mjs：14项
- check-campaign-population.mjs：13项

新增原版 Java 差分：**138 incoming 快照 +32人口推进快照 +12真实条件→12产业可达性串联快照**。旧198 incoming/120环境、180市场组/288可达性、192人口推进/24多步历史对照同次运行继续通过。

重要：新增32个人口 Java 案例包含首次迭代/UI-only，但不运行 Church 全资格重应用的占位桩。探针在那种情况会明确抛错，不将空实现冒充真实原版。实际新增条件增长调用路径另由真实共享条件→商品/财务→产业access 的集成测试验证；条件→access 使用独立原版 Java阶段串接，仍不等于完整游戏端到端原版实机验证。

- 严格生涯 TypeScript 检查通过。
- 修改的10个 JS 文件单线程 lint：0 diagnostics。
- 新增条件、生产产业、特殊产业来源导入 --check 全通过；其它3个原版来源清单由旧回归测试核验通过。
- 日志：artifacts/campaign-extended-incoming-regression.log、campaign-extended-incoming-types.log、campaign-extended-incoming-lint.log、campaign-extended-incoming-sources.log。
- 调试中的测试前置修正：hot 原版危害是+0.25；mining 具有 industrial 标签会使 Church apply 不注册；变更产业顺序必须同步财务 roster 顺序；原版队列桩必须设置真实 spaceport 标签。这些修正未改写原版公式/资格。

## 仍未完成

- 这次修复的是本地规则链，不能把整套生涯模式标为完成。完整世界/存档恢复、实际管理员/技能/事件与监听器重应用、经济网络与缓存初始化、submarket 库存、月结、势力与任务、端到端联机仍需要继续。
- 原版实机/UI截图与Web交互验收仍未执行。本轮没有改UI，没有启动可见程序或操作桌面；没有子代理。
- authority ruleset 未调整；没有宣称 Corvus industrySimulation 已执行，没有虚构 native-save readyForAuthority。
- 后续若做下一次重应用，必须合并各阶段的真实最终状态；conditionPhase 仍只是条件阶段快照，不是整轮产业后的最终市场。
- 生涯文件不暂存、不提交、不推送、不打包、不发布；未改其它并发任务文件。
