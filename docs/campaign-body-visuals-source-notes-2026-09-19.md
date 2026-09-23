# 有界原版天体视觉资料（2026-09-19）

## 范围与交付

本轮仅新增：

- `src/campaign/content/OriginalBodyVisuals.mjs` / `.d.mts`
- `src/campaign/data/reference-body-visuals.json`
- `scripts/import-campaign-body-visuals.mjs`
- `scripts/check-campaign-body-visuals.mjs`
- 本文档

没有改写 Corvus 蓝图或模块、client、Types、ReferenceRuleset、共享核心、其他已存文件或原始资产，没有提交/发布。

参考包包含 **6 planetSpecs、8 customSpecs、14 sourceHandles、35 source records**。图像只记录 `graphics/...` 路径及文件哈希；不拷贝、不生成、不替换图片。已验证引用图像在 `public/game-assets/graphics/...` 存在。

这是一组加载后的 spec 与已知 Corvus source override 的**静态、可审计视觉输入**。不是 WebGL renderer，不是原版全部渲染效果的实现或视觉验收证明。

## 主线程接线

```ts
import bodyData from '../data/reference-body-visuals.json';
import { createOriginalBodyVisuals } from '../content/OriginalBodyVisuals.mjs';

const bodyVisuals = createOriginalBodyVisuals(bodyData);
const visual = bodyVisuals.resolve({
  kind: 'planet',
  nativeType: 'desert',
  sourceHandle: 'corvusI',
});
```

公开 API：`createOriginalBodyVisuals(data: unknown).resolve({kind, nativeType, sourceHandle?})`。

- 参数 kind 为 `star | planet | custom`；星体返回的 descriptor 统一 `kind:'planet'`，通过 `isStar` 区分。
- 未知 kind/type、star/planet kind 错配、错误或未知非空 sourceHandle、sourceHandle/type/kind 不匹配：返回 `null`。不随机替代，不猜测，不退回别的类型；prototype 上的 `toString` 等也不会被当成类型。
- sourceHandle 省略、undefined 或 null：返回基础类型 spec，**没有** Corvus 实例覆盖。调用方若要 Asharu 城市灯必须提供 `corvusI`，不能只传 nativeType。
- Corvus sourceHandle 是蓝图中的 `star/corvusI/corvusII/relay/...`，不是 nativeId（例如 asharu）或世界实体ID。调用方应显式传递已有蓝图来源标识；本模块不反猜世界ID。
- 工厂先复制并验证 JSON；错误数据抛 `CampaignError`，code=`INVALID_BODY_VISUALS`（JSON非法时可能由通用 JSON 校验抛对应错误）。描述、数组、audit、resolver 均不可变；更改调用方 data 不影响已建 resolver。
- 运行时只有浏览器可用的 `Values.mjs` 依赖，无 Node、文件读取、网络、资产加载和代码执行。已实际 bundle 为 browser ESM 并运行 JSON→resolver。
- 工厂验证结构和值，不在浏览器做 SHA-256 重读。源码/蓝图 hash 锁由离线 importer 与定向测试执行；不要把任意客户端提交的数据当作“已核实原版包”。

### Planet descriptor

包含用户要求的全部字段，另保留原版独立的 `cloudAlpha`：

```
kind:'planet', isStar, texture, planetColor,
tilt, pitch, rotation,
cloudTexture, cloudColor, cloudRotation, cloudAlpha,
glowTexture, glowColor, useReverseLightForGlow,
atmosphereColor, atmosphereThickness, atmosphereThicknessMin,
coronaTexture, coronaColor, coronaSize, lightPosition, audit
```

**颜色是0–255的RGBA四元组，不是0–1。** WebGL若使用归一化颜色，应在 renderer 除以255。加载为Java float的数值按 `Math.fround` 保留，包括如 -2.6 → -2.5999999046325684；不要据此视为随机误差。角度、rotation/cloudRotation、厚度、coronaSize 保留原版 spec 单位与含义，不在本模块换算成动画相位、每帧角度或绝对像素。尺寸/世界radius仍由真实世界实体提供。

### Custom descriptor

```
kind:'custom', sprite, width, height, color, alphaMult,
additive, showInCampaign,
useLightColor, renderShadow, facingOffsetDegrees:-90,
nativeLayers, pluginClass, pluginRender, audit
```

额外字段使renderer能分清基础数据和尚待实现的原版效果：

- `color=[255,255,255,255]`、`alphaMult=1` 是源码中 Sprite 初始/中性基础值，**不是断言实际游戏当前光照和感知淡入均为1**。
- CustomCampaignEntity render 每帧按 light source/spec决定是否着色，并把viewport alpha × sensor fader × contact fader设为实际alpha；这些动态输入不在本模块的 resolve 参数内，所以在 unsupported 列出。
- `additive=false` 对应真实**基础sprite**的 normal blend，不代表插件额外glow也是normal。
- facingOffsetDegrees=-90来自基础sprite.setAngle(entityFacing-90)，不是为缺失世界facing编造一个朝向。
- width/height 是继承/加载后的 spriteWidth/spriteHeight，非文件分辨率、非默认交互radius。Corvus没有声明额外实例尺寸覆盖。
- `nativeLayers` 是custom spec层列表；基础sprite只在其firstLayer渲染。不要在数组的每一层重复绘制基础sprite。

## 源码证据与正确默认值

源根：`../starsector-core`、`../decompiled`。完整路径/字节数/SHA-256见参考JSON的sources。

### PlanetSpec加载

`starfarer_obf/com/fs/starfarer/loading/specs/PlanetSpec.java` 构造函数（约135–196行），不是单看字段初始值：

| 字段 | 未声明时加载结果 | 依据 |
| --- | --- | --- |
| tilt/pitch/rotation/cloudRotation | 0 | 构造函数optDouble |
| cloudAlpha | 255 | 构造函数optDouble |
| atmosphereThickness | float(0.1) | 构造函数optDouble默认double(0.1f) |
| atmosphereThicknessMin | 10 | 构造函数optDouble |
| planet/cloud/atmosphere/glow/coronaColor | 白色RGBA255 | `loading/String.java:cfr_renamed_2` 缺字段返回Color.white，约180行 |
| lightPosition | [0,0,0] | `loading/String.java:Object(JSONObject,...)` 缺数组返回new Vector3f，约254行 |
| cloudTexture/glowTexture | null | 构造函数optString |
| coronaTexture | settings.graphics.planets.default_sun_halo | 源字段名starCoronaSprite；本安装为graphics/planets/sun_halo.png |
| coronaSize | 0 | 源字段名starCoronaSizeMult |
| isStar | false | 构造函数optBoolean |
| useReverseLightForGlow | **false** | 字段初始值虽是true，但JSON构造函数optBoolean缺省false覆盖它 |
| texture | 必需，不能编造 | 构造函数getString("texture") |

所以非恒星descriptor可能有默认coronaTexture，但coronaSize=0，不能仅因纹理非null就画光晕。Corvus恒星自己声明了另一张 `graphics/fx/star_halo.png` 和float(5.12)的size。

### Corvus实例覆盖

固定哈希的 `reference-corvus.json` 与其原始 `data/scripts/world/corvus/Corvus.java`，再交叉验证 `settings.json` 的纹理映射：

- `corvusI` / desert / Asharu：`graphics/planets/asharu_sparse_glow.png`，glowColor白，useReverseLightForGlow=true。
- `corvusII` / jungle / Jangala：`graphics/planets/volturn_glow.png`，glowColor白，useReverseLightForGlow=true。
- 两者都必须有原蓝图 `applySpecChanges:true`；importer不把未应用的setter冒充已生效状态。
- 覆盖只复制三个已要求的glow字段，其余description/market/gameplay属性不混入render descriptor。

### Custom尺寸与继承

`loading/specs/int.java`（反编译类名 `_int`）：load逐字段覆盖当前值，未声明保留继承结果；getter关联的初始sprite尺寸是64×64、showInCampaign/useLightColor/renderShadow为true。继承证据另锁定 `SpecStore.java` / `loading/S.java`，链条逐项与原始custom_entities.json核对。

`CustomCampaignEntity.java:readResolve`（约170–211行）：负的实例尺寸取spec尺寸；有sprite时按width/height设置；没有sprite、没有sheet则sprite=null。`render`约350–391行明确了normal blend、facing-90、动态光色/透明度、阴影和插件调用。

`fs.common_obf/com/fs/graphics/Sprite.java`：初始color白、alphaMult1；setNormalBlend=(770,771)，setAdditiveBlend=(770,1)。

| nativeType | 基础sprite尺寸 | 特别事项 |
| --- | --- | --- |
| sensor_array_makeshift | 86×86 | 继承sensor_array及base_campaign_objective；替换为makeshift真实sprite |
| station_side06 | 60×60 | 普通基础sprite |
| stellar_shade | 50×50 | 普通基础sprite |
| station_jangala_type | 120×120 | 原声明renderShadow=false，未错误继承true |
| comm_relay | **89×48** | 不是方形；使用com_relay.png |
| inactive_gate | 192×192 | 保留gate.png；插件效果部分未支持 |
| station_lowtech1 | **66×80** | 不是方形 |
| stable_location | 默认64×64，**sprite=null** | 地图icon不是场景sprite；不能用它冒充真实实体贴图 |

### 插件审计

- SensorArrayEntityPlugin、CommRelayEntityPlugin → BaseCampaignObjectivePlugin → BaseCustomEntityPlugin，核实render继承空实现；标记 `pluginRender:'inherited-noop'`。它们有游戏逻辑不等于有未实现的sprite动画。
- GateEntityPlugin.render/scaleGlowSprites（约324行后）额外执行扫描/激活光环、漩涡/星空warp、抖动和additive效果，依赖运行时gate状态；标记 `partial-base-sprite` 及 `gate-plugin-stateful-effects`。**不因为这些未完成而拒绝真实192×192基础sprite。**
- 无plugin的custom标记 `pluginRender:'none'`。
- 尚未审阅的新plugin类在import时拒绝；没有把所有plugin一概宣称完整静态sprite。

## audit的解释

每个descriptor均带：

- `supportedLayers`：本资料包已提供真实输入的层，如surface/clouds/glow/atmosphere/corona/base-sprite。不是宣称消费端renderer已经完整还原该层。
- `unsupported`：资料/API范围外的行为。Planet的native shader/runtime phase、实际light source；custom的动态感知/viewport淡入、指标圈/标签，按spec加入light tint/shadow pass；星门另外标识插件状态效果。
- `sourceIds`：描述实际依赖的源码/数据证据。
- `overriddenFields`：只有源handle应用的glow字段；基础spec是空数组。

unsupported不是“整个实体禁画”开关。按supportedLayers显示真实基础输入，其余保持诚实边界。稳定点没有基础sprite，不能用假球体或地图icon填空。

## 锁定、路径与复导

- importer固定锁定解释相关Java源码、Corvus生成来源及Corvus蓝图SHA（完整source列表以JSON为准）；配置原文件哈希继承自已锁蓝图，然后再次读原文件核实。
- 6个planet声明和8个custom继承链必须与原始配置逐项相等。改变蓝图/源码/配置时应先审查更新解释，不会无声套用旧默认值。
- 读取先拒绝绝对路径、盘符、反斜杠、NUL、`.`/`..`、空路径段，再realpath并验证最终位置仍在所选root内；目录symlink/junction逃逸已实测拒绝。
- 所有被引用graphics均验证存在并记录hash；不写原始资产。数据生成是确定性的，`--check`只比较，不覆盖目标文件。

```powershell
node scripts/import-campaign-body-visuals.mjs --check
# 可显式指定读源根：--core PATH --decompiled PATH
node scripts/check-campaign-body-visuals.mjs
npx oxlint src/campaign/content/OriginalBodyVisuals.mjs scripts/import-campaign-body-visuals.mjs scripts/check-campaign-body-visuals.mjs
npx tsc --noEmit --strict --skipLibCheck false --module NodeNext --target ES2023 --types node src/campaign/content/OriginalBodyVisuals.d.mts
```

验证结果：**16通过、0失败、0跳过**；涵盖构造函数默认值、源码hash、全部catalogue、glow source overrides、unknown/kind/source mismatch、深冻结/隔离、custom继承/尺寸、partial插件、路径词法与junction逃逸、hash漂移拒绝、复导一致、public资产存在、无Node依赖的browser bundle运行。lint及声明类型检查通过。

本轮没有运行Java原版整局渲染，也没有对主线程WebGL画面做截图验收；测试不能被描述为“画面已与原版一致”。

## 2026-09-22 原生 CampaignPlanet 绘制接入（实施前对照）

- 原版证据：0.98a-RC8，CampaignPlanet.render:229–262；terrain/Planet.setSpec:153–172、renderSphere:260–298、render3d:336–665、setMaterial:667–688、renderAtmosphere:705–814；用户 QQ20260919-165600.png 已重新查看。画面证明球面/昼夜/大气与舰队在同一世界背景，不证明未展示交互。
- 预期：PLANETS 球面/云/夜光/双盾/大气，ABOVE 恒星 additive 光晕；32段球网格，逐顶点固定管线材质及两盏灯，64段大气。使用 graphics 已应用相位/位置/纹理缓存，观察请求不得推进世界或 RNG。按原版先实体再 graphics 裁剪。
- 当前差异：真实星体已在权威世界/导航/恢复链路，但 ScenePresentation 跳过其绘制。旧演示 BodyRenderer 不作为正式渲染器；在 NativeFleetRenderer 同一 RGBA scratch target 扩展紧凑球面命令，避免每帧发送球面顶点及独立透明画布。
- 授权与扩展：只在鉴权 observer 所在位置输出可识别星体；隐藏/匿名星体不泄露图纹、位置、类型。独立纯 draw-plan 与可注入资源服务；未实现匿名星体 contact 明确列为边界，不伪造成已知球面。已应用资源新增缓存，旧 Web checkpoint 只在缓存缺失时由现有 applied spec 初始化，无法还原此前未保存的纹理缓存历史。
- 验证：扩展既有 native-save 场景验证灯光/纹理应用/相位只读/层序/权限与 checkpoint；一次 tsc、改动 lint、该单一场景含 headless UI 截图。仅后台运行，不操作原版桌面。截图为正常空间开发夹具，非 Corvus 新开局；不宣称像素等价或完整生涯。

### 本轮接入说明

- 新增 OriginalCampaignPlanetDraw：只读绘制计划，sphere 命令传材质/位置/旋转/两盏灯，不传整球顶点；大气/光晕沿用既有 quad/sprite。PLANETS 与 ABOVE 使用 location.renderer 注册顺序。
- NativePlanetSurface 在现有 NativeFleetRenderer 的同一 RGBA8 FBO 绘制，逐顶点钳色、背面剔除；每次球面后恢复 2D program/VAO/buffer/cull 状态，保留舰队阴影 alpha scratch。未叠旧 BodyRenderer 透明画布。
- 网格补查 LWJGL 2 Sphere.java 的 GLU_FILL/textureFlag 分支（https://raw.githubusercontent.com/LWJGL/lwjgl/master/src/java/org/lwjgl/util/glu/Sphere.java）：float drho/dtheta、rho+drho、quad-strip a,b,d/a,d,c 拆分。原版 terrain/Planet 使用 GLU Sphere/detail=32；本轮没有对本机 lwjgl_util.jar 逐字节反编译或宣称 GPU 跨平台逐像素相同。
- 45项资源 descriptor 由本机原版图片读取尺寸、计算 SHA256，并与 public/game-assets 对应字节逐项对照；未重写资源 manifest，未复制资源。自定义图通过显式 readTexture 服务扩展，不回退为猜测图。
- graphics.renderCache 在构造/applySpecChanges 复制纹理路径与 glowColor，保留 Java 已加载资源不随保留的旧 spec 引用突变的行为。旧无缓存 checkpoint 只读使用 applied graphics.spec。
- 仍有边界：匿名星体 contact/渐变、星体选择/HUD、正式世界生成/自动 tick 未接齐；本轮只把已注册且可识别的真实星体连到主地图，不借绘制请求推进它们。

### 本轮验收

已通过类型检查、11文件lint及唯一既有场景（一次冷启动超时后定向复查通过，88.366秒）；已查看1920×1080无头截图 artifacts/native-scene-planets-1790060070887.png。不是原版实机同状态对照，不宣称像素等价。Utils.o00000(a,b):210–215按先float差值再normalize核对，保留大气闭合点reverse仍pow1.5分支。详见主进度文档及本次检查日志。
