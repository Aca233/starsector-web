# 可分可合联机生涯：代码接入与实现方案

> 最新实现为 reference.cooperative **0.5.0**：新增原版来源的开放空间航行、控制/所有权分离与19项测试，累计97项。下文阶段性数字/缺口保留历史语境；最新边界以 [航行进度](campaign-travel-progress-2026-09-19.md) 和 [实现账本](campaign-implementation-progress-2026-09-19.md) 为准，生涯尚不可完整游玩。

> 本文保留早期设计/探针记录，不代表当前功能已全部完成。后续实现已到 `reference.cooperative` 0.4.0、数据库 schema 2、78 项运行测试；包括统一世界时钟和 Worker 调度，但尚无可玩的生涯。最新状态见 [实现账本](campaign-implementation-progress-2026-09-19.md) 和 [统一模拟进度](campaign-simulation-progress-2026-09-19.md)。

日期：2026-09-19。基于当前工作区源码的实现设计，承接 `campaign-multiplayer-exploration-2026-09-19.md`。本轮仅调研、内存技术探针和文档，不是功能已实现。

**最新设计基线：默认生涯尽量还原指定版本原版，结构支持替换规则和大改。见 [原版优先的生涯规则集架构](campaign-ruleset-architecture-2026-09-19.md)。下文“小场景/简化模型”只表示验证范围或实验夹具，不授权将自创简化规则作为正式默认；遇到冲突以该准则为先。**

## 1. 实现决定

目标：玩家在同一个世界内各自活动；可以汇合、结伴、共同出击；战后可以分开。临时合作不改变舰船所有权。

**采用“一条常驻世界连接 + 一条按需战斗连接”；一个世界服务容纳多场遭遇，每场先复用一个现有 LAN 房间。**不是每个玩家维护自己的世界存档再做合并，也不把整个生涯塞进现有单机 GameSession。

首个切片只允许每位玩家同时参加一场战斗、每台参战客户端最多承担一场权威模拟；两场同时发生时，分别选择其中一位参与者计算。世界主机、队长、战斗计算主机是三个不同角色。初期保留“每场计算主机分配为该场 seat 0”，减少对现有输入/快照代码的改动；seat 0 不代表整个世界的拥有者。

## 2. 源码检查发现的具体接缝

以下行号是本次检查时的位置，后续并行修改可能移动；以函数名为准。

| 位置 | 当前约束 | 实现需要 |
| --- | --- | --- |
| `server/lan-server.mjs:58,274,299,596,639` | rooms 是集合，但每个 peer 只有 p.room；房主离开关闭该房间；创建最多 16 房 | 世界连接独立；每个 encounter 绑定单独 room；关闭战斗房不删除世界身份 |
| `src/network/LanBattle.tsx:167,443`；`LanWorld.ts:30` | seat 0 创建 Worker，必须对应 match.hostId | 由世界协调器选择本场参与者为计算主机，再分配 seat；先不实现旁观者/无席位主机 |
| `src/network/LanWorld.ts:24` | 战斗名册由真人旗舰 + 各队 AI 模板展开，没有资产归属 | 引入冻结的逐舰参战清单，真人/AI 舰船都保留 durable member ID 和 owner 映射 |
| `src/network/host.worker.ts:353–364` | 部署按 team 授权；撤退仅额外阻止操作其他真人舰船 | 同队不等于所有权，增加 own-member / 显式授权检查，覆盖队友 AI 舰船 |
| `src/network/CaptureBattleReport.ts:5` | 是展示战报，不含完整持久状态 | 新增独立 EncounterOutcome，不能拿最后一帧展示数据直接结算 |
| `src/engine/game/CombatHandoff.ts:15,70,118` | 已有持久状态捕获/应用、预备舰保留；依赖单机 Session | 提取可复用的 condition 捕获/应用，不把 GameSession 放进 LAN Worker |
| `src/network/LanDesign.ts:30`；`src/studio/DesignModel.ts:99,366` | 编译 spec 改成临时 ID；完整 Design 的字段多于 FleetMember | 保存规范化 Design/loadout 与基础 hullId，结算只回写 condition，不从临时 spec 反推完整设计 |
| `src/engine/simulation/CombatDeployment.ts:30,63` | configure 只允许战前；快照要求固定部署名册长度 | “已有后备舰部署”不是新玩家/新舰热加入；战中增援要单独扩展 roster 协议 |
| `server/steam/gateway.mjs:223,251,255,299` | 一个大厅发布一个 room code；只接受一个 renderer 连接；只有大厅拥有者 canHost | LAN 的双连接/多房间方案不能直接套 Steam，需逻辑通道复用与多 encounter 路由 |
| `scripts/package-electron.mjs:39–51`；`package-windows.mjs:46–57` | 后端依赖图只允许 .mjs/.js/.json，并校验依赖包白名单 | Node 后端不能直接 import 新建的 .ts 文件；新增 Worker、数据库及规则模块要进入完整安装包 |

现有协议 v25 和自由对战房保持兼容边界；生涯能力单独协商。新增字段/消息最终如果改变共用 LAN wire，必须相应升级协议/build 握手，不能悄悄让旧端接入。

## 3. 模块切分及建议文件

沿用项目已有 `.mjs + .d.mts` 的共享协议模式，让 Node 可直接执行纯领域代码、前端仍有类型；不要先把复杂 GameSession/DesignModel 浏览器依赖图整体搬进服务器。

| 拟新增模块 | 职责 |
| --- | --- |
| `src/campaign/domain/State.mjs` + `.d.mts` | players / fleets / parties / encounters 的数据合同 |
| `src/campaign/domain/Commands.mjs` + `.d.mts` | 纯命令验证与状态变化计划；无 DOM、存储或实时 Ship |
| `src/campaign/domain/Loadout.mjs` + `.d.mts` | 规范化配装、内容兼容与可持久化数据校验 |
| `server/campaign/CampaignWorker.mjs` | Node worker_threads 内的唯一世界写入者、世界时钟及命令队列 |
| `server/campaign/Repository.mjs` | SQLite 事务、局部版本、资产锁、回执、恢复；数据库只由该 Worker 写入 |
| `server/campaign/CampaignGateway.mjs` | 世界 WebSocket 认证、边界校验、限流、事件订阅，桥接 CampaignWorker |
| `server/campaign/EncounterCoordinator.mjs` | 遭遇准备、邀请、参战名单冻结、每场计算主机、战斗房 admission |
| `src/campaign/network/CampaignConnection.ts` | 常驻世界连接、requestId 重试、事件游标、快照恢复 |
| `src/campaign/combat/CampaignCombatAdapter.ts` | 冻结名册 ↔ 战斗实例映射、战前 condition 恢复、战后 condition 捕获 |
| `src/campaign/CampaignApp.tsx` | 小星区/玩家列表/邀请/港口；切换战斗视图但不卸载世界连接 |

以上文件是建议写入范围，本轮没有创建这些实现。

既有文件的改动顺序：

1. 从 CombatHandoff 提取保持行为不变的 condition 工具；给原单机流程补往返回归，不改其存档 schema。
2. 从 lan-server 的建房/入房/开局/结束逻辑提取受控的 RoomService 接口，原消息处理器继续调用它。不通过已暴露的 rooms Map 直接拼装对象，避免绕开计时器、加载握手和 presence 规则。
3. 为 createLanServer 增加可选 campaign 接入，路由 `/campaign/ws`；保留现有 Host/Origin 验证。现有 extension 已用于 Steam/DesktopLAN，不能用新对象直接覆盖它；应增加独立命名 hook 或明确组合分发。
4. 在 LanWorld、host.worker、LanBattle 加受控的 campaign 模式分支/适配接口，默认自由对战路径不变；同一个 builder 必须用于计算主机与显示端，避免 entity ID/名册排序不一致。
5. 添加独立开发入口 `?view=campaign`，先不替换主菜单和默认 LAN 流程。完成验证后再接正式入口。
6. 更新桌面服务启动、存档目录传递和打包检查，最后再改 Steam 路由。

打包补充：以 `new Worker(new URL(...))` 启动的 Node Worker 不应假定会被当前 esbuild 依赖扫描自动收集；将其作为额外 entryPoint 或显式受控复制项，并在无源码安装环境验证。当前 tsconfig.node 只包含 vite.config.ts；新增共享领域的类型/JS 检查也要单独接入，不能仅凭既有 typecheck 通过宣称后端已检查。

SQLite 同步调用不能直接放在当前 60Hz 快照中转事件循环里；置于独立 Node Worker，主线程仅转发命令与结果。Worker 的成功回执必须发生在数据库 COMMIT 之后，不能把“已投递到 Worker”当成已保存。

## 4. 最小数据结构

以下为合同草图，不是可直接拷贝的完整实现；ID 字段实际应有有界字符串和 schema 校验。

```ts
type OwnerRef = { kind: 'player' | 'faction'; id: string };
interface CampaignFleet {
  id: string;
  owner: OwnerRef;
  version: number;
  location: { systemId: string; x: number; y: number };
  memberIds: string[];
  partyId: string | null;
  encounterId: string | null;
}
interface CampaignMember {
  id: string;
  fleetId: string;
  owner: OwnerRef; // 编入/借驾不转移资产所有权
  version: number;
  loadout: PersistentLoadout; // 基础 hullId + 完整配装，不是 lan-player-N
  condition: ShipCondition;  // hull/CR/armor/ammo；模块另有层级约束
}
interface EncounterManifest {
  campaignId: string;
  encounterId: string;
  battleAttempt: number;
  rosterRevision: number;
  computeHostPlayerId: string;
  seed: number;
  contentFingerprint: string;
  roster: Array<{
    memberId: string;
    owner: OwnerRef | null; // NPC 可归属势力；无主实体另行处理
    controllerPlayerId: string | null;
    teamId: number;
    spawnIndex: number;
    memberVersion: number;
    loadout: PersistentLoadout;
    condition: ShipCondition;
    initiallyDeployed: boolean;
  }>;
}
interface EncounterOutcome {
  encounterId: string;
  battleAttempt: number;
  rosterRevision: number;
  manifestDigest: string;
  terminalTick: number;
  reason: 'victory' | 'defeat' | 'draw' | 'retreat';
  members: Array<{ memberId: string; status: DeploymentStatus; condition: ShipCondition }>;
}
```

要点：

- owner 不等于 controller；team 不等于 party；party 不等于 encounter。玩家、势力、殖民地、市场与管理授权分别建模，默认公式由原版基准规则集提供。NPC 和没有真人驾驶的自有舰都必须在名册中。
- 存档保存权威端已经批准的配装原文；战果不允许修改 owner/loadout，不带客户端计算的 credits/rewards。
- 现有 ShipSpec 有 sourceHullId 可作校验辅助，但长期身份仍以入场合同为准；不能依靠运行时临时注册名的命名规律。
- 捕获 CR 统一使用持久结算口径；预备舰 condition 保持战前值。召唤/临时战机不生成永久资产。
- PersistentLoadout 覆盖基础舰体、武器槽位、插件、S-mod、幅能、系统、联队槽位和分组。模块往返未验证前，原型明确排除模块舰，不静默降级。
- 从 DesignModel 抽出的共享规则要同时服务设计器和服务器校验，避免维护两套 OP/槽位/内置装备规则。库存、解锁、预算在服务器另验；UI 可通过的自由设计不意味着生涯中买得起。

## 5. 世界命令与加入过程

建议最小命令：

- `fleet.travel`、`fleet.stop`
- `party.invite`、`party.accept`、`party.leave`
- `encounter.join`、`encounter.ready`、`encounter.start`
- `market.trade`、`fleet.repair`（先限制场景和内容，正式默认按经核验的原版规则）
- `campaign.resume` / `campaign.snapshot`（恢复，不是客户端覆盖存档）

每条修改命令带 requestId、campaignId、authorityEpoch、相关对象 expectedVersions。actor 来自认证会话，不能由正文任选。去重记录绑定 actor 与 payload 摘要；同 requestId 不同正文拒绝。全局 revision 用于订阅事件序列，局部版本用于并发冲突，不能让 B 的交易使 A 的合法战果失效。

### A 与 B 联合作战

1. A/B 的世界连接一直存在；同地点结伴可共享航线，但账本不合并。
2. A 的遭遇形成，服务停下并锁住 A 的参战舰队。B 请求加入时，服务检查邀请权限、位置/距离、舰队可用、内容及 DP；在同一事务中加入 B 并锁住其资产。
3. 锁定后不能再交易/维修参战资产；未参与者继续活动。邀请/加载必须有期限及明确取消规则，不能无限停留在无风险准备状态。
4. 全员就绪，持久化 manifest/seed/attempt，选本场计算主机，创建 managed battle room，发出短期 admission ticket。
5. ticket 绑定世界、遭遇、attempt、身份、角色/seat、build，并由服务校验、单次消费；重连通过世界身份重新授权，不重复使用入场票。不用 URL 明文或日志记录持久凭据。
6. 客户端按 ticket 连接战斗通道，世界通道继续保留。配装、AI、阵营、DP 来自已冻结 manifest，不能接受客户端再 configure 一个免费满血舰队。
7. 战斗完成进入“正在保存战果”，可靠提交 Outcome；直到 `encounter.committed` 才回到可操作世界。收到 legacy `ended` 不能直接当作持久成功。
8. 写回每人自己的舰队、分配已约定的奖励；之后可以 `party.leave`，从当前位置继续各自航行。

managed room 必须在后端限制 configure/options/ai/team/kick/end 等自由房主权力；生涯计算主机不能凭现有房主权限随意改资产或删除别人。保留驾驶输入及已授权部署/撤退；“结束本局”改为对应的撤退/恢复申请，不能造出胜利结果。用户退房和网络掉线不删除 CampaignPlayer 或舰船。

## 6. 权限与结算的关键实现

### 部署权限

`host.worker` 不能只调用 `engine.deployment.deploy(ids, ship.teamId)` 就放行。建议共享一个权威授权判断：

```text
认证 playerId → 当前 encounter / attempt → 可操控 memberId 集合
请求 entityIds → 本场 bindings 映射 memberIds
逐项检查所有权或显式授权 → 检查所属战斗和部署规则 → 执行
```

服务中转层与 Worker 都按冻结的授权集合校验；主机本机操作也不能跳过。无授权的队友 AI 舰船同样拒绝。世界拥有者不自动获得战斗中出售/改装别人舰船的权力。

### 单场提交（伪代码）

```text
BEGIN
  查询 encounter 的已提交回执；相同结果重试返回原回执
  验证当前 computeHost、epoch、attempt、rosterRevision、manifestDigest
  验证该场仍持有全部参战资产锁，逐舰状态完整且合法
  依据已批准 manifest 与 Outcome 更新本场 members.condition
  按服务器任务/奖励规则发奖；共享任务另验领取资格
  写入 encounter=committed、不可重复兑现的结果记录和 outbox 事件
  释放本场资产锁；递增相关版本和世界事件 revision
COMMIT
  广播提交回执；广播失败可通过 outbox / 快照恢复
```

不把战前整个 GameState 覆盖回世界；只提交本场拥有的写集合。旧 attempt 不能提交；无回执但 Worker 已死亡只能恢复本场战前资产，不能回滚 B 在此期间的交易或另一场战果。战斗重试保留遭遇身份，换 attempt 不新发一次任务奖励。

当前单机 settleCombat 可参考但不可直接充当多场事务：它只有一个 pendingCombat，且本地保存失败允许仅内存继续。

### 存档目录和恢复

数据库放在应用数据目录，不写 Program Files、dist、安装包或原版 saves。Electron 主进程通过现有 DesktopBackend 启动参数传入受控的数据目录；浏览器客户端不能指定任意路径。便携版采用明确的用户数据目录/启动配置。

进程启动恢复已提交世界与未完成 encounters；逐场标记恢复待处理。数据库事务不能修复尚未落盘的战果。世界位置/时间的检查点频率还需实测：不可逆命令确认前必须持久化其依赖状态；未确认的移动展示不能当成已保存进度，不能用墙上时间在离线期间自动扣资源。

## 7. 战中加入为何另做，以及怎么做

当前 `CombatDeployment.configure` 只允许战前建立固定集合，显示端也要求快照行数不变；初始创建出的真人控制表固定。因此不能仅允许 running 房间 join 就算完成增援。

需要新增的一条可靠变更链：

1. 世界服务验证增援舰队到达、资产未锁、申请在窗口内；保存加入准备记录。
2. 各端预载新增内容；不修改已在运行的名册。超时可取消本次加入并按规则释放新增锁。
3. 计算主机确认安全的固定步边界，服务提交新的 rosterRevision，可靠下发名单补丁与指定生效 tick。
4. Worker 在该边界注册船只/控制者/部署条目；产生包含新名册的完整同步基线。显示端先应用相同名册，再消费该版本快照，旧名册快照不得混用。
5. 新玩家完成首帧与 controls-ready 握手后才接受输入；在此之前不让不存在/未同步的舰船被操控。
6. 结束结算覆盖所有已正式加入者。加入与战斗结束竞争时，由权威状态转换决定谁先发生；未正式生效的增援退回世界，不能拿到本场战利品。

还需为“名册已提交但 Worker 未应用就崩溃”定义恢复：保留原始战前检查点与增援事件，不把中途状态当作新的完整战斗存档；首轮可在恢复待处理界面重新组成遭遇，但不能自动复制已锁舰船。具体增援时间重放/重新开战语义需单独验收。

## 8. Steam 不是改地址即可

LAN 可保留两个 WebSocket；当前 SteamGateway 只有一个 renderer 连接。建议后续在一个物理通道里复用：

```text
channel=campaign                世界命令 / 邀请 / 持久回执
channel=battle, encounterId=...  输入 / 战斗控制 / 状态
```

需要同步改网关大厅元数据：大厅标识 campaign，不再由任意一场 roomChanged 覆盖唯一 code/status；某场战斗开始也不能把整个世界大厅误设为不可加入。世界拥有者继续做可信协调/中转，其他参与者可经 managed admission 成为单场 computeHost，而不是放开普通 client create 的 canHost 校验。

低频可靠事务消息与大体积可替换状态需有独立队列预算/公平调度；逻辑 channel 不会自动消除现有可靠底层的队头阻塞。每场还需隔离同步基线、ACK/credit、重连和拥塞预算。先验 LAN 的业务正确性，再测 Steam 的单物理链路复用；不以研究代码替代真实双账号跨网证据。

## 9. 建议按六个可回归切片落地

1. **领域与仓库**：mjs/d.mts 合同、内存 Repository、SQLite 适配、权限和去重；没有地图 UI 也可验证两名玩家的资产。
2. **世界连接与最小界面**：两人独立坐标/钱包、邀请/接受/退出、一个市场；重连恢复，不进入战斗。
3. **持久战斗适配**：把受损舰、弹药和配装带入一次 managed battle，再准确写回；先验证一个遭遇，不改自由 LAN。
4. **可分可合 + 并发**：两场独立遭遇、B 活动不阻塞 A、汇合共战再分开、单场失败不回滚其他人。这才是核心原型验收。
5. **打包与真实 LAN**：更新 Worker/规则依赖、数据目录和安装包内容，用无开发依赖的完整包双机验证；之后再扩充生涯内容。
6. **热加入 / 代驾 / Steam**：分别实现、分别验收，不塞进首个不可回归的大改动。

关键回归：同一舰重复参战、重复奖励、过期 attempt、同 ID 不同请求、无权操作队友 AI、准备失败、断线接管、加载一半退出、提交前写盘失败、提交后 ACK 丢失、单场恢复保留其他交易、模块/联队/预备舰状态、旧单机存档与自由 LAN 不受影响。

不设未经测量的工期。先把第 1–4 项作为技术闭环，而不是先画完整星图再回头处理存档和权限。

## 10. 本轮技术探针与限制

当前本机 Node **v24.13.1** 可加载 `node:sqlite` 的 DatabaseSync，运行时明确给出 ExperimentalWarning。这仅证明本机开发 Node 可用，未验证 Electron utilityProcess、便携运行时或发布包；选择它作为正式依赖前仍需这些门槛。

使用 `:memory:` 数据库、合成玩家/舰队与极简事务模型验证 **10 项全部通过**：独立遭遇占不同资产；冲突入场回滚全部临时锁；其他交易不被失败结算覆盖；另一遭遇能独立提交；局部重开保留其他战果；旧 attempt 拒绝；当前 attempt 提交；ACK 丢失后重复提交不二次发奖；不同结果重放拒绝；提交后释放对应锁。

**这不是新生涯代码的测试。**它只验证拟采用的 SQL 事务/局部更新/去重结构可表达这些行为，未验证真实并发、磁盘持久性、断电、账号认证、实际战斗、浏览器或网络。没有把该简化模型加入生产代码，也没有修改测试运行器/依赖/现有服务。本轮未启动游戏或服务、未覆盖 dist、未操作用户存档、未打包发布；工作区其他并行改动未触碰。


## 11. 后续实现状态

上节的 10 项测试仅是此前的 SQL 概念探针。后续已经编写实际领域/仓库/规则/Worker 和遭遇生命周期代码；实现范围与新的 34 项回归测试见 [实现进度与还原度账本](campaign-implementation-progress-2026-09-19.md)。当前没有接入真实网络、地图 UI、战斗结算、市场或殖民经营。
