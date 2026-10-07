# 战斗武器分类生命周期审计 — 2026-10-03

## Source notes（先于任何 helper 编码）

- 任务范围：只追查已有 Web 静态分类的真实生命周期/写入口，提出可实施根因修正；不集成生产，不写 `NumericAcquisitionFrame.ts`、`WeaponAcquisitionKernel.ts` 或另一代理负责的 range/modifier 文件。不操作可见桌面、不发布、不改生涯、不启动子代理、不跑构建/bench。工作区无 `.git`；不以 git 状态声称隔离成功。
- 原版目标：**0.98a-RC8**。本次后台 `Test-Path C:\starsector-core`、`Test-Path C:\decompiled` 均为 False；原版实现、相关 UI/实机均**待核实**。未取得原版分类规则证据，本块不改规则或 UI，只核对 Web 执行及数据所有权。
- 原版证据 → 预期 → 差异 → 验证：原版证据缺失；预期仅为保持现有 Web 每次分类结果及动态读取语义；差异是 Web 把可变 spec 上的稳定规则事实在每个 fire-query frame 重新审计/翻译；后续由主代理在既有真实场景对照快照、RNG、全部 fireControl/tracker，再独占计时。不能把本审计或 helper 单测称为原版等价。
- 已读普查：`docs/combat-work-demand-census-{source-notes,results}-2026-10-03.md`。67994 cold 输出与上次同挂点一致只证明观察窗口，不授予跨 stage 缓存。
- 最小 Web 证据：`ShipStepBatch.ts:89–109` 每步 weapon-state 后建立 fire frame、seal source、计划，关闭 frame 后 commit；`NumericAcquisitionFrame.ts:168–200` 分类描述符审计 + hint 查询 + bit 编译，`LimitedMissile` 在 194 行取 `Number.isFinite(mount.ammo)`；`ShipWeaponControlSystem.ts:76–123` 从 registry base 经 `HullMods.ts:727–758` 派生可变挂点 spec；`Weapon.ts:144–166,306,325` 分类 spec、引用、弹药均可变。
- 初步准入原则：**独立 immutable scalar rule record**，绝不冻结现有 mutable spec；移出弹药有限性、距离/速度/delay、pose、arc 和 modifier。未知可变/外部接口保留原路径。helper 即使生成了快照，也不能仅凭该快照给原 spec 发永久缓存证书。

以下内容随本次检索补充；文中路径均以 `C:/starsector-web-master/` 为根，行号为本次读取的工作区源码。

## 1. 结论：稳定的是什么，为什么仍然 cold

1. **不是 `WeaponSpec` 被每帧重建。** 正常挂点 spec 在 `ShipWeaponControlSystem.init()` 创建，`effectiveHullModWeaponSpec()` 每挂点返回一个新的、未冻结的浅派生对象；之后正常 fire-query 读取同一引用。冷的是 `NumericAcquisitionFrame.classes`：它是 **frame 实例字段**，每个新 frame 从空表开始，在首次实际查询某挂点时编译。`close()` 标记不可用并清理阶段表，但并未显式 clear WeakMap；真正失效点是新 frame/旧实例不可再用，不是 `close()` 删除了 spec。
2. cold 路径对挂点 `spec`/`ammo`、8 个分类输入、`baseAngleDeg`/`arcDeg` 做描述符检查，展开 hints 成 role bits，再分配分类对象（`NumericAcquisitionFrame.ts:175–200`）。描述符调用最多固定 12 次，hints 短路查询最多 9 次；这不是性能计时结论。stage 内同 mount + 同 spec 命中，stage 外无法继承。
3. **当前分类并不完全静态：** `LimitedMissile = weaponType === MISSILE && Number.isFinite(mount.ammo) && !DO_NOT_AIM`（194 行）。规则部分可以预编译，但有限弹药判定必须在消费者当前读取点完成。不能拿 `maxAmmo`、注册武器类型或上次 roles 替代真实 `ammo`。0、负值、-0 仍是 finite，此 role 不是发射许可。
4. 源码确实缺少“挂点分类 revision / immutable rule record”。`Weapon.ts:306,325` 是开放可变字段，`Ship.ts:250–251` 暴露挂点数组 getter/setter，control 的数组及 `init()` 也是公开的。**仅 `readonly` 类型或持久 WeakMap 不产生运行时所有权。** `ContentRegistry.revision` 只覆盖内容注册，完全不覆盖已有挂点的原地字段写。
5. 根因修正应为：**把稳定规则事实从开放的可变运行 spec 中提取成独立 immutable scalar record，并限定在真正的私有 authority owner 生命周期使用；修改规则时显式重新发布。** 保留 stage 几何、动态 range/speed/delay、pose、arc、状态/资源的原读取和失效节奏。未知可变接口走原路径，而不是再做 13 字段 WeakMap 比对。

### 真实执行序列

```text
内容注册（复制/冻结 base）
  → Ship 构造 / 每个模块、舰载机、无人机新生
  → control.init → base + hullmod/skill derivation → 新 mutable effective spec + 新 mount
  → weapon-state（弹药、生命周期、维修等活写）
  → 每步新 CombatFireFrame → 新 NumericAcquisitionFrame.classes
  → sealScope（仅当前 native readonly query span）
  → 挂点首次 input：描述符审计/规则翻译，后续 stage 内 identity 命中
  → frame.close
  → fire-commit（扣弹药、发射）→ finish
下一步不是重新造 spec，而是重新造 frame-owned 分类表。
```

证据：`Ship.ts:402–429,511–513`；`ShipWeaponControlSystem.ts:76–123`；`HullMods.ts:727–768`；`ShipStepBatch.ts:89–109`；`CombatFireFrame.ts:31–38`；`NumericAcquisitionFrame.ts:83–95,122–150,165–200,285`。

## 2. 分类 record 的精确边界

当前 role 常量来自 `WeaponAcquisitionKernel.ts:7`；下表逐项对应当前 Web 规则，不声称核实原版。

| 持久规则事实 | 精确来源 | 不得带入 record 的动态依赖 |
|---|---|---|
| `beam` | `!!spec.isBeam` | 活跃 beam 状态、周期、几何 |
| `guided` | `!!spec.isGuided` | 导弹目标、锁定、剩余航程 |
| `alwaysAim` | guided 且 (`alwaysFire` 或 `DO_NOT_AIM` 或 `GUIDED_POOR`) | 手动触发、当前角度/射界 |
| `PDOnly`, `AntiFighter`, `Strike`, `UseFrigates` | hints `PD_ONLY`, `ANTI_FTR`, `STRIKE`, `USE_VS_FRIGATES` | 目标资格/team/存活/相位 |
| `PassFighters` | `passThroughFighters && !passThroughFightersOnlyWhenDestroyed` | 当前 fighter 是否死亡 |
| `PD` | `isPointDefense || PD || PD_ONLY` | missile 当前资源/轨迹 |
| `limitedMissileCandidate`（新拆出的静态 bool） | `weaponType === MISSILE && !DO_NOT_AIM` | **每次 `Number.isFinite(mount.ammo)` 后才置 LimitedMissile 位** |

最小 record：`{staticRoles, limitedMissileCandidate, beam, guided, alwaysAim}`，只有 1 个 number + 4 个 boolean，无 source spec、hints 数组、mount、Ship、modifiers 或 getter 引用。不要把 `WeaponSpec` 整体 `immutableCopy`/freeze 来实现本块。派生 PD 必须在 `HullMods.ts:737` 生效之后编译；只按 registry base/id 缓存会错失 hullmod/skill 授予的 PD。不同挂点同 id 不保证相同有效规则。

## 3. 写入口普查（区分真写与误报）

检索范围：`src` 的 TS/TSX（排除生涯改动）、相关 scripts；查直接 assignment、数组变更、generic decoder/codec、constructor/refit/clone、`Object.defineProperty` 和 hints 原地变更。**这是仓库内已定位入口，不可能凭文本检索列尽外部 Proxy/插件任意计算属性写；这些必须靠准入边界隔离，不能假装有全局监听。**

| 入口与文件/行号 | 实际写什么 | 对方案的处理 |
|---|---|---|
| `ContentRegistry.ts:19–28,30–49,52–68` | 注册/pack/installSnapshot 换新复制的 immutable base；递增内容 revision | 后续新挂点按新 base 编译。现存 effective spec 不自动被重写；registry revision 不能代替 mount revision。 |
| `HullMods.ts:727–768` `effectiveHullModWeaponSpec` | `{...base}` 新 effective spec；737 行覆盖 PD，亦派生其它运行标量/嵌套对象 | 唯一标准有效 spec 构建出口；在完成派生之后取分类。其输出保持可变。 |
| `ShipWeaponControlSystem.ts:76–123` `init` | 清空并重建整个 weapons 数组；每 slot 新 mount、新 effective spec、初始 ammo | 新挂点 lifetime/规则注册；整个重新 init 不复用旧 slotId 的证书。 |
| `Ship.ts:250–251`，control `:68` | 外部可替换实际挂点数组；可原地增删或改 mount.spec | generic 调用不能获持久缓存准入；私有 owner 如新增此功能须通过发布入口，否则撤销该 control 的准入。 |
| `CombatEngine.ts:193,219–222,365–366,391–416`；`Ship.ts:511–513`；`FighterSystem.ts:110`；`DroneSystem.ts:53` | 新战斗/换船/增援、递归模块、craft 新生均 `new Ship`，再走 init | 新实体/挂点重新注册；死亡后同 shipId/slotId 新生也不能继承旧记录。 |
| studio `DesignModel.ts:294–312,346–378,381–394`；`LanDesign.ts:26–34` | 评估设计、改 `weaponSlots.defaultWeaponId` / hullmods/skills，注册**新 hull spec**（可同 id）；随后创建战斗舰 | 这是 refit→注册→新 Ship，不是 live mount 原地 refit。`DesignModel.ts:341` 的 `mount.spec` 是**模块 ShipSpec**，不是 WeaponMount.spec；不要误归类。 |
| `VisualScenarioController.ts:635–638,686–690` | 两个视觉实验场景直接把 live mount.spec 换成 registry base | 真正 live spec 替换，generic visual-lab 不得继承 owner record；若未来 owner 支持此操作，显式重新发布。 |
| `multicore/Protocol.ts:243–266`；`Owner.ts:39–59,63–67` | publisher 复制实际 fit；owner realm 对**wire 副本**重新 immutableCopy，并把 `new Ship` 默认挂点替换为实际 models mounts | 真重建/引用替换，不是修改 authority 原 spec；新 realm 新发布 record，不能把父 realm 的 WeakMap/证书传过去。现有副本冻结不授权冻结 authority mutable spec。 |
| `multicore/Protocol.ts:16–38,250–264`；`Owner.ts:84–116`；`ScalarWire.ts:1702–1769,2038–2049` | parts 包含 mount/relativePos/health，**不包含 WeaponSpec 节点**；mount schema 明列 ammo 等 9 个运行态；generic codec 写该 node 的指定 scalar | 真动态写：ammo 等。不能仅看到 generic `node[key] = ...` 就说当前 owner codec 会改 spec。owner模型的 spec 复制/重建已在上行单列。 |
| `AuthorityCombatSnapshot.ts:39–61,116–122,498–508,698–723`；`NativeRecordRestore.generated.ts:418,493,562,705,775` | `spec` 在 SKIP；布局拒绝 SKIP 字段；对象 decode 跳过 spec；mount native layouts 不含 spec，只恢复运行态 | 标准 authority snapshot **不写这8个分类 spec字段**，但写 ammo/角度/挂点数组状态；不能把“generic decoder”泛化成 spec 写入口，也不能复用其中的动态 roles。 |
| `AuthorityCombatSnapshot.ts:1029,1053–1070`（craft 重建分支） | craft 定义换代/新生会按 frame spec 创建新 Ship，再恢复运行态 | 新生必须新记录；这不是复写现有 effective spec 的分类标量。标准 presentation snapshot 不是可恢复 simulation checkpoint。 |
| `local-combat.worker.ts:33–64`；`LocalCombatKernel.ts:56–75`；`CombatReplayCheckpoint.ts:5–24` | restore 要求新 Worker，复制 checkpoint 后 `new LocalCombatKernel`，内容 installSnapshot，逐条 replay seed/history | replay 真正重建新 engine/新挂点，再跑相同规则；不可从 display snapshot/旧 owner cache恢复证书。 |
| `LanDisplaySnapshot.ts:100,107`；`display/ShipDisplayLane.ts:291,297`；`RenderShipProjection.ts:70`；`CombatPresentationDecoder.ts:220–256` | display/hydrate 通道赋给**呈现对象** spec/weapon definitions，generic presentation decode 可写对象属性 | 这些是 decoder 写入口但不在 authority native combat 消费域；不将其显示缓存当规则 owner。若未来转成 resumable simulation，当前审计与准入作废，需新增规则发布。 |
| `ShipWeaponControlSystem.ts:110,251–257,718,967`；`NativeCombatSystems.ts:96,102`；`EnergyLashSystems.ts:32` | 初始 Infinity/finite ammo、regen、扣弹药、技能补弹 | 保留每次 finite ammo 合成角色、原状态/资源消费语义；不能 record 中保存资源结果。 |
| `check-combat-threat-phase.mjs:167–169,271–276`；`check-sampled-autofire.mjs:35,49–51` | 真原地改变 `isGuided/isBeam/isPointDefense`，getter 替换/恢复；已有测试要求 mutable scalar 工作、未知 getter不被调用 | 明确是**支持中的 generic 行为**，不能靠 freeze 或统一拦截改变它；走现有完整审计/原路径。 |
| `check-weapon-range.mjs:26–27`；`check-lan-threat-range-packet.mjs:58` | hints push/length 清空/整体替换，PD/type等原地写（其范围消费者由另一代理审计） | 证明 hints 不可凭 identity 当永久静态；record 只复制编译事实，未知 mutable hints 无准入。 |

### 已排除的易误判

- `Ship.ts:1302 this.spec = ship.spec` 位于内部 read guard 的证书刷新，不是把 live Ship 或武器 spec 改掉。
- `EmpEmitter.ts`、`DroneStrike.ts`、`GravityTractor.ts`、`SourceMissileLifecycle.ts` 写 `p.isGuided` 是**已发射 Projectile** 的制导生命周期，不是挂点 WeaponSpec 分类变更。
- `RenderWeaponDictionary.ts:50–53` 已有 epoch-local 呈现数据 intern，只保真 renderer read-set，不覆盖这些分类事实，不能借作分类 cache。
- 本次没有发现标准 native authority update 直接修改这8个分类字段；这不等于外部 generic/custom hook 不会修改，更不等于当前 public mount API 有 revision。

## 4. 可实施方案（推荐：私有 owner rule publication）

### 4.1 最小实现顺序

1. **先拆动态位（语义修正，不改 role 规则）：** 持久 record 不包含完整 roles，只含 `staticRoles + limitedMissileCandidate`；每次 input 在原读取点取当前 ammo 并合成 LimitedMissile。现有 stage 数值检查/pose/arc/速度/射程/delay 保留。该改动不涉及另一代理的 range/modifier 生命周期。
2. **建立真实 owner contract：** 沿用 `FireControlQueryRoster.ts:226–231` 已有私有 cloned-command Worker 域，并增加**私有** owner token/lifetime 管理，不通过 Ship/DTO 公共 bool、slotId、武器 id 或 `readonly` 声明准入。调用点已有 `local-combat.worker.ts:38,68`、`host.worker.ts:639`。worker plugins 或外部可变对象一旦进入须撤销资格。`ownForWorker` 本身现在只写 WeakSet，**没有武器规则发布/失效逻辑**，需要真实实现，不能假定已经存在。
3. **注册实际派生挂点来源：** 初次 own 时对现存实际 control/mount 建立 lifetime；后续 native `init`/新 Ship/craft 注册新 lifetime，或在首次实际消费时 lazy 登记。必须验证实际 owner membership，不能因为 engine 有 owner marker 就承认任意传入 mount。rule 在 effective spec 最终出口以后生成，不能从船的默认 loadout 猜。
4. **lazy 规则发布：** `owner → WeakMap<mount, {sourceSpec, control, rulesRevision, record}>`。第一次实际查询该 lifetime/revision 编译一次，后续同 owner、control、mount、sourceSpec identity 仅常数级检查后消费 record；不逐步重新读8字段，不复活13字段比较。不需要急着对没参与查询的所有 mounts eager 编译。record 是新对象、仅冻结它，不改变原 spec 及用户可变 API。
5. **明确唯一 owned 写入口：** `publishOwnedWeaponSpec / replaceOwnedMounts / rebuildOwnedControl` 等私有操作负责原子修改/替换 + 新 record/new revision。`rulesRevision` 是**真实发布递增数或新 record identity**，不是 tick、contentRegistry.revision、对象“看起来没变”或普查相等。每次分类字段、hints 替换/内容变化都发布新 record；改 unrelated scalar 不需要使分类 record 失效。未知 direct write/自定义控制/未覆盖 restore 入口应直接退出 owned 快路，不能悄悄自动“猜一个revision”。
6. **必须允许的兼容性：** generic inline/visual-lab/自定义接口保留现有逐次 descriptor 审计和读顺序；可持有临时 record，但它是快照、不自动授予跨 stage 使用权。闭合 owner 中发现 spec reference 替换时，不静默复用旧记录：通过已覆盖发布来源重新编译；来源不明退回完整原路径。若允许 source 原地改8字段却不触发发布，则方案不成立。
7. **epoch/realm 重建：** battle reset/replay 新 engine、新 token；owner models copy/hydrate 新 realm重新发布。禁止传递缓存值而保留旧证书。新 token 或 WeakMap lifetime 回收旧 records，无需跨 stage保存几何状态。display/hud/replay witness 不带证书。

> 可先做更窄的最小落地：只给现有闭合 Worker、native construction、没有新规则写命令的挂点发持久 record；仍明确所有将来 owned rule writers 必须走发布 API。这利用的是已审计的**封闭写集合**，不是“当前 benchmark 没写过”。当前 `LocalCombatKernel.ts:83–92` command 支持 add-ship/control，未看到 live weapon-refit 命令；若新增 refit，先落实现有 spec 重建出口的发布，再扩准入。

### 4.2 准入与失效成本

| 场景 | 必需成本/动作 | 不应再付出的成本 |
|---|---|---|
| 首次 owned lifetime/revision 真消费 | 一次描述符/类型/immutable hints 审计、一次 hints→scalar record 编译；O(8 + hint 查询成本) | 每个新 frame 重复全套 cold |
| owner 内未变规则的每次 query | owner成员/控制/mount/source identity gate；O(1)读取 scalar record；**仍读 finite ammo及动态几何、资源、数值合法性** | 12个分类相关 descriptor、重复 hint解析和分类对象分配（不包含整个 AcquisitionInput） |
| 已覆盖规则写/真实refit | 只受影响 mount 新 record/revision；数组重建按新挂点发布；O(受影响挂点 + hints) | 所有船/全部 modifier 全域失效 |
| 更换 owner engine/新realm/replay | 新 token/弱表；对新世界已消费挂点重编译 | 把上一场/static registry证书搬来 |
| 未知 mutable caller/getter/proxy/hook | **原成本保留**；reject 不调用未知 getter；未知来源不发证书 | 永久WeakMap或定期重试字段比较 |

WeakMap 在这里仅管理已取得所有权的 lifetime，并不是“缓存一个可变 spec，然后每次用13字段证明它没变”。性能收益仍待主代理测量；建议记录 `recordBuilds / recordHits / legacyFallbacks / publicationInvalidations / newLifetime`，不能把冷构建计数下降直接换算 ms，不能加时间采样污染主代理 ABBA。

### 4.3 两条不可接受的捷径

- `WeakMap<WeaponSpec, fullClassification>` 永久缓存，靠 spec 引用/registry revision/最近 output 相等做有效性：会漏原地 PD/guided/hints 写以及 finite ammo变化。
- 直接冻结 effective spec，或把全部跨 stage modifiers/ballistics/range一起缓存：改变已有 mutable API，破坏不同生命周期边界，并违反本任务约束。

## 5. 已提供独立 helper（未生产集成）

文件：`scripts/lib/combat-weapon-classification-rule-record.ts`。

- `snapshotWeaponClassificationRule(spec)`：对8个字段作 data-descriptor 检查；拒绝 inherited accessor、非原生标量、未取得 immutableMetadata资格的 hints；生成独立 frozen scalar record，不冻结/修改源 spec，不保留源/hints 引用。
- `classificationRoles(record, ammo)`：合成活的有限弹药位；复用现有 `AcquisitionRole` 导出，未复制/修改 kernel 位定义。
- **helper 不包含缓存/owner证书/revision，不证明源 spec以后不变**。Proxy 和 realm intrinsics 的副作用不是描述符工具能消除的，必须由既有 native准入/封闭 owner排除。比原路径更严格的类型拒绝必须 fallback，不得改变 generic行为。
- source notes 已先落盘。没有任何生产文件导入该 helper；它位于 scripts/lib，而非替换生产实现。它只是可复用的“规则事实/动态位”拆分原型，owner publication 是后续必须另行实现的核心。

## 6. 验收边界与后续最小矩阵

本次仅源码/文件轻量审计：**没有 tsc、lint、构建、场景测试、benchmark或桌面操作**。主代理开始独占 ABBA 后只继续文件读取/文档；helper **未运行验证**，不能报成已测试。主代理主线顺序修正通过快照/RNG等，是用户报告的另一个修改结果，不是本 helper/owner方案的验收。

建议主代理完成一块实现后在既有相关场景集中验证，不另起重型工程：

1. 规则真值逐项对照（PD授予、全部分类hint含重复/未知hint、PassFighters组合、guided/alwaysFire）；同 id不同派生PD必须不同 record。
2. 已发证 mount `ammo = finite / 0 / -0 / Infinity / -Infinity / NaN`：动态位等于当前公式，不读 `maxAmmo` 替代；不得变成发射门禁。
3. 同 mount spec替换、同 spec原地分类字段变更/hints变更、getter安装与恢复：owned发布更新；未知 generic fallback且 getter不被准入代码调用。明确测试**record存在不代表mutable原对象变更已被追踪**。
4. 新 craft/module/重新 init/相同 slotId不同mount、owner model重建、replay新realm：new lifetime；旧记录不得复用。display snapshot恢复 ammo 不得把呈现spec当owner事实。
5. 原始逐步快照、双RNG、AI/defense、每挂点tracker/fireControl对照；dynamic acquisition inputs、点击/键盘等UI未改，本块没有UI等价结论。
6. 主代理独占ABBA计时；保持stage权限、同实体/挂点/目标/60Hz，禁止降低查询频率/伪造ms。cold下降和输出相等不是单独的提速结论。

**待核实**：原版0.98a-RC8源码/实机/UI；helper类型与逻辑验证；真正owner publication落地与所有失效覆盖；优化后的真实收益。本次没有生产集成、没有发布/提交、没有生涯更改。


## 7. 补充关键审计：cloned-command Worker **仍有 live 可写钩子**

### 7.1 明确结论（收紧第4节准入建议）

**`ownForWorker` 不是安全边界，也不是“WeaponSpec分类不会变”的证书。实际 LocalCombatKernel Worker 只闭合了外部输入通道，并没有移除内部扩展函数：`advanceCombat`、system生命周期事件、hullmod `advance/apply`、recoil及延迟effect仍可取得真正的 Ship/WeaponMount，因而能直接改这8个字段或替换spec，无需经command/revision。** 本次未找到现有打包钩子实际这样写分类字段，但能力/路径确实存在；不能把“无文本命中”升级为永久不变权限。

因此第4节的 **private owner是必要条件、不是充分条件**。尤其“仅现有closed Worker + native construction便发持久record”的最窄方案，仍必须再审核/约束全部可能写到该挂点的钩子；没有完成这一步时继续当前每frame冷编译，**不应强行合并持久cache**。本补充优先于前文可能读作“Worker闭合已足够”的措辞。

### 7.2 逐入口、阶段、准入结论

| 钩子/入口与来源 | 当前可写能力及实际执行阶段 | 当前gate到底保证什么 | 持久分类record准入结论 |
|---|---|---|---|
| `FireControlQueryRoster.ts:226–231` `ownForWorker` | public static API只 `WeakSet.add(engine)`，同realm调用者仍可保存 engine/ship/spec 引用 | 注释明确 internal ownership contract，非same-realm monkeypatch sandbox；没有callback审计、写追踪或分类revision | **不单独准入**。不能用调用了这个API证明原地写被隔离。 |
| `LocalCombatKernel.ts:38,54–65,83–92`；`local-combat.worker.ts:33–38,65–68` | Worker请求structured-clone，config按ID/data装载，command不传行为函数；但kernel公开 `authority`/`engine`，inline调用者拿得到对象 | 真Worker闭合外部引用；inline同realm不是闭合。当前无live weapon-refit command不代表内部hook没有写能力 | 必须限真正Worker实际宿主，不承认任意inline调用ownForWorker；仍需下面各项writer证据。 |
| `DefinitionRegistry.ts:7–12`，`Immutable.ts:5–19`；`Dependencies.ts:11–13` | 注册只validate函数类型，immutableCopy冻结definition数据，**函数仍原样可调用/保留closure** | definition不能被覆盖≠行为pure；只验证typeof function不验证写域 | `immutableCopy(definition)` **不赋予函数不写spec的证书**。callback能力必须按身份/实现审计。 |
| hullmod `apply`（`HullMods.ts:85`；`Ship.ts:511–527`） | mount init已完成后，constructor调用 `mod.apply(this)`，可写所有已创建mount/spec | 不受ownForWorker或numeric input准入限制；构造阶段可能发生在首次own之前 | 初始record须在**全部constructor initialize/apply完成之后**发布或首次真实消费lazy编译。仅在effective spec/init出口提前发布仍可能被apply覆盖。 |
| system `initialize/onReset/onInterrupt`（`Types.ts:136–139`；`ShipSystem.ts:90,134,198`） | initialize取得owner；reset/interrupt取得owner，可在切换/撤退/中断生命周期改mount及别船closure | system对象definition frozen不限制函数；numeric admission不是这些callback的调用gate | 审核callback身份和可达写域；未知者不发持久证书，或接入真实发布/写跟踪。 |
| hullmod `advance`（`HullMods.ts:86`；`Ship.ts:940`） | 每次prepareStep、fire-query之前，直接传live Ship、dt、RNG | `hasOnlyLocalAdvanceHullMods:550–551`是**另一个**更新写域gate；numeric `hasNativePreAimRangeReads:742–751`没有调用它 | 不能继承局部threat gate当分类权限。先审核字段写集；即使只允许本人写，本人spec仍可能变。 |
| hullmod **`advanceCombat`**（`HullMods.ts:88`；`CombatShipStatusSystem.ts:95–102`） | `CombatEngine.ts:1042` batch.execute已完成，`1058` status.update随后调用；传live Ship及world.componentShips/projectiles/spawn/addCombatEffect，可写其它舰挂点，变化在下一frame可见 | 调用处没有native-only过滤；`localAdvanceDefinitions`登记只看 `advance`，**不检查advanceCombat**（`HullMods.ts:296–303,533–538`） | **现有gate不足**。必须单独覆盖advanceCombat以及world写域；不能只审核受益ship自己的callbacks。 |
| system `onActivate/onActive/onAdvance`（`Types.ts:140–142`；`ShipSystem.ts:189–195`） | statusSystem同一world循环分发；真实ship/system/world引用，frame关闭后仍可能改spec或安装未来effect | `dispatchEvents`只检查available，无nativeStat gate；`hasNativeSystemStats`准入read purity，不限制这些effect写 | **不跨dispatchEvents发永久证书**，除非event callback实际写集已审核或统一发布。 |
| `weaponEnabled`（`ShipSystem.ts:281–283`；Types/Registry验证） | fire control读取会调用definition.weaponEnabled(system, live mount)，可经system.owner触达其它mount；不是只读类型 | `hasNativePlanLoop:61–65`检查planFire/autofire方法identity，不能证明system callback不改spec；numeric `hasNativePreAimRangeReads`靠system definition read allowlist | 需要具体definition的weaponEnabled函数writer审计，不能只看原生plan方法。打包Zhefeng `ZhefengSystem.ts:14`当前只读PD，无分类写；这是具体源码事实，不是同签名都safe。 |
| hullmod `onWeaponRecoil`（`HullMods.ts:84`；`ShipWeaponControlSystem.ts:1189`） | 已接受实弹射击的commit给live ship、mount，frame关闭后；可改spec，下一frame受影响 | 没有分类失效通知/record publish；native range allowlist不约束recoil writer | 审核具体callback或真实重新发布；不要把commit发生在frame外理解为可以跨frame缓存。 |
| `statusEffects.advance`（`Ship.ts:933–934`）、`combatEffects`（`CombatEngine.ts:805,1083`） | statusEffects得到live Ship；combatEffects是closure并于tick前执行；system world能安装下一步effect | `hasOwnedLocalThreatUpdate:307`排除statusEffects；某些fleet/threat gate排除combatEffects，但**不是weapon分類永久证书**，Numeric gate没有同等全域封闭检查 | 未知effect与closure写域无法从spec identity得知；全域拒绝持久快路或effect写入也走rule publish。 |
| `surfaceFeedback`（`Ship.ts:215–219`）、modifier/query/AI callbacks | surfaceFeedback拿live Ship；modifier/system.owner、AI上下文可能取得live对象；只读查询签名本身不能限制写入 | 各个native read allowlist只针对特定读集合/阶段；不得扩张成所有callback生命周期的purity | 复用经过**该字段写集**审核的函数identity才能持久化；未知回调保留原路径。 |

### 7.3 已存在的具体反例证明“gate不是生命周期封闭”，不是声称已有分类bug

- `stealth_minefield` / `stealth_minefield_lt`（`HullMods.ts:522–525`）明确含 `advanceCombat`。`native()`在296–303行看到没有 `advance` 即加入localAdvanceDefinitions，故 **hasOnlyLocalAdvanceHullMods可以为含advanceCombat的mod返回true**。当前实现用于布雷，未见分类字段写；但“通过local gate就没有world hook”的前提已经被源码否定。
- Hyperion repair（`HyperionHullMods.ts:49–54,121`）含 `apply`、hullDamageInterceptor注册及 `advanceCombat`；bundled登记533–538行也仅检查advance。该系统本身是否能进numeric还要另看system read gate，不能说此example必然进入numeric；它确实证明hullmod localAdvance gate不覆盖所有writers。
- Rocinante recoil（`RocinanteHullMods.ts:28–41`）实际改flux、compensation、vel，不改classification；Rocinante `onAdvance:116–117`、Gloriana Edict `onAdvance:54–59`实际只中断system状态。它们说明“custom authored hook仍在Worker中运行”，不是分类不变的通用声明。
- `Registry.ts:39,51–60,73–84` 的 `hasNativeSystemStats`允许gravity、Rocinante、Zhefeng以及部分original authored definition的**统计读**；注释已明确不同AI/dispatch范围。把这个现成read gate当“生命周期不写WeaponSpec”的writer gate是不合法扩权。

### 7.4 对可实施方案的最终修正

1. **不新增生产cache**。目前nearest主线保持独立；本审计没有性能候选或收益结论。
2. 真持久record要同时取得：(a) 实际私有Worker ownership；(b) 初次publish晚于构造apply/initialize；(c) **全可达writer的规则字段写集**（含其它ship的world hook、effect closure及parent/carrier/module）；(d) 真正发布/失效入口。缺一项，保持frame-local分类。
3. 最保守可实施资格是“涉及世界内无未知spec writer，所有已运行/可安装hook按不可替换definition身份完成字段审计”。另立 `doesNotWriteWeaponClassification` 能力，不能复用nativeStat/nativeRange/localAdvance等别用途permit；需覆盖onActivate/onActive/onAdvance、advanceCombat、recoil及deferred effects。不必冻结原spec。
4. 如要支持任意hook原地写，有两条诚实路径：**在hook执行边界撤销/重新发布所有可能受影响规则**（world hook至少其可达world，代价要测，不能承诺收益），或明确更改owned扩展接口让分类写走显式publish。后者会改变现有hook行为约定，需用户批准；generic原API仍保留。没有纯文件类型技巧能监听已经逃逸引用上的任意原地赋值。
5. 只在受益ship检查它自己的hook是不够的：`SystemWorld.ships`是其它live实体引用。只在command里bump revision也不够：列出的callback不经command。仅 `sourceSpec === recordedSpec` 不够：这些回调可以原地写。

补查仍仅轻量读取/文档，没有构建、测试、计时、production cache或发布。本次结论不是已发现默认场景分类输出错误，而是**原计划持久准入不能只凭closed-command owner；真实writer hook能力未被现有gate封闭**。
