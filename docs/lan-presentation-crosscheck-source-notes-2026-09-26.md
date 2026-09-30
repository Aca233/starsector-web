# LAN 呈现交叉对照：修改前方案（2026-09-26）

## 核实范围

已重新读取当前 LanBattle：键盘边沿立即 sendInput/pushControls；共享控制邮箱已移除 ordinary controls 对主线程 ACK 的依赖。2026-09-25 的 controls 验收已完成，不重复实现。原版只读核实 settings.json 的 vsync=true/fps=60，CombatEntityAPI.java:8–13 的位置、速度、朝向接口。本轮仅修改测试工具，不变更玩法、UI、正式调度、校验或默认开关。没有原版实机验证。

## 测量语义

同一个实际 LanBattle/Host Worker/relay/DesktopLanBridge/WebGL 场景；在渲染所有者本地记录完成 draw 的时间，只在结束取回，不增加每帧 IPC。补充 DOM→传输接受、主线程观察到累计 ACK、实际绘制使用的权威累计 ACK 的时间。ACK 覆盖 seq 可能由更新输入覆盖，不能证明每个边沿都被单独模拟。采样按键且 prediction.active 也只代表预测未被安全门阻止，不等于像素变化或显示扫描。缺失、碰撞保护、不发送、超时必须保留，不填零。

## 预写固定方案

工件目录 artifacts/lan-presentation-crosscheck-20260926，已存 before 原字节和完整非生涯源码图。固定 main/shared/shared/main 四臂串行，每臂30秒，前半普通、后半每250ms真实隔离页面DOM键盘事件后忙70ms。2端、20AI、seed917、完整样式1280×720、D3D11。保留既有800ms主机停顿及同局重连断言；不并发性能测试。每对恢复 main/shared 角色后求相对差，再等权汇总；不跨臂拼接原始样本挑收益。

详细性能/覆盖门槛见 protocol.json，运行后不修改门槛。预测覆盖不足或正常延迟/确认/吞吐退化则不能宣称全面响应改善，不据此默认启用。统计工具添加缺失和跨窗口/累计确认的合同测试，集中一次 lint/既有 measurement 合同+真实场景；仅mjs工具变更不重跑全项目TS。保留所有WIP，不提交/推送/打包/发布。
