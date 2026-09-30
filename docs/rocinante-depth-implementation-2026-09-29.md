# 罗西南特前置能力：腹面实弹武器分层

2026-09-29。**宿主能力实装；不是罗西南特舰船完成，也没有新增可玩舰体或占位资产。**

## 原版证据与扩展边界

- 本机`../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/CombatEngineLayers.java`列有`BELOW_SHIPS_LAYER`、`UNDER_SHIPS_LAYER`及上层弹体层；仅证明原版存在层级，不证明原版自动支持本次腹炮契约。未启动原版实机，未独立确认该源码包对应的完整发行版。
- 原有Web顺序为舰体→武器→枪焰/弹体；`renderBarrelBelow`只交换炮管和炮座。新需求是指定槽位的承座/炮头及初始出射落在自己的船壳下面。实现属于Web扩展，不声称是原版移植。
- 旧舰省略字段时走原绘制路径；不改变原版/既有武器的伤害、射程、出射点、速度、寿命或碰撞规则。

## 已写入生产代码

### 内容与安装

`WeaponMountSlotConfig.renderLayer`支持`ABOVE_HULL`（省略时默认）与`BELOW_HULL`。

第一版仅接受**有明确内置绑定的普通实弹炮**：不可HIDDEN，不可空位，不可换装，不接受光束、火箭、导弹或特殊射线视觉。适配六PDC中的腹面那门；并未把鱼雷或轨炮的未知坐标先填进去。

- 战斗：同一绘制函数按层调用。下层承座→活动炮头/炮管→下层安装前景→下层发射效果→真实舰体；上层武器仍在原位置绘制。炮管/炮座之间原有顺序、后坐、瞄准与枢轴不变。舰体阴影副本不重复画新弹。
- 设计页：主舰与模块都有独立下层艺术层；槽位交互标记仍在上面，辅助名称标为“腹面挂点”。不通过把腹炮移到顶面来使它可选。
- 安装承座和固定前景跟随槽位层级；空的上层承座与旧内容行为不变。

### 枪焰与弹体

- 实际开火入口给腹炮枪焰附加`underHullShipId`，粒子位置仍是世界坐标，不跟舰体旋转。
- 旧枪焰事件压缩行没有所属舰ID，因此带层级的发射走已有完整粒子记录路径；普通枪焰保留原事件快速路径，不丢信息、不借用上一次开火的拥有者。
- Worker紧凑粒子字段增加可选所属舰ID；槽位层级和弹体原有`sourceShipId/slotId`一起经过生产显示投影。
- `WeaponDepthComposer`只在画面端把初始发射按舰ID分组。调用原来的弹体绘制器，在所属舰体之前绘制，所以透明船壳轮廓自然裁切枪焰与弹体，不是按中心点整颗隐藏/显示。
- 完整弹体、炮弹前端和曳光离开舰体显示范围后回到普通弹体层。保守圆形范围只决定何时解除下层关联，**不拿圆形当船壳遮罩**。解除后不重新吸附；场景重置、时间回退、弹体消失与拥有者死亡会清理关联。
- 画面分组同时保留已确认/预测的弹体显示姿态，不改模拟数组；同一弹体不会在上下两层重复提交。

## 核心文件

- `src/engine/render/WeaponDepthFrame.ts`：只读出射分组与解除关联。
- `src/engine/render/webgl/passes/WebGLShipPass.ts`、`WebGLCombatRenderer.ts`：所属舰体前的下层绘制。
- `src/engine/content/ShipSpec.ts`、`src/engine/modding/ContentValidation.ts`：显式字段与首版能力边界。
- `src/engine/simulation/systems/ShipWeaponControlSystem.ts`、`CombatFXSystem.ts`、`CombatEngine.ts`：真实开火事件的显示归属。
- `src/engine/runtime/local/PackedVisualState.ts`：Worker粒子字段保真。
- `src/studio/ShipStage.tsx`：设计页分层及腹面选择标记。

没有修改Sprite/Ribbon的全局着色器，不引入运行时3D、生成贴图或额外特效。

## 考据状态

后装轨炮和鱼雷口仍未得到足以冻结正式坐标的版本证据。本次尝试公开Printables模型页超时；Syfy剧集总页可访问但没有提供所需武器位置证据。没有绕过验证、提取不可下载模型，或将同人注释冒充官方结论。

## 验收记录

结果写入`artifacts/rocinante/depth-implementation/`：

- 项目`npm run typecheck`通过；改动源码与检查脚本的oxlint退出码0。
- `node scripts/check-hull-weapon-depth.mjs`通过；`check-result.json`记录真实WebGL像素与Worker结果。
- 0°、90°、180°、45°下，船壳内部发射前后变化像素均为0；切回普通上层对照分别出现495/495/505/500个变化像素，证明不是整个效果未渲染。船身边缘能自然露出弹体。
- 检查初始分组、两个拥有者不串弹、完整曳光离船后解除关联且不重新吸附、复位/拥有者死亡清理，以及绘制不修改世界坐标弹体、幅能或RNG。
- 生产开火事件输出所属舰ID；旧普通枪焰仍走原事件快速路径。真实Web Worker接收生产显示包并用生产解码器还原槽位层级、枪焰所属舰和弹体sourceShipId/slotId。不是在Worker中进行完整战斗。
- React设计页下层实体不重复绘制；腹面挂点仍有可选标记与辅助名称。
- 4类非法定义被拒绝：未知层、非内置、HIDDEN以及不受支持的光束。
- 相关既有`check-projectile-visual-renderer.mjs`场景通过：可见弹体2304像素，移除后0，指示器差值63299，pageerror为0。原脚本引用已删除的onslaught；本次只在artifacts副本中将测试舰替换为现有逐渊，并配置可用的Playwright及隔离临时端口，未改其断言、未恢复原版舰体、未修改原脚本。

测试只用现有获认可的逐渊舰体和女王近防炮，构造隔离内存场景，不注册到玩家目录、不写玩家配装，也不是罗西南特的临时美术。原版舰体/武器已被用户从Web目录移除，本次不会为了运行旧测试把它们恢复。

未验证：罗西南特正式素材贴合、六门真实射界、自然AI交战、完整权威Worker战斗、多人房间、安装包、hulk碎片复杂遮挡和所有特殊舰体渲染器。Worker解码成功不能替代这些验收。
