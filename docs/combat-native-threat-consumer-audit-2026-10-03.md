# 已注册系统 Threat 消费契约审计 — 2026-10-03

## Source notes / 范围

- 只枚举当前 Registry 实际注册的 `advanceAI` callbacks、其直接 helper 和 `tactical.threat` 的读集合；为避免误给 aggregate 权限，额外核实两个现有宿主/defense 的整表消费点。**不改生产**，不写 ThreatAssessment / CapitalShipAI / WeaponThreat* / 主线census，不跑profile、构建或测试。
- 用户最新主线census：120步，defense **76次/步**、每ship tick恰好1次、无vent重复；IncomingThreat对象 **4062.42/步**，imminent **360.46/步**。本审计接受这组用户报告，不独立重跑，也不继续研究“重复defense/vent”假设。
- 原版目标0.98a-RC8；core/decompiled缺失，原版源码/实机/UI **待核实**。证据→预期→差异→验证：只有现有Web callback源码；预期保持其字段读取和全部数值/forecast/防御行为；差异是大部分对象输出没有callback消费；后续主代理需对照精确aggregates、状态、RNG，再独占计时。没有原版等价或提速结论。
- 文件路径以下均相对 `C:/starsector-web-master/`；行号为本次轻量读取的源码，主线并行修改时须以最终版本复核。

## 1. 结论先行

**当前已注册系统的 advanceAI，没有任何 callback 消费 `tactical.threat.threats` 的长度、索引、迭代、map/filter、对象spread或反射。** 唯一直接读 threat 的已注册 callback 是 Rocinante **`attitudeAI`**，读取 `actualDamage`、`imminentDamage` 两个scalar。其他注册回调连 threat 都不读，或传给已核实的静态helper；world.projectiles 的扫描不是 threat.threats 的扫描。

但是 **“全部AI/defense只读现有aggregates”尚不成立**：

1. `ShipDefenseController.ts:9–11` 的 observe读 `threat.threats.length` 维护safeVentFor。
2. `CapitalShipAI.ts:208–211` 刷新forecast时迭代完整threats，提取 `kind === WEAPON && eta > defenseWindow` 的存在性及最早ETA。

这两处都可以用**精确的额外归约事实**替代，而不需要 IncomingThreat 明细对象：`hasAnyThreat/count`、`hasFarWeaponThreat`、`earliestFarWeaponEta`。主线负责这些宿主修改；本审计没有改它们。**不能用空数组/假length冒充完整assessment，也不能仅计算imminent而丢掉far。**

因此具体答复：**对下面已审核callback集合，可安全采用 exact aggregate observer 的输入形状；整个native AI/defense流水线只有在两项整表消费者被精确归约替换、所有原有aggregate计算仍严格一致后才可切换。未知系统继续完整路径。**

## 2. 注册图与 callback 身份清单

### 当前实际注册集（不是“目录里有文件就算注册”）

`ship-systems/Registry.ts:35–49` 当前注册：NONE + 17个implemented authored definitions，共18个固定definition；17个advanceAI字段合计15个不同函数身份（gravity的两个battle变体共享callback）。`Registry.ts:100–121`还可动态注册unavailable source stub，均无advanceAI；外部公开注册另见第4节。

当前 `nativeStatDefinitions` 在39行只捕获此前已注册的 **NONE**。目录中的 BurnDrive/FortressShield/NativeCombatSystems 等不能算进当前名单：本次检索没找到它们的注册/导入生产链，且 `NativeSystemFactory.ts:3` 明确直接throw `Native system removed`。不运行注册库存探针，因此这是**当前源码注册图结论**，不是宣称知道所有外部运行时注入。

表中“身份”指实际 `shipSystemDefinitions.require(id)` 返回的不可替换definition及其 `advanceAI`函数引用；原始export object本身不是注册后definition证书。

| 注册ID | callback身份 / 文件函数行号 | threat读集合；整表/反射结论 |
|---|---|---|
| `NONE` | Registry:35，无callback | 不消费context。 |
| `WEB_ZHUYUAN_ECLIPSE_PROTOCOL` | `eclipseProtocol.advanceAI`，EclipseProtocol:36–39 → `advanceWeaponBoostAI`，SystemAI:33–49 | wrapper原样传context，但helper只读target、tactical.withdrawing/waypoint和武器/幅能；**无threat读、无spread/反射**。 |
| `WEB_GLORIANA_BROADSIDE_EDICT` | `glorianaEdict.advanceAI`，GlorianaEdict:61–72 | 读withdrawing/waypoint/avoidingCollision；扫描实际batteries/weapon readiness，不读threat。 |
| `WEB_SC2_HYPERION_YAMATO` | `createHyperionYamato()`生成的注册definition callback，HyperionSystems:60–65；Registry:42,44 | withrawing/waypoint等，不读threat。function由这次factory生成，另一次factory新对象不能继承身份准入。 |
| `WEB_SC2_HYPERION_JUMP` | `createHyperionJump()`生成的注册definition callback，HyperionSystems:106–115；Registry:43,45 | waypoint/withdrawing/allowOffensiveManeuver/desiredRange，不读threat。 |
| `WEB_ADUN_ARK_FORGE` | adunArkSystems[forge].advanceAI，AdunArkSystems:43 | target/distance/flux，不读tactical/threat。 |
| `WEB_ADUN_ARK_BARRIER` | adunArkSystems[barrier].advanceAI，AdunArkSystems:52 | distance/flux，不读tactical/threat。 |
| `WEB_ADUN_ARK_REPAIR` | adunArkSystems[repair].advanceAI，AdunArkSystems:65 | assemblyShips/hullHp/flux，不读tactical/threat。 |
| `WEB_ROCINANTE_ATTITUDE` | **`attitudeAI`**，RocinanteSystems:42–60，97行赋给advanceAI；helper `driftClear:20–40` | **actualDamage、imminentDamage**（49行）；不读earliest、不读threats。driftClear收到context但只扫world ships/asteroids，不读取或保存threat对象。 |
| `WEB_ROCINANTE_FIRE_CONTROL` | **`localFireControlAI`**，RocinanteSystems:62–77，121行赋给advanceAI | 只读tactical.withdrawing、quietFor；直接扫world.projectiles/world.ships做拦截，**不是threat明细消费者**，该world工作不能因为aggregate observer而删除。 |
| `WEB_ZHEFENG_COMMUTATOR` | `zhefengSystem.advanceAI`，ZhefengSystem:23–28 | withdrawing/waypoint/avoidingCollision；reachableFireTarget读world/挂点，不读threat。 |
| `WEB_GRAVITY_WELL` | `gravityWell.advanceAI`，GravitySystems:39–44 | withdrawing/waypoint；临时改aim后activate再还原，不读threat。 |
| `WEB_GRAVITY_BATTLE_WELL` | `gravityBattleWell.advanceAI === gravityWell.advanceAI`，GravitySystems:119–124 的object spread继承 | 同上；**共享函数但definition身份不同**，需分别登记。 |
| `WEB_GRAVITY_REPULSOR` | `gravityRepulsor.advanceAI`，GravitySystems:58–63 | waypoint/withdrawing；自算world.projectiles barrage、world.ships close，不读threat。 |
| `WEB_GRAVITY_BATTLE_REPULSOR` | `gravityBattleRepulsor.advanceAI === gravityRepulsor.advanceAI`，GravitySystems:151–154继承 | 同上；不因world扫描而需要ThreatAssessment整表，但也不据此获得compact/exact threat producer权限。 |
| `WEB_GRAVITY_VECTOR_TURN` | `gravityVectorTurn.advanceAI`，GravitySystems:90–95 | withdrawing/waypoint，不读threat。 |
| `WEB_GRAVITY_REMOTE_RELEASE` | `gravityRemoteRelease.advanceAI`，GravitySystems:112–116 | withdrawing；读well.lifecycle/target距离，不读threat。 |
| `WEB_GRAVITY_COLLAPSE` | `gravityCollapse.advanceAI`，GravitySystems:145–148 | 没有tactical参数消费，不读threat。 |
| `UNADAPTED_SOURCE_*` | `registerUnavailableSourceSystem`，Registry:100–121 | 仅timing/metadata，不含advanceAI；不扩大成原生行为。 |

此列表包含所有七个gravity definitions（GravitySystems:156）和两个Rocinante definitions（RocinanteSystems:84–123），没有按allSystems去掉某个非主system。

### 原生目录内的未接入定义：不自动扩大结论

为避免误把之前grep结果当实际消费者，本次只核实这些“存在文件但不在当前注册集”的threat读点：BurnDrive:22、NativeCombatSystems.defensiveAI:15–19、SystemAI.advanceJetsAI:18–28、EnergyLashSystems:105、SystemWeaponLauncher:36–38都只用imminentDamage，FortressShield:14用imminentShieldFlux。**它们当前未成为上述注册身份，不得因此给未来整批native adapters发aggregate证书**；若主线恢复注册，需按实际callbacks重新登记，本次不展开该未注册目录。

## 3. 宿主与defense的实际依赖：必须精确保留

| 消费点 | 原语义 | aggregate observer必须输出/保持 |
|---|---|---|
| CapitalShipAI:207 | 同一个horizon/defenseWindow、refreshForecast决定评估窗口 | 原精确求解、目标资格、时间窗口不变，不因far对象多就缩horizon。 |
| CapitalShipAI:208–211 | 遍历本次接受的WEAPON rows，条件严格为eta **> defenseWindow**，取存在性与最小ETA | `hasFarWeaponThreat`与`earliestFarWeaponEta`，只含WEAPON，不能用全source earliest替代。 |
| CapitalShipAI:213–219 | compact窗口保存far flag/min ETA并在非refresh时覆盖hasDeferredWeaponThreat/earliest | 原forecast时钟、保存/恢复行为保持；consumer形状改变不授予新降频或跨stage缓存权限。 |
| ShipDefenseController.observe:9–11 | quietFor看imminentDamage；safeVentFor看**threats.length非0 或hasDeferredWeaponThreat** | 精确`hasAnyThreat`或rowCount，加原deferred flag；“无imminent”不能当“无威胁”。保留zero-damage等原本会进入threats的行存在性，不自创新过滤。 |
| ShipDefenseController.update:14,33,36,40–42 | facing、imminentDamage、imminentShieldFlux、actualDamage决定防御 | 所有这些标量原数值/浮点归约顺序不变；facing归约不是任意朝向替代。 |
| CapitalShipAI.effects:304–319 | 所有tacticalSystems调用，若无rightClickSystem另调用defenseSystem；两种调用都传同threat | aggregate消费者准入须覆盖**实际收到context的所有system**，不能只审主system、漏auxiliary/right-click路径。 |
| ShipDefenseController.update:18–21 | 若以后真的vent，refreshBeforeVent可能触发fresh observe | 用户120步已明确没有触发，本次不把此分支归因为重复大头；实现仍保留其未来的原stage重新读取语义。 |

`SystemAIContext.tactical`（Types.ts:38）目前类型仍承诺完整 `ThreatAssessment`；`ThreatAssessment.ts:22–29`公开接口包含 `threats`。因此建议原公开接口保持不变，为已核实私有consumer明确增加独立exact summary入口，而不是对所有调用者返回缺字段对象或伪装空threats。

## 4. Registry准入不能混用

- `DefinitionRegistry.ts:7–12`注册后 `immutableCopy`，禁止同id覆盖，行为函数引用保留；**资格使用注册后的definition+callback身份**，不是id/name/sourceIds、factory函数名、object形状或任意registered=true。
- `Registry.ts:73–81`：`hasNativeThreatPhaseAI`当前nativeStat set；`hasExactThreatPhaseAI`再加入originalStat set（60行：Eclipse、Edict、Hyperion二者、Ark三者，共7个authored）。它们限制不同阶段的行为/数据复用，**不是已经存在的“只读threat aggregates”能力**。
- `Registry.ts:51–54,83–84`：gravity/Rocinante/Zhefeng被允许native stats读，但不属于上述exact threat AI set。这些callback虽然本次证明不读threat整表，仍不能借机抬升它们的预测/geometry/read-plane权限。**consumer read-set资格与producer数学/原生快路资格分开**；二者各自满足才能使用对应优化。
- `nativeSystemAIInputDependencies:61–69`目前只为Eclipse、Edict、Hyperion二者证书 `forwardClear:false`，不证明 `threats:false`。别把现有forwardClear依赖证书扩大成threat字段删减权限。
- 公开Registry外部注册只验证callback类型，不验证消费契约；新definition、copy、同callback但未知wrapper、instance method override都不能自动继承本次准入。NONE/unavailable无callback只代表没有该consumer，不能替其它未知consumer背书。

### 最小真实准入建议

另立不可外部声明的consumer能力表，例如 registered definition → `{ advanceAI: recordedCallback, threatDetails: false }`。上表17个definitions各自登记；gravity battle变体虽同callback仍按不同definition登记。NONE/无callback可直接视为无系统consumer。

在原决策/assessment入口检查**所有实际将调用的systems/defense callback以及宿主/defense使用的原生方法身份**；consumer集合里出现未知或override，整次保留完整assessment及原输入对象。不要用only ship.system gate。主线若分离exact summary类型，则只有经过明确read-set审计的callback收到summary；所有其它callback仍取得真正完整ThreatAssessment。

**unknown fallback必须在省去明细输出之前确定**；不要调用未知callback后才发现它读threats，再用改变后的world重算一个“旧assessment”。更不要装getter/Proxy探测、反射包装、fake数组或Object.keys遮掩输入。已知callback身份在真实effects边界变更，则此许可失效，按原阶段/快照契约恢复完整路径。

## 5. exact aggregate observer能省什么，不能声称什么

- 对已核实宿主与callbacks，可将接受threat rows的逐行事实直接归约到原标量，以及 `hasAnyThreat / hasFarWeaponThreat / earliestFarWeaponEta`，不分配far IncomingThreat对象，不为了这几项输出materialize/sort整个列表。
- **仍需求出所有影响原标量的精确结果**。用户报告绝大多数far仅证明明细对象很可能无consumer，不证明far interception/ETA/资格全部可删。最早ETA、far weapon存在、safeVent判断都可能由far改变。
- 若facing算法必须保留imminent的角度/权重明细，先只保留原精确imminent数据（约360.46/步），不要把它也强行删除；本次不重写ShieldThreatSector或主线producer。
- 数值归约顺序需明确：若原算法先按ETA排序后求和，改为任意source遍历直接sum可能有浮点差异。exact observer应与原消费者的加总/平局/sector顺序核对；只读aggregate并不自动授予重排计算。
- 此处没有新WeakMap、反射包装、跨tick存储、降低defense次数或降频；实际收益仍待主代理独占计时。

**最终判定：系统callback名单对aggregate-only输入已提供正向源码证据；现有宿主仍有两项整表消费，但均可精确归约。满足这些归约及独立consumer准入后，可以安全采用exact aggregate observer。尚不能直接删除ThreatAssessment.threats公开字段或给未知系统返回summary。**

本次只新增本文；无生产改动、profile/构建/测试/bench/桌面/生涯/提交发布。原版来源与实现后的strict行为/性能验收仍待核实。
