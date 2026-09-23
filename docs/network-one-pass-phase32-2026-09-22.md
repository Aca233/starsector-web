# Phase32：单遍解码 + 原生 DTO 恢复，默认接线完成（2026-09-22）

## 状态与边界

这是**第一层底层替换**，不是全世界实体复制/权威架构重写已经完成，也没有达成完整状态稳定60Hz的目标。本轮不降低Hz/精度，不删屏外信息，不改预测、命中、权威归属或玩法；无生涯改动、子代理、提交、推送、发布或可见桌面启动。

- 默认二进制完整快照改走单遍校验/解析，不再正常情况下扫描整包两次；LAN与Steam共用入口。
- 共用LanBattle实际调用启用`nativeProjection`，用键数组直接恢复普通DTO字段，替代每字段临时`[key,value]`二元数组的分配；每个字段仍恢复，源帧不是共享的可写引擎状态。
- 模组/泛用调用默认仍保留原Object.entries读序，不能靠原型推断Proxy/访问器不存在。新选项只用于本机拥有的原生引擎和普通网络DTO。
- relay投影保留原先完整结构校验；非法/特殊UTF8数据退回原验证器，保留错误优先级/错误类型/字符串规则，不以放宽输入验证换性能。
- 大数组随实际解析增长，小数组最多预分配256项；深度、字节、map65536及累计槽位预算都有边界。DataView数值读使用内建越界检查，字节/字符串读显式检查。
- SWF2已有固定标签使用经过ABI核对的直接构造，容器层级/槽位照常计入，不是绕过校验或新协议。
- Phase31实体胶囊仍未启用；未开启serializer Worker、低频visual或GNS新路线。

## 完整同源对照，不只看某个函数

22舰固定轨迹；每对30tick预热+120tick实测；3与5个顺序离线接收副本，分别A/B及B/A。物理模拟在计时外；计入完整capture/encode/真实ordered-motion-byte-delta/deflate6/N个inflate+decode+apply。包字节、增量字节、压缩后字节逐包完全相同，完整恢复结果对照原实现。

| 副本数 / 顺序 | 旧管线P50 ms | 新管线P50 ms | 总CPU降低 | P95比值 |
|---|---:|---:|---:|---:|
| 3 / A→B | 28.8762 | 26.7465 | 7.38% | 0.886 |
| 3 / B→A | 27.6961 | 25.6534 | 7.38% | 0.787 |
| 5 / A→B | 41.8288 | 37.8086 | 9.61% | 0.933 |
| 5 / B→A | 41.2779 | 37.2295 | 9.81% | 0.922 |

全部通过预设门槛：每对P50至少改善5%，P95不恶化超过10%，压缩wire不增加。解码部分约快17–20%。**这是发送端加全部离线副本的累计CPU成本，不是网络RTT降幅、单个玩家帧耗时或真实多人Hz。**

前三个仅改解析器的版本未全过总成本门槛，负结果保留在benchmark、benchmark-native-bounds、benchmark-native-tags。没有为最终结果改变阈值；之后新增了明确的DTO恢复分配替换，再测完整组合。单独某项改动的全管线贡献不能从组合数字拆出。

## 默认流程实际验证

同一台机器、隔离无头Chromium、WebGL/D3D11 RTX5060、22舰、15秒测量窗口。真实LanBattle、host Worker、局域网服务和每客机独立桌面桥接；不是纯传输模型。冻结587个非生涯源码文件；本轮核心源码与测试候选完全相同，冻结后漂移清单见validation.json。

| 本机人数 | 主机物理模拟Hz | 客机完整状态Hz | 客机运动更新Hz | 客机画面FPS |
|---|---:|---:|---:|---:|
| 3 | 59.90 | 42 | 60 | 约60 |
| 5 | 60.01 | 28–31 | 54–58 | 44.5–48.4 |

- 两轮均无连接/运行错误，开火、炮塔/本地弹丸预测活动断言通过。
- 房主主线程阻塞800ms时，客机ACK在阻塞窗口内继续推进。
- 两轮断线重连均恢复到同一场战斗。
- 3人客机测得状态年龄P95约20.5–24.9ms，输入确认P95约60.8–67.9ms；5人状态年龄P95约28.8–79.2ms，输入确认P95约82.7–100.2ms。这些是loopback本机各应用层指标，不是实网Steam/n2nRTT。
- 未进行浏览器同场景旧/新成对A/B，因此不能把与Phase30不同时间的浏览器结果差异全部归因于本轮改动；因果性能依据是上面的同源离线管线对照。

### 仍然没有60Hz的缺口
本次5人采样已出现“主机物理模拟约60Hz，但完整快照生成约27–35Hz、上传速率接近生成速率”的窗口，客机完整状态也约28–31Hz。至少在本机测试中，缺口在进入传输前就存在；不能靠仅换Steam/UDP或多做客机预测把完整状态补成60Hz。

主机采样中simulation P50约9.49ms、capture P50约4.286ms、encode P50约1.899ms，且有更高尾延迟。各指标采样/平滑口径不同，不能机械相加成某一帧预算。后续须针对主机模拟+捕获/编码的调度及真正变化登记继续对照；本轮只削减接收侧重复工作，未声称这就是所有实网卡顿的唯一原因。

## 正确性、回归与可复现性

- 新解析器9组差分测试通过：256tags/截断/随机畸形输入/深度/危险键/重复键/UTF8/数字边界/偏移视图/所有权/固定标签路径；120个原生战斗状态必须直接单遍成功，不能用兼容fallback冒充。
- 新DTO恢复4组测试通过：嵌套标签、稀疏字段、容器/向量复用与修复、泛用getter/Proxy读取顺序、批量回调/重置/错误前缀、危险键/深度。
- network:check通过（各测试块合计635）；network:check:shared通过（120）；steam:check的342项通过。这些计数按Node各测试块摘要相加；Steam测试包含模型与本地SDK绑定，不是Valve实网验证。
- TypeScript、定向lint与修改文件diff whitespace检查通过。
- 原codec与原CombatSnapshot精确源码压缩保存在测试专用one-pass-reference.mjs，SHA校验；不依赖git HEAD或临时工作区，也不以近似实现作对照。
- 检查命令：node scripts/check-one-pass-snapshot.mjs；node scripts/check-native-dto-restore.mjs；node scripts/benchmark-one-pass-snapshot.mjs。

## 本地构建已更新，而不是只改源码

新增`node scripts/build-local-battle.mjs`：基于当前Vite配置，只编译index.html战斗/联机入口，拒绝campaign模块，保留已有静态输出，不生成安装包或发布版。

已生成构建 **2026-09-21T16:21:20.999Z**（北京时间9月22日00:21）。无头生产静态页面烟测通过，前端/后台build一致，主入口`assets/main-snF7RTgi.js`，页面无JS异常，菜单包含局域网/Steam联机。没有启动或重启用户的可见桌面窗口；既有安装版/自动更新未发布。

## 证据

`artifacts/network-stream-20260921/phase32/`内：
- validation.json / benchmark-combined/result.json / pair-*.json / source.json
- portable-correctness.log / portable-dto.log / network-regression.log / shared-regression.log / steam-regression.log
- frozen.json / browser-3/result.json / browser-5/result.json / 对应逐条样本与host-load
- local-build.log / built-smoke.json

完整生产构建源清单另见artifacts/local-latest-build.json。实施前原版来源和门槛见network-one-pass-phase32-source-notes-2026-09-21.md。

### 并行改动说明
冻结浏览器验收之后，检测到其他任务的两个AI文件变化：`src/engine/ai/AcquisitionSpatialGrid.ts`、`src/engine/ai/FireControlQueryBatch.ts`。未覆盖或回退它们。本轮三个生产接线位置仍与被测候选一致；本地最新构建可能包含比冻结浏览器测试更新的AI内容，不能把冻结的3/5人数据当作这两个最新AI改动也已完成浏览器性能验收。
