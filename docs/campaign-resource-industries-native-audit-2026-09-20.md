# 原版资源产业供需：编码前对照（2026-09-20）

版本：本机 Starsector 0.98a-RC8。只做后台源码/数据与方法级验证；不启动原版窗口。

## 原版证据 → 行为

- `data/campaign/econ/corvus.json`、已导入 `reference-corvus.json`：Asharu(size4)有 farming + farmland_poor；Jangala(size6)有 farming/mining + farmland_adequate/organics_plentiful；Garnir(size3)有 mining + volatiles_plentiful。不能把 authored 行业列表当作经济已经模拟完成。
- API `impl/campaign/econ/ResourceDepositsCondition.java:29–141`：24种资源条件的商品、增量、基础偏移；供应是 condition modifier 两个具名 flat。food/lobster 优先 farming，缺少时退到 aquaculture；龙虾不加市场规模。非 functional 只删该条件两个 flat。其 `unapply` 不删除 commodity flat，不能把撤条件/压制自动“清空产量”冒充此方法。
- `impl/campaign/econ/impl/Farming.java:29–42`、`Mining.java:26–35`：先 BaseIndustry.apply，农业/水产重型机械需求 size-3/size，采矿还需求 drugs=size；只按 heavy_machinery 缺口降低相应产出，非 functional 最后 clear supply，不清需求。
- `BaseIndustry.java:182–199,256–325,421–426,720–743`：具名 supply/demand 零值删除原 flat；只有正 quantity 才刷新 ind_sb/ind_dr；最大缺口先截断行业 demand float，再减商品 available int；未修正的供应不扣缺口。functional = !disrupted && (!building || upgrading)。
- `BaseIndustry.java:1355–1397,1853–1878`：每次 industry apply 先重建 bonus：AI核心、改善、管理员、其他具名修正依次应用；alpha +1产出/-1需求，beta/gamma -1需求，改善 +1产出。其他 modifier 同名覆盖且保留插入顺序，base 不随 applyMods 复制。
- `combat/MutableStat.java:51–66,109–157,230–297`：isUnmodified 检查 modifier 列表是否为空，非“最终数值等于base”；float每步舍入，getModifiedInt=Math.round。
- `campaign/econ/Market.java:313–321,1101–1107` 及 `reach/MainWorkTask2.java:91–92`：conditions 与 industries 有独立的 apply 顺序，不允许计算器隐式重排/把一次调用宣称为经济稳态。

## 界面证据与边界

本轮不改 UI、布局或玩家交互。市场/殖民地产业详情的原版截图仍缺对应状态证据，不做视觉还原声明。已保存货舱截图不能证明产业界面。

## 当前差异 → 本轮实现

已有 economy 聚合器要求“已生效的行业产需”，没有农业/采矿实际来源。本轮增加可持久序列化的资源产业 commodity state 与两种显式操作：资源条件 apply、资源行业 apply；保留原 modifier 顺序及之前的 bonus，允许外层经济执行器按原版阶段调用。数据从原版 map/constants 导入，代码与数据分开。

不是全行业/全条件执行器：人口、太空港、军工等、hazard/immigration/upkeep、殖民地技能解析、产业物品效果、贸易网络和真实经济任务编排另待接入。管理员值和其他修正必须由调用方明确提供；特殊产业物品非 null 暂拒绝，不能静默漏算。不写 asOfTick、不生成库存、不把 Corvus 初始化为可交易经济。

## 验证方法

1. 原版 maps/constants/source hashes 导入检查。
2. Asharu/Jangala/Garnir 的资源产业来源链，缺货、停工、恢复、AI/改善、条件并存、farming/aquaculture 优先顺序与重复 apply。
3. 抽取原版 ResourceDepositsCondition/Farming/Mining/BaseIndustry 方法，结合原版 MutableStat，Java CLI oracle 对照多步状态序列（非原版实机）。
4. 向既有行业最大值/经济报价内核提供真实生效量的集成测试；无改变非法商品规则、市场 freshness 或玩家权限。
5. campaign 回归与类型检查；不提交、不推送、不打发布包。
