# 模块交错威胁复用结果（2026-09-27）

## 结论
保留为第四个**默认关闭**的实验：`VITE_AI_INTERLEAVED_THREATS=true`。Node整步唯一ABBA两组分别省14.3346%和9.7435%，超过预注册的每组3%门槛。真实浏览器仍在启动/稳定HUD前触发主机过载，未取得有效稳态Hz或输入P95，不能称联机延迟改善或优化完成。没有减实体、降频/精度/效果、跳过校验或放宽过载保护；没有提交/推送/发布。

## 实现边界
- 新建独立的owned-interleaved WeaponThreatEnvelope，绝不延长根AI缓存或扩大nativeThreatPhase/compactForecast。
- 只有私有数据命令Worker、原生Engine/模块AI/更新入口和独立写入资格允许。HullMod许可基于注册定义身份，不是可伪造字符串标签。
- 模块AI后、舰船更新后失效parent/sourceCarrier连通组；未知statusEffects、伤害拦截器、Armor/Flux回调、未审计advance或PHASE防御关闭整段。异常finally关闭。资格丢失不在本步重新打开。
- 未更改ships实时查询、发射与更新顺序；新弹体、光束与已有光束变化仍实时评估。没有给这些对象使用旧索引。

生产写集：
1. src/engine/extensions/HullMods.ts：独立本舰advance许可。
2. src/engine/simulation/Ship.ts：独立本舰/依赖组写入资格。
3. src/engine/ai/WeaponThreatEnvelope.ts：受控交错段工厂。
4. src/engine/simulation/CombatEngine.ts：默认关闭接线、组失效与finally关闭。

## 一次集中验证及定向修复
- 首轮typecheck准确发现moduleAI为WeakMap，不能values枚举；仅改为沿combatShips get身份检查。首版日志和冻结保留；v2 typecheck与改动lint通过。
- 5行为合同通过：176实体734挂点、初始化/重建/default关；依赖组与退场；12类回退；异常与动态失去资格；既有60完整步场景包含激活、靠近、排散和模块封舱，逐步authority及隐藏fire-control/RNG完全相同。
- 初始真实Engine一步：新span 1个，176次构建、4664次命中；最终关闭、清空、不可继续get。重建后重复同等非计时合同。
- 后续复核发现live projectile/beam子场景最初没有实际发射。这不是有效覆盖，未据此宣称完成。已修复为真实原生fireWeapon发射，强制断言1弹体+1光束及两类威胁，并修改现有beam伤害确认实时读取。仅定向重跑该非计时合同通过；**没有重复ABBA**。最终脚本lint通过。

## 固定性能验收：一次顺序独立隐藏Node进程ABBA
真实两玩家+20AI，烛渊/荣光女王/休伯利安循环，seed917、3200DP；每臂150热身+120计时完整fixedUpdate。四臂均开启既有exact根AI/motion/preAim三个实验，只有本候选不同。

| 臂 | 模式 | 120步耗时ms | 每步ms |
|---|---|---:|---:|
| A0 | 基底 | 5202.2109 | 43.3518 |
| B1 | 交错复用 | 4456.4938 | 37.1374 |
| B2 | 交错复用 | 4532.1416 | 37.7678 |
| A3 | 基底 | 5021.4014 | 41.8450 |

两对分别省14.3346%、9.7435%。没有取最好值、改门槛或重跑。自然推进终态四臂均171活跃实体，数量不单独用于推断战损；完整authority+隐藏tracker/RNG hash均为bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6。

本轮冻结726源码模块，含并行任务新增GlorianaSiegeHit及军械改动。全部A/B使用同一新基底；不可把本轮hash和历史725模块的60469…hash直接比较为行为回归。没有撤销并行内容改动。堆占用是未强制GC的瞬时数，不能据此宣布内存/GC改善。

## 真实浏览器功能验收：失败，不冒充性能对照
只运行一次候选，不是浏览器A/B。D3D11、1280×720、main呈现、presentation Worker/display-v2关闭；完整index/lan/motion样式冻结，保留全部效果、22根舰+56模块+70战机+28轰炸机=176实体。计划10秒普通+10秒输入后70ms忙任务、800ms停顿ACK、同局重连。

实际进入measurement准备后，主机worker-runtime过载中断，HUD就绪等待30秒超时。最大观察到快照tick32；两端before实体证据均176。稳定采样尚未开始，因此无有效稳态Hz/输入P95，800ms停顿ACK和同局重连均未执行。不能拿停止后的60FPS/0Hz或过期HUD读数声称实时速度。所有测试浏览器、helper和服务器已完成清理；四生产文件、Node/harness及资产哈希均无测试中漂移。

## 工件与下一步
- artifacts/lan-interleaved-threats-20260927/before.json、before/：原始字节。
- candidate-v2-browser.json、candidate-v2.json：通过合同/测量的冻结候选。
- check-v2/abba.json：唯一整步ABBA；whole-state-hashes.json：60步差分。
- check-live-coverage/group-results.json：真实弹体/光束补验。
- browser-status.json、browser-summary.json、browser-candidate-1/：浏览器失败证据与清理。
- scripts/check-lan-interleaved-threats.mjs 默认重放冻结候选。

当前差距仍是完整权威步与发布等串行工作无法在实际浏览器启动负载下及时完成。本轮不默认启用、不追加重复测速；下一步应基于新基底区分剩余模拟与捕获/发布开销，而不是放宽过载保护。
