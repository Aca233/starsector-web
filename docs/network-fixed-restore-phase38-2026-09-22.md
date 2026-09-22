# Phase38：固定字段恢复，降低客机主线程CPU成本

## 结论与启用范围

保留这一轮为**已验证的恢复CPU成本优化**，不宣称已解决真实Steam/n2n RTT或五人稳定60Hz。已接入`CombatSnapshot.ts`已有的`nativeProjection`路径；默认`LanBattle`（LAN/Steam共享接收端）本来就传true，没有再加一个默认关闭的实验开关。任意外部调用/未识别布局完整回退原恢复器。

没有打包、安装或发布。本轮测试加载冻结的当前源码JS；复用了经源码哈希校验的旧构建CSS，不是运行旧JS来证明新代码。

## 做了什么

- 采样实际五人联机的客机主线程，完整恢复占17.45%，绘制占14.64%；房主物理约59.93Hz。不能把这个同机CPU采样解释为用户远端网络瓶颈已经证实。
- 通过构建时生成的固定属性读写，替代常见布局上的逐字段动态属性访问。31个有限已知布局；精确匹配字段和顺序才使用。
- 全量布局/身份/嵌套校验不减少；仍逐字段读取原值再写入，保持稀疏合并、原型、引用归属、异常前缀和每个插值端点回调。未知形状完整回退。无eval/new Function，无新增网络协议，无降低Hz或精度。
- 没有重新启用Phase35被否决的向量叶子/省略旧值读取/跨帧校验缓存实验。
- 生成源码约150KiB（gzip约9KiB，非最终bundle增量）；静态表来自本轮完整原生检查点，只是有限优化字典，不是允许网络控制代码生成。

生产文件：`src/network/CombatSnapshot.ts`、`src/network/NativeRecordRestore.generated.ts`。
生成器/数据：`scripts/generate-native-record-restorers.mjs`、`scripts/lib/native-restore-shapes.json`。

## 同轨迹CPU对照

所有旧断言保留，A/B和B/A均运行。权威数据、编码包和恢复后完整世界逐步/定期比较，不移除业务字段。

| 对照 | 完整恢复P50成本下降 | 全流程P50成本下降 | 门槛 |
|---|---:|---:|---|
| Chromium，3/5个顺序接收副本 | 18.7–20.4% | 9.9–12.5% | 四对均通过 |
| Node，含可靠增量及deflate/inflate | 18.8–20.2% | 5.4–8.1% | 四对均通过 |

Node原门槛：每对全流程P50至少下降5%、P95不恶化超过10%、线路字节不增长。不是挑最好的一对；传输字节完全相同。

这些是同数据离线流水线CPU成本，不是网络往返延迟/FPS。复用Phase35基准入口，原结果scope文本含旧实验介绍，**实际候选是RECEIVER_FIELDS_SOURCE指定且按SHA记录的本轮固定字段版本**；旧介绍不表示重新启用了Phase35候选。基准源图/包哈希和原始行均保留。

## 真实LAN验证及限制

`phase38/real2`：3人A/B、5人A/B、5人B/A，22艘舰，固定种子917；实际LanBattle、房主Worker、每客户端独立desktop helper、D3D11/WebGL、1280×720，持续操舰/开火。不含CPU profiler，不是远程Steam/n2n测试。

六个子运行均通过：预测与炮塔呈现、确认后持续开火、确认弹体飞行、800ms房主主线程阻塞期间Worker继续发布及客机ACK推进、同局重连、无游戏错误。三对的完整检查点1/61/121/421/721/1021均字节相同，整个区间有效输入变化（含fresh/online）也一致。

| 同机观测 | 之前 | 之后 |
|---|---|---|
| 3人，客机完整Hz（末统计） | 60/60 | 60/59 |
| 5人，A/B客机完整Hz | 56/53/55/53 | 48/48/47/46 |
| 5人，B/A客机完整Hz | 50/48/52/49 | 53/53/52/53 |
| 5人，A/B客机apply HUD样本P95 | 9.189ms | 6.963ms |
| 5人，B/A客机apply HUD样本P95 | 8.616ms | 7.223ms |

apply是每次呈现RAF的平滑耗时，不是每个快照调用的原始分布；Hz/FPS是同机多个窗口的观察。房主物理59.76–59.96Hz。机器CPU负载明显变化，但不能仅凭相关性断言谁导致变化。

**不能宣称五人Hz或RTT有稳定提升：正反顺序Hz一降一升。** 保留该实现的依据是四对完整流水线成本门槛全部通过、实际路径完整验收通过，以及两种顺序的恢复尾部观测均下降；不是把微基准提升直接换算成FPS。下一阶段仍需解决/隔离绘制与同机多窗口调度成本，并在远端实测。

### 负证据不抹掉

首对`phase38/real`两个浏览器子测试均通过，但三人完整世界在1021tick出现差异（之前五个检查点相同）。该对被比较器拒绝，未记作等价/性能通过。原记录没有连续有效输入审计，原因**未确定**，不擅自归因输入过期或编译器。

随后为测试夹具增加每物理步有效输入变化审计，只记录变化，不改输入、新鲜度500ms保护或模拟行为；比较器现在把该审计不一致也判为失败。加强后的六个运行全部通过。首对日志与差异仍在，不能通过删字段/放宽精度把它改为成功。

## 回归

219项Node测试通过：固定恢复39、开火预测110、炮塔8、运动14、弹体飞行32、流水线16。另有夹具检查、生成器一致性检查、完整tsconfig.app类型检查、项目实际使用的oxlint通过。最初误用ESLint因无配置退出2，记录保留；不是源码lint失败后隐藏错误。

所有实际测试的冻结源码与测试结束时的src逐文件一致；Node/server/helper/harness依赖哈希无漂移。未触碰生涯、未提交/推送/发布、未占用桌面。

证据根：`artifacts/network-stream-20260922/phase38/`。重点：`validation-summary.json`、`real-summary.json`、`real2/pairs.json`、`node-pipeline/result.json`、`chromium-pilot/chromium-receiver.json`。

## 重现入口

```powershell
node scripts/generate-native-record-restorers.mjs --check
node scripts/check-native-record-restore.mjs
# 实际对照拒绝覆盖旧证据；指定新的输出目录。
$env:NATIVE_RESTORE_OUT='artifacts/network-stream-20260922/phase38/another-run'
node scripts/check-native-record-restore-browser.mjs
```

Playwright使用本机已有NODE_PATH依赖。旧对照源码由已有的`receiver-fields-reference.mjs`提供，哈希固定；不要拿含有其他并发改动的不同源图互相比性能。
