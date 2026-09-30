# 亚顿之矛：真实模型到二维舰体的制作记录

日期：2026-09-27。范围：用户提供的模型检查、Blender正交渲染和结构核对；不是游戏实装或发布。

## 美术验收状态

用户否决直接用原始烘焙稿进入实装。以下渲染结果仅证明结构与导出技术成立，**不是P5/P6美术合格**。后续 `material-study-v02` 的材质/光影方向已获用户认可；`production-v01` 已输出双状态图与可见区域蒙版，但 P6 尚未完成、P7 仍暂停。分层与实际尺寸处理详见 `spear-of-adun-art-gate.md`；不得将“继续开发”解释为允许跳过该关卡。

## 最新决定：运行时使用二维贴图

用户在讨论实时模型和性能后明确选择「算了还是贴图吧」。因此取消实时三维舰体的实现方向，不加模型渲染通道、不把glTF/骨架/源贴图纳入运行依赖。Blender仅作离线美术母版。

已从验证过的真实模型重新烘焙512×1024透明俯视图，输出至 `output/spear-of-adun-sprite/v01/`。PNG与无损WebP逐像素一致，透明边界和未裁切检查通过；单张RGBA8为2 MiB（不含mipmap）。复现脚本为 `scripts/bake-spear-of-adun-sprite.py`。这是舰体美术素材，不是已完成的舰包迁移；新轮廓不能复用旧图26槽坐标。动画如有需要，仅后续制作已核实局部构件的帧图。

## 来源与边界

- 用户提供：`C:/Users/Aca/Downloads/spear_of_adun_-_protoss_-_starcraft_2.zip`。
- 作者：Catholomew；来源：https://sketchfab.com/3d-models/spear-of-adun-protoss-starcraft-2-7582ff949a4844e4bbc32ea93de2b8ec 。
- ZIP内许可：CC BY-NC 4.0，必须署名，不可商用。作者另说明模型来自游戏并经其材质/动画调整；平台许可不能证明对底层游戏IP拥有发布授权。本轮只在本地研究，不加入游戏发布资源。
- 压缩包、各源文件的SHA256、Blender官方校验值见 `artifacts/spear-of-adun/model-research/source-manifest.json`。解压逐个检查目标路径，原始ZIP和提取的glTF/贴图均未改写。

## 实际资产

glTF 2.0：45个mesh、26份材质、20张图片、1个skin、1段动画；约17万三角面。贴图为10张baseColor和10张emissive，无额外的法线/粗糙度贴图。初始结构研究阶段不修改原材质参数与节点；后续 v02 / production-v01 在派生 Blender 场景中调整材质节点，未改源文件。真实质感仍受源模型和纹理质量约束。

源动画 `[Action Stash]` 共有5条通道，涉及核心控制骨与 `Pos_Adjutant_17`；不能因为带骨架就声称原舰各处均为旋转炮塔。结构图固定在第0帧。

## 已使用的制作方法

1. 从Blender官网下载4.5.9 LTS便携版，按官方SHA256核验。放在用户 `.codex/tools`，不安装系统服务、不改PATH、不打开桌面窗口。
2. 使用 `--background --factory-startup --disable-autoexec`，导入用户模型；不执行文件附带脚本、不访问用户浏览器会话。
3. 使用导入后的真实顶点和蒙皮评估几何计算边界。导入器创建的骨骼显示Icosphere不算舰体，不参与尺寸与部件统计。
4. 模型长轴沿Blender Y，舰首朝-Y。俯视相机沿+Z看向模型，画面向上为-Y；同时输出-Z反面、+X侧视和斜视用于交叉核对。相机均为ORTHO，没有透视缩短。
5. 只增设相机和研究灯光，不改顶点、不改轮廓、不对原贴图重绘。原始多层外构在正交投影中自然遮挡，而不是手工压扁斜视截图。
6. Cycles / OptiX / 256采样，最长边3072像素；RGBA透明背景、10%取景余量。中性棚光，AgX色彩管理，曝光+0.5。没有星空背景、额外炮塔、光束、引擎火焰或AI生成内容。
7. 保存包含贴图、骨架、灯光、四个相机的 `.blend`，可直接继续调整与复现，不把图片当作唯一母版。

## 文件与复现

- 原始研究资源：`artifacts/spear-of-adun/model-research/source/`。
- 渲染脚本：`scripts/render-spear-of-adun-model.py`。
- 高清输出：`output/spear-of-adun-model/orthographic-v01/`。
- `axis-plus-z.png`：严格正交俯视，RGBA，舰首朝上。
- `axis-minus-z.png`：反面核对图。
- `axis-plus-x.png`：正交侧视。
- `oblique-plus-z.png`：斜视核对图，仍为正交投影。
- `spear-of-adun-model-study.blend`：可继续编辑的真实三维场景。
- `render-report.json`：渲染参数、每个相机的坐标/旋转/正交尺度、每像素世界尺度、网格边界和贴图加载状态。
- `SOURCE-LICENSE.txt`：下载包内原始署名与许可。

在工程目录执行：

```powershell
& "$env:USERPROFILE/.codex/tools/blender-4.5.9-windows-x64/blender.exe" `
  --background --factory-startup --disable-autoexec --python-exit-code 1 `
  --python scripts/render-spear-of-adun-model.py -- `
  --source artifacts/spear-of-adun/model-research/source/scene.gltf `
  --output output/spear-of-adun-model/orthographic-v01 `
  --resolution 3072 --samples 256 --exposure 0.5
```

## 到实装之前仍需做的事

- 由用户核对真实俯视外形，再决定远行星号运行尺寸、灯光和缩小后层次；渲染成功不等于最终游戏美术验收。
- 从真实结构识别可能的发射口、固定构件和可动件，缺少证据的武器设计明确标为Web改编，不把蓝色窗或核心当作炮口。
- 然后建立固定/旋转分层和枢轴、枪口、遮挡、射界档案，继续保留同档换装限制；不沿用旧图的26槽坐标。
- 源模型署名/许可/IP边界与舰船包发布权限另外核实。

现有v05舰包、旧图、配装、存档均保持原样。本轮没有重跑游戏测试，因为未改变运行代码或游戏资产；验收对象是导入、渲染、图像透明度、取景与真实多角度外观。


## 已认可方向之后的 P6 资产

`output/spear-of-adun-art/production-v01/` 保留双状态 PNG / 无损 WebP、可见部件蒙版、实际多层 EXR、可编辑 Blender 母版、署名与三张检查板。

- 制作：`scripts/prepare-spear-of-adun-art-layers.py`，需用 Blender 后台运行。
- 集中图像核验与检查板：`scripts/review-spear-of-adun-art-layers.py`，普通 Python + Pillow；验证真实尺寸、轮廓、蒙版覆盖、EXR 通道及 WebP 无损一致性。
- 模型骨架依据：`artifacts/spear-of-adun/model-research/rig-articulation-audit.json`。
- 本轮只确认离线图像技术结果；没有将遮挡不完整的可见区域拆片冒充炮塔，没有运行时动画帧，也没有更改现有游戏资源。
