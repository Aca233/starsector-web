# 飞行按键保留修复验收（2026-09-26）

## 实际保留的生产修复

唯一生产改动：`src/network/LanBattle.tsx` 的keydown飞行键准入。操控权限、当前呈现视图仍有效时，允许先记住不涉及离散命令的飞行按键；一次临时 `readRealtime()` 失败不再直接丢掉held边沿。真正发送仍要通过原来的新鲜坐标、发送预算、连接状态和准入；没有造aim、消耗空输入序号或绕过权威ACK。动作、射击、指针检查未改；默认呈现Worker仍关闭。

这是**消除丢键条件的正确性/响应可靠性修复**，没有新的吞吐或端到端提速百分比。普通主线程路径原先也不依赖remote坐标，新的条件在该路径不放宽权限。

## 前后真实反例

工件：`artifacts/lan-flight-edge-retention-20260926`。相同704模块冻结图，before→after仅LanBattle.tsx变化；最终704模块与after图一致。测试只在既有 `check-normal-multiplayer-browser.mjs` 中启用，不创建替代模拟器。

每臂：真实LanBattle/Host Worker/relay/DesktopLanBridge/Offscreen Worker、2端、20AI、seed917、完整1280×720、D3D11、10秒既有计时窗口；**故障注入在计时之后**。本次10秒数据不和前轮30秒ABBA混用，不作为新性能A/B。

| 检查 | before（baseline-recheck） | after（fixed） |
|---|---|---|
| 实际DOM按下W时临时坐标不可读 | 未接受事件，keys=0 | 接受事件，keys=1 |
| 持续不可读约150ms | seq735→735，无待发按键 | seq765→765，保留keys1，未虚构发送 |
| 恢复坐标 | 不会自行恢复丢失按下边沿 | 实际发送seq766/keys1，权威累计ACK达770 |
| 实际draw | 本项before只复现丢键，不伪称绘制通过 | 恢复后实际活动draw采样keys1 |
| 不可读期间按下S又松开 | 不纳入旧版验收 | keys2→0；恢复后只发送keys0，无按键复活 |
| 文本输入焦点 | 不纳入旧版验收 | 飞行键未接受，keys0 |

实际draw的motion prediction仍因collision保护被阻止，报告 `predicted=false`；没有关闭保护以制造“运动已响应”的证据。累计ACK覆盖可以来自更新样本，不证明seq766一定单独经历了一个物理tick。`readRealtime()`强制null证明代码中的丢键条件；前一轮自然发生的两次缺失没有捕获拒绝理由，不能追溯断言必然是seqlock竞争。

## 集中验收

- `tsc -b --pretty false` 退出0；生产文件及测试helper oxlint `--deny-warnings` 退出0；diff whitespace无错误（仅已有CRLF提示）。未重复全项目检查。
- 两臂最终真实场景：errors=[]、failures=[]、cleanupCompleted=true。
- 原有800ms主机主线程停顿期间发布/访客ACK进展、同一battle主机重连通过。
- 共享邮箱原子测试：各30000写入，最终revision30000；before833/after832个相异读取，分别831/831个并发读取，相关字段错误0。不是性能吞吐结论。
- 扣留真实controls-applied后400次发布/忙任务期间Worker继续采样、撤销计数、隐藏/恢复、访客重连等既有检查均通过。
- 实际disposed回执：两臂residentTextures=0、pendingUploads=0，client.closed且实时读取null。

### 一次环境失败与定向复查

第一次baseline在加载protocol模块时浏览器报 `net::ERR_NO_BUFFER_SPACE`，还未开始测量/故障注入。完整失败日志及cleanupCompleted=true保留在 `baseline/`；没有归因于生产逻辑或删除失败数据。只读检查当时TCP状态没有证明持续端口耗尽，也没有关闭用户/其它任务进程。仅重试失败baseline到`baseline-recheck/`，随后按原计划执行fixed；均成功。未重跑ABBA或静态全套。

## 复现

使用本目录`run-checks.mjs`中的明确环境配置；复跑应使用新工件目录，原始日志不覆盖。关键开关为 `MULTIPLAYER_CONTROL_MAILBOX_CHECK=true`、`MULTIPLAYER_FLIGHT_READ_UNAVAILABLE_CHECK=baseline|fixed`；基线与修复分别指定before/after冻结图。原场景的停顿/重连/原子检查仍启用。

原版来源与预期见source-notes；没有原版实机UI验证。没有修改原版安装、降低频率/精度/实体或效果、修改默认开关、暂存、提交、推送、打包或发布。其余任务的打包/更新/舰船开发修改完整保留。
