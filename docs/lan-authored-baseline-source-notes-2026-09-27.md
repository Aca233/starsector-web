# 三种自定义舰：联机目录与新性能基线（2026-09-27）

## 用户确认与范围

用户已确认以后续实际使用的烛渊、荣光女王、休伯利安三种自定义舰建立新基线。本轮先修复其联机目录/部署点连接，并使用现有无头联机场景采集一份新负载基线；不是性能候选ABBA，不与旧Hammerhead数据计算提升比例，不恢复已否决方案。

### 当前证据 → 行为 → 差异 → 验证

- content-selection.json和ModManager分别选择/注册web_zhuyuan、web_gloriana、web_sc2_hyperion。三包中已有部署点35、180、65，根纹理分别为web_zhuyuan/zhuyuan.png、web_gloriana/c.png、web_sc2_hyperion/hyperion.png；沿用包内中文名。
- 预期房间预设、人类默认舰体、AI准入、部署点预检均能识别这三种可独立部署的根舰体；舰载机/模块不能作为根舰体加入。
- 当前protocol.ships还是onslaught/paragon；server.aiHullIds来自空的generated/ships.json；room-deployment只查空的generated/deployment-costs.json。战斗端deploymentCost已优先读ShipSpec.deploymentPoints，因此这里是联机目录缺失，不是需要调整战斗数值。
- 将已有protocol.ships作为房间根舰目录，补齐三舰名称、部署点和根纹理。服务端AI准入与房间DP预检使用该目录；原本的报文限制、版本/构建握手、方案校验、队伍预算和战斗端规则不改。遗留DP数据仍只作既有路径回退。
- 用实际TypeScript舰体包与当前selection对照目录，另验证合法/非法AI、模块、部署点、真实relay启动match；不修改生成目录或并行内容包。

这些是用户已确认的Web原创/主题扩展，35/180/65不是原版平衡数值。不涉及原版玩法或UI重设计，不宣称原版实机/画面等价；本次不操作原版或桌面。

## 实现前固定的新基线条件

- 复用check-normal-multiplayer-browser：2玩家，20个AI根舰体，seed917，3200DP，D3D11，1280×720，main呈现，Worker呈现/v2默认关闭。
- 人类默认烛渊；AI按[web_zhuyuan,web_gloriana,web_sc2_hyperion]循环后均分两队。两队总DP均不超1600；根舰、模块、舰载机的实际数量需另记，不能把22根舰说成22实体。
- 20秒测量：普通10秒与输入后70ms主线程忙任务10秒，保留真实800ms主机停顿、ACK推进、同局重连和清理。
- 冻结本次源码/样式，Node共享JSON必须匹配浏览器，资源清单及被使用的资源字节记录校验和。若发生漂移或运行失败，保留失败，不作为有效新基线。
- 接收恢复阶段和CPU profiler本轮先不开，避免把插桩诊断当普通延迟基线。报告发送、ACK覆盖后draw、control→submit、帧间隔、模拟Hz；不是输入到光子。
- 完整实现后集中一次typecheck、改动lint、目录合同及上述一个既有浏览器场景。具体失败才定向处理；不为改善数据择优重跑。

本轮验收是新负载可用且证据完整，不是“已提速”。后续结构优化另行预注册门槛并做配对对照。

## 实现补充（测试前）

- relay `expectedShips` 与 CombatSnapshot.ships 统计的是部署根舰身份；附属模块在 assemblyShips，舰载机在 crafts。保留根舰严格数量校验，不把模块加入 expectedShips 来放宽协议。
- 新目录合同使用真实 ModManager 注册图，对照 selection、中文名、DP 和纹理；真实双客户端 relay 验证模块/舰载机/未知 AI 拒绝且房间不变、预算拦截、准备状态和 match 发布。
- 实体数在浏览器计时窗口外读取实际显示世界的根舰、模块、舰载机、后备状态；不在逐帧路径增加遍历，不用减少实体改善结果。

## 首次浏览器结果与定向诊断门槛

首次新负载实测已失败，保留在 baseline-1，不当作有效基线：176个实体已加载（22根舰/56模块/70战机/28轰炸机），尚未进入可操控计时窗口就触发主机过载保护。源码/样式/资源未漂移，资源响应均200。typecheck和改动lint通过；目录合同修正了Node测试环境、无变化分队不发回执、初始AI revision为0等夹具问题后通过，不改生产校验。

下一次仅作这次具体失败的启动诊断：使用同一份冻结源码、CSS、Node JSON、176实体及seed917；在权威Worker创建时开启CPU采样，记录第一次过载/中断，最长等待15秒。保留过载保护和原有所有工作，不降低数量/频率、不延长游戏超时、不替换模拟。诊断只在测试入口的只读Node加载钩子内提前开启已有CDP profiler并将cleanup时的profile写盘；不计作第二次性能基线、不据此计算提速。若失败不重现，仅报告不能重现，不选择性重跑。
