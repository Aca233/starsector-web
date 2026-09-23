# 原生航速及燃料日耗仪表（0.98a-RC8）

## 编码前最小对照
- 已查看原版1920×1080截图 artifacts/native-cargo-ctrl-overload-20260920.jpg：左下燃料条右侧日耗、下一行左侧43×24航速数字，右侧214×24斜格航速条；不用自创进度条。
- 原版 coreui/C.java:69–100,124–165,206–256,265–272：getVelocity速度转fractional burn并round，上限999，保留10次UI帧样本，均值round且±0.1均值保护；最大航速由movementSpeedMod(getTravelSpeed)得出，fleetwideMaxBurnMod与minBurn差值分别给bonus/penalty。20格，每格8、间隔1、起点11、高24；独立最大可用/当前亮起/bonus/penalty。
- coreui/O0O0OOOO…java:64–129,263–326：每格几何、末格延伸、首格左边垂直；最大值<=0时惩罚闪烁。
- Misc.java:1652–1692：扣baseTravelSpeed后<=minTravelSpeed+1视为0。C.getFuelUseStr：无燃料优先；正常空间且无normal倍率显示---；实际速度<10归零再round，20航速耗油上限使用舍入前速度作除数，hidden fuel倍率最后乘。
- LogisticsModule.getFuelCostPerLightYear 只用hyper倍率，即使normal倍率触发显示仍如此。这是原版显示公式，不改成真实扣费公式，也不将显示值用于扣费。
- 使用该舰队的已同步成员/指挥官/修正stat与logisticsEnvironment，不替换global playerFleet。getTravelSpeed在浅拷贝上重算避免改checkpoint；dynamic stat未创建时按源码默认1读取，不执行惰性创建。未同步或缺环境逐项未知。

## 实施范围与验证
- 接现有私有HUD投影、原生页面、原版insignia21LTaa字体；客户端10样本平滑只影响显示，不预测/推进世界。可见页面按浏览器动画帧取最近已提交航速样本，是网络呈现策略，不声称与原版帧时序相同。
- 原版完整tooltip/GL加法混合与fader逐像素等价本轮不承诺；SVG保留源码几何和各状态，CSS过渡/闪烁明确为Web呈现近似。
- 同一既有personnel场景追加静止、阈值、超20、无油/normal/hyper、修正、未同步、只读及私有HTTP→UI→帧更新断言，一轮类型/lint/场景；截图检查原位置。只后台无头，不新增测试工程、不提交发布。

## 已落地
- OriginalNativeLogisticsHud 私有投影新增 currentBurn / burnLimits / fuelUse；NativeBurnHud接入NativeCampaignApp现有HUD，燃料日耗位于燃料条右侧，航速位于下一行。仅显示权威已提交速度，不把目标点当成已移动。
- getTravelSpeed仅更新脱离权威的浅拷贝；stat未sync时最大航速/耗油未知，独立真实速度仍可显示。原版空舰队Float.MAX_VALUE burn边界保持float溢出/Java round语义。没有账户或global playerFleet切换，没有开放自动世界。
- 原版字体副本字节一致：insignia21LTaa.fnt SHA256 7a2f9be74905b305c1edb8afa50c40d438ff5e5d9af2f76676b51d283b49eecb；insignia21LTaa_0.png SHA256 e45e15dfb92512f9a12f41d31b9b876c211e9d1d54619df8c27fdfe76639a432。字体加载沿用native-menu，不改资源清单。
- 第一轮类型检查、9文件lint均退出0；场景首次停在新增断言对循环舰队图使用JSON.stringify，而非业务失败。改成现有allowCycles checkpoint编码后的字符串比较，避免deepEqual巨图输出；仅重跑同一场景和测试文件lint，未跑全套。

## 最终验收
- 类型检查和9文件lint通过；循环图断言修复后的测试文件lint通过。同一既有personnel场景复验1通过0失败，84653.7898ms（总85229.7224ms），没有全套测试。
- 数值覆盖：原版航速阈值21/22、显示上限999、10样本迟滞、最大航速加成/扣减/归零、燃料停用/耗尽/速度<10/20航速耗油上限/隐藏倍率、dynamic默认不写入、未同步统计未知。
- 真实SQLite→认证HTTP→完整NativeCampaignApp：显示本舰长58,580，另一舰长1,234,567不泄露；原版航速字体已加载；20格及其中12格亮起确证。可信夹具提交实际host帧将速度12改成0，页面随revision3更新为0格亮起；没有用前端数据替换私有投影。此为帧事务夹具，不冒称正式自动航行。既有Worker/权限/回滚/个人探测音效仍通过，pageerror为空。
- 已实际查看1920×1080截图 artifacts/campaign-native-navigation-hud-1920.png 与 artifacts/campaign-native-navigation-hud-stopped-1920.png：原左下位置，速度数字及斜格无溢出，停止态超载惩罚标红。燃料55/25是夹具过载真实数据；背景黑是合成地点，非正式星区。UI本轮为compact，expanded沿用位置规则未另拍；没有同状态原版实机像素等价结论。
- 日耗数值各分支已核对，实际页面此次验证的是正常空间---分支；未冒称耗油动画或动态世界已完成。
- 未改readyForAuthority=false / simulation.status=unavailable，未操作桌面、未使用子代理、未暂存/提交/推送/打包/发布。完整tooltip、精确GL/Fader、正式开局/自动世界/多人独立上下文及普通货舱/舰队页面仍需继续。
