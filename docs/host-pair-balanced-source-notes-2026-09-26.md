# Host基准三臂顺序平衡：修改前方案与范围（2026-09-26）

## 来源

先完成fleet-cover-scalars门槛验收与精确回退，再做独立同图旧方法A/A；顺序修订前的证据和方案已写入host-pair-aa-source-notes-2026-09-26.md及host-pair-aa-performance-2026-09-26.md，method-gate.json在实现前保存。本文件汇集该方案，不改写先前门槛。

## 确定的缺陷与边界

旧三臂serial/before/after只正反交替，before始终处于中间。一次相同320模块、21个相同构建文件的A/A仍有after/before编码+3.968%、交付+0.966%；不证明顺序是唯一原因，不反推历史候选效果。

本块只修改benchmark-real-workers.mjs并增加benchmark-arm-order.mjs，未改生产逻辑或Worker/Host计时代码。没有新玩法/UI或原版行为移植；原版实机不操作。

## 实现约束

- 三臂balanced策略：六种排列，每周期每臂在首中尾各两次，每种有向相邻关系出现两次。
- 两臂仍为原先逐tick正反交替；--order-policy legacy保留旧三臂顺序，--reverse-order在两种策略均有确定含义。
- 计时外记录每份测量样本的实际executionPosition；最终与按warm/steps推导的计划位置计数严格核验。
- 输出executionOrder包含方法版本2、策略、完整周期、实际位置次数、初始化次序和版本归属。非整周期不丢样本，明确记录残留不平衡。
- 不改完整权威/隐藏火控/RNG/witness/packet/显示/Host地图与部署对照，不更改计时边界、预热、采样或实体数。
- 初始化次序与模块共享布局仍保持旧行为；实例/JIT/GC/系统调度差异未被此补丁完全控制，结果须披露。

## 验证节奏

调度合同已检查392个不同窗口、1980个legacy/两臂逐tick精确顺序、六排列/相邻关系平衡以及输入不变性/非法参数。两处修改完成后集中一次typecheck、两文件lint、node语法检查，再运行唯一一次同图balanced A/A现有完整Host场景。只修脚本，不另建测试工程；不重复舰队候选，不重测择优。

工具修改过程中一处文本替换锚点不唯一触发assert，在write之前退出；随后收窄锚点完成。没有半写runner、没有失败的性能样本。

## 最终结论

方法结构门槛通过并保留。实测每臂首/中/尾60次，320模块/21个bundle与旧控制相同，完整oracle通过。但同图仍有模拟−4.167%、交付−2.428%的差异，甚至满足旧单次性能门槛；故不能把单次小幅差异当成已证实收益。未新增生产候选，未重测择优。详见host-pair-balanced-performance-2026-09-26.md。
