# 地雷进入共享权威的实施方案

继承aux-world方案及0.98a-RC8来源、用户完整可玩目标和数值合同。本块保持原有技能/装备/操作，不新增UI或登记已删除内容，不发布生涯、不使用桌面。真实Mine与Stealth独立对照已通过，现有shared world还未装入。

一次静态安装两实际MineSpec、每舰effective payload、Stealth变体和原installedHullMods中调用次数、travel slot资格。所有Bodies必须完整登记；未知或替换内容、stale generation、缺spec和重复安装整批拒绝。重复Stealth hullmod保留源逐mod调用；整个场只有一field source。状态原ship顺序，在每舰系统dispatch/舰装修复之后立即调用Stealth，world dt；不能先dispatch全部舰再一次推进。后武器阶段先aux私有爆炸再reverse mines，最后正常FX/死亡sweep。Ordnance唯一拥有position/velocity，生成/退役立即登记gravity，并从真实phase reader取潜航资格。源死亡保留binding与源身份，队列不被显示消费。

安装命令105初始化、106两雷spec、107舰payload/Stealth调用数、108travel slot、109具名mine deploy。109仅开发/真实系统事件共用服务入口，客户端玩家命令不能直接提交damage/spec或裸命令。暂停接受允许的deploy/输入边缘而不步进timers/RNG。命令和step均参与Bodies/Ordnance/world/Aux/RNG/events同一事务，失败回滚；只读tag21发布完整mine timers/field队列及私有blast witness，不冒充恢复codec。

验收用已实现真实Mine/Stealth连续场景，在共享core安装/step而不复制公式：单源双变体/重复调用、interception/退役、真伤害/统计/FX、生成RNG、pause与stale/未知无副作用。先接wire/runtime，等待共享phase服务，再集中一次build与Node/freshWorker；之后继续生产页七包正常游玩。本块无新增产品取舍。原版实机/UI未许可仍待核实。


## 共享原生内核集中验收（2026-10-09）

实际Node及新建无头Worker各6场495连续步，194424strict/14457geometry，最大差分别5.684341886080802e-14/2.2737367544323206e-13。真实部署/盾伤害/零flux源NaN/轻重共享Stealth/double实际hook均通过；941mine、12blast、255damage、50shield、300stealth、171light、84queue、6rollback、6startup覆盖。冻结sharedWasm1309556bytes SHA a0d50ef35840152131993771764991b34191966258741e502bb525395dcb7b70，result `artifacts/rust-combat-core-20261008/verification-p2-aux-runtime/result.json`。只闭合实际域共享运行，不声称production接入、wholebattleReady或性能提升。
