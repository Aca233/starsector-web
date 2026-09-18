# 联机射控：扫描内复用不可变武器提示（2026-09-18）

## 结论

用户当前优先级是解决联机卡顿/慢动作。本轮正式保留一项小范围射控优化，**32/100 舰真实双端仍未达到稳定实时运行，问题未解决、目标未完成**。没有改物理 dt、AI 频率、伤害规则、舰船/特效数量或恢复预算。3005（PID 18988）未关闭、替换或重启。

## 证据与改动

- 冻结基线：artifacts/lan-targeting-baseline-sources.json；最终源码快照：artifacts/lan-missile-pd-live-read-sources.json。使用冻结源码/独立构建，避免共享工作区后续改动污染对照。
- 百舰 600 步调用计数：hint('PD') 14,257,329 次，hint('PD_ONLY') 18,402,840 次。导弹列表循环反复对相同武器提示数组做 includes，是其中的主要来源；这不是网络包计数。
- 唯一正式代码改动：src/engine/ai/AutofireController.ts 的导弹候选扫描及 isImmutableMetadata 导入。只有原生批次、至少两枚候选弹体、来自注册元数据的深冻结提示数组可以复用 PD / PD_ONLY 分类。配装产生的 WeaponSpec 对象仍可变，因此不缓存整个 spec，也不跨扫描/跨帧缓存。
- 每一枚候选弹体仍按原来的短路顺序读取 live isPointDefense、第一次 aiHints、必要时第二次 aiHints。数组或 spec 被替换时按实际读到的数据查询；未受信提示/入口访问器回到原逻辑。候选顺序、诱饵规则、射击安全和索敌频率不变。
- 更快的早期候选把两次提示读取合并，虽通过普通场景差分，却在“扫描中安装动态访问器”检查出现 523 项差异。因此**没有保留早期版本**；不得把其约 7% 的整步结果当作最终交付收益。

## 最终安全版本验证

通过 stdin / 内存 Vite 模块执行，没有新增项目测试文件或测试运行器。

1. 14,000 项边界差分全部通过：500 seeds × 14 种模式 × 原生/回退两种入口。覆盖可变/冻结提示、自定义 includes、初始及扫描中替换的 spec/hints/PD 访问器、实时 PD 标志修改、诱饵 getter、空列表等；比较候选选择顺序及访问器调用日志。
2. 32/100 舰分别先新旧各预热 600 步，再新→旧→旧→新各 600 步；每 30 步的完整捕获投影与引擎 RNG 摘要一致。
3. 同一最终版本的整步计算均值（ms/步，不是显示 FPS）：

| 规模 | 旧版 | 新版 | 解释 |
| --- | ---: | ---: | --- |
| 32 舰 | 3.9360 | 4.0045 | 新版约慢 1.74%，不能宣称整步改善 |
| 100 舰 | 18.7722 | 17.8266 | 本轮均值减少约 5.04%，共享机器波动明显 |

局部 aim 强制索敌诊断：32 舰 282 炮座/169 弹体，每批 846 次调用，13.55→12.32ms；100 舰 813 炮座/395 弹体，每批 2439 次调用，92.37→88.02ms。诊断使用 dt=1 强制扫描，**生产索敌频率未改**。局部结果不能外推为联机容量或整体帧率收益；百舰整步单轮也有 15.91–19.74ms 的漂移。

4. npm run typecheck、npm run lint、隔离 Vite 生产构建均通过。构建仍有已有的大 chunk 提示。

## 最终生产双端

构建：artifacts/lan-missile-pd-live-read-preview，build ID 2026-09-18T07:14:33.989Z。两真人、守护者配装、其余锤头，固定 seed 2232494901，battleSize=3200 / initialDeploymentLimit=1600。独立临时服务与浏览器；测试结束关闭，未使用或干扰 3005 服务进程。

| 规模 | 观测时间 | 结果 |
| --- | ---: | --- |
| 8 舰 | 20.049s + 双人输入复核 | 测量窗约 0.982×，后段 Worker 时钟约 0.998×；0 恢复/错误；复核后 running、tick 1752 |
| 32 舰 | 20.056s | 约 0.956×，仍 running，但已恢复 2 次，不能视为稳定通过 |
| 32 舰延长复核 | 计划 65s，实际 15.724s | 第三次过载终止，服务端 tick 878 / Worker tick 890；证实短测存活不代表修复 |
| 100 舰 | 2.059s | 第三次过载终止，服务端 tick 43 / Worker tick 55；只有 4 张快照，并非快照洪泛 |

双人 W 输入都已核对权威状态而非仅看本地画面：房主按下 tick 1355 / ack 529 / throttle=1，释放 tick 1439 / throttle=0；客机按下 tick 1638 / ack 810 / throttle=1，释放 tick 1728 / throttle=0。最终双方 loaded，输入复核无恢复或页面/Worker错误。切窗后等待 HUD 可操作且获得焦点；按键复核的完整二进制解码放在性能测量窗之外。

下一步仍需降低房主整步战斗计算耗时；不能把局部分类优化、较高显示 FPS、一次短测存活或放宽过载保护当作解决方案。已有多核 AI 路径仅支持受限单机原生 Onslaught 场景，不能直接声称已适用于这些混合舰船的联机权威端。

## 原始记录

- artifacts/lan-targeting-call-counts.json
- artifacts/lan-missile-pd-early-candidate-risk.json（早期候选反例）
- artifacts/lan-missile-pd-live-read-boundaries.json
- artifacts/lan-missile-pd-live-read-differential.json
- artifacts/lan-missile-pd-live-read-final.json
- artifacts/lan-missile-pd-32-long.json

更早候选的 lan-missile-pd-differential / warmed-differential / whole-warmed-32 / live-final 文件只是调查过程，不是最终交付版本的验证结论。
