# 输入边沿触发一次即时呈现（2026-09-26）

## 依据及区别

上一轮LAN时间线确认快照恢复是慢帧来源，但再查历史发现：2026-09-25的validator标量递归分离、assertDataField guard重排已分别完整测量并否决。因此不再包装相似微改、重跑找好结果，也不盲启用具有捕获/可写定义成本的display-v2。针对恢复大任务另需结构性方案。

本候选改进已经存在且默认关闭的呈现Worker：共享邮箱虽然立即发布按键，但普通keys/firing变化不唤醒Worker；只在Worker自己的下一rAF采样。之前main/shared交叉对照证明Worker缓解主线程忙任务，但普通采样尾延迟回归超3ms，不能直接默认开启。本方案并非恢复被撤回的网络发送准入额度；不改网络队列、输入75/s预算、同步回执或主机模拟。

原版先行：本机0.98a武器配置amblaster.wpn与WeaponSpecAPI.java（setRarity等）再次核实可变定义边界；飞行操作遵循现有ShipCommand映射，未改键位、玩法、UI或精度。原版没有Web Worker调度层，原版实机未验证。

## 实现合同

1. keys/firing边沿只请求现有有界controls-wake通道：最多一条在途加一个最新待唤醒位。邮箱数据仍立即发布、不等待该ACK。频繁seq更新/指针移动不单独唤醒额外绘制。
2. Worker收到controls或controls-wake后，读取当前有效邮箱；只有当前输入与最近实际提交帧不同、视口/权限/新鲜同步/资源/可见性都有效，才在同一owner中提交一帧。若常规rAF已经采样，不再重复画；没有世代/同步/停机绕过。
3. 复用同一个完整frame流水线和已有rAF链，不创建轮询/第二条rAF，不跨线程复制世界。允许少量输入边沿额外帧（增加CPU/GPU工作换延迟，需实测），不删常规帧/特效、不新增模拟step。
4. 同一owner时钟不倒退：即时帧之后已排队的rAF时间戳可能较早，clamp到lastNow，避免播放/视觉dt重算；重入frame被拒绝。隐藏、上下文丢失、准备中、stop/reset/dispose不即时绘制。
5. 不默认开启呈现Worker。本候选若保留只改善现有opt-in Worker；恢复任务本身耗时也不会因此变短。

## 验证及预写门槛

集中typecheck、改动lint、既有真实WebGL FrameLoop/Worker合同；添加即时帧准备/重入/时钟/取消场景。真实双端20AI、seed917、D3D11、1280×720、shared呈现，before/after/after/before各20秒，无CPU/时间线/准入探针；同一完整冻结JS/JSON/52CSS+三个编译入口字节，保留800ms主机停顿/同局重连。

配对0→1、3→2，先恢复角色再等权汇总，不pool原始样本。每对普通控制到提交P95至少改善25%；忙时至少改善10%；普通/忙时累计ACK覆盖后draw P95、帧间隔P95回归不超过3ms；模拟Hz不退5%；发送/活动draw覆盖不比对应baseline少且至少95%，额外绘制帧数不超过baseline的1.3倍（此固定每秒4个输入场景）。所有断言、错误/资源释放通过才能保留。忙时测试是DOM合成任务而非硬件输入，WebGL提交不是scanout；不宣称原版/UI实机完成。失败精确回退三个生产文件，保留原数据，不放宽门槛。

## 首次性能启动失败（保留，不混入后续）

首个before在beginPresentationMeasure等待HUD允许操控时超时，尚未开始按键计时。真实主机在tick75触发worker-runtime持续过载/恢复失败，样本有对应battle-failed；不是候选测量回归，也不能算对照通过。保留1-before全部数据。附带cleanup因该早退从未安装controlClient而将undefined当null断言；定向修为只有真实安装了probe才核查probe释放，不掩盖原失败/不把exit1变0。

允许一次明确的冷启动重查：全四臂重新从before开始，源码/冻结样式/门槛与原组原字节相同；不混入旧臂、不挑速度数据。如果再次同类启动失败，停止测速定位启动链，不不断重跑。真实场景的其余断言不变。
