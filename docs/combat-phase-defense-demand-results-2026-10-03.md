# 原函数BODY实际fixedUpdate需求普查

仅fixedUpdate，150warm/120窗口，不含capture/memory外部读取。无时钟BODY计数不能换算毫秒。每步isPhased 21348.35次，phase direct 20456.19次，剩余allSystems 6044.66次；shipCollision相位读取9366、terrainStatus4162.92、wingsDrones2117.88。对象getter放在两层实体循环/parent递归是结构问题。

防御每步76次，每ship/tick恰好一次；4062.42条threat明细，仅360.46 imminent；77.2%调用无imminent。没有vent前重复评估，不能再作为大头。已注册callback不消费整表，但宿主仍需count和far存在/最早ETA，不能删far数学或伪造空数组。全部9120调用使用staged weapon frame，projectile index供给0；未知资格仍待研究，不可抬升旧native gate。

证据：artifacts/combat-phase-defense-demand-20261003/fixed-step-counts.json、result.json；consumer audit文档。原版/实机待核实；没有新ms根治结论。
