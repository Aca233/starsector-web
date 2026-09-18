# 零幅能掩护开火实验（2026-09-18）

**REJECTED AT DEVELOPMENT / NOT_DEPLOYED**。正式AutofireController从未修改，RL仍关闭。

候选只在原DEFENSIVE_HOLD条件中豁免严格零基础幅能消耗武器：非光束用fluxPerShot，光束用fluxPerSecond（缺省0，沿用原成本逻辑）。正/负/非有限/缺失非光束成本仍停火。原瞄准、射界、障碍/友舰、弹药、系统、过载/排散、最终幅能检查全部保留，不改舰船撤退和防御。

6个开发编队种子1601、60秒，原AI旁路探测到轻型/突击/三舰/五舰分别795/304/255/212次可安全开火却被DEFENSIVE_HOLD挡下的ready武器评估；驱逐/巡洋为0。主要是heatseeker与sabotpod。候选decide使用克隆ammoAllowed状态后恢复原tracker和fireControl引用；每场探测/原样完整summary一致。这些是相关帧级机会次数，不是独立战力样本。诊断JSON中ammo:null代表原Infinity（无限弹药），不是缺弹。

轻型局共同原AI前缀到9秒，之后仅team1采用候选：Lasher实际零幅能发射1→2发，持禁火标志时发射0→2发，直接命中1→2次，护盾幅能17.5→42.5；两分支均没有这些直接命中的船体/装甲伤害，整场仍然落败（69.93→85.23秒）。每次发射前后幅能值相等；探针/原样与全旧/基线完整summary一致。不能把多撑几秒或多发射当增强。

48场开发对打（6编队×4既有种子×两边、90秒）：**6胜6负36超时，计分50%**。轻型43.75%、驱逐50%、突击50%、三舰56.25%、五舰43.75%、巡洋56.25%。没有正向整场信号，开发阶段拒绝，不追加独立验证或调参。10项候选合同+24项基础AI+12项撤退检查通过，仅证明所测规则合同。

证据：artifacts/ai/zero-flux-cover-fire-2026-09-18/下isolation.json、diagnosis.json、branch.json、development.json、decision.json。无可撤回的生产改动。
