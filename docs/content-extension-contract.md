# 内容扩展契约（2026-09-16）

## 本次解决什么

不再让舰船或武器 ID 决定战斗规则。新增使用现有机制的内容，只增加规格、资源、文本和可选配装；不要修改 CombatEngine、Ship、通用 AI 或 HUD 来识别新 ID。

这不是“原版所有功能已实现”的声明，也不保证任意未来机制不用写代码。新的系统/命中/光束/舰装逻辑在现有扩展接口内实现一次；新的底层物理种类、渲染通道或原版 Java API 仍可能需要扩展基础接口，不能假装自动兼容。

## 唯一职责与入口

- **原版导入**：StarsectorDataLoader 只转换读取器提供的文本；浏览器不读取游戏安装目录。
- **导入选择**：data/content-selection.json 集中声明舰船、武器与沙盒对手，不再把武器适配器键列表当导入目录。
- **原始数据**：data/generated/ships.json、weapons.json 保存来源规格。无运行时按 ID 改数值。
- **Web 表现策略**：data/presentation-policy.json 保存现有美术参数，和原版规格明确分离。重新导入不会覆盖此文件。通用表现回退是 Web 默认，不是原版精确复现。
- **配装**：generated/loadouts.json 是可选沙盒预设；缺省保留舰体内置武器，没有预设也能按实际挂点形成武器组。
- **行为**：extensions/ship-systems、weapon-effects、HullMods.ts 分别拥有系统定义、效果与舰装。规则、时序、AI 策略、音效和控制能力不再散落在舰船身份分支里。
- **公开代码入口**：extensions/index.ts。可信 TypeScript 模块在应用组合阶段注册行为；JSON 内容包不执行 Java/JS 代码。
- **内容包入口**：installContentPack(pack) 等待本地资源清单，再原子安装；同步 modManager.loadMod 供已准备好资源的调用者使用。
- **运行时目录**：ContentRegistry 是唯一权威。默认 ContentManifest 随注册 revision 从它生成。public/content/manifest.json 仅用于显式外部清单校验，不是默认运行时第二份目录。

## 新舰船 / 武器

1. 提供完整 ShipSpec / WeaponSpec 与引用资源；资源需要在本地 game-assets 资源清单中，不进行哈希或大小验证。
2. 复用已有系统 ID、效果 ID、舰装 ID。光束身份由 beamEffect 决定，不由武器 ID 决定；射程由装备的舰装决定，不由舰船名称决定。
3. 新 hull 可以直接带 weaponSlots.defaultWeaponId；defaultWeaponGroups、独立沙盒配装均可省略。
4. 一次 installContentPack({id, name, version, author, description, ships, weapons, i18n})。同包战机交叉引用不依赖排列顺序。
5. 应用启动时先注册行为并等待内容包安装，再渲染 App / 读取存档；缺少内容包的存档应明确拒绝，不能换成默认舰船。
6. UI 自动读注册目录、真实挂点、系统名称与武器组，不新增针对该舰的 JSX 分支。

新音效在应用组合阶段通过 registerSoundBank 注册 samples（file/pitch/volume），之后内容只引用声音键。贴图加入 spec 或行为 resources.textures；行为使用的音效在 resources.sounds 声明。资源准备会收集当前舰船、武器、子弹体、可重建战机与行为依赖，不为每个新增系统再加一个全局预载特例。

## 新行为

ShipSystemDefinition 包含时序、开关/充能、幅能成本、控制能力、表现能力、音效、数值修正和生命周期/AI 回调。通用 ShipSystem 只推进 IN → ACTIVE → OUT → COOLDOWN，保留越阶段时间，零时长 ACTIVE 也只派发一次事件。

WeaponEffectDefinition 按原版完整类名或自定义 ID 注册 beam / hit / advance 回调。每道射线状态用 effectState，换发射周期时 clearEffectState；影响目标的持续效果放在 ship.statusEffects，护盾修正放在 shield.damageTakenModifiers。不要在 Ship 或 Beam 上继续堆具体武器专属字段。

HullModDefinition 区分 implemented 与 metadata-only。前者通过 apply / advance / rangePercent 生效；后者只呈现为“尚未实现”，禁止携带生效回调。多个定位核心用分组和优先级计算，不重复叠加。

这些是已有通用阶段上的扩展点，不是完整的 Starsector Java 插件兼容层。未知原版系统、武器效果、子弹体行为会明确拒绝导入/注册；不允许回退为 NONE、普通弹或无效果。添加全新底层行为时，应扩展对应能力接口，而不是增加某个具体内容 ID 的判断。

## 安全与一致性

- 定义与数据注册时复制并递归冻结。可变战斗状态归实例所有，不修改全局规格。
- 内容包先完整复制、校验 ID、挂点/尺寸/类型、武器、战机引用、效果/系统/舰装、表现、音效、资源和翻译，再提交一次 revision。
- 任一项失败，不改变内容目录、翻译或已加载包记录。重复 ID 不静默覆盖。
- 行为注册是可信启动代码；它与运行中 JSON 内容包的事务边界不同。不要在加载不可信 JSON 时执行行为模块。
- 切换不存在的舰船会在重置战斗之前失败，不能清空正在进行的战斗。
- 注册后安装的内容在下一次会话准备时重新验证；不能依赖旧的静态 manifest 缓存。

## 仍然明确未实现的原版部分

重型弹道集成 hbi、相位场 phasefield、精密机械 delicate 目前保留原版元数据，但不是完整舰装实现。阔剑现有沙盒快照没有原版 flarelauncher_fighter；新导入器现在会明确拒绝这个未支持系统，而不是继续伪装成 NONE。因此当前全量重新导入会在该能力处停止，必须先实现对应模块；本次未运行导入器，也未修改原版文件。

AI 回调是现有 Web AI 策略，并非原版 BasicShipAI 的复刻。原版战役、完整变体/改装、碰撞与战机行为的差异仍以 source-fidelity-audit-2026-09-16.md 为准。

## 本轮验证（不保存测试文件）

- TypeScript / lint / 生产构建；Node 内存打包加载，以及开发版和生产版浏览器启动。
- 全新普通武器与舰船 ID 的装配、开火、真实碰撞 hit 回调、every-frame 回调、射程与无配装武器组。
- 更名速子束/引力子束仍走原效果；自定义光束回调实际派发；引力子 1/2/3 层及超时、射线周期状态清理。
- 新系统定义的深冻结、源 ID 映射、阶段越界、单次激活事件、取消、充能与幅能。
- 原有冲刺推进/堡垒护盾/空雷时序与数值；空雷仍进入可拦截的共用弹体管线。
- 错误包、错误翻译、未知机制/音效/资源拒绝且不残留；同包先舰载机母舰、后战机的引用；manifest 随 revision 更新。
- 17 个现有原版武器仅在内存中读取并转换校验；未知 projectile behavior 被拒绝，无导入写入。
- 隔离浏览器注册新舰船/武器/系统，舰船目录及 HUD 自动显示新名称，无新增 UI 特判。不改用户默认页面或存档。

这些验证证明上述扩展路径可用，不代表所有未知内容和所有原版机制都已覆盖。

开发模式下，引擎/内容数据变化会失效整个模块图并整页重载，避免 HMR 混用新旧单例。UI 样式/组件保留原有热更新；正式包没有此开发插件。

开发重载已用只更新文件时间戳的方式触发验证：发生完整重载后，新系统和内容包依然通过同一注册表加载。

## 自动火控角色数据（2026-09-16）

武器可通过 `aiHints` 声明原版 PD/PD_ONLY/ANTI_FTR/STRIKE 等角色；常规新增舰船、武器不需要修改火控 ID 分支。敌舰、玩家自动驾驶和手动驾驶时的自动组共用逐挂点控制器。已支持的提示、原版依据与未支持机制见 `fire-control-fidelity-2026-09-16.md`；未实现的提示仅保留元数据，不能当作已支持能力。


## 原生能力解析与独立防御（2026-09-16）

- 舰体主系统使用 systemType，非相位特殊防御使用 defenseSystemType；后者有独立右键输入、生命周期、充能/消耗、状态与资源校验。相位线圈仍由 Shield 管理，不把原版 PHASE 防御槽标记一律解释为潜航。
- SourceCapabilities 和 resolveSystemId 根据注册定义的 sourceIds 将旧 UNADAPTED_SOURCE 引用接回真实实现，恢复已经实现的原生内置舰装。不能把导入报告当成永久可用性白名单。
- 新系统可以复用原版元数据工厂，但必须显式提供并注册行为。selectTarget 在激活被接受时捕获目标；onActivate / onActive / onAdvance 可接收具体槽位的 ShipSystem，不能假设永远是 ship.system。
- 两个槽位的百分比/固定加成相加，倍率相乘；生命周期和费用各自管理。damageTakenModifiers 用来源键，作用结束、源死亡或再次激活时须失效、清理。
- 舰装的 shieldSpec 修改防御基础参数，然后统一计算普通 flat/percent/mult；原始 ShipSpec 不保存派生数值。安装约束必须区分原生防御和有效防御，不允许以移除护盾绕过原生安装限制。
- 已有接口覆盖的效果新增内容只需数据和定义；全新的战役或战斗机制仍需实现底层机制，不能承诺任何未知内容都只加数据即可完成。


## 系统武器、装填与派生统计（2026-09-17）

- ShipSpec.systemWeaponSlots 与普通 weaponSlots 是独立槽位ID空间（原版苍鹭有跨空间同名槽位），只保存SYSTEM槽几何，不占普通改装位。导入器直接读源槽；旧导入内容由 SourceCapabilities 小型投影恢复。
- ShipSystemDefinition.isExecuting 独立于CSV阶段/冷却，用于原生武器型系统的真实发射状态。共用 SystemWeaponLauncher 不改变原有时序；效果仍须显式定义。SystemWorld.projectiles 必须是实际战斗弹体数组，不允许脱离实体管线的假特效攻击。
- Projectile.targetProjectileId 是制导诱饵锁定，targetShipId 保留后备舰船。flareBehavior 明确区分标准/追踪；ECCM抵抗与单诱饵免疫集合用战斗RNG；原生环绕式诱饵不能注册为这两种模式。火控与碰撞共享实体；无条件吸引、固定距离虚构爆炸被移除。
- WeaponSpec.tags / ordnancePointCost 来自源标签/CSV，装填器按原始武器容量与实际原生槽消费共享容量。WeaponMount.reloadDelayRemaining 是独立额外延迟，先走装填延迟再走普通冷却，期间所有开火入口一致拒绝。
- HullModSupport.scope=mixed 表示战斗已接、战役未模拟，UI必须同时显示缺失范围，不能当全效果完成。
- Ship.maxHullHp 是有效结构上限，所有运行时血量比例/修复/存档/死亡使用它；ShipSpec.hitpoints 只作原始基础数据。phaseTimeBonusMultiplier 作用于相位时间增益，不乘整个主观时间；玩家世界补偿和发射舰光束时钟自动沿用同一倍率。
- 原版系统“基础容量百分比”使用未施加舰装的基础容量，不能由最终有效幅能容量重复放大。


## 舰长战斗技能、来源与派生数据（2026-09-17）
- ShipSpec.captainSkills 只保存已登记技能 ID 和等级1/2；未知 ID/等级拒绝，旧方案缺省为空。源 .skill 的效果组才是启用依据，不能把同名 Java 里的旧 Level 一并启用。
- CombatSkills 描述/静态 stats/weaponStats/rangePercent 共用登记表；实际消费者必须存在。不能仅让 UI 出现选项。
- effectiveHullModWeaponSpec 输入必须是注册表中的原始 WeaponSpec，不可二次传派生挂点；武器 OP 只计实际安装、非免费内置武器，内置来源与挂点武器类型分开记录。
- 发射时记录 sourceDamageMultiplier、sourceWeaponType、spawnLocation；命中时目标/距离/幅能监听不写回 Projectile.damage，防止贯穿与二次爆炸叠加。分裂子弹头继承来源和发射倍率，重新记录子弹头出生位置。
- sourceCarrier 必须引用真正母舰，不得按 isPlayer/阵营批量增益。所属战机技能通过生成入口接入，补充战机走相同入口；目标馈送的实时武器加成也适用于持续光束。
- 弹体对 Ship 的来源引用放在弱映射里，不进入快照 DTO；即使死亡战机从 roster 移出，已发射弹体仍有其原始技能来源，且弹体回收后不泄漏。
- 未完成系统/技能/舰装仍明确标记未完成；只有战斗部分完成的混合舰装不声称战役效果有效。当前完整性见 native-ability-coverage-2026-09-16.json。


## 电子战、系统武器限制与舰队配置（2026-09-17）
- combatWeaponRange用于战斗/火控/AI/光束/弹体/射程弧；effectiveWeaponRange用于静态改装数据。ECM为实例状态，不能写进共享舰体或武器元数据；动态倍率在额外flat和阈值之前应用，导弹免阈值但不免ECM。
- SystemWeaponModifiers新增rangePercent/projectileSpeedPercent，百分比相加而非相乘；combatProjectileSpeed合成静态与临时百分比。新系统使用passiveModifiers/weaponEnabled描述闲置效果和逐挂点限制，不能在核心武器循环按舰体ID特判。
- FleetMember的hullMods/captainSkills/fighterWings/weaponGroups为可选原始配置，缺省兼容旧存档；派生结构/幅能/装甲不写入这些字段。先还原ShipSpec再构造Ship，不能仅替换武器数组而保留过期hullStats。
- sourceHullTraits保留原生内置身份/提示但不赋予对应尚未实现舰装的能力。使用它判断automated/civgrade/CIVILIAN；不要把元数据身份登记为已实现插件。新导入数据保留源提示与机翼tags。
- SystemWorld.deployReserveWing使用真实飞行甲板，补充战机均经同一spawnCraft入口，保持母舰/技能归属；额外编制有独立到期回收，不增加常态重建配额。


### 系统无人机与机翼回收（2026-09-17）
- 普通机翼属于FighterSystem；系统释放实体属于DroneSystem，不混用机翼补充队列。母舰/机翼归属必须明确，不按阵营或舰体ID猜测。
- 系统无人机的原生配置与指定变体在ship-systems/native-drone-launchers.json，元数据本身不赋予完成状态。DroneLaunchers的库存命令不扣次数，DroneSystem实际生成时扣；派生状态不写共享ShipSpec。
- SystemWorld.recoverWingCraft/advanceDroneLauncher由CombatEngine接实际生命周期，不能传仅做视觉或传送位置的假实现。
- 外部相位用Ship.externalPhaseEffects独立source key，读者返回undefined即失效；不得覆写shield.isPhased。入坞实体必须从活动集合移除，并防止回收编制被当成战损重复补生。
- 新船使用已有已登记系统不增加舰体分支；新无人机武器按指定variant的真实挂点构造，内置插件/幅能配置也必须保留。


### 统一操作与世界舰装（2026-09-17）
- CombatCommands分离按键解码、状态校验、实际执行；键鼠/HUD/LAN/Worker复用。新系统声明能力，不新增舰体专用键盘分支。
- activationInput捕获指令边缘输入，延迟执行效果按定义选择固定落点或持续追踪；不要在共享定义中保存某艘船的鼠标。
- HullModDefinition.advance负责舰体本地更新；advanceCombat(ship,dt,world)负责依赖战场实体的效果，dt为真实战斗时间。world.combatScope是每战唯一对象，重开必须更新；使用WeakMap隔离全场单源效果。
- NativeMines按真实weaponId提供空雷规格，MineSystem统一拦截/引信/伤害，落点策略属于源能力。感应雷区与空雷突袭不能混用寿命、散布、声音。
- 舰船殉爆独立于视觉爆炸，使用真实最大幅能和explosionDamageMultiplier/explosionRadiusMultiplier；isHullExplosion载荷不乘武器伤害监听，HITS_SHIPS_AND_ASTEROIDS不打战机/导弹。


### 派生舰体身份（全项目审查，2026-09-17）
- ContentRegistry 为新舰体规格建立 sourceHullId（默认原始 id）。改装、联机、模拟、系统变体复制规格后即使修改运行时 id，也必须保留 sourceHullId。
- 查询原生舰体事实使用 sourceHullId ?? id；sourceVariantId 继续表示装配方案身份，不能代替舰体身份。自定义部署CR仍以 deploymentCRCost 显式字段为优先。


### 后备舰队 / 局内增援（2026-09-17）
- 战斗对象必须区分 allCapitalShips（完整身份名册）和 capitalShips / ships（活动战场）；禁止把待命舰加入 AI、碰撞、光环或补充循环。
- 部署统一经 CombatDeployment 校验固定名册、队伍、状态和部署点；网络客户端不得自行构造主舰或传费用绕过校验。模拟目录仅放宽舰船来源，不放宽费用校验。
- ShipSpec.deploymentPoints 是部署费用，不能以 OP 或舰级估算；原生导入读取 supplies/rec，旧内容用 sourceHullId 对应原生费用。新增可部署自定义舰必须声明有效费用。
- 激活保留同一 Ship 状态，舰载机仅在实际入场后初始化；结算须覆盖完整名册，未出场舰原样返回。详见 reinforcement-deployment-2026-09-17.md。

## 模拟器完整目录与双阵营批次

- deployment-costs.json 使用原版目录已解析的皮肤继承/覆盖费用；新原生舰体不应只更新模拟器30项预设。
- simulation-variants.json 保留特殊原版装配及来源路径；同ID不同源文件的方案必须保持独立运行时身份，原始 sourceVariantId 不变。
- 模拟部署选择可同时包含友军和敌军，经 deploySimulationFleet 一次校验两边额度后提交。不能先部署一方，再发现另一方无效。
- 查看目录不覆盖 studio-prototype；未适配条目明确给出原因，不通过删装备、猜部署费用或伪造方案掩盖。
