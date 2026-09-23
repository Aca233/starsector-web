# 原版航行与舰队指挥身份 — 2026-09-19

> 后续0.6.0已接入普通跳跃与已知拓扑的缺油漂移，累计124项测试通过；详见 [跳跃进度](campaign-transitions-progress-2026-09-19.md)。本文0.5.1边界和99项数字保留阶段历史；仍无可玩生涯UI。

## 0.5.1阶段进度

`reference.cooperative` **0.5.1** 已把原版来源的开放空间航行接入统一世界时钟、后勤和 SQLite 事务；新增显式指挥身份，与舰队/舰船资产所有权分离。它是通向可玩生涯的实际领域链路，**尚未提供生涯地图 UI、真实网络连接、世界生成或完整航行环境，不能称为生涯模式完成。**

## 1. 权限和 NPC 分类不再从资产所有权猜测

每支舰队现在必须保存 `control`：

```js
{ kind: 'player', id: 'player-id' }
{ kind: 'faction', id: 'faction-id' }
{ kind: 'npc' }
```

- `owner` 继续表示资产归属；`control` 表示当前指挥主体。结构允许 A 的资产由 B 指挥，或个人舰船处在势力指挥的舰队中，所有权不会随指挥变化。
- 个人控制只有指定玩家能下令；势力控制由该势力当前 leader/manager 下令；NPC 没有隐式人类权限。
- 航行、维修开关、编队邀请/接受/离队、计算主机资格采用同一显式指挥检查。邀请接受时重验发起者当前是否仍有指挥权。
- `control.kind === 'npc'` 才选择原版 AI 后勤分支：不从玩家式货仓扣补给/燃料、按 AI 满足船员条件恢复。势力所有但由玩家或势力成员指挥的舰队仍支付后勤。
- 这里只接通 NPC 分类、后勤和内部系统航行意图，**没有 NPC 决策 AI、生成/巡逻/贸易/追击，也没有用户授权/撤回代驾命令或 UI**。普通玩家不能把自己的舰队改成 NPC 来逃费，现有玩家命令不写 control。
- 合作加入仍不合并资产或自动共享操纵；玩家可分别设置本舰队目的地。

这是明确的联机授权策略，不是将原版单一 playerFleet 指针硬扩展成“所有势力资产都由所有成员指挥”。

## 2. 原版依据与实现范围

本轮定向核对：

| 来源 | 保留的行为 |
| --- | --- |
| `SmoothMovementModule.advance` | 位置误差 ×3、速度误差的预计变速时间 +0.75、加速度限制、平滑超速衰减、先改速度再改位置 |
| `FleetData.getMinBurnLevel/getBurnLevel/getTravelSpeed` | 最慢舰船决定速度，**包含封存船**；默认无 fleetwide modifier 分支四舍五入/0–20 上限；0 burn 使用 minTravelSpeed；空舰队另有 200 的速度分支 |
| `CampaignFleet.updateSpeedBonus` | 货物/燃料/人员/舰船数量中的最大超载比例降低burn；轻微惩罚不能被四舍五入抵消，数量超额按源码双倍计入 |
| `CampaignFleet.advance` | 加速度为 `max(10, travelSpeed × accelerationMult)`；当前支持默认 multiplier=1；**后勤先于移动** |
| `LogisticsModule.advance` | 超空间燃料使用移动前速度计费；普通空间默认倍率0，超空间默认倍率1，计费速度上限 burn20 |
| `FleetMember.updateStatsBasedOnCrew` | 缺员降低 CR/恢复，不凭空增加 burn 惩罚；封存也不从最低 burn 计算中删掉舰船 |
| `MilitarizedSubsystems`、已支持后勤船插源码 | 军事化增加1 burn；其他当前支持的对应船插没有这项修改 |
| 原版 settings.json | `minTravelSpeed=20`、`baseTravelSpeed=0`、`speedPerBurnLevel=20`、`unitsPerLightYear=2000`；通过导入器读取而非用户命令传入 |
| `NoFuelDriftScript` | 燃料耗尽不是原地免费飞行：原版会向重力井漂移并可能跳转。此链路尚未接入，当前明确报错 |

`OriginalMovement.mjs` 是纯移动积分器，当前支持固定目的地、目标速度0、默认平滑速度上限。**没有人为“距目标若干像素直接吸附”或“停车立刻清零速度”**；固定 dt 下的小幅余速/振荡不以虚构规则抹平。Web 使用 JS double、60 ticks/秒；没有运行 Java 原版做逐帧数值对照，不承诺 Java float 逐位一致。

`OriginalFleetStats.mjs` 增加有效 maxBurn，`OriginalTravel.mjs` 作为独立 travel provider 消费它；大改可替换 travel 的描述/积分服务。已用替代移动 provider 验证保持同一世界时钟、后勤、Kernel 和 Repository，不把航行公式塞进数据库或界面。

## 3. 持久航行意图及统一推进

地点可保存：

```js
navigation: { space: 'normal' /* 或 hyperspace */, terrain: [] }
```

默认 travel provider 要求地点明确声明环境；没有环境或非空未移植地形不能悄悄按空旷区域运行。terrain 当前是明确的未支持标记列表，不是已实现的地形集合。

舰队持久运动状态：

```js
navigation: { velocity: [0, 0], destination: [1000, 0] }
```

- `fleet.set-course` 接受 fleetId、locationId、destination；`fleet.stop` 接受 fleetId、locationId。
- 命令只保存意图，不自行移动/耗油。必须携带 fleet 预期版本，拒绝旧地点意图、额外速度/耗费/新状态字段和越权调用。
- stop 以当前坐标为新的目的地、保留当前速度，让后续 ticks 物理减速；不是瞬停。
- 统一模拟每 tick 从不可变起点快照生成运动描述，先按旧速度执行后勤，再积分位置/速度。全部活动舰队连同时间、舰体/CR、回执与事件在同一事务提交。
- 参战锁定舰队的位置、速度、目的地和后勤一起冻结，禁止改航线；取消未开战遭遇后从现有速度继续，不追补暂停时间。
- 同 requestId 重试不会重新改航线；另起 ID 携带旧 fleet 版本被拒绝。跨 locationId 不会被当作传送。
- NPC 可由可信内部 system 下航行意图，不允许客户端自选 system principal。真实认证网关尚未实现。

## 4. 仍待接入，而非近似默认

1. 地形/碰撞、传感器、导航技能、持续/紧急加速、隐蔽/低速航行、拖曳等有效修正；当前直接拒绝已声明但未移植的地形/能力/修正。
2. 星系/超空间跳跃、重力井和缺油漂移；玩家式舰队进入“超空间且燃料为0”会报 `UNSUPPORTED_FUEL_DRIFT`。若一个长批次在中途耗尽燃料，后续 tick 触及该状态时整个批次回滚并使调度器显式出错；这是未完成边界，不是最终缺油体验。
3. 原版导航/接战/追击触发和战后结算；当前遭遇准备仍是内部测试流程，不因舰队碰到一起就自动进入真实战斗房。
4. UI、世界生成、身份连接、命令版本重试体验、原版场景内容与网络/发布运行时。
5. 全部配装合法性和未支持的舰船/军官/技能效果；不能用当前已知船插集合声称完整还原。

旧 `travelOrder` / 顶层 `velocity` 状态仍被拒绝，避免同时存在两套运动权威。新版 fleet 必须有 control；未发布的世界 JSON 草案 schema 仍为1，但规则锁已为0.5.1，**没有给旧0.4.0草案存档静默补控制者或环境**。SQLite schema仍为2，同文件 fencing不变。

## 5. 验证

新增 `scripts/check-campaign-travel.mjs` **21项**，累计 **99项**：

- 独立的源码特征数值例：加速、转向、制动、超速平滑衰减、0时间/0加速度、最低burn与特殊速度分支。
- 航行真实改变持久位置，普通/超空间不同油耗，先计旧速度费用，不接受客户端伪造速度/成本。
- 跨批次位置、速度、物资及CR一致性，指令幂等/旧版本/地点拒绝。
- 所有权与指挥分离、势力权限、NPC经济分类、计算主机资格。
- 明确拒绝未知环境/地形/缺油漂移；其他舰队不支持及真实SQLite回执注入失败时整份事务回滚。
- 实际航行汇合、加入、离队后分别移动且保留资产；参战冻结与恢复。
- 实际Node Worker执行航行命令和权威时间推进。
- 替换整个travel provider而不改Kernel/Repository。

```sh
node --test scripts/check-campaign-foundation.mjs scripts/check-campaign-encounters.mjs scripts/check-campaign-logistics.mjs scripts/check-campaign-simulation.mjs scripts/check-campaign-travel.mjs
node node_modules/typescript/bin/tsc -p tsconfig.campaign.json --pretty false
node node_modules/typescript/bin/tsc -b --pretty false
```

最终验证：**99/99运行测试通过**，严格类型合同和全项目 TypeScript通过；定向oxlint覆盖47个文件、0条诊断，浏览器规则/内核与Node Worker的esbuild内存打包通过，未覆盖dist。未做原版游戏逐帧对照、浏览器/LAN双机/Electron验证，原版安装/存档未修改。

### 后续核对修正：超载航速

检查跳跃调用链时发现并修正了此前遗漏的超载航速惩罚：`max(货物比、燃料比、人员比、(2×舰船数−上限)/上限)`，上限2；burn倍率为2减去该比例。真实减速若被四舍五入抵消，仍强制降低1 burn。0 burn对应原版minTravelSpeed，不是完全不能移动。联机中对全部非NPC控制舰队应用原版playerFleet这条分支，属于显式多人映射；NPC分支不应用此惩罚。原版航行属性现在必须接收权威货物/容量，不能省略后当作未超载。

对应新增两项测试分别核对公式边界及真实世界移动结果。跳跃与缺油漂移仍未接入；来源和接入顺序见 [跳跃来源核对](campaign-transition-source-notes-2026-09-19.md)。
