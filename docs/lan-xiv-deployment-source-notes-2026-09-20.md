# 联机 XIV 舰体部署点来源修复（2026-09-20）

## 最小原版对照（修改前）

- 原版版本：本机 `../starsector-core/starsector.log` 首行是 0.98a-RC8。
- 原版证据：`../decompiled/starfarer_obf/com/fs/starfarer/campaign/fleet/FleetMember.java:864-871` 的 `getDeploymentPointsCost()` 使用 supplies-to-recover 的基础值，再应用 deployment_points_mod；不是 fleetPoints 或 OP。此处只修复联机已有基础 DP 的数据来源，不改动态修正机制。
- 数据交叉验证：`../starsector-core/data/hulls/ship_data.csv` 的 supplies/rec：dominator=25、eagle=20、enforcer=9、falcon=14、legion=40、onslaught=40；六个对应 `data/hulls/skins/*_xiv.skin` 继承基型，没有 suppliesToRecover 覆盖。fleetPoints 的独立覆盖不能用于 DP。
- 预期行为：有效 XIV 舰体按继承后的原版部署点校验；缺失费用仍报错；真正超额仍拒绝开始。联机是 Web 扩展，不存在原版同款房间界面。本次不改 UI 结构或交互，仅修正校验和现有 AI 详情的费用来源。
- 当前差异：房间的 room-deployment.mjs 和 LanAiInspection.tsx 读取 simulation-roster.json 的 costs（165 项，仅 CSV 行，缺全部 XIV 皮肤）；战斗 CombatDeployment.ts 已使用 deployment-costs.json（185 项，含皮肤继承/覆盖）。完整表由 import-native-catalog.mjs 的已解析 catalog.ships 生成，不应靠手写 XIV 特例、任意默认 DP 或删除 `_xiv` 后缀补救。
- 验证方法：修复前复现六型 XIV 被拒绝；修复后覆盖玩家直接舰体/自定义配装、AI 原始舰体/fit ID、开战预览、全部已解析费用、实际预算边界、未知费用拒绝，并运行现有房间回归与类型检查。原版实机 UI 待核实（遵守不操作用户桌面的约束）；不宣称原版全机制等价。

## 验收

- 修复前新增回归可稳定复现六种 XIV 玩家/AI 被旧费用表拒绝；错误文字与用户报告一致。
- 修复后：`node --test scripts/check-lan-deployment.mjs scripts/check-lan-room-workflow.mjs`，26/26 通过。覆盖六种 XIV 的直接/配装身份、AI fit 引用、房间开战预览；遍历 185 个解析费用并与 CombatDeployment.deploymentCost 对照、逐一验证预算以内/超额。
- 真实隔离 LAN WebSocket 服务（本机随机端口，不接触现有房间）：Aca233 配置攻势 XIV，添加军团 XIV AI，通过 start 并收到 match；服务端进入 loading，分队额度 100 DP。
- `node node_modules/typescript/bin/tsc -b --pretty false` 与三个修改/新增代码文件的 oxlint 均退出 0。
- 仅更换房间校验和既有 AI 详情的费用表 import；没有修改生成数据、配装、原版 DP、存档或生涯代码，没有重新打包/发布，也没有重启用户现有服务。已运行的旧客户端/房主服务需用修复后的构建重启。
- 验证边界：完成原版源码/配置核实、Web 逻辑与真实服务端协议验证；本次未执行浏览器截图、战斗实际入场或原版实机验证，不把进入 loading 宣称为完成整场战斗。
