# 实时相机/瞄准通路：修改前证据与边界（2026-09-25）

原版 0.98a-RC8：重新读 settings.json:8–9 的 vsync/60fps，以及 CombatEntityAPI.java 的位置/速度/朝向接口。现有 Web 的 PlayerControls.clientToCombatWorldInViewport 是偏移/CSS缩放/高DPI坐标转换的唯一算术来源；LanPresentationControls 在同帧姿态和相机之后提供当前数值。无桌面权限，不作新原版实机交互或外观等价声明。

接入阻塞：现有生产 Worker 只每100ms发布 UI 状态，其中包含相机。若主线程发送真实输入时使用它，会人为引入最多一个HUD周期的瞄准陈旧；不能把完整世界搬回去来解决，也不能等每次输入的往返RPC。

实现每呈现帧发布少量标量的专用通路：优先固定大小 SharedArrayBuffer，单写者 + 版本锁 + Int32 原子字读写（不依赖撕裂 Float64）；读最多有限次，不自旋等待。无共享内存时是一份在途+最新一份的消息，UI无关、没有无界帧队列。切局采用客户端单调 generation，不能将新连接重复的epoch当成有效旧数据；隐藏/停止/context loss/失败撤销可读性。时间戳使用 timeOrigin 跨realm归一，陈旧样本不用于新输入。客户端提供只读采样和复用既有转换算术的输入构造，仍只在真实 send 成功后记录预测，不发送/消费动作。

不会默认开启整页Worker；实时通路必须先经撕裂/代际/有界回退及实际生产Worker场景证明。后续页面替换仍需命令/HUD、本地主机、JSON/错误回退、整场景与p95/p99对照。此步不能声称已测出实际延迟收益或SIM提升。完整实现后一次集中类型/lint/既有Offscreen场景，具体失败才定向复查。保留所有既有WIP和0.2.11，不提交/发布/打包。
