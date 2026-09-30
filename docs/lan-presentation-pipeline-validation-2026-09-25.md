# LAN 显示流水线共用化：验证结果（2026-09-25）

## 本轮实际接入
`LanPresentationPipeline` 不只服务测试：**默认 LanBattle 已使用它**，与 Offscreen `LanPresentationRuntime` 共用逐端点恢复、关键/运动/弹体分流合成、局部运动/炮塔预测和尾迹/炮口/粒子/弹道/开火效果处理。

这仍不是把默认联机换到Worker：相机、输入、网络同步、ACK、HUD、音频及默认RAF/renderer位置没有迁移。未改物理、AI、伤害、武器、效果数量或频率。下一步是有界UI投影和生产Worker通信/调度，而非长期维护一份省略逻辑的测试renderer。

## 顺序与所有权
- 默认组件仍保留原控制器对象别名，用于接收、重同步、暂停和诊断；不是新建重复的预测实例。
- `applyEndpoints` 的每个原恢复器afterApply回调，先执行原tick/Hz记录，再用对应端点的本舰姿态和ACK更新预测，不把多个ACK套到最后一个姿态。
- 同步过期/恢复检查仍在端点恢复之后、姿态合成之前；相机跟随仍在姿态合成之后、本地特效之前。
- 无效焦点/碰撞时保持原运动分流姿态，仍调用原suspend逻辑；fire prediction的250ms新鲜度门槛和所有原保护不变。
- Runtime增加`receive/applyPlayback/renderPose/drawPlayback/resetPlayback`。调用者仍须处理同步epoch/minTick、入站credit和收包安全检查，不能把这几个方法当作完整网络协议。
- Runtime在receive阶段保留每个被接受的炮口事件窗口，而不是只接收播放队列最后留下的两个端点；同tick/倒退帧仍由原SnapshotPlayback拒绝。
- 生产源码相对本轮前冻结只有3个文件变化：LanBattle、LanPresentationRuntime和新LanPresentationPipeline。清单/哈希在本轮artifacts的source-changes.json。

## 无头像素/Worker验证
沿用上轮的battle batching浏览器场景，新增可选`OFFSCREEN_PIPELINE_CHECK=true`。数据仍是22艘真舰、真实编码快照、4组普通战斗+8组1320伤痕/过载/残骸场景。

对照不是把新流水线在两端都跑一遍：测试oracle从修改前冻结的LanBattle原语句提取（原文件SHA256 `6acd1a71caf57a3caf3bc75d0a401b367fbcf7c246598abba245475d344f8dbe`），只将UI/计时闭包换成参数。冻结DOM和当前DOM跑原顺序，Worker跑生产新流水线及真实SnapshotPlayback。

- D3D11 RTX5060：12组当前DOM、12组Worker与冻结原顺序完全像素一致。
- 主线程阻塞200ms时Worker仍完成12次处理/绘制。
- DOM/Worker资源生命周期、迟到解码generation竞态、非法快照拒绝、dispose和真实GPU context恢复继续通过；受损图像恢复前后0差异。
- 首次测试oracle漏接原闭包中的alpha，报ReferenceError；补上`alpha=presentation.alpha`后通过。生产代码未为此改变。
- 本轮像素数据没有用户按键/鼠标操作，运动/炮塔/开火的主动操控边界不由这些图片证明；函数本体没改，但实际Worker主动操控验收仍待生产输入桥接。

## 默认真实联机与重连
现有 `check-normal-multiplayer-browser.mjs`，冻结前/当前各一次，2个真人席位+20个AI舰船，seed917，各15秒计量；真实LanConnection、host Worker、桌面网络helper和WebGL。纯无头，不操作桌面，steady/prediction/weapon/command-held/particle夹具均关闭，无输入事件注入。

| 指标 | 修改前 | 当前 |
| --- | ---: | ---: |
| 权威物理Hz | 59.950 | 59.926 |
| 主机FPS | 60.002 | 60.003 |
| 客机FPS | 58.067 | 58.067 |
| 主机输入回执P95(ms) | 76.264 | 67.567 |
| 客机输入回执P95(ms) | 49.798 | 51.513 |
| 15秒内权威tick推进 | 900 | 900 |

两次均无authority/browser错误、两端保持加载/连接，强制房主断连后恢复同一match继续推进，清理完成。当前中性输入条件下也实际执行了运动预测（两端737/607个renderedFrames）及确认弹道表现（453/421个renderedFrames）；没有主动炮塔操控/开火，所以不以0预测弹数量声称主动开火路径验收完成。分流combat/visual功能在此普通场景未协商开启，不能扩大为这些网络通道的完整验收。

**这是一轮行为/接线回归，不是性能提升证据。** 只有一次前后样本，主机回执变好、客机略变差，不能挑一项宣布加速；本轮没有改权威CPU算法或主线程/Worker分工。仍需完成输入/UI和网络桥接，才能测真正的输入到画面收益。

## 检查与证据
- `npm.cmd run typecheck`：通过。
- 改动生产/测试文件oxlint 1.82.0：通过。
- `artifacts/lan-presentation-pipeline-20260925/before-browser.json`：652模块冻结，SHA256 `e6356fa5bebd51a1e4a5752137a7e02e95bb97e6ab76d56e698ee8fd53c1e2a2`。
- `pixels/offscreen-result.json`：完整像素、计时和生命周期数据，pipeline=true。
- `lan-before/result.json`、`lan-after/result.json`：实际联机、重连与清理结果。
- 先前Offscreen基础验证仍见offscreen-presentation-validation-2026-09-25.md；它描述上一个阶段，这轮已改LanBattle内部共用代码，但默认线程拓扑仍未切换。

无原版桌面实机补验。未暂存/提交/推送/打包/发布；总体优化目标继续。
