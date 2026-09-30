# LAN 接收/渲染 owner 自主帧循环：修改前边界（2026-09-25）

- 原版0.98a-RC8：重新读取 settings.json:8–9（vsync与60 FPS），CombatEntityAPI.java:16–50（位置/速度/朝向/角速度/HP）；重新读取 starfarer_obf/com/fs/starfarer/combat/CombatState.java:694–703 及 O0OO.java:94–119（鼠标镜头偏移、跟随与缩放阈值）。本轮沿用已核实的Web算术/相机，不改变原版系数或模拟tick；原版没有该Web消息/Worker协议的等价物。
- 当前默认LanBattle是主线程Runtime；实验Worker由测试主线程逐次postMessage请求draw，不是自主渲染时钟。已有raw ingress、motion/combat消费回执和UI小图保留原样。本轮补生产级同realm RAF循环，由Worker本地时钟持续执行原恢复→同步gate→pose/当前aim→camera→effects/WebGL阶段。不返回完整world，也不在每帧调用gl.finish。
- 生命周期：资源准备期间无RAF；最多一个待执行RAF；隐藏/context lost取消排程但不调用runtime.stop，不丢确认事件；恢复先等待资源；stop/reset/dispose撤销旧generation，迟到资源完成和已经取出的旧RAF不能再次画图。reset重置播放与输入预测，stop保留末端点；失败关闭owner并一次报告，不能继续坏帧。
- 不变量：原60Hz模拟、状态/效果数量、数字精度、坏包/资产校验、输入seq/action/budget、网络消费回执不变；dt保持默认LanBattle的0.05上限。readInput只在pose已应用更新通道后同步取值；同步gate在apply之后，允许撤销后续绘制。循环只接受同realm同步回调，不把网络send视作已消费。
- 验证：扩展既有Offscreen headless场景，真实Runtime/WebGL与显式旧阶段顺序对照；加入可控RAF/resource latch测试取消竞态，真实Worker本地RAF/主线程阻塞进度计数，以及context loss/restore与dispose。测试用诊断/像素不进入生产消息。不操作桌面或键鼠。
- 限制：这一步不是完整LanBattle Worker开关，也不完成音频、全部host快照、UI/输入跨线程控制plane或Canvas回退。默认路径不切换；本轮只能证明自主调度/隔离和当前覆盖，不声称输入到画面或FPS性能改善。不暂存、提交、发布、打包，0.2.11不变；保留所有旧WIP。
