# LAN 共享控制邮箱验收（2026-09-25）

## 结论

完成主线程→呈现Worker的144字节最新控制邮箱。运行中的普通键鼠/缩放/视口更新不再等待主线程处理`controls-applied`；图形偏好和可见性唤醒保持有界消息，动作与网络回执不进入邮箱。实验开关仍默认关闭，消息回退仍可用。

本轮同一既有联机场景的先导对照表明：主线程忙时，**DOM按键事件→实际绘制采样该按键后的WebGL提交**p95从99.84ms降到23.57ms（约76.4%）。这不是屏幕/input-to-photon延迟，也不是模拟速度提高76.4%。普通窗口没有明确收益；忙窗口的绘制连续性本来已由Offscreen Worker改善，本轮主要去掉控制传输的ACK依赖。

## 改动与边界

- `LanPresentationControlMailbox.ts`：144-byte SAB，主线程唯一写者。Float64通过Int32原子字+版本锁保存，有限4次读取，不等待/无限自旋；不携带动作队列、网络ACK或世界数据。
- `LanPresentationWorkerClient.ts`：共享模式直接发布latest；普通更新不会排队等待唤醒ACK。失焦/屏蔽/隐藏及pointer失活使用累积撤销计数，快速撤销→恢复不会仅因latest覆盖就丢失清理依据。stop/reset/dispose撤销，stop后的configure不能重新激活。
- `lan-presentation.worker.ts`：每帧和同会话命令前读取；代际/sync只由显式reset消息授予。读取失败不使用旧活动状态绘制或分流处理；下一帧重读。图形设置仍变化时才发送。
- `LanPresentationWorkerProtocol.ts`：初始化携带控制SAB，新增有界`controls-wake`及诊断计数；竞争时唤醒回执能要求重试。
- 不改主机物理/火控算法、模拟Hz、画质或实体数量；不放松碰撞预测保护、权限、发送准入及消费信用。DOM事件若尚未被主线程处理，该邮箱也无法提前获取它；隐藏→显示仍依赖唤醒消息。

## 验证设置与源码

既有`scripts/check-normal-multiplayer-browser.mjs`，无头、两客户端（真实host Worker + LanBattle guest）、22舰、seed917、完整样式1280×720、RTX5060 / ANGLE D3D11、loopback。开启layered sync/critical combat/presentation Worker。

每臂10秒：前5秒普通，后5秒每250ms通过隔离页面DOM交替W/S，并在事件之后执行70ms主线程任务；每窗口20个输入。Worker内记录实际成功draw及采样key mask，只在计时结束取回记录，没有逐帧诊断IPC。

冻结图：before674模块、current675模块，3个已有生产文件改变+1个新文件，671个已有模块不变；最终675模块hash全部匹配磁盘。类型CompilerHost冻结对照before0、after0、新增0；改动文件oxlint退出0；diff whitespace检查无错误。campaign等未冻结内容共享读取，不能把这一对照冒充干净发布工作树。

最终验收目录：
- `artifacts/lan-presentation-controls-20260925/before-shared/`
- `artifacts/lan-presentation-controls-20260925/shared-recheck/`
- `artifacts/lan-presentation-controls-20260925/messages/`

各臂`errors=[]`、`failures=[]`、`cleanupCompleted=true`。完整配置、hash、定量数据见同目录`acceptance.json`、`source-changes.json`及各臂`presentation-submit-raw.json`/`presentation-submit.json`。

## 计时结果

| 模式 | 普通控制→提交p95 | 忙时控制→提交p95 | 忙时帧间隔p95 | 忙窗口draw数 |
|---|---:|---:|---:|---:|
| 修改前shared | 18.20ms | 99.84ms | 26.30ms | 295 |
| 新shared | 19.80ms | 23.57ms | 24.64ms | 299 |
| 新messages回退 | 19.60ms | 92.82ms | 24.59ms | 296 |

全部窗口40/40个控制事件均被对应实际活动draw采样。但**采样新键不等于一定已表现为运动预测**：碰撞等保护会停预测。忙窗口有预测帧的事件分别仅5/20、6/20、2/20；其余明确保留删失原因，不填0。新shared忙窗口预测延迟最大值仍达178.91ms。因此不能拿控制通道的23.57ms说所有动作/画面响应都达到这一水平。

单次顺序先导，不是ABBA、逐tick同画面或长期p99证据；不含GPU完成、合成器、显示扫描、真实网络抖动及不同机器。messages是测试变换强制传输回退，不是真正关闭跨源隔离后的浏览器能力探测。保留默认关闭，不据此默认启用。

## 同一场景的计时后安全验证

新增探针仅在新shared计时之后安装，不改变上述计时输入负载。

1. **原子一致性**：独立测试Worker与主线程通过真实邮箱并发读写30000个相关字段样本；1178个不同revision被读取，其中1177个在写入尚未结束时观察到。最终revision30000，相关字段错误0。相同revision返回false、错误generation返回null、持有奇数锁有限读取返回null、显式撤销返回null均通过。高写入压力下45319次读竞争返回null是允许的有界失败，不是成功采样，也不证明吞吐。测试Worker的启动闸门等待/有界循环只在测试，生产没有阻塞等待。
2. **真实唤醒ACK扣留**：实际Worker的一份`controls-applied`被暂缓交给客户端，不伪造回执。400次configure后再阻塞主线程70.075ms：控制IPC发送数3→3，SAB发布871→1271；一份ACK仍在途且无排队唤醒。实时frame800→804、zoom0.65→1.399，忙窗口内4次真正活动draw都已采样keys2。证明不是等主线程释放ACK以后才更新。
3. **短暂撤销**：同一任务中focus/block/pointer撤销后立即恢复，Worker诊断中revocations和pointerRevocations均0→1；latest没有吞掉清理依据。这是计数/应用路径验证，不冒充整套持续开火玩法验收。
4. **隐藏恢复**：强制控制visible=false后主线程立刻读null；隐藏期间Worker实际draw记录819→819。恢复后得到新帧823；无OS窗口切换。
5. **真实重连**：guest实际socket.close触发恢复；代际3→11、HUD状态tick857→941，同一match，实时新帧tick946且新会话计数归零。
6. **真实释放**：清理时等待Worker的disposed回执，residentTextures=0、pendingUploads=0，客户端phase=closed且readRealtime=null；不是只假定unmount已释放。
7. **messages/JSON回退**：真实relay输出65个JSON状态，连续流generation11保持、tick889→941、ACK554→579；56次控制消息不重发未改图形偏好；实际修改/恢复screenShake均通过。暂时缺坐标150ms期间待发武器组动作序号595不前进，恢复后动作恰好发送一次并获权威ACK/HUD确认。再接收12个真实binary状态，generation12、tick998、ACK606。

快速hide/show同时扣住唤醒ACK，以及生产读取竞争引起`applied=false`的重试，没有单独强制注入；代码有保护，但不把尚未诱发的分支列为实测通过。

## 保留失败与复查说明

首轮`shared/`完成计时后在原子探针失败：用JSON.stringify直接比较对象，错误依赖属性插入顺序。保存的8个样本通过独立deepStrictEqual复核，字段都符合各自revision公式（见`probe-failure-analysis.json`）。仅将测试比较改成递归键排序，lint定向复查；生产冻结图未变。随后只重跑失败的新shared臂并完成原计划messages臂。首轮失败工件保留，不冒充通过，也不挑它较低的21.47ms作为最终结果。

原版证据与预期边界见`docs/lan-presentation-controls-source-notes-2026-09-25.md`。没有原版实机UI验证；保留所有已有WIP，版本0.2.11，不暂存/提交/打包/发布、不修改安装游戏。
