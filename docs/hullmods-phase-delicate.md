# 相位场 / 精密机械：原版事实、真实效果与支持状态

日期：2026-09-16。本次只处理 `phasefield`、`delicate`，不重导入、不修改 UI。

## 改动边界

仅改动：

- `src/engine/extensions/HullMods.ts`
- `src/engine/extensions/native-hullmod-metadata.json`
- `docs/hullmods-phase-delicate.md`（本文）

未改 `src/studio`、DesignModel、导入脚本、任何生成目录或原版游戏文件；未覆盖、还原或提交已有未提交工作。未新增测试套件/运行器，未做资源哈希或体积审计。无需新增模拟文件：现有 `Ship` 构造和 CR 生命周期已经消费 `effectiveHullStats()` 的结果，本次把缺失的原版统计修正接入这一真实链路。

## 原版依据（只读）

原游戏目录：`C:/Program Files (x86)/Starsector/starsector-core`。

1. `data/hullmods/hull_mods.csv`：相位场第 141 行，精密机械第 164–166 行（精密机械说明跨行）；两项费用均为 0，均为隐藏内置项。名称、脚本、图标维持原值。
2. `data/hullmods/DelicateMachinery.java`：`DEGRADE_INCREASE_PERCENT = 50f`；`applyEffectsBeforeShipCreation()` 调用 `getCRLossPerSecondPercent().modifyPercent(id, 50)`。
3. `starfarer.api.zip` 内的 `com/fs/starfarer/api/impl/hullmods/PhaseField.java`：直接以只读 ZIP 流读取，未解压/改写原游戏。与已有 `decompiled/starfarer_api_source/.../PhaseField.java` 的相关效果一致。
4. `data/hullmods/HardenedSubsystems.java`：仅为核对叠加关系而读取。其峰值时间 `modifyPercent(+50)`，CR 衰减 `modifyMult(0.75)`；本次不改该插件。
5. 已有反编译 `decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Ship.java` 第 2261–2267 行：超过峰值并满足交战条件后，真实 CR 扣减使用 `dt * CRLossPerSecondPercent.computeEffective(baseLoss) * 0.01`。

### delicate / 精密机械

- **峰值时间耗尽后的 CR 衰减速率 +50%**，不是直接减去 50% CR，也不是额外每秒减去 50 个百分点。
- 不缩短峰值时间，不改变初始/部署 CR、维修速度、故障概率或舰船耐久。CR 下降后，已有低 CR 性能/故障机制会自然更早受到影响；不是本插件直接叠加故障修正。
- 原版用 `modifyPercent`，因此同类百分比相加，再与 `modifyMult` 结果相乘。只写 `crLossMultiplier: 1.5` 虽在孤立情况下数值相同，却会破坏未来百分比修正叠加。
- 原版适用性：舰体原始峰值时间 `< 10000` **或**舰体 CR 衰减率 `> 0`。注册中保留此条件，以及既有内置专用限制。
- 新增统计字段 `HullModStats.crLossPercent`，默认 0；精密机械返回 `{ crLossPercent: 50 }`。

实际计算：

```text
crLossPerSec = (spec.crLossPerSec ?? 0.25)
             * (1 + sum(crLossPercent) / 100)
             * product(crLossMultiplier)

战斗每次扣减的 CR（0..1） = crLossPerSec * 0.01 * dt
```

当前导入数据中这些舰体的基础值为 0.25 个百分点/秒：精密机械得到 0.375；再配硬化子系统得到 0.28125，后者峰值时间仍由硬化子系统单独增加 50%。这里是已有 `ShipSpec` 基础率的修正，**没有重写或补算原游戏依赖部署成本/战役统计的基础 CR 率**。

链路是 `native('delicate')` → `installedHullMods()` → `effectiveHullStats()` → `Ship` 构造时的 `hullStats` → `Ship.update()` 峰值耗尽后的真实 `currentCR` → 现有 `crEffects` / 性能与系统防御限制。不会在构造和 advance 中再次乘 1.5；不把衍生值写回保存用的 `ShipSpec`。

### phasefield / 相位场

原版只含战役传感器/舰队效果，**不是**战斗中的 Phase Cloak（相位隐形、时间倍率、相位幅能成本）实现。

- 本舰传感器截面乘 `PROFILE_MULT = 0.5`（降低 50%）。虽然这项通过 `applyEffectsBeforeShipCreation()` 写入原版 mutable stats，它仍是战役传感器统计，不因此成为战斗效果。
- 舰队同步时，根据舰队构成进一步修正 `fleet.getDetectedRangeMod()`，修正键为 `core_PhaseField`。
- 应答器开启时，**额外的舰队被侦测距离乘数**设为 1；这不撤销本舰传感器截面 ×0.5。
- 贡献额外相位传感器强度的成员须具有 `phasefield`、未封存（mothballed），且 CR **至少 10%**（源码跳过 `< 0.1` 的成员）。这项筛选不等于给本舰 ×0.5 另加 CR 门槛。
- `P` 为全舰队成员传感器截面最大的 K 项之和；`S` 为符合上述条件的相位舰传感器强度最大的 K 项之和。K 来自 `maxSensorShips`，此安装的 `data/config/settings.json` 中为 5。
- 额外舰队乘数为 `clamp(P / max(P + S, 1), 0.25, 1)`；若 `S <= 0` 则为 1，应答器开启也覆盖为 1。下限 `MIN_FIELD_MULT = 0.25`，并非所有舰队恒定获得 −75%。
- 源码还在玩家舰队切换应答器时刷新上述舰队修正。

Web 当前没有舰队传感器、应答器、封存/战役同步生命周期。因此本次**没有模拟上述战役状态、没有提供伪传感器数值或假效果**，只记录事实和适用范围。该插件没有 `stats`、`apply`、`advance`、武器/射程等战斗钩子，也不修改战斗雷达、目标锁定、隐形/相位状态。

## 给主代理的 UI / 数据接口

### 新字段（无需按插件 ID 硬编码）

`HullModDefinition.support?: HullModSupport`，同时保存在原生元数据 JSON 的对应条目下。注册时从元数据读取至定义顶层，**不混入 `refit`**。

```ts
interface HullModSupport {
  scope: 'combat' | 'campaign-only';
  combat: 'implemented' | 'unimplemented' | 'not-applicable';
  campaign: 'not-applicable' | 'not-simulated';
  summary: string;
}
```

两项当前值：

| ID | 旧 `status` | `support.scope` | `support.combat` | `support.campaign` |
| --- | --- | --- | --- | --- |
| `delicate` | `implemented` | `combat` | `implemented` | `not-applicable` |
| `phasefield` | `metadata-only` | `campaign-only` | `not-applicable` | `not-simulated` |

- `status` 保持原有联合类型，仍用于战斗钩子和安装门禁，避免影响其他并行代码。**不要单凭 `metadata-only` 就把相位场标为“战斗效果未实现”。**
- `support` 可选；未明确审计范围的其他插件不补写范围，不把缺失字段推断成“战役已实现”或“仅战役”。旧条目继续使用既有 status 展示即可。
- `support.summary` 提供可直接用于详情/悬浮提示的中文说明。
- 注册校验拒绝将 `campaign-only` 标为战斗 `implemented`，也保留 `metadata-only` 禁止战斗钩子的校验，防止后续误报。

主代理可直接读取：

```ts
const mod = hullModDefinitions.get(hullmodId);
const support = mod?.support;

// 展示建议：范围优先于旧的 metadata-only 标签。
if (support?.scope === 'campaign-only') {
  // 中性提示：仅战役；当前无战役模拟。
  // 不用红色“战斗效果未实现”，也不用绿色“已实现”。
} else if (support?.combat === 'implemented' || mod?.status === 'implemented') {
  // 战斗效果已实现。精密机械同时仍展示“内置”。
} else {
  // 沿用既有未实现/元数据状态，不猜测适用范围。
}
// tooltip / details: support?.summary + mod?.description
```

`builtInOnly` 是安装权限，与支持范围正交：两项仍不可当作免费普通可安装插件；已有内置项预算为 0。不要因为精密机械变为 implemented 就让它出现在可安装候选里。

### 重导入 / 统计卡注意事项（由主代理处理）

- 如果原生目录/生成报告缓存了旧的 implemented/metadata-only 状态，按本次 registry 和 `native-hullmod-metadata.json` 重新计算/展示；本任务没有改写生成文件或导入器。
- 只读复核发现 `scripts/import-game-content.mjs` 当前生成 `refit.hullmods[id]` 时只输出 `{ name, implemented }`，并有两处按旧 status 生成“behavior not implemented”原因。仅统一重导入还不足以区分相位场范围：主代理若使用生成元数据，可增加 `support: hullModDefinitions.get(id)?.support`，保留 `phasefield.implemented === false`，并优先生成 `campaign-only / not-simulated` 原因；直接使用 registry 的 UI 不必等待此生成字段。不要为了消除警告把相位场的 implemented 设为 true。
- `src/studio/NativeRefit.tsx` 的 `modRow` 当前 title 与 `<small>未实现</small>` 都直接比较 `status === "metadata-only"`；这两处应由主代理优先检查 `support.scope`。其他生成目录页面若只读 `nativeRefit.hullmods[id].implemented`，也需保留上述范围字段或回查 registry。
- 当前受 `delicate` 修复影响的已导入舰体：`afflictor`、`afflictor_d_pirates`、`doom`、`harbinger`、`hyperion`、`phantom`、`revenant`、`shade`、`shade_d_pirates`、`ziggurat`。
- 峰值时间显示 `effectiveHullStats(spec).peakCRSec`；衰减速率显示 `effectiveHullStats(spec).crLossPerSec`，单位是**百分点/秒**。不要把 0.375 显示成 37.5%/秒，也不要在导入 `ShipSpec` 时先乘 1.5，避免战斗构造时重复应用。
- 单纯 `phasefield` 变化不应改变战斗统计预览。战斗相位系统/盾型照原有独立实现判断，不能用是否内置 `phasefield` 代替能力检测。

## 验证

完成后运行：

- `npm run typecheck`：通过。
- `npm run lint`：通过。
- 一次性 Node 内存断言：**82 项通过**。使用现有 esbuild 将被检模块 `write:false` 打包到内存并通过 data URL 导入；没有新增或写入测试脚本、套件、运行器、bundle 或生成数据。

覆盖：

- 两项 registry 状态、支持范围和 `phasefield` 全部战斗钩子为空。
- 精密机械 +50%、峰值不变、与硬化子系统的真实乘法叠加；临时内存 +20% 修正验证 `1 + (50 + 20)/100`，不是 `1.5 * 1.2`。
- 适用性 `< 10000` / `> 0` 边界、零衰减、缺省基础率、内置权限、内置 0 OP、重复内置校验与统计去重。
- 构造真实 `Ship` 后推进 `update()`：峰值期不扣 CR、交战范围外暂停、峰值后真实扣减、dt=0、不交战、死亡，以及 CR 下限与现有低 CR 机动/输出/承伤/系统防御限制。
- 以厄运基础配置，峰值归零后累计推进 2 秒：无插件 CR 为 `0.695`，精密机械为 `0.6925`，精密机械 + 硬化子系统为 `0.694375`（浮点误差容差内）。初始 CR 为 0.7，部署 CR 保持不变。
- 相位场单独安装时，`effectiveHullStats()` 与无插件完全一致；真实更新后 CR、相位效果级别一致，不自动开启相位隐形。
- JSON 保存/重新构造不重复叠加，重新开始恢复基础初始 CR/峰值，不带插件恢复基础衰减；全部 10 个已导入精密机械舰体的统计修正正确。
- 整个过程前后原始导入舰体对象和现有 registry 定义不被修改；拒绝伪造“战役专用但战斗已实现”和 metadata-only 挂载战斗钩子的定义。

### 有意保留的既有模拟边界

本次没有重新实现全局 CR 时钟：当前 `Ship.update()` 以现有目标/2500 范围判定交战，且在正峰值舰体上，先完成峰值倒计时，之后的 tick 扣减 CR。未改原版更复杂的显著敌人/舰载机出勤判断，也未修订单 tick 穿越峰值的时间分摊或初始零峰值的处理。断言覆盖当前受影响的正峰值舰体，不能据此宣称整个 CR 系统已全面 1:1。本次准确实现的是插件统计修正以及它在现有真实 CR 生命周期中的作用。

没有运行 production build（避免写入生成输出或干扰主代理并行流程），没有改 UI 或声称完成浏览器截图验收。主代理可继续 UI 状态接入、左侧战机甲板及统一重导入/最终验收。
