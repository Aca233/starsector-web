# Phase43：原生字段投影循环专用化（实施前）

上一轮为进展：Phase42 排除无收益候选、补全 Worker 构建来源和最新编译版五人验收。本轮重新读取当前 CombatSnapshot / host.worker、Phase39 原生 Worker profile、Phase40/42 负例以及此前动态射程缓存负例；不重复那个已否决的射程缓存方案。

## 原版边界

重新查看本机 0.98a `decompiled/starfarer.api/com/fs/starfarer/api/combat/ArmorGridAPI.java:10–35`，逐格读写/getGrid 独立存在；仍保留所有格子、数值精度、顺序和物理步。本轮只调整私有 native 捕获时的代码执行形式，不改变画面、玩法或网络合同；没有原版实机 UI 比对（桌面操作被禁止），不冒充原版网络算法。

## 与失败的固定读取实验有什么不同

Phase40只替换了Object.values取值，后面的通用投影循环未变。本候选**保留Object.keys校验和Object.values原顺序读取**，为真实观察到的 `(raw keys, projection)` 生成有限静态投影函数：把通用循环的 raw 索引、字段名、递归 projection 固定在调用点。保留函数字段过滤、标量类型判断、嵌套递归和同序写入。不是 runtime eval；不缓存数据或跳过原生对象的最新形状验证。未知布局走旧循环。

共同的捕获级递归闭包避免每个对象另分配闭包；seen只在一次同步捕获内共用，顶层调用前后为空。必须验证循环、getter/Proxy普通路径、抛错、function/value转换、形状/顺序增删、投影分支和源对象/旧快照所有权。

## 门槛和范围

候选先只写实验目录/测试生成器，不改生产模块。正确性逐帧完整wire/JSON及恢复后世界比对；Chromium 3/5顺序副本同轨迹A/B和B/A，至少180测量tick，完整capture+encode+decode+apply每组P50≤0.95、P95≤1.10，生产端P50≤0.85，字节不增。通过后再Node压缩/增量与真正多人验收；不通过则不启用，不调整门槛追求通过。保持60Hz目标、恢复窗口、超时和保护；不碰生涯、不用子代理、不占用用户桌面、不发布。
