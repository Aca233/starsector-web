# 混编 JIT 诊断结果（2026-09-27）

只运行一次隐藏Node trace（270完整固定步，150冷段+120后段），不是ABBA或性能收益验收。当前740模块、上轮before bundle及18个外部依赖hash预检通过；20/270步完整authority+隐藏tracker/RNG分别为既定 bc891a0…224 / bf519eed…d6，末态171实体。源码和1个实际读取资产无漂移。没有生产修改或浏览器运行。

## 有效统计与解析修复
PowerShell合并V8原生日志与JS console时，stage/tick标记可能插在一行中间。第一次临时控制台统计只匹配行首，误把最终capture的反优化计入warm；**该临时输出无效**。没有重跑进程。正式analyze.mjs在任意位置识别标记，去除嵌入标记后恢复V8行，断言全部270个tick顺序和4个stage完整；以source map映射原源码，按SFI区分同名update。
正式计数：preflight2、init19、cold583、witness20为6、warm185、witness270为11，共806。合并流的输出顺序不是严格CPU时间线；逐tick归属仅作诊断，另列170–250内部窗口避开边界，不用此计数推算时间/收益。

## 证据改变下一步
- warm185中122个wrong map、19个not a Smi，另有首次类型反馈、lazy deopt等；递归lazy栈可来自一次失效，不能当185次独立根因。
- 内部170–250窗口有68条、47个SFI；不是单一函数每步持续去优化。advanceWeaponLifecycle其中5条；yieldFireLane3条；若干碰撞/首次开火路径补充类型反馈。
- fixedUpdate后段5条not a Smi均指向CombatEngine.ts:963的hullHp<=0，出现在战斗首次造成伤害阶段附近。
- ShipWeaponControlSystem的update/advanceWeaponLifecycle有计时器、散布、健康值读取点的wrong map；构造时大量可变小数槽初始化为整数0，首次射击/伤害才写小数。这是布局候选的线索，**尚未证明这些map事件全部由字段数值表示变化引起**，也没有证明为主要耗时。
- modifiers、combineSystemModifiers、getWeaponRangePercent、getProjectileSpeedPercent、prepareAimQuery在warm段记录到0条。不能以JIT解释之前属性共享候选的净负收益，更不恢复它们。

下一候选限于对象尚未发布时的数值槽初始化：不增加/删除字段、不改最终值或属性枚举顺序，不动系统属性共享、AI Hz和玩法。构造期试验本身另备份/预登记，只有完整状态和端到端计时过关才保留。Node结果不代替浏览器JIT或联机延迟。

证据：artifacts/lan-authored-jit-diagnosis-20260927/{preflight.json,result.json,trace-once.log,deoptimization-analysis.json,runner.mjs,analyze.mjs}；trace-once.exit=0，进程已结束。没有测试服务遗留。
