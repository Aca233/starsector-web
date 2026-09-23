# 重复技能描述修复 — 2026-09-23（编码前对照）

## 原版证据 → 当前差异 → 预期
- 本机版本仍为 Starsector 0.98a-RC8（starsector-core/starsector.log 首行）。只处理舰船技能描述，不改变技能机制或未完成生涯内容。
- 原版 `data/strings/descriptions.csv` 的 SHIP_SYSTEM 记录分别提供 text1/text3/text5。堡垒护盾说明武器能量转给护盾、持续硬幅能及90%减伤；空雷突袭说明传送追踪空雷、2000高爆/1000距离；时流之壳为最高3倍时间流速；量子干扰为1秒过载。已和 `generated/native-catalog.json` 对照，不能把文字相似当成机制相同。
- 原版 scripts：`data/shipsystems/scripts/{BurnDriveStats,FortressShieldStats,MicroBurnStats,MicroBurnOmegaStats,CombatBurnStats,DynamicStabilizerStats,SensorDroneStats}.java`；反编译 API 源码 `com/fs/starfarer/api/impl/combat/{DamperFieldStats,DamperFieldOmegaStats,CryofluxTransducerStats,TemporalShellStats,EntropyAmplifierStats,AcausalDisruptorStats,InterdictorArrayStats}.java`。DynamicStabilizerStats 可核对机动/射速/光束伤害/后坐力；CryofluxTransducerStats 标记 UNUSED，不冒充常规原版装备，其 Web 适配独立存在。
- 无人机 `.system` 的 droneVariant/maxDrones/allowFreeRoam/launchDelay 与 CSV max uses 分别代表型号、部署上限、自由出击、释放间隔、库存；不可把库存当作同时部署数。热诱弹由 `.system` /对应 `.wpn` / `.proj` 定义 STANDARD、SEEKER、JAMMER 与连发数，必须区分。
- 运行目录审计：58条系统定义，NONE以外17条缺 description；NativeSystemFactory 的统一 implementationDetails 被 SystemLoadoutEditor 当主描述显示，导致“都一样”。另外8种无人机共用同一段介绍、4种诱饵仅两段介绍。武器背景说明仅 breach/breachpod 源文本本就相同，不人为改写这一正确重复。
- 预期：17种系统各有用途/效果/限制的准确说明；无人机按真实型号、库存、部署数区分；热诱弹按行为/连发区分。主详情只读效果说明，实现说明另行折叠，不再用技术兜底文案冒充效果。文字只承诺现有Web行为，原版未移植差异不隐藏。

## 验证边界与方法
- 不操作桌面、不启动可见窗口。无对应原版同状态截图，原版实机对照待核实。
- 实现完整后集中一次类型检查、改动文件lint及现有 `check-native-descriptions-browser.mjs` 场景（扩展同一fixture覆盖技能详情，不另建测试工程）。检查选择切换、描述不重复/非空、F2/关闭既有行为与草稿不被浏览操作改写。
- 不发布/重启当前客户端，不暂存提交推送，不改用户其他工作。

## 本次完成与集中验收
- 补齐17种原本没有主描述的技能（冲刺推进、堡垒护盾、空雷突袭以及14种 NativeCombatSystems 系统）；NONE有明确空槽说明。未改任何技能时序、属性、AI、命中或充能逻辑。
- 8种无人机由各自原始型号、库存、部署上限、释放间隔与自由出击开关生成说明；感应无人机明确每架25%视野/15%实弹能量射程。4种诱饵明确普通10枚、追踪3枚、干扰3枚/单枚。没有为了“不同”而杜撰效果。
- 对照CSV纠正编写时的细节：microburn与combat_burn没有noTurning限制，后者关闭护盾；microburn_omega的主力舰默认库存为3，较小舰型初始化为2。数据以本机原版配置和现有适配共同核对。
- SystemLoadoutEditor 不再将 implementationDetails 或“沿用原版技能效果”当主介绍。技术信息独立折叠；未来缺文案时只明确指出具体技能缺说明，不再作虚假通用承诺。
- 一次集中 TypeScript 检查、9个改动文件oxlint及 diff-check 通过。扩展既有 `scripts/check-native-descriptions-browser.mjs`：原资料库7组场景保持通过；57个可选技能逐个搜索/打开，主描述非空、彼此不同、无参数占位/通用兜底，关键数据断言通过；折叠技术信息独立，查看与取消不改装配。无 pageerror。
- 已查看 `artifacts/native-description-tests/system-description-desktop.png`（1440x900）；文字完整显示、主效果与技术信息层次分离。构建仅有原有大分包警告，产物仍在该回归场景的 artifacts 目录，没有覆盖 dist 或打包生涯。
- 原版实机同状态截图仍未验证。本次仅改源码和既有验证脚本，未发布或替换用户当前运行的客户端。
