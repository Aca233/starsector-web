# 资源产业 live apply 原版核对（2026-09-22）

## 范围与证据

本次仅扩展 `OriginalResourceIndustries.mjs` 及同名声明：农业、水产养殖、普通采矿的一次经济 apply / unapply。不是产业对象生命周期、建设/升级、自然帧或 Runtime 接线交付。遵循 `AGENTS.md`，先读源码、写本最小对照再改代码；不操作桌面、不启动可见窗口、不运行测试/类型检查、不提交/推送/发布。

本机 `../starsector-core/starsector.log:1` 标明 **Starsector 0.98a-RC8**。源码相对 `../decompiled/starfarer.api/com/fs/starfarer/api/`：

| 源码 | 已核对 SHA-256 |
| --- | --- |
| `impl/campaign/econ/impl/BaseIndustry.java` | `bc3ff7aee903318926a532910fd6a1495ff3db3cfd7a1e345388d70bf718ace8` |
| `impl/campaign/econ/impl/Farming.java` | `5768e658316ed3eee708cd77fcc12b147c9168f7ac7b3a4e73c03edd4228f452` |
| `impl/campaign/econ/impl/Mining.java` | `b1c4d5140c512cc5a8c4022ea31bc8a14308e8517639f2cf8a1478a0907380e0` |

以上与既有 `reference-resource-industries.json` 来源散列一致。另阅读 `ResourceDepositsCondition.java`、`ItemEffectsRepo.java`、`BaseInstallableItemEffect.java`、`BoostIndustryInstallableItemEffect.java`，并以 `../starsector-core/data/campaign/special_items.csv:18,20,23` 交叉确认物品产业绑定。未取得此次功能原版 UI 截图，也未进行原版实机验证；不修改 UI。

## 修改前最小对照

| 原版证据 | 预期行为 | 修改前差异 | 集中验收建议（本任务不执行） |
| --- | --- | --- | --- |
| `BaseIndustry.apply(boolean):182-200`, `updateSupplyAndDemandModifiers:1385-1398` | 基础供需修饰器 → 财务 → AI/改良特殊方法（这两个子类未覆盖，基类为空）→ 移民登记 → 物品 → 子类经济 | 离线克隆，读取预先捕获的机器可用量，没有财务/物品阶段 | 回调中观察同一个 state；财务看到新 bonus、旧需求/供给；短缺看到新需求 |
| `Farming.apply:30-43`, `Mining.apply:27-37` | 农业/矿业机器需求 size−3；水产 size；矿业另需 drugs=size。只有机器短缺降低 food / 四种矿产品；最后失能清空 supply | 离线算法已保留公式，但无法触发实际 lazy getter | 对每个单产业 apply 验证一次机器 getter、无 drugs getter；失能仍执行该顺序并保留需求 |
| `ResourceDepositsCondition:30-91,95-144`; `Farming.isAvailableToBuild:52-69` | 食物/矿产基础供给由条件 callback 写；先找 farming，缺失才找 aquaculture；lobster 基础不加 size，且不受 Farming 的机器短缺修饰 | 不能把产业 apply 当条件/产业完整重应用 | 先有真实条件写入再 apply；无条件不得凭空生成 food/矿床基础产出 |
| `ItemEffectsRepo:268-375,422-433`; `BaseInstallableItemEffect.getUnmetRequirements`; `special_items.csv` | soil_nanites 仅 farming，供给 bonus +2，禁稀有矿石/挥发物；mantle_bore 仅 mining，非宜居且非气巨，对存在资源条件的 ore/rare_ore/organics 直接 +3；plasma_dynamo 仅 mining，气巨，对有条件的 volatiles +3 | 离线输入只接受无物品 | 物品资格不满足执行 unapply；允许条件存在但未 surveyed/suppressed（物品原版不筛选）；正确处理 null planet |
| `BaseIndustry.unapply:204-216,setSpecialItem:1679-1685`; item unapply | 只撤旧物品经济修饰器，不清空 bonus/需求/供给；soil 写 neutral 0；矿业物品用 supply(itemId,commodity,0) 去 flat，保留历史 ind_sb | 原模块没有物品撤销入口 | 验证卸载/更换、资格失效、旧 ind_sb 保留和幂等 |
| `Mining.java` 全文件；`TechMining.generateCargoForGatheringPoint:171-178` | 普通 Mining 没有资源枯竭字段/衰减回调；TechMining 的 `$core_techMiningMult *= techMiningDecay` 属于遗迹挖掘 | 不应编造普通矿床枯竭规则 | 明确普通矿业与 techmining 分离，不据此声称已完成所有世界事件影响 |

## 条件和物品的重要边界

- Farming 的建造判断还要求：有行星且 typeId=`water` 才与 aquaculture 匹配，并有映射至 farming 的资源条件；不只是简单检查 `farmland_*`。这不是 apply 的前置门槛：对已存在的产业执行 apply 不补做建造许可。
- `water_surface` 映射 food；`volturnian_lobster_pens` 映射 lobster，二者归 farming 并可回退 aquaculture。原版农业短缺只处理 food，不削减 lobster。
- 物品运行时资格不检查调查状态；`BaseInstallableItemEffect` 在 checkSurveyed=false 时把 prelim/full 当真。无行星时 GAS_GIANT 与 NOT_A_GAS_GIANT 均不因气巨条件失败；必须由实际 getter 显式返回 `null`，不能将未知值默认 false。
- 矿业物品 apply 只遍历当前条件对应的受影响货品，不主动清扫已消失条件留下的旧物品修饰器；正确撤销须由独立 unapply 顺序完成，不能暗加一轮清理。条件写入也不隐式插入产业 apply。
- BaseIndustry 的移民注册/注销、Farming 教会移民加权与突袭危险修正、Mining 的 drugs 移民惩罚与 Pather interest，以及 Mining.setSpecialItem 的等离子网视觉回调，有源码入口但本次未接线；完整调用链/用户可见行为待核实，不声称这些非经济特殊钩子已还原。

## 实现与验收记录

新增接口（同名 `.d.mts` 已声明）：

```ts
applyOriginalLiveResourceIndustry(
  market: { size: number; conditions: { id: string }[] },
  entry: OriginalLiveResourceIndustryEntry,
  runtime: {
    applyFinances(): object;
    readCommodityAvailable(commodityId: string): number;
    readPlanetIsGasGiant?(): boolean | null;
  },
): DeepReadonly<OriginalResourceIndustryState>;
unapplyOriginalLiveResourceIndustry(entry: OriginalLiveResourceIndustryEntry): void;
unapplyOriginalResourceItem(state: OriginalResourceIndustryState, specialItemId: OriginalResourceItemId | null): void;
```

- `entry` 包含同一份可变 `state/operating/modifiers`。live apply 不克隆或替换 `entry.state`；bonus 重建复用现有 `updateBonuses`，与 production live 风格一致。返回值是独立冻结快照，不是接下来应塞回 live 图的替代 state。失能时原地删除 supply keys，保留 supply 容器身份。
- `OriginalResourceIndustryModifiers.specialItemId` 扩展为 `OriginalResourceItemId | null`，三种物品只通过本 live 路径解析；不修改既有 JSON schema 或资源数据文件。类型中的物品联合并不授权跨产业安装：运行时按 `special_items.csv` 拒绝 farming 上的矿业物品、aquaculture 上的 soil_nanites 等不匹配项。
- 原 `applyOriginalResourceIndustry`、`applyOriginalResourceDeposit`、构造/校验/输出接口保持原行为；离线路径继续只支持 `specialItemId:null`，不伪造它没有的条件/行星上下文。原始离线输入和返回结构无需迁移。
- live 顺序：验证已知输入 → 重建 bonus → **同步财务回调** → 当前物品资格与效果 → 新机器需求（矿业同时写 drugs）→ 先取当时 demand、再调用 **一次 `readCommodityAvailable('heavy_machinery')`** → 按 deficit 写入已存在修饰器的目标供给 → 检查当前 operating 并清空失能供给。不会提前汇总 available、不会读 drugs、不会主动把网络刷新到所谓稳定态。
- `readPlanetIsGasGiant` 只在矿业物品资格阶段调用，必须对应当前实际行星 getter；缺失、undefined、Promise 均不接受。无物品及 soil_nanites 不要求它。条件从 `market.conditions` 在物品阶段读取，不使用旧 capture，不猜行星类型，也不把缺失行星当普通行星。
- 主代理接线时：在原版本应 unapply 的位置调用 `unapplyOriginalLiveResourceIndustry(entry)`，随后调用 live apply；此处不隐式替主线 unapply，也不插入条件 callback。更换物品仅先 `unapplyOriginalResourceItem(state, oldId)` 再由拥有者保存新 ID。资格变化后的旧修饰器清理由正常 unapply/apply 顺序保证。
- 财务回调必须返回同步对象；供给 bonus 已重建，但财务读取仍面对旧供需（包含此前条件阶段留下的供给），没有偷写新机器需求。live 方法不自行实现财务公式；错误中断后的事务回滚属于主线责任，不声称本方法原子提交。

已做代码阅读复核：需求写入/机器读取顺序、正/零/负 quantity 对 `ind_sb/ind_dr` 的差异、soil neutral 撤销、矿业物品按当前条件去重与零供给撤销、原版 null-planet 资格分支、失能结尾清供给。**没有运行类型检查、lint、测试、探针或原版/Web 实机**；以上为源码与代码静态复读，不是测试通过记录。主代理统一集中验收。

### 仍未覆盖

- Runtime/OriginalLiveIndustryEffects 接线、完整条件重应用调度、行政输入 getter 更新由主代理负责，本任务未修改。
- 建造许可、安装/卸载命令合法性与物品货舱转移、AI 核心/改良命令、建设/升级/中断恢复/撤销等完整产业生命周期；本方法仅消费当前状态。
- 非经济钩子和自然帧：移民注册/注销与权重、突袭、Pather interest、等离子网行星视觉、事件/监听器与存档恢复。源码入口已阅读不等于端到端核实；不要把经济 callback 标成生命周期完成。
- TechMining 遗迹衰减/随机打捞不在三种资源产业范围内；这里不添加普通矿床“枯竭”。其他世界事件/模组改变资源条件的完整来源也未核实。
- 原版 UI、原版实机与 Web 交互均未验收，未改共享总进度文档。

## 主代理接线补充

已加入 live runtime 的必需 registerImmigration():void（财务之后、物品之前），不再省略 BaseIndustry 的真实注册时点。OriginalLiveIndustryEffects 的农业/水产/矿业分支已改用新 live apply；Runtime 负责原实例的移民注销/注册、当前 lazy getter、财务和真实星球气巨字段，旧离线方法保留。真实资源构造/建造队列和自然帧尚未接入；等离子视觉不在本次经济接线中。以下集中验收由主代理补记。

主代理集中验收已通过：tsc、13改动文件lint、既有 shared scheduled economy 场景（763.4951ms），日志 C:/Program Files (x86)/Starsector/starsector-web/artifacts/campaign-parallel-industry-integration-1790074811838.log。live Runtime 无物品资源重应用已接线；特殊物品 helper 单独覆盖，但 Runtime 财务物品白名单仍未开放，不是物品端到端完成。
