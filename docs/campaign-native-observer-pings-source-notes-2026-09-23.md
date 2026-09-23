# 观察者探测ping绘制与完整视觉生命周期（0.98a-RC8）

- 原版ActionIndicator.java:56–107：只在当前地点画；进度可反向，反向增长平方/正向开平方；最小半径与实体半径比较后上限10000；视口边界range+100；inFraction决定alpha，反向固定0.5；width×min(0.1+alpha曲线,1)。
- campaign/util/super.java:170–245,289–320：ActionIndicator强制走纹理渐变环（不使用细线分支或副色分段）；原纹理graphics/hud/line8x8.png；半径r-0.5/r+0.5/r连续三个QUAD_STRIP，前二alpha半值，外沿0/内沿alpha，圆周分段max(int(2πr/15),36)再×2，770/771混合。同一次glBegin的圈间连接也保留，不能自绘平滑CSS圈冒充。
- CampaignEngine.render:888–896：地点图层和普通指示器后绘制ping；advance时先已有ping，再地点contact产生新PingScript，再脚本阶段重复发ping。每次script最多一发，上轮已有源实现。
- 本地原版line8x8.png已查看；公共副本存在，需核对字节hash。此前用户原版截图证明航行HUD/星区布局，未显示完整探测ping动态；本批不能声称原版实机同状态逐帧等价，不操作桌面。
- 当前ScenePresentation产生个人探测effects却没有消费，NativeSceneCanvas也未画ping。本批让每个(viewId,observer,player)持有独立真实PingScript/ActionIndicator，按原顺序推进并输出原版GPU几何；恢复世界图按实体身份重绑，隐藏/移除/权限撤回清理，不能轮换全局playerFleet或消耗权威RNG。固定player势力颜色不能错用manager.playerFaction。
- 边界：沿用现有观察者视觉时钟（单次最多0.25秒，不推进世界）；正式世界暂停/快进耦合尚待宿主时钟。音效intent保留，浏览器播放及canonical世界脚本ping向每位观察者披露不在本轮冒充完成。
- 验证：一个既有native personnel场景中的纯几何/隔离/重绑断言，以及已有真实Worker/HTTP/Vite无头页面；在1920×1080实际探测ring出现时截图，核对纹理字节、GPU无错和页面可继续导航。一次集中类型/lint/场景。

## 实现与本轮验收

- OriginalCampaignPingDraw 已按原版ActionIndicator与_super生成GPU四边形：渐变三环、原分段数、连续条带接缝、半值/全值alpha、770/771混合与真实line8x8.png。公共副本与原资源逐字节一致，SHA256=60b5444d9f1126312f257bd4a21f11752cc5dd36198e67539a571a0a020abfb2。
- NativeScenePresentation每个私有view维护自己的pings/pingScripts，消费实际contact结果，已有环→新contact→重复脚本→最终ping图层。对恢复后的同身份对象重绑，不重置生命周期；隐藏/移除/撤权清理，渲染不改world/RNG。修正固定player势力颜色读取，缺数据明确失败，不回退到manager.playerFaction。
- NativeSceneFrame增加pings图层，NativeSceneCanvas用现有WebGL renderer真正绘制；data-scene-revision/ping-count只在GPU帧完成后更新，清屏时移除。没有另画CSS圆圈或替换原HUD。
- 源码数值断言：明确输入下半径150/宽14/alpha212，1504顶点（含两处条带连接），反向平方半径与颜色override通过；独立观察者实际探测→淡出→重发现产生原版ping，重绑更新位置但保留场景ID，另一舰长不继承、隐藏后清除、权威checkpoint不变。
- 无头UI：同线程真实SQLite拥有者+认证HTTP+Vite+完整NativeCampaignApp；新合成世界用可信帧事务设置测试目标位置，实际探测规则决定何时丢失/重发现，没有伪造scene响应或注入圆环。页面出现实际GPU圆环，GL无错、pageerror为空；之后画面点击导航产生真实revision3回执。已有同一场景的Worker/重启/回滚断言继续通过；不将本UIfacade说成Worker写帧RPC。
- 已查看artifacts/campaign-native-observer-ping-1920.png：1920×1080右侧匿名接触周围可见原版纹理渐变环；夹具没有背景，是明确的功能验收图，不是完整星区或原版实机像素等价证明。截图参考原图不包含该动态完整过程，仍待许可后原版同状态实机对照。
- 一次集中tsc通过、6个改动代码/声明文件lint零警告；一个既有native personnel场景1通过0失败，151212.4698ms（总152497.6504ms），未跑全套、未失败重跑。日志artifacts/campaign-native-observer-pings-{types,lint,scenario}.log。末尾源码复查修正“真正null颜色→原版灰色”和“缺失undefined颜色→拒绝”混淆，仅做该颜色分支定向检查及3文件lint，通过，日志artifacts/campaign-native-observer-pings-palette.log；不重跑整场景。
- 未完成：浏览器实际音频、正式世界暂停/快进与观察者时钟耦合、非contact来源的canonical世界ping按每位观察者披露、默认其余经理/NPC/完整自动世界。公开limitations明确标注campaign-audio-unavailable和canonical-world-pings-unavailable。readyForAuthority=false / simulation.status=unavailable保留。
- 无子代理；所有本轮后台验收正常退出；未操作桌面、未暂存/提交/推送/打包/发布。
