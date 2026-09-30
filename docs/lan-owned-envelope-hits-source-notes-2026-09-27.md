# 私有交错包络命中资格复用：实施前（2026-09-27）

## 来源与当前差异
再次核实本机0.98a-RC8的Ship.java:5006实时相位以及ShipAPI.java:91–93系统API。保持Web实时读语义、模块/载机依赖、目标顺序和现有模拟结果，不改UI、不做桌面/原版实机验证。
已保留WeaponThreatEnvelope在每次get命中前重新调用hasExactThreatPhaseHooks（逐项系统、伤害/相位及舰装读者审核）。forOwnedInterleavedPhase已经审核全名单所有读者和写入范围，并在模块AI后、ship.update后失效parent/sourceCarrier整组。只有本舰连通组可能被该writer修改。重复命中未变化组时，既有缓存的资格证明仍然有效。

## 与已否决候选不同的边界
不新增相位boolean缓存、不建新的Map/列表/空间索引、不接通旧owned-phase读取；只对已有envelopes Map命中消除冗余资格遍历。显式VITE_AI_OWNED_ENVELOPE_HITS默认关闭，并要求已有private Worker owned-interleaved writer认证。
新增beginOwnedWrite/endOwnedWrite记录当前正在写的已有依赖组。仅active、原生Vector2.set身份未变、有明确当前writer、来源不在writer组、并且已有已审核缓存命中时可直接复用。
- 当前writer及其父舰/载机同组，仍跑原资格检查；miss、普通构造、exact-AI-only、未开始/已结束写段均保持原顺序（先许可再Map），包括许可getter触发invalidate/抛错的兼容语义。
- Engine只有在现行写入资格确认后开始标记；模块AI和ship.update后的现有整组失效保持不变，结束清除标记。资格丢失close、异常finally close、未知writer/重复begin均不能留下许可。
- 不允许跨步/发射后阶段保留，不修改资格白名单，不放松unknown effect/插件回退。Worker只接structured-clone数据，不声称可防任意同realm原型篡改。

## 固定验收
两生产文件写集Ship.ts不变，只改WeaponThreatEnvelope.ts与CombatEngine.ts，实施前逐字节备份；同一726模块基底。
完整实现后一次typecheck、改动lint、集中合同：真实init/reinit/default176实体734挂点；明确当前writer和组外命中减少审计；父舰/载机组及失效；未授权工厂/未知/重复writer拒绝；原许可回调顺序、失效、异常和Vector2.set身份回退；20步源码内计数+完整终态；既有60完整fixedUpdate权威和隐藏tracker/RNG逐步一致，技能/近距开火/排散/封舱不減。
只在行为通过后首次且唯一独立隐藏Node A0/B1/B2/A3，每臂150热身+120完整计时步，2玩家+20AI、三舰循环seed917/3200DP，原四实验两边均true。本候选两组分别至少省3%且完整终态一致才保留，不以调用数代替收益、不择优重跑或降门槛。离线失败核对SHA后精确撤回两文件；通过才跑既有真实双无头浏览器176实体功能场景。仍过载则不宣称Hz/P95改善，实验默认关闭。不暂存、提交、推送、打包或发布。

最终：typecheck/lint及五行为合同一次通过；唯一ABBA两组0.7479%/-0.0309%未达门槛，两个生产文件精确撤回，全部726基底模块一致，不跑浏览器。
