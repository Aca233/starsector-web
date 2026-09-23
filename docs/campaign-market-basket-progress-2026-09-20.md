# 市场混合篮子权威结算进度（2026-09-20）

本轮是市场交易可玩化的一项必要底层步骤，不是完整市场或完整生涯。编码前证据与计划见 campaign-market-basket-native-audit-2026-09-20.md。没有使用子代理、操作桌面/原版窗口/用户键鼠或启动可见浏览器。

## 已实现

- 可替换market服务新增 quoteBasket，命令新增 market.trade-basket；真实Worker与认证HTTP接通。一次针对一个市场/子市场/账户/舰队，1..64条有序净商品行；重复商品（包括相反方向）拒绝，草稿应先抵消再报价。
- 每行从同一不可变市场快照取得原版积分或V0价格，未执行之前行的库存/经济影响。新增原始价格函数 originalCommodityTradeGross；旧单商品报价外部形状不变。
- OriginalMarketBasket按F.getTransactionValue保留买组/卖组float累加，统一关税只舍入一次，净价向零取整后减税。V0小数不能逐行取整，不能用逐笔命令/逐行税代替一次确认。
- 只检查最终账户余额，允许当次卖出所得支付买入；继续允许超容量购买。其它玩家的账户不收款/扣款，没有虚构商人有限钱包或把税自动发给殖民地。
- 确认时重新报价且要求完整player/fleet/account/market/extension/anchor/member/faction依赖版本；同一SQLite事务保存四个实体版本、全部商品增减、影响事实、一个receipt和outbox事件。任何错误整单不生效；同requestId重试不重复成交，换权威重开后同样可重放收据。
- 多行事实使用可选 lineId=commodityId，键为[playerId,requestId,lineId]；旧单行仍使用[playerId,requestId]。市场验证拒绝混合身份/同请求不同子市场/创建tick，经济ledger禁止旧/新身份交叉复用，逐行内容变更同样拒绝。现有schemaVersion1保留，新字段由新provider验证；旧账本不重写、不静默迁移。
- 新测试发现范围保护若在float舍入之后检查，-2^24再减少1会被舍入掩盖。现改为先检查未舍入的结果是否越过显式支持范围，再转float；应用于旧单行和新篮子的tradeMod，以及篮子分组金额。
- reference.market显式升级0.2.0，默认reference.cooperative升级0.14.0。已有世界仍受原规则锁保护，不接受旧锁冒充新规则；未修改任何用户存档。

## HTTP/集成合同

POST /campaign-api/market-basket-quote：认证会话决定玩家，body为

```ts
{
  worldId, epoch, marketId, submarketId, fleetId, accountId,
  items: [{ commodityId, side: 'buy' | 'sell', quantity }]
}
```

响应包含原worldId/epoch与四个目标ID、每行quantity/side/rawGross/available、buyGross/sellGross/subtotal/tariffRate/tariff/creditsDelta、asOfTick、完整expected、距离和可执行/不可用原因。客户端不能自己传价格或principal，不能把rawGross先截断后相加。新接口带world/epoch检查；旧market-quote未被暗中改成另一种请求格式。

执行POST /campaign-api/command使用type=market.trade-basket，payload去掉worldId/epoch（保留四个目标ID和items），命令外层携带worldId/epoch/requestId/expected。直接消费整份报价依赖，不挑选部分版本。它是单一账户/单一子市场结算，还不是原版跨子市场总确认。回执只属于命令，报价不创建receipt。

## 实际验证

- 新增 check-campaign-market-basket.mjs **19项**：统一关税/小数/范围、实际V0价格、小额账户与卖出融资、无修改报价、超载、原子失败、完整版本/双玩家竞争、接触/权限/旧经济拒绝、黑市quote-only、影响账本预算、SQLite故障回滚与重开幂等、旧新ledger身份、真实Worker+HTTP认证/重试/版本竞争等。
- 原生对照测试抽取本机F.java的完整getTransactionValue方法；以“无持有光标的净买卖栈”为场景，商品价格/栈环境用最小桩。**240组**混合买卖、V0式小数、大量累加及税率边界与Java输出一致。不是原版整局实机；原始积分函数还有既有320组Java对照回归通过。
- 最终全部campaign套件：**496项，491通过，0失败，5项可选原版探针跳过**。单并发执行，日志 artifacts/campaign-market-basket-regression.log。这不是整个仓库所有功能的测试声明。
- 全项目tsc -b、严格campaign契约通过；新增不可变篮子/禁止客户端principal类型负例有效。变更范围oxlint --deny-warnings通过。独立campaign QA构建通过，publicDir:false，不是发布包。
- 本轮未改UI，因此没有拿无头HTTP测试冒充市场视觉/鼠标交互验收。原版市场完整布局和hover状态仍缺证据；已有用户图30979333实际是星图，不能冒用。Web现有货舱/HUD兼容回归另记结果，不等同市场UI实现。

## 尚未完成

- 同步真实产业/运输/需求/库存/准入/外交，持续运行时的经济刷新和账本原生计时集成。same-tick保护保留，不允许更新asOfTick伪装经济已刷新，也没有把这些测试库存发布到Corvus。
- 跨子市场统一确认、市场双边货舱UI、手持商品/Shift/Ctrl下的市场价格预览、完整原版工具提示。
- 黑市后果、exotic结算、军用/仓库/本地资源子市场、武器/联队/特殊物品、售船。
- 生涯其余世界/传感器、任务与战斗结算、势力/自创势力/殖民地及生产联机仍未完成。

未暂存、提交、推送、打包发布。保留其它任务新出现的LAN AI/room-deployment等变动，不修改它们。

## 最终现有界面兼容回归

显式headless:true重跑五份既有场景（HUD、Ctrl、Shift、货舱预览、普通转移），全部通过、页面错误0；包含延迟响应、撤销、1024小屏、丢失成功回执后幂等重试。日志 `artifacts/campaign-market-basket-ui-regression.log`，结果已另存 `artifacts/campaign-market-basket-headless-results.json`。测试浏览器、上下文、内存Worker与HTTP网关均经finally关闭；没有市场UI新增画面可验收。暂存区检查为空。

## 2026-09-20 后续：开放市场资源补货与计时

见 `campaign-open-retail-progress-2026-09-20.md`：原版资源上限/刷新/衰减、同一权威时钟下的零售计时、system原子刷新和显式所有者授权已接线；320组库存Java方法与4组帧率对照通过。旧阶段测试数字保留。当前完整campaign为515项/510通过/5可选跳过；真实上游经济/进港UI仍未接齐，same-tick保护保留，不使用测试库存填正式世界。规则锁0.15.0，未迁移用户存档。
