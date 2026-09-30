# 小行星提前弹开：原版对照与修复（2026-09-29）

## 修改前证据
- 本机原版参照：0.98a-RC8（项目既有来源记录）。`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEntityAPI.java` 区分 `getCollisionRadius()` 与 `getExactBounds()`。
- `../decompiled/starfarer_obf/com/fs/starfarer/combat/E/oOOO.java:330–397`：先做圆形粗筛，再旋转/平移精确轮廓；只有一方有轮廓时做圆与轮廓判定，两方均无轮廓才最终用圆。`:427–438` 对轮廓边求最近点，距离严格小于圆半径时才接触。反编译变量名不作语义依据，交叉核对了 API 与 `../starsector-core/data/hulls/hound.ship` 同时存在 bounds/collisionRadius。
- 用户截图可见罗西南特与小行星之间有间隙，但截图不能证明动态时序；该舰正式配置为 NONE 护盾。当前 Web `AsteroidSystem.resolveShipCollisions()` 将船体最终判定直接写成两圆半径相加，忽略正式船体 bounds；随后扣血、沿中心连线推出。罗西南特外接半径约 120.735，长窄舰的圆内空白尤其明显。
- 已查看用户图与正式舰体贴图；没有新增原版实机/键鼠操作权限，原版动态画面对照待核实。

## 预期与改动边界
- 保留现有护盾优先规则、相位/死亡免碰撞、伤害系数、小行星圆形模型及小行星之间的碰撞。
- 船体有 bounds 时，圆形范围仅可用于保守粗筛；局部坐标下计算圆心到最近轮廓边的距离，支持旋转、凹轮廓与顶点。接触点用于装甲/部件伤害与特效；响应法线朝船外，穿透深度仅来自该轮廓。已有深度重叠从最近边推出；缺少 bounds 的老规格保留圆形回退。
- 不改碰撞半径配置、不改素材、不重写原版未逐项核实的伤害/冲量系数，不涉及弹丸、小行星透明像素轮廓或舰船互撞。

## 验证计划
- 在既有罗西南特完整规则场景内补充：外接圆内但轮廓外不碰撞；真实舰艏/舰尾/两舷接触、旋转/平移；接触点/反冲/扣血；重复已分离调用不重复伤害；凹口、边界中心、深度重叠、缺 bounds 回退；护盾/相位/死亡规则。
- 集中运行一次项目 typecheck、改动文件 lint 与 `check-rocinante-controls.mjs --complete`（同一生产规则场景分别在无头主线程和真实专用 Worker 执行）。不启动可见窗口，不做提交/发布。
- 自动化规则证据不等同于用户窗口自然实战或原版实机一致性；验证结果完成后追加。

## 验证结果
- `npm run typecheck`：通过（exit 0）。
- `npx oxlint src/engine/simulation/collision/HullGeometry.ts src/engine/simulation/systems/AsteroidSystem.ts scripts/rocinante-complete-scenarios.mjs`：通过（exit 0）。后续仅修正测试舰型前置条件，再单独 lint 该脚本通过。
- `node scripts/check-rocinante-controls.mjs --complete`：主线程 180 项、真实专用 Worker 180 项通过，pageErrors 为空。两侧均验证 16 组旋转实际舰体接触与 8 组旧圆形判定会误撞的空隙；包括舰艏、舰尾、两舷、接触点装甲损伤/特效、沿轮廓法线分离、已分离不重复扣血、凹口、顶点、两种顶点绕序、重复顶点、穿透中心、轮廓超出名义半径、缺轮廓回退、相位、死亡、护盾优先及暴露后方、岩石破碎。
- 初跑测试在保护规则用例的前置条件失败：当前目录未加载原版 shade/hammerhead。此前几何/罗西南特碰撞断言均已通过。修正为不注册到目录的私有规格，使用生产 Ship/Shield 实现；不宣称原版舰型实机验证。之后定向重跑同一既有场景通过，未重跑全套工程测试。
- 结果：`artifacts/rocinante/complete-implementation/check-result.json`。修改前工作区文件另存于 `artifacts/asteroid-hull-contact/before/`，原有弹丸穿透相关改动保持不动。
- 证据边界：已做本机原版源码/资源对照与 Web 生产规则主线程/Worker 验证；未操作用户窗口，未补原版实机、当前游戏自然实战或新渲染截图对照；小行星自身仍是圆形碰撞体，不是透明像素级轮廓。未提交、打包或发布。
