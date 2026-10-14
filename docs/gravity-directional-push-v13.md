# 万有引力号：右键定向推送 v13

> 历史记录：同目标优先/右键替代左键弹簧力及右键自舰推进现已被v14左右独立修正取消。当前左键始终拖锚、右键只推其他未抓住对象；当前区域时限和自动爆见 [gravity-area-controls-v14.md](gravity-area-controls-v14.md)。下方验收数字仅证明当时版本。

2026-09-30。用户批准替换“右键纯极性反转”：按住右键直接持续推送，已有左键抓取时优先推当前对象而不松抓；F区域控场、G全向解围保留。不加伤害或大型说明面板，不改舰体/槽位，不提交或发布。

## 改动前对照

原版：本机0.98a-RC8（`../starsector-core/starsector.log:1`）；`data/shipsystems/burndrive.system` 和 `scripts/BurnDriveStats.java:apply` 调整运动属性，`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java:8-9` 分开位置和速度。它们不支持本次鼠标定向引力操作；本轮是已获用户批准的Web原创，不冒充原版还原。原版实机未验，不操作用户桌面。

改动前差异：`GravitySystems.ts:gravityPolaritySwitch` 仅翻转符号；`GravityFieldPhysics.ts` 使用锚点位移乘符号，未抓取/无F/锚点重合时没有主动推力。单纯加符号系数不能解决空闲无功能及自牵引反直觉。

## 预期行为

- 新独立右键能力，持续逻辑输入`GravityPush`（bit9/512）。不把持续输入伪装成不断点击；本地、专用Worker和LAN权威均走相同状态。松开、失焦、暂停/UI阻塞、退场、排散、过载、离线等立即停止施力。
- 不必先抓取，在真实舰体/弹体/环境轮廓附近首次对准即可推送。首次选中后保持同一对象，不能被鼠标移位或对象移动无意替换；松开/失效/越界/遮挡结束，支持重新对准。未抓取友舰、普通友弹及自身不被自动选中；固定结构不作推进器。
- 有合法左键HOLD时，优先同一对象（含本舰），沿本舰到鼠标的方向施加有限连续推力；不翻转左键/F极性。该帧右键代替同对象的左键弹簧力，不两股力对打；原抓取计时/潮汐伤害继续，费用不重复收同一质量牵引项。本身不新增伤害、接管弹体或改变寿命。
- F仍唯一可移动区域场/短驻留；新版默认F吸引。按住F拥有鼠标，已有右键推送保持最后力向，不偷偷随F游标转向；没有已有对象时不新选。G仍独立外向波并释放左键；右键不复刻G的全向能力。
- 初始试验值：单体范围2000，舰船源强1800按质量响应并受共享260加速度/240额外速度上限，实体弹1400加速度并受现有限速；启动60软幅能，维持350/秒×原质量系数。没有目标不持续计费，有左键同目标时复用原维持费用。不是最终平衡。
- 新默认右键ID；旧默认组合只在运行规格编译时迁移，存档/武器不回写，自定义右键NONE等保留。旧极性ID留给明确历史组合/回归。
- 反馈只沿用真实目标外紧凑标签和方向箭头；空闲不显示。无生产规则驱动的状态不得显示“推送”。

## 验证范围

完成整块后集中typecheck、工程oxlint、既有主线程/真实Worker引力场景及生产HUD/真实模拟器右键按下/释放场景。覆盖独立推送、抓取优先/不脱锁、质量与费用、无自伤/无新增伤害、敌弹阵营/寿命不变、F/G、清理及LAN快照/显示恢复。历史v10/v12极性回归与新版默认行为明确区分。真人长局、最终平衡和友舰多人同意未验。

## 已完成验收（2026-09-30）

状态：**工程集成、后台可玩操作已验**。正式舰体、安装位、左键伤害与保存配装不变；本轮未提交、打包或发布。

- 项目 `npm.cmd run typecheck` 和改动文件工程 oxlint 通过，含 LAN/Steam 两处输入掩码服务器文件。
- `node scripts/check-gravity.mjs --v8 --push`：主线程与真实 Dedicated Worker **各219项检查**，检查及测量完全一致，页面错误0。含原175项历史回归与44项定向推送检查，覆盖真实速度/费用、独立右键、抓取优先且不互相抵消、手动自牵引、友舰资格、范围/遮挡/固定目标、敌弹所有权和寿命、F/G仲裁、中断清理、bit512及真实LAN快照/显示。
- 质量9000的受控重舰实际定向加速度为200；生产引擎30个按住步长加释放步长测得位移约24.7083世界单位。维持费用使用既有质量系数（该质量700软幅能/秒），只是机制试验数值，不是长局强度结论。
- `node scripts/check-gravity-presentation.mjs --push-only`：真实设计页两套配装应用、保存/刷新读回、进入模拟器，以及实际鼠标右键按下/释放、按住/松开F和独立G通过。页面错误和资源请求失败均为0。
- 生产固定步长引擎、正式舰体和生产HUD画面验证独立右键、其它武器组、已抓住推送、F冻结/恢复力向、自舰推送、关闭特效、松键清理及空闲无面板。反馈只取真实推送状态，不用展示假数据替代受力。
- 两处定向修复：正式战术台补充右键空闲提示（不新增准星面板）；箭头从目标框外起画，避免埋入舰体，推送同一对象时隐藏已不生效的左键锚点十字。仅定向重查类型/lint及 `--render-only --push-only`，通过 `arrowOutsideHull` 断言；最终独立推送与自舰推送截图已人工查看。

### 证据

- 规则/测量：[rules-check-directional-push-v13.json](../artifacts/gravity/rules-check-directional-push-v13.json)。其中 `collapseHullDamage` / `collapseFalloff` 及 `support.snapshot.polarity:-1` 是明确的历史规则回归，不是当前默认G伤害或新版极性行为。
- 玩家UI操作：[ui-check.json](../artifacts/gravity/v13-directional-push/ui-check.json)。
- 生产引擎/HUD阶段：[push-check.json](../artifacts/gravity/v13-directional-push/push-check.json)。
- 画面：[独立右键](../artifacts/gravity/v13-directional-push/right-only.png)、[抓取后推送](../artifacts/gravity/v13-directional-push/grabbed-push.png)、[自舰推送](../artifacts/gravity/v13-directional-push/self-push.png)、[释放后](../artifacts/gravity/v13-directional-push/released.png)。

### 未验边界

真人手感与多场景最终平衡、真人多人同步及友舰接受/退出授权、独立包安装和原版实机操作/UI等价未验。后台UI与受控生产场景不能替代上述验收；本次Web原创不声称原版已有。旧v8开发包没有新版操作，不改动无关生涯内容、不占用桌面、不停止用户服务。
