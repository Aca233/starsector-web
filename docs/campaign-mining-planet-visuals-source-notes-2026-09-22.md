# Mining plasma_dynamo planet visuals — 2026-09-22

## 原版证据 → 预期行为

- 来源版本沿用项目已核实基线 Starsector 0.98a-RC8；本轮阅读本机反编译文件与原始贴图，未启动原版游戏。
- ../decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/econ/impl/Mining.java，applyVisuals / unapplyVisuals / setSpecialItem：非 null planet 的实际 getSpec() 写 shieldTexture2、shieldThickness2、shieldColor2，然后同步 applySpecChanges()。启用为 industry/plasma_net_texture、Java float 0.15f、RGBA [255,255,255,255]；移除为 null、0、null，不恢复安装前的第二层护盾。第一层不变。
- ../starsector-core/data/config/settings.json:1454：industry/plasma_net_texture = graphics/planets/dynamo.png。已查看该原始 1024×512 RGBA 贴图，仅证明素材，不证明实际球面视觉、远近距离或交互状态。
- ../decompiled/starfarer_obf/com/fs/starfarer/campaign/CampaignPlanet.java:314–324：getSpec 首次克隆 graphics.spec；applySpecChanges 将当前工作 spec 交给 graphics.setSpec，再克隆为下一份工作 spec。planet/entity/graphics 对象本身不替换，spec 切换身份是原生语义，不能为了“保持身份”取消。
- ../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/terrain/Planet.java：setSpec 缓存 shieldTexture2；第二层使用 shieldColor2 和 radius * (1 + shieldThickness2)。

## 项目路径与本次实现

- src/campaign/rules/OriginalCampaignPlanet.mjs 已有真实 getOriginalCampaignPlanetSpec / applyOriginalCampaignPlanetSpec；后者更新 graphics.spec、graphics.renderCache、tilt/pitch/lightPosition 并克隆后续 planet.spec。直接复用，不新建记录型服务，不更改既有模型。
- 新增 OriginalMiningPlanetVisuals.mjs / .d.mts：setOriginalMiningPlasmaVisuals(planet, enabled, options?) 直接变更实际工作 spec 并同步调用上述模型路径。null planet 无副作用；拒绝不完整 planet 和异步/空纹理路径。默认纹理来自上述原版 settings，可显式注入同步 getSpriteName(category, key) 适配真实设置覆盖。
- createOriginalMiningPlanetVisualServices({ readPlanet, getSpriteName? }) 返回 ResourceLifecycle 可接的 readPlanet / setMiningPlasmaVisuals。readPlanet 必须注入，且每次读取当前市场对应的真实共享 planet 实例或显式 null；不缓存、不克隆、不猜测 ref、不允许 Promise/undefined。setter 的第三个 row 参数兼容生命周期调用，但不改 row；shownPlasmaNetVisuals 及调用顺序仍归 ResourceLifecycle 所有。
- applySpecChanges 的真实同步模型服务已经存在，因此无需另行注入；接口不接受用空实现或 record 替换模型更新。

## 当前差异 / 未实现边界

- 没有修改 Runtime / ResourceLifecycle。依本轮用户同步：Runtime 已默认接 setOriginalMiningPlasmaVisuals，按当前 planetEntityRef 解析共享 world 实例，缺 world 拒绝、实际 null 早退；测试代理负责补真实模型断言。本任务未读取或验证其最新实现，不再将这项接线列为 renderer 资源链路的待实现项。
- 首轮发现的 stock dynamo renderer 纹理描述缺口已按本轮追加授权补齐，详见下节。真实 UI 显示、球面外观与安装/关闭交互仍未运行验证；自定义 getSpriteName 返回的其他纹理仍须由调用方接入真实资源及描述，不能以 stock dynamo 替代。
- 未新增特殊物品兼容性、货物交易、资格判断或移除产业时自动清护盾。重复启用仍执行 applySpecChanges；禁用不恢复旧 shield2；null 不更改历史 shown 标记，均交由现有生命周期遵循原版。
- 未启动原版实机、Web 页面、测试、类型检查、lint 或其他检查。未编辑其他代理文件。

## 验证方法（交由主代理集中执行，本次未运行）

1. 对真实共享 planet 安装/重复安装/卸除 plasma_dynamo：观察三项工作 spec、graphics.spec、renderCache.shieldTexture2 同步更新；旧工作 spec 成为已应用 spec，新工作 spec 与其不相同，planet/entity/graphics 身份不变。
2. 保留第一层护盾及其他 spec 修改，确认 applySpecChanges 正常连带应用；卸除后第二层清空而非回滚旧值；null planet 不触发纹理读取或标记变更。
3. 缺失 reader、undefined/Promise/伪 planet 返回值、非法纹理路径必须拒绝；当前市场换 planet 后 reader 需读到新的实际实例。
4. 真实 dynamo 纹理描述与既有资源路径已接齐；统一验收时在相同原版分辨率/镜头距离下比较球面第二层及移除效果，截图、交互与联机回执均仍待验证。

## 追加授权：补齐 stock dynamo renderer 纹理描述

### 原版证据 → 预期行为 → 当前差异

- 本轮仅修改 src/campaign/data/reference-campaign-planet-textures.json 与本文档；不改 Runtime、ResourceLifecycle、测试、shader 或通用 asset manifest，不运行全量资源导入。
- 本机 ../starsector-core/graphics/planets/dynamo.png：827818 bytes，PNG IHDR 宽高 1024×512，SHA-256 eedcbf337b3916826489d76a3f9ba5bd83ae359e9442fc159b8a9b7358638991。以上为导入所需源资源元数据读取，不是生成图或占位描述。
- public/game-assets/graphics/planets/dynamo.png 已有原版资源；读取出的宽高、字节数和 SHA-256 与上述原始文件相同。public/game-assets/asset-manifest.json 已有 graphics/planets/dynamo.png image 条目，因此不复制或覆盖二进制，不扩大导入其他资源。
- 缺口仅在原生专用 reference-campaign-planet-textures.json：按现有排序新增该路径与真实宽高、SHA-256。1024×512 均为 power-of-two，不需要扩展边缘，故 texWidth=1、texHeight=1，符合现有球面纹理描述约定。
- 原版 terrain/Planet.java 的 shieldTex2 != null 分支采用 radius * (1 + shieldThickness2)、z=100、第二层色彩、SRC_ALPHA/ONE 加色；未启用时不画该层。本次不替换已有这条渲染语义。

### 实际资源与 shader 路径（源码定位，未启动 renderer）

1. OriginalMiningPlanetVisuals → getOriginalCampaignPlanetSpec → applyOriginalCampaignPlanetSpec：实际 graphics.spec 与 renderCache.shieldTexture2 得到 graphics/planets/dynamo.png。
2. OriginalCampaignPlanetDraw.mjs 的 originalCampaignPlanetTexture 从专用 JSON 建立描述索引；planet-shield-2 生成现有 planet-sphere 命令，引用本次新增的原版纹理描述。
3. NativeSceneCanvas.tsx 调用 NativeFleetRenderer.load 加载实际帧纹理；NativeFleetRenderer.ts 的 loadTexture 经 BodyRenderer.ts 的 campaignAsset 得到 /game-assets/graphics/planets/dynamo.png，沿用真实 Image.decode → RGBA 字节 → WebGL texture 路径，没有增加独立静态地址或假服务。
4. NativePlanetSurface.ts 的球面 shader 采样真实 uTexture，并乘以现有球面顶点光照/色彩。NativeFleetRenderer 使用自己的 REPEAT 与适用的 mipmap sampler；它不读取通用 asset-manifest 的 clamp 字段，本次不为了球面绘制修改其他 renderer 共用的 sampler 配置。
5. scripts/import-game-assets.ps1 现有扫描包含 src 下的 JSON；该专用清单足以让今后正常资源导入保留该实际路径。脚本无需修改，本轮未运行该脚本。

### 默认 / 关闭兼容与未验证边界

- 默认 shieldTexture2=null 未改变，OriginalCampaignPlanetDraw 的 path !== null 门禁仍跳过该球面命令；仅登记纹理不会让全部星球强制加载或显示等离子网。
- 关闭仍由 setOriginalMiningPlasmaVisuals(..., false) 清掉三项 shield2 属性并刷新 renderCache；随后帧不含 planet-shield-2。已加载的 GPU 纹理即使缓存保留，也不会被未生成的命令绘制；无需增添销毁或遮挡逻辑。
- 未运行测试、lint、类型检查、导入校验命令、浏览器或原版实机；没有新的截图验收。只读源码与所需原版资源元数据，然后补齐描述；不得将此报告为实机视觉验收通过。
- 后续集中验收：用默认 readTexture 生成启用帧，确认 real dynamo 描述进入 load/draw；默认及关闭帧无第二层命令；实机对比远近球面效果及安装/卸除交互。生命周期/Runtime 接线归主代理，未在本轮修改。

## Renderer 方向交付（2026-09-22）

- 此方向实现已成形：真实共享 planet 的应用后 spec / renderCache → 原生纹理描述索引 → planet-shield-2 球面命令 → NativeSceneCanvas 汇总 planets 帧 → await NativeFleetRenderer.load(frames) → draw / NativePlanetSurface。NativeSceneCanvas 在 load 完成后才执行本帧 draw；这次仅阅读现有路径，不改 shader 或客户端逻辑。
- 新增清单项与已存在的本机原版 public 资源构成完整资源引用；无二进制复制、假图、生成图、占位服务或额外加载入口，无其他 renderer 资源待补项。
- 本次最终收尾仅更新本文档，说明用户同步的 Runtime 接线状态与统一验收责任；没有修改其他代理文件，没有运行任何测试或检查命令。
- 交给统一验收的观察点：启用时出现真实 dynamo 纹理的第二层球面且正常 decode/draw；默认与关闭时没有该层命令；卸除保留第一层护盾及 planet/entity/graphics 身份。真实模型断言由测试代理处理，浏览器画面和原版一致性不在本报告中宣称通过。
