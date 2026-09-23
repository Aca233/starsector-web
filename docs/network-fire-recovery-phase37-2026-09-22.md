# Phase37：持续开火预测恢复与射击节奏时钟修正（2026-09-22）

## 本轮完成的实际改动

**已接入共享LanBattle默认源码路径，不是只新增关闭的实验开关。** LAN/Steam客户端共用此路径；本轮实际联机验收使用LAN，本机未做真实Steam/n2n/异地验收。未构建、安装、发布或提交/推送；不触碰生涯。整体多人延迟/完整60Hz目标仍未完成。

1. **选组/命令与按住开火撞在一起后，不必松开重按才能恢复预测。** 在完整世界ACK越过当前已发送扳机及命令屏障后先建立基准，再用后续完整世界中唯一新生的同舰/挂点/规格弹体，给下一发一份预测许可。不是重画已确认弹体，更不是客机判定命中。
2. **不再把显示缓冲重复加到连续射击节奏里。** SnapshotPlayback只暴露更新的、已经收到的完整世界combatTime；恢复/观察到的射击周期仅扣除这些帧证明的进度（0–250ms内），不猜RTT，不从运动ACK或墙钟制造物理进度。
3. **接收处理只收集一次自己的弹体。** 原来每个pending会再次扫描全战场；现在复用本帧自身弹体列表。无到期许可的输入仍不扫战场。
4. 日志增加脱敏数字字段`hud.input.firePrediction.recoveredCycles`，用来区分“策略开启”与“这次持续射击确实恢复”。旧版未上报该新增计数，不把null说成真实0。

原版证据与实现前合同见 `network-fire-recovery-phase37-source-notes-2026-09-22.md`。原版桌面同场景验证未做，没有占用用户桌面。

## 保持的边界

- 原32 pending、512基准ID、250ms显示寿命/新鲜度不变，60Hz目标不变，无减精度/删弹体/删战术数据。
- 第一份完整ACK只建基准；旧弹体、重复/歧义、非法时间/ID/ACK、失序/过期输入、松手/指针离开、切舰/组/瞬移、暂停/失焦/断线、AI/禁火/实验弹体流不直接给新许可。
- 单轮、原生支持武器、正常时速/射速及原弹药/幅能/冷却/装填检查仍执行；命令屏障未放开。
- 预测仍是独立视觉层；没有改世界弹体数组、命中、伤害、弹药、幅能、冷却、音频或RNG。快照不包含预测弹体。

## 真实联机：旧版负例 → 新版恢复

使用Phase36受控夹具的专用`commandHeld`模式：tick1等待所有实际客户端同步，真实DOM选组/W/按住开火经实际网络到齐后释放。同一冻结公共图只改变LocalFirePrediction、SnapshotPlayback、LanBattle三个生产源文件；检查点1/61/121/421/721/1021，以及准备/释放输入逐字节一致。桌面日志白名单在两臂相同。

- `recheck2`：3人A/B、5人A/B。
- `reverse`：再跑5人B/A。
- 原版三次子测试均保留**exit1**，明确失败在持续开火repeat断言；每台`repeated=0`。外层验证确认该错误为目标回归，同时检查其它功能，未把原始失败改绿。
- 新版三次子测试全部**exit0**；所有玩家均恢复，并实际创建/呈现重复预测。
- 新版保留压力与功能断言：运动/炮塔/确认弹体呈现、800ms房主主线程阻塞中仍>=5次发布且客机ACK推进、同一局重连、无页面/协议错误、原有年龄与样本阈值。

| 测试 | 各玩家重复预测次数（15秒窗末累计，含窗口前预热） | 各玩家恢复次数 | AuthorityHz | 客机完整Hz |
|---|---|---|---:|---:|
| 3人原版 | 0 / 0 / 0 | 旧版无该计数 | 59.996 | 60 |
| 3人新版 | 7 / 4 / 6 | 2 / 2 / 2 | 59.996 | 58–60 |
| 5人原版A/B | 0 / 0 / 0 / 0 / 0 | 旧版无该计数 | 59.952 | 52–54 |
| 5人新版A/B | 6 / 6 / 10 / 8 / 7 | 2 / 2 / 2 / 3 / 2 | 59.449 | 48–49 |
| 5人新版B/A | 6 / 6 / 5 / 6 / 5 | 2 / 2 / 2 / 2 / 2 | 59.896 | 57–58 |
| 5人原版B/A | 0 / 0 / 0 / 0 / 0 | 旧版无该计数 | 59.880 | 53–56 |

这是可复现的**预测覆盖修复**，不是一致的Hz或网络ms改善证明。第一轮5人新版完整Hz较低，反向顺序较高；保留这个波动，不挑好看的轮次。新增接收CPU成本另测，不能用单项快冒充整个游戏快。`lastResponseMs`是接受输入至首次本地呈现的时间，不是RTT，也不是所有帧响应分布。

## 回归验收

- LocalFirePrediction：**110项通过**，包括原55项、新命令阻塞恢复、旧/歧义/非法/超限/失序/松手/禁用、10/20Hz完整快照、重复帧不重复授权、0–250ms已确认时间及越界回退、权威快照/RNG不变。
- MotionPrediction：14通过；LocalTurretPrediction：8通过；ProjectileFlight：32通过。
- 网络诊断白名单：30通过；日志/集成/运行时/测量边界：38通过。合计232项Node测试。
- 普通非steady、非commandHeld三人实际联机回归通过，保留原始动态瞄准/换组、压力和重连断言。
- TypeScript完整app检查两次exit0；改动文件lint通过；steady可选夹具检查通过。

炮塔回归最初7/8：旧测试硬搜`weaponPresentationAngle`，而本轮之前的渲染边界重构已改用`renderWeaponAngle` facade。没有修改生产渲染器；更新调用路径守卫，并增加运行时验证：native facade读到预测角、detached facade读自己的相对角、reset后消失、整个权威快照不变。旧失败日志保留，修正后8/8，不是删除原安全目标。

## CPU独立对照（不含传输/恢复/绘制）

同一原生世界，两种恢复器对象；200预热+1200样本/臂，128/1024/4096弹体（自身8），A/B和B/A。测试密度为合成压力，不冒充完整实战。

- 已有工作循环：1024弹体旧P50约0.0091–0.0092ms，新约0.0067–0.0070ms；4096旧约0.0339–0.0361ms，新约0.0111–0.0213ms。
- 以前完全不工作的“命令阻塞持续开火”：新观察器增加成本，128弹体P50约0.002ms，4096约0.0093–0.0094ms，P95约0.0117–0.0125ms。旧版此场景几乎不做事，因此不能宣称此分支CPU更快。
- idle分支仍不扫弹体。样本很短会受JIT/计时精度影响，不根据微秒比率推断端到端收益。

## 失败和剩余工作

- 首版只修许可：`recheck1`有2台出现repeat、1台仍0，未作为完成依据。随后定位并修正显示缓冲重复计时。
- 早期runner用最后一个HUD样本要求仍有活弹体，比原本“测量窗内实际渲染过”多了错误条件；已改为原有整窗断言，原日志保留。
- 下一步仍需攻克多客户端全量状态恢复/呈现成本与实际环境吞吐；本补丁不保证Steam/n2n或每台机器60Hz。不重新启用Phase35接收字段候选或其它已拒绝实验。

## 证据与修改文件

证据根 `artifacts/network-stream-20260922/phase37/`：`validation-summary.json`、`recheck2/`、`reverse/`、`receive-cpu.json`、`normal-regression/`及所有正负例日志。

生产：`src/network/LocalFirePrediction.ts`、`src/network/SnapshotPlayback.ts`、`src/network/LanBattle.tsx`、`desktop/network-diagnostic-record.mjs`。

测试：`scripts/check-local-fire-prediction.mts`、`scripts/check-local-turret-prediction.mts`、`scripts/check-network-diagnostics.mjs`、`scripts/lib/steady-multiplayer-fixture.mjs`、`scripts/check-steady-multiplayer-fixture.mjs`、`scripts/check-normal-multiplayer-browser.mjs`、`scripts/check-fire-recovery-browser.mjs`、`scripts/benchmark-fire-recovery.mjs/.mts`。

新真实对照需新目录（拒绝覆盖）：准备before/after冻结图，再运行 `node scripts/check-fire-recovery-browser.mjs`，用`FIRE_RECOVERY_OUT`指定目录；可选`FIRE_RECOVERY_PLAYERS=5`、`FIRE_RECOVERY_ORDER=after,before`。无头Playwright依赖取既有运行时，编译CSS须先通过源哈希校验。测试变换不进入生产构建。
