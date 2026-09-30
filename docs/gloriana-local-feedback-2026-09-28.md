# 荣光女王局部反馈 — 2026-09-28

## 范围与证据（编码前）
- 本轮仅落实选舷敕令、战损封舱的局部可读性；不更换正式船图，不生图、不改伤害/时长/OP、不制作发布包。
- 本机原版 0.98a-RC8：`starsector-core/data/shipsystems/ammofeed.system` 的 weaponGlowColor / BALLISTIC；`damper.system` 的橙色舰体副本反馈；`decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/DamperFieldStats.java` 的 apply/unapply 与独立状态说明。原版依据是“反馈跟随真实受益对象与强度”，不是本舰原创规则的出处。
- 原版实机画面/交互本轮未检查（用户禁止占用桌面）；原版等价待核实。本轮明确为 Web 原创材质表达，不复制整舰 jitter 光圈。
- 当前差异：敕令只在核心 jitterUnder，真正受益的炮廊无局部反馈；封舱权威 WeakMap 仅投影为 HUD 文本。

## 视觉契约
| 对象 | 权威来源 | 空间/素材 | 阶段与退出 |
| --- | --- | --- | --- |
| 选舷炮廊 | accepted activationInput、父舰生命周期、现有 usableBattery/edictOnline | 该模块插值姿态、现有正式装甲纹理；暖金材质行进与实弹炮座弱光，位于战损/武器下方；绝不作用核心/动力/对舷 | IN 按 effectLevel 顺舰纵向通电；ACTIVE 用模拟 combatTime 的低幅流动；OUT 随强度收束；过载/排散/封舱/失段/撤退/死亡立即去除，不延长收益 |
| 封舱模块（含核心） | 原 WeakMap used/remaining，且 available | 只处理本模块材质，橙色横向分区闭锁；不画假门、圆盾或新增粒子 | 真实6秒内先闭锁、持续、结束前退光；不宣称回血修甲；封舱显示优先于敕令，炮座敕令光熄灭 |
| 待封舱 | 存活、未使用、低结构但还未满足触发条件 | 本舱低强度红色告警，不显示保护/锁闭 | 满足条件后切真实封舱；结构恢复/死亡/撤退移除；用尽无常驻光，HUD 储备保留 |

## 接入边界
- 提供只读 hullmod surfaceFeedback 投影钩子；Ship 暴露只读值。封舱计时仍只由 advanceBulkheads 持有，不解析文字、不在显示侧运行规则。
- 显式纳入本地 Worker 投影、LAN 权威投影及固定显示 lane 的有界元数据；显示值没有 Ship 引用、规则函数或私有计时器。
- 显示着色使用已批准 hull texture 的颜色/明度掩膜，不生成替代素材；每个可见受影响舱最多一个材质 pass，无每帧 Canvas、无纹理乘帧。共用战斗时间，暂停不动。
- 截断或取消只清反馈，不撤销/重发实际支付，不改变任何收益规则。

## 验证计划
一次类型检查、改动文件 lint、现有军械脚本的局部反馈场景；对左右选舷、光标移位、退光、中断、独立封舱、待机、死亡、投影和清理做生产对象探针。隔离无头浏览器做真实 Worker 状态/阶段截图，封舱用生产引擎受控场景，不伪造 Worker 状态。自然实战/多人实机/独立安装仍待验。

## 实现与验收结果

- 移除敕令核心 `jitterUnder`。受益炮廊在真实强度范围内沿原装甲纹理逐步通电、维持流动、退出退光；只对同侧存活且可用的炮廊显示。宏炮/攻城炮只提亮固定承座，不重复描画后坐炮管、不冒充开火。
- 封舱优先显示本舱暖橙闭锁过程，并将停火炮塔压暗；没有支付条件时是低强度红色告警而不是防护表现。到期退光，用尽不再亮；HUD继续显示封舱时间/储备。
- 通用只读 `HullModDefinition.surfaceFeedback` → `Ship.surfaceFeedback` → 本地Worker/LAN投影/固定显示lane；渲染只有 mode/level/progress，没有封舱WeakMap、parentShip规则或额外时钟。权威模块规则抽到 `GlorianaEdictState.ts`，原倍率、筛选条件和支付未改。
- `ShipSurfaceFeedbackRenderer` 使用既有船图的明度/金属色掩膜；材质/炮塔严格沿现有pivot和插值姿态。覆盖在舰体上、战损与武器下，残骸不携带此状态。GPU资源随渲染器重置/释放/上下文丢失释放；没有新纹理或每帧画布。

### 已验
- `npm run typecheck` 通过；改动文件oxlint通过。初次视觉复查偏暗，定向调整局部强度和封舱炮塔暗化后复查。
- `node scripts/check-gloriana-armory.mjs --feedback-only`：5组断言全部通过，包括左右接受输入锁定/阶段、父舰中断与舱段不可用、封舱真实扣费与独立倒计时/暂停/库存用尽、本地/LAN/固定lane清除复用记录、承座裁片不影响物理。
- 首次逻辑检查曾错误地把“本帧支付额”等同于“帧末硬幅能余额”：正常耗散导致4980≠5000。改为监听真实支付事件，未改游戏扣费/耗散规则。
- 真实应用模拟入口与Worker：左/右敕令只投影各自3炮廊；启动0.2秒强度0.25，ACTIVE=1，OUT样本≈0.583；移光标不换舷；实际vent指令取消后全部清除。真实冷却结束后可以切右舷重启。
- 13张生产WebGL帧：8张来自真实Worker，5张封舱来自生产Ship.update受控场景（人为设定低结构/幅能初始条件，不是自然战斗击伤，也不冒充Worker封舱）。13帧GL错误均0，页面/资源错误均0。
- 暂停后重新渲染，像素一致；ACTIVE阶段在炮廊区域（排除机群/尾焰）像素变化，证明流动不只是飞机运动造成；封舱含waiting/closing/held/releasing/ended。
- 已人工查看整舰左舷ACTIVE和P1封舱HELD帧：范围局部，封舱炮塔暗化，未见扩大圆罩、离体贴纸；最终审美仍待用户试玩，不宣称“完美”。

### 初次浏览器尝试的限制
第一次隔离冷启动显示“Local combat worker failed”，等待部署取消按钮超时；未取得更细堆栈，不把它归因于已修复问题。保留 `local-feedback/failure.png`。增加Worker错误采集后，同一真实UI/Worker流程连续两次通过（第二次含最终局部对比调整）；没有重启或停止用户5173/5174服务。冷启动偶发问题尚未独立定位。

### 产物
- `artifacts/gloriana/armory/verification-feedback.json`：5组当前断言结果。
- `artifacts/gloriana/armory/local-feedback/verification.json`：13帧时钟、phase、逐舱反馈、暂停/动画/vent回执与错误清单。
- 同目录 `worker-*.png`、`controlled-seal-*.png`；后一组明确为受控生产场景。
- `scripts/lib/gloriana-feedback-check.mjs` / `gloriana-feedback-visual-check.mjs`：复用既有军械脚本的定向入口。

### 仍未宣称
自然混战平衡、多人实机、大量并发性能、独立舰船包安装、本轮原版实机对比未验；未修改设计页为可交互战损预览。旧全量军械脚本仍有历史基线问题，不因定向验收通过而标全量绿。此轮无生图、无提交、无打包/发布，现有图像/模型许可判断不变。
