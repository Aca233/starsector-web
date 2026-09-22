# Phase35：客机恢复成本实验（2026-09-22）

## 结论先行

**进展是可复现的候选、完整正确性验证及更清楚的性能边界；不是联机优化目标完成。**

- Chromium同状态对照：客机应用P50改善约11–14%，捕获/编码/解码/应用CPU合计改善约5–8%。
- Node含真实delta/压缩的长对照：应用改善约13–16%，合计改善4.26–6.16%，有一对未过预设的5%门槛。
- 真实5人AB/BA：候选没有稳定改善输入确认、完整Hz或FPS，多项反而更低；场景/测量窗口也不完全一致，不能把这些差异都归因于候选。
- **所以生产 `src/network/CombatSnapshot.ts` 保持原样**，没有加入默认开关或未使用的生产快路径，没有发布/推送/重建安装版。候选只归档在测试模块。

## 候选内容与边界

1. 显式nativeProjection路径中，标量覆盖前不再读取无用旧值；普通路径保留getter/Proxy的旧读取顺序。
2. 常见Vector2走短恢复路径，仍保留标记优先级、深度与坐标验证、稀疏数组的索引存在行为、旧向量identity和set调用。
3. 字段字典只复用**完整逐键匹配的已验证序列**。最多128个桶、每桶最多128个键，缓存持有冻结副本而非输入数组；未命中仍做原来的完整重复/禁用字段/长度检查。不缓存可变实体值，不跳过端点或目标字段。

这不是改变协议、删数据、量化、降Hz或跨帧共享实体。它只适用于已有“本机非Proxy实体+普通解码DTO，无自定义accessors”的原生契约，泛型路径未变。

## 正确性

6组功能测试通过（最终426ms）：

- 嵌套tag/typed/map/set、稀疏更新、被本地改过的值、对象identity。
- 普通getter/Proxy读取与写入顺序。
- 多端点回调、插值reset与中途错误的已应用前缀。
- 深度/禁用键、混合marker优先级、无效/稀疏坐标及自定义Vector2.set调用。
- 字段字典缓存的输入修改、同前缀同长度碰撞、160次淘汰、0/128/129/2048/2049键边界。

整个真实世界编码、实际有序motion delta和压缩包字节全部比较，恢复后的完整世界也进行对照。脚本lint通过。没有以此冒充生产全量回归——生产代码未改。

## Node完整管线：同源且共用生产者

22舰真实交火，3/5顺序接收副本，A/B和B/A，30预热+360实测。公共源码来自 `before.json`。两臂共用**同一个捕获函数及codec实例**，只切换接收应用函数；不是旧git HEAD对照，也没有撤回Phase32/33成果。

|副本/顺序|应用P50变化|完整管线P50变化|完整管线P95变化|
|---|---:|---:|---:|
|3 A/B|−15.60%|−6.16%|−3.61%|
|3 B/A|−12.91%|**−4.26%**|−5.21%|
|5 A/B|−13.24%|−5.62%|−7.20%|
|5 B/A|−14.18%|−5.00%|−9.64%|

`benchmark-shared-producer/result.json` 的overall gate是 **false**，不四舍五入成通过。所有包字节一致、全部四对权威轨迹hash一致。这是CPU管线，不是网络RTT；3/5是离线副本，不是物理电脑。

三个前置结果目录 `benchmark`、`benchmark-leaf`、`benchmark-layout` 保留：分别是标量、追加向量、追加字典的候选。它们为两臂使用了两个源码相同的捕获函数实例，出现了不应归因于接收端的capture差异。最终判断使用共用生产者的长对照，未拿早期好数字替代它。

## Chromium同状态管线

180实测+60预热；3/5顺序副本，两种顺序。两个分支仍共用同一生产者，计入捕获、编码、全部接收者的完整解码和应用；不含delta、压缩、传输与渲染。权威字节每tick相等，恢复世界每30tick及结尾比较。

|副本/顺序|应用P50变化|合计P50变化|合计P95变化|
|---|---:|---:|---:|
|3 A/B|−13.68%|−7.93%|−11.20%|
|3 B/A|−11.28%|−5.28%|−5.12%|
|5 A/B|−12.94%|−8.41%|−10.27%|
|5 B/A|−12.49%|−7.16%|−7.87%|

该层的5%/10%门槛四对均通过，但没有把它等同于端到端降延迟。

## 实际5人路径：不能宣称变快

同一GPU电脑、1280×720、D3D11、真实LanBattle/host Worker/desktop helper；两个冻结图只差候选所在的CombatSnapshot模块。开火、运动预测、确认弹体、800ms主机画面阻塞期间输入确认推进、同局断线重连：4个子测试均exit0、错误0。

|顺序/版本|物理Hz|客机完整Hz|客机关键Hz|客机FPS|客机输入确认P95|
|---|---:|---:|---:|---:|---:|
|A/B 原版|59.90|35–36|51–53|35.6–40.6|92–110ms|
|A/B 候选|59.88|31–33|52–53|32.9–36.8|83–98ms|
|B/A 候选|59.84|33–35|54–58|40.6–46.9|94–103ms|
|B/A 原版|59.97|49–51|56–59|48.4–54.2|79–86ms|

**没有稳定的整体改善，不能把一次输入P95下降算成结论。**不是Steam/n2n/多物理机验证。测量场景还存在重要混杂：

- authority已经在“全部viewer加载完成”前推进；本次起始tick为229/287/216/221。
- 输入/瞄准按墙钟计时；权威轨迹并不完全相同。
- 旧脚本在计时窗内等待截图；A/B候选实际测量19473ms，其余约15192–15559ms，不能都按名义15秒理解。记录的真实窗口没有伪造。
- 主机模拟中位约2.89–9.04ms；弹体约105–135。候选只改恢复，却测到不同的权威负载，必须先控制比较条件，不能靠再调一项参数解释掉。

下一步应首先改善**真实联机对照的可比性**：加载阶段测试专用hold、相同模拟阶段开始、受控输入/记录回放、把截图放在计时窗外；保留现有真实功能/阻塞/重连断言。这不会改生产调度或通过删债务提高Hz。验证范围仍必须区分固定接收回放与完整可交互联机。

## 对照守卫的范围修正

四个浏览器子测试通过，但外层原始runner最后exit1：它扫描了整个server目录，检测到并行工作的两份 `server/campaign/native/NativeCampaignRuntime.*` 修改。原始失败日志及漂移记录未改成绿色。

新工具 `scripts/lib/battle-server-inputs.mjs` 用esbuild只解析实际Node侧战斗依赖（不运行它们、不输出bundle），连同harness/helper/package清单做哈希；实测61个文件，包含以前漏掉的Node实际使用的 `src/network/BinarySnapshot.mjs` 等，无campaign依赖。缺文件/内容变更仍失败，若战斗图意外导入campaign直接拒绝，而不是全局关掉守卫。此修正不使旧性能对照自动有效；即使排除无关漂移，本轮也不满足整体改善要求。

浏览器/离线公共图冻结后另有 `TacticalWorld.ts`、`ThreatAssessment.ts`、`CombatEngine.ts` 变化。未覆盖它们，不能声称验证过这些后来的最新改动。

## 文件与复现

- 证据根：`artifacts/network-stream-20260922/phase35/`。
- `validation-summary.json`：Node/Chromium/实际5人结果、窗口、分阶段耗时、漂移。
- `browser-pairs.json`、各 `browser-5-*/`：原始完整结果、样本、图片、负载。
- `scripts/lib/receiver-fields-reference.mjs` / `receiver-fields-experiment.mjs`：SHA校验的前后源码，仅供测试，生产不导入。

```powershell
node scripts/check-receiver-fields.mjs
$env:RECEIVER_FIELDS_FROZEN='artifacts/network-stream-20260922/phase35/before.json'
$env:RECEIVER_FIELDS_OUT='artifacts/network-stream-20260922/phase35/new-node-run'
$env:RECEIVER_FIELDS_SAMPLES='360'
node scripts/benchmark-receiver-fields.mjs
# Chromium需要已有Playwright运行时；使用新目录，禁止覆盖旧结果。
$env:RECEIVER_FIELDS_CHROMIUM_OUT='artifacts/network-stream-20260922/phase35/new-chromium-run'
node scripts/benchmark-receiver-fields-chromium.mjs
```

不指定冻结图会用当前公共源码，仍为同源两臂，但不是本次历史测量。默认候选是仓库内归档的实验，**不是生产已启用的恢复器**。
