# 生产呈现Worker入口/消费桥：修改前边界（2026-09-25）

原版0.98a-RC8：重新读取本机settings.json:8–9与CombatEntityAPI.java:16–50；状态权威和模拟频率不变。本轮是Web线程接线，无原版Worker网络等价物。无桌面/键鼠许可，不作新原版实机/UI等价声明。

当前FrameLoop仅由实验Worker调用；LanConnection已有明确owner/epoch、异步receipt及有界state/motion/combat通道，但没有可由实际页面直接创建的生产Worker入口与客户端。首先连接这一缺口：原始bytes/string→生产Worker原解码/恢复/预测/自主RAF→小UI/read模型和声音/输入ACK摘要，禁止恢复world回传。不复制仿制LanConnection/parser。

- 启动先查询Worker原生RAF/Offscreen支持，再不可逆transfer canvas；无支持时拒绝，调用方保留原canvas选主线程。启动超时/坏消息/失败销毁Worker，禁止无确认自动切换两个绘制owner。
- 通过既有claimBinaryState领取生产二进制/组件；必须在post前同步defer，Worker retain和主线程同步保留声音/ACK后才complete；UI消费另有one-in-flight回执，不耦合网络额度。过期owner/epoch不得授权，重置撤销排队配置、RPC和旧UI能力。
- 数值viewport/控制更新latest-only且一个在途；成功发送的输入才显式recordAcceptedInput。时间戳跨realm用performance.timeOrigin+now转换，不把主线程relative now当Worker时钟。UI复用现有codec、命令客户端/owner和afterRevision屏障。
- 首包资源加载与RAF生命周期使用现有Runtime/FrameLoop；停机、隐藏、context loss/reconnect、不支持环境、坏帧/回执错误必须fail-closed。禁止新增gl.finish到生产循环。
- 此步不立即改变默认LanBattle；完整页面还需接入所有输入/音频/视觉组件、本地主机/Canvas回退。网络原始包目前仍经LanConnection所在主线程转投，不能声称主线程阻塞期间仍连续收取/ACK网络；直接socket Worker→呈现Worker尚需单独处理控制顺序和终局屏障，不能跳过来冒充完成。

验收扩展既有Offscreen headless场景，使用真实LanConnection、socket I/O Worker、生产呈现Worker、WebGL/资产与UI端口，不再借测试Worker的自制raw-retain命令作为该新路径。验证多个真实快照/组件、数据不泄漏到默认订阅者、ACK顺序与终局/重连、配置合并/输入记录、地图UI回执、资源关闭。仅做一次集中类型检查、改动文件lint和相关场景，失败定向修复。未进行配对延迟测量前不宣称性能提升。不提交/发布/打包，不改版本，不覆盖生涯和此前优化。
