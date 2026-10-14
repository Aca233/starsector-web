# Rust 启动初态安装方案

目标是让已有配装进入 Rust 后使用与现有 Web 相同的武器/引擎维修计时器、CR 和有序 runtime modifiers，保持玩家开战、驾驶、维修及故障体验。本块仅闭合一次性初始化，不新增玩法、界面或存档字段。生产接线与可玩门槛继续采用 production-readiness-audit；本块通过不能证明整场可玩。

原版证据沿用本机 0.98a-RC8 和 `../decompiled/starfarer_api_source/com/fs/starfarer/api/impl/combat/CRPluginImpl.java:25` 的 CR/PPT、故障及装载接口。Web 的确切构造顺序来自 `src/engine/simulation/Ship.ts:512`：parent 武器、递归模块、parent 引擎、shield malfunction interval、ordered hullmod apply。`systems/EngineController.ts:59` 每引擎抽维修时长和检查间隔；`systems/ComponentHealth.ts:22` 保存 tracker。Rust 现有各域独立 constructor 会按不同域顺序抽 RNG，故不得直接使用其初态冒充对应源初态。原版实机及视觉没有本次许可与证据，仍待验证；界面不变。

一次性可信编译先取得真实纯数据初态，按 slot/generation 安装完整构造记录，最后 command104 核对 seed 并设置真实构造结束的两个随机游标。计时、资源和 tracker 均严格相等；不限定几何以外的舍入。Infinity 仅允许永久禁用武器的 disabledTimer 和 shield 未受击时钟，不能通用放宽。

安装在 tick/time=0 的私有候选内执行，每实体至多一次；完整组件/引擎数量、唯一身份、tracker 类型、CR、runtime source/field 顺序必须匹配。单批遗漏、重复、非法来源、过期 generation 或无穷非法字段使整批回滚，包括 RNG、初态完成标记与世界。后续生成直接走 Rust 真正 constructor，不能套用 sample tracker。runtime source 使用共享原逻辑的 canonical key（bulkheads、phase anchor），按原 Map 插入顺序装入；未知来源明确拒绝，不接受随机 hash 代替可删除的真实键。

联机客户机不接触安装命令；生产 kernel 在开战准入时使用，保留 epoch/revision 和取消销毁候选流程。恢复由相同 backend/build/content 的确认日志重放，不从画面导入状态，不改用户存档。

顺序：新增 typed startup-only wire、内容编译器消费、完整静态候选安装对照，再接常驻运行。集中验收真实七包配装所生成的初态、两 RNG witness 和重复/缺项/非法字段的零副作用拒绝；失败定向修正。本块无新增玩家取舍待决定。剩余 AI、flight、部署、权威和呈现由总方案追踪。

## 相位场景与同步伤害接线补充

沿用已经核实的 PhaseAnchor 方案及真实 `Ship.isPhased`、`PhaseAnchor.ts`、`ShipSystem` definition controls：每场只有一个相位场景，记录一次应急潜航资格、每舰监听器和所有已装系统的 phase/vulnerable/controls 元数据。118 创建场景，119 一次安装实际舰船 anchor 的 deployment CR cost，120 安装每个 allSystems 的 controls；最后 104 和首步核对完整元数据，遗漏或重复整批拒绝。不改变界面和玩法，不猜无证据系统属性。动态生成仍由原生构造器安装同样规则。

现有调试伤害入口26/31/37/40/47也必须借同一场景执行 armor overflow、直接结构和故障致命回调；相位监听器在结构写入前同步执行，资源/系统中断和事件跟随同一事务回滚。生产客户端仍只提交操作命令，不暴露这些调试伤害入口。验收在 shared Wasm 连续场景内观察实际致命拦截、CR pending、所有系统中断、模块 phased、无穷哨兵和失败零副作用；不能以事后HP回填替代同步规则。
