# 分层同步 Phase 8：带独立时钟的关键战斗组件

日期：2026-09-21。原版依据见 `network-critical-combat-source-notes-2026-09-21.md`。**目标仍未完成。本阶段未提交、推送、发布，未改生涯模式，未操作桌面或网络配置。**

## 不是改一个 Hz 数字

现在有四种不同负载：60Hz 权威物理/输入、独立 motion 姿态、独立关键战斗组件、完整世界/弹体显示。它们的实际接收率、数据年龄和渲染 FPS 不能混为一谈。

旧世界快照在弱带宽下落后数秒，即使 motion 超过 50Hz，HP/幅能/护盾仍来自那个旧世界。新实现将以下**现有权威值**抽为 SCC1 组件：
- 舰体 HP、CR、死亡/撤退；
- 软/硬幅能、容量、过载标志/剩余/总时长、排散/进度、零幅能加速标志；
- 护盾开启/弧度/朝向/关闭淡出计时/锁定/等待开启；相位枚举、effect level 和阶段计时。

没有预测伤害、调用 toggle/overload/death 方法、执行 guest AI/碰撞或产生声音/事件。源引擎固定路径读取，不遍历完整对象图，不创建未知实体；最多 128 艘资本舰、32768B 原始组件。超出支持范围整体回退，不悄悄删舰。

## 时钟与传输所有权

- dedicated Worker 独立 mailbox，每次最多一条等待精确 tick 归还；完整 snapshot IPC 被扣留也继续工作。按绝对 50ms deadline 推进，避免 `now-last >= 50` 的采样边界抖动把实际 20Hz 压成 16–17Hz。错 tick 不释放，关闭 demand 停产，不补发历史队列。
- 浏览器只保留最新一份完整组件。在每次完整恢复后、渲染前，若组件 tick 更新，重写这些受控字段；相同/更新完整快照优先。不会因短暂断流自动把新 HP/死亡回退成旧快照值。切换 match/sync 清理组件，未知 ID 不能创建舰船。
- SCL1 是可靠有序 helper WS 字节压缩层，不是另一个模拟/应用基线。全包与 XOR 均无损、CRC 和 SCC1 复验；记录 tick、base tick/CRC、match/sync。每端最多一个原始字节基准，每次发布最多两个不同基准 XOR 编码，共享相同基准结果。helper 还原普通 JSON+base64 SCC1 给浏览器。
- 只在 socket 准入后提交压缩基准；浏览器消费 credit 与压缩基准分离。发送失败/跳过不会改变基准，reset generation 也会废弃尚未提交的 null-base choice。CRC/解压/时钟错误不污染旧基准；关闭可选通道保留完整世界回退。
- 每客机最多 16KiB、房间最多 32KiB 的未消费线缆字节；按干净 RTT 的 20Hz BDP 限制 2–6 个条目，轮换接收顺序。只有精确数字 tick + match/sync + 合法 consumed/discarded 收据释放对应债务，不累积确认，不提前 ACK。
- 重同步/关房退休组件但不抹掉债务。旧 scope helper 包仅可 discarded 原债务，不能建立新字节基准或授予新组件时钟。真实 primary 拆除才 abandon。上一房间仍有债务的端点不能无条件再占一份预算。
- 持久日志区分 criticalCombat tick/Hz/age、wire full/delta、wireBytes、保留/基准字节、inflight、consumed/discarded/abandoned；不输出内容、scope 或身份。

## 启用范围

两项都显式打开才协商：

```
VITE_LAN_LAYERED_SYNC=true
VITE_LAN_CRITICAL_COMBAT=true
```

**都不是生产默认。** 新组件仅 dedicated LAN authority + 新 helper/control/motion-wire 协商成功后启用；浏览器房主/直连旧 helper/Steam 不获得新能力，也不能上传权威组件。保留现有完整世界断流/重新同步保护，不能拿新组件假装全世界已经及时。

## 性能证据与失败尝试

工件：`artifacts/network-stream-20260921/`。22 舰录制；各 guest 独立 Node 进程；真实 WS/TCP、一个 FIFO 4Mbps 下行、60ms RTT、5 人（4 个远程接收者），30 秒、去前三秒。**没有真实游戏应用/渲染、n2n、Steam、丢包；input echo 不是 input-to-photon。**

| 指标 | 本轮无新组件参考 | 初版组件（全量压缩） | 最终组件（无损 XOR） |
|---|---:|---:|---:|
| motion 接收 Hz | 51.96–52.15 | 48.78–49.15 | 50.81–51.19 |
| 组件接收 Hz | 无（依赖旧世界） | 20 | 20 |
| 组件 age P95 | 不适用 | 88.8–90.1ms | 82.3–83.2ms |
| 组件房间 wireBytes / 30s | 0 | 1,777,148 | 912,616 |
| 最差完整世界 age P95 | 3098ms | 3237ms | 3149ms |
| 最差合成 input echo P95 | 123.8ms | 130.9ms | 125.8ms |

文件分别为 `layered-phase8-reference-isolated30s.json`、`layered-phase8-combat-isolated30s.json`、`layered-phase8-combat-delta30s.json`。初版占带宽令其他更新退化，因此未保留只发完整压缩组件的策略；最终每次仍保留完整包回退。最后一次 2400 包中 2368 XOR、32 full；该通道字节量约减 48.6%，峰值未消费 6156B。单次顺序试验不构成严谨的多次统计显著性证明。

先前 `layered-phase8-combat-matrix.json` 为**初版组件** 3/4/5 人 x 4/32Mbps 的 10 秒矩阵，部分与回归测试同时运行且发送调度随后修正；不能冒充最终实现的受控性能对比，只作探索记录。

真实生产 authority Worker 单独跑 22 舰、12 秒、完整抓取消费延迟 200ms、motion+combat 同时启用：
- `worker-combat-phase8-final.json`：物理 60.04Hz；完整抓取约4.69Hz；motion 717帧，combat 241帧；无 errors/recoveries。
- Worker CPU 6234ms（含启动）不是 guest FPS，也不包含网络、helper、应用/渲染成本。
- 较早 `worker-combat-phase8.json` 只有198个组件，暴露50ms判断漂移；绝对deadline修改后重跑得到上述241，不隐藏旧结果。

## 验证

- `network-gate-phase8-final.log`：**363/363**（包含新组件14项、3/4/5个真实 helper、权限、scope/损坏回退、日志与真实 Worker mailbox）。
- `native-capture-phase8.log`：**12/12**；含原生 Web authority 源不被 capture 修改、完整恢复不能覆盖更新关键字段、负零/相位/淡出 getter 对照、未知ID不生成实体。
- `tsc-phase8-final.log`：app TSC 成功；`lint-phase8-final.log`：本次相关源码 focused oxlint 成功。
- `webgl-phase8.log`：实际无头 WebGL 弹体/标识烟测成功，pageErrors 为空；**这不是新关键组件的原版实机 UI/像素验收**。
- Worker-only bundle 检查没有 campaign 输入；仅后台测试构建，不是发布包。

## 仍阻止完成的事项

1. 五人弱网完整世界仍约三秒陈旧，现有1500ms世界断流保护仍可能触发重同步；没有通过扩大超时/伪造 ACK 掩盖。
2. 武器/系统、装甲格、crafts、光束、雷、残骸/爆炸/音效、部署/目标列表仍依赖完整世界。死亡标志及时不等于死亡爆炸和所有武器状态也及时。
3. 应建立有时钟/引用依赖的其余组件及稳定 roster/baseline 机制，测真实 native apply+render 后再决定完整世界的降级与活性条件；统一带宽调度必须证明各类进度，不能只增窗口。
4. Steam 路径尚未接入这些 helper 通道；历史 experimental Sockets 两个未通过用例未被本次修改解决。真实 n2n/Steam 多人机器实测仍欠缺。

因此保留独立实验开关，**不将局部组件改善包装成“彻底解决延迟/客机60Hz”。**
