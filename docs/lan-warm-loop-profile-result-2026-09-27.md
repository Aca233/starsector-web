# 热身后完整模拟CPU采样结果（2026-09-27）

## 结论与状态
在连续两轮缓存候选未通过整步门槛后，对**已恢复的726模块基底**进行一次热身后采样，未再次运行ABBA。没有新的生产改动、浏览器验收或联机延迟改善宣称。此前只凭短冷启动和调用量优先盯系统列表的方向需要调整：这个热负载中allSystems self仅约1.92%，GC约1.84%，并非吞掉大部分CPU；单独减少列表/资格调用可用的总收益有限。

## 负载、证据与限制
同一真实2玩家+20AI三舰循环、seed917、3200DP、四既有实验开启；初始176实体、734挂点。150完整步热身后，Node内置inspector对120完整fixedUpdate采样一次。请求500us间隔，实际4624样本、timeDeltas合计4892.380ms，平均样本delta约1058.0us，不能把请求间隔当实际采样频率。
热身点176实体/734挂点、40弹体/7光束；终点171活跃实体/724挂点、101弹体/9光束。数量不单独用于推断战损。
270步完整authority+隐藏tracker/RNG hash与既有未profile A0完全相同：bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6。

表中百分比使用全部样本timeDeltas为分母，含inspector自身约1.99%；不是CPU占用率、浏览器稳态Hz/FPS或输入P95，也不能与未profile耗时算收益。函数inclusive桶彼此包含，**不得相加**。self按采样叶节点归属，不重叠。模块标签来自esbuild注释，精确位置保留bundle行号，不冒充TS源码行号。有限采样与JIT内联仍可能影响归因。

## 主要成本
| 位置 | self ms | self占比 | inclusive ms | inclusive占比 |
|---|---:|---:|---:|---:|
| 根舰/模块AI | 166.282 | 3.40% | 1626.299 | 33.24% |
| 武器控制 | 169.083 | 3.46% | 1583.256 | 32.36% |
| 正式瞄准 | 53.123 | 1.09% | 703.367 | 14.38% |
| 预瞄 | 212.953 | 4.35% | 518.985 | 10.61% |
| 威胁评估 | 224.103 | 4.58% | 679.003 | 13.88% |
| 导航障碍扫描 | 123.524 | 2.52% | 393.480 | 8.04% |
| 属性合成 | 195.001 | 3.99% | 195.001 | 3.99% |
| 系统列表getter | 93.912 | 1.92% | 93.912 | 1.92% |
| exact资格getter | 85.774 | 1.75% | 134.705 | 2.75% |

GC 89.883ms / 1.84%。因此不能把对象池或更高占用率当成当前能带来巨大收益的已证方案；这也不证明其它工况不受GC影响。

## 从既有样本提取调用链（没有重跑）
主要aim→武器控制→Ship.update→fixedUpdate为13.67%，同链preAim为10.30%。属性合成的重要来源是prepareAimQuery内射程/弹速准备：ShipSystem.modifiers经getProjectileSpeedPercent约1.66%、经getWeaponRangePercent约1.30%，这些与aim inclusive及combine自身重叠，不能累计。
advanceGlorianaCraft总体inclusive约9.54%，但样本中其子调用aim/preAim远小于普通根舰/模块路径，不应仅凭该函数总量就断言战机火控是首要问题。

## 下一步决策
不原样复活已否决的相位缓存、资格缓存、预瞄空间索引或导航索引；不靠降低60Hz、精度、实体或跳过校验提速。优先审计**完整aim/preAim调用的数据准备与候选求解通路**：范围/弹速是否能在明确只读的同一扫描中一次准备，以及如何让私有Worker的数据边界消除重复适配而不为每个目标新增Map/反射认证开销。未知回调、修改/发射边界、当前目标优先、tie-break和RNG仍必须保留。
这是下一阶段方向，不是已实现收益。本轮目标仍active；浏览器开场过载尚未得到新验证或解决。

## 工件
artifacts/lan-warm-loop-profile-20260927/loop.cpuprofile、result.json、caller-contexts.json、profile.mjs、summarize-callers.mjs、run.log、exit.json。冻结bundle SHA 7327e125ea40151f0bfd2a6b487fd9898dfbc54906e4a020c6709f09aa99187d；原始profile SHA 6fb08f55ee524fbb12517e180c5ee56a2f14188ad33422c7d9b03391c8c845ce。
