# LAN 客户端快照还原 CPU：2026-09-18

## 最终状态：只保留已验证的 roster 优化

原先 Chrome 测得 **25%–31%** 的 fast-fields 候选已撤回。虽然线上 JSON/binary 与原生实例回放一致，该候选把 `Object.entries` 改为逐值读/写并跳过标量旧值读取，改变实际模组 getter / setter / Proxy 的可观察顺序。不能以该组数字宣称当前源码的收益。

当前整个 generic `unpackRecord` / `unpack` 段已恢复至修改前文本；不绕过旧字段 getter，也不引入逐对象形状、descriptor 或 Proxy 检测。原实验报告与输出保存在 ignored `artifacts/lan-restore-cpu-local/rejected-fast-fields-report.md`、`rejected-fast-fields.txt`、`formal-ab.json`、`chrome-ab.json`，仅作被否决实验记录。

## 当前范围

本轮只改 `src/network/CombatSnapshot.ts` 的 apply 路径及其专用 helper。不改 pack/capture、协议、更新率、精度、舰船数量、Ship/Vector2/组件身份或 prototype，也不覆盖并行 host/LanBattle、codec、火控改动。

- 原整文件：`artifacts/lan-restore-cpu-local/baseline.txt`。
- 当前候选：同目录 `candidate.txt` / `roster-candidate.txt`。
- 一次 apply 内复用 capital roster 与成员 Set；只对原生 Engine/roster getter 启用。一次调用检查 4 个 roster getter 身份，不在逐字段/逐舰路径添加复杂保护。
- 为未改写的 `findHostile` 传入本次最终 active roster，避免逐舰重建同一列表。仍调用现有目标选择逻辑，不缓存目标/敌友/可见性结果。
- 定制 `findHostile` 每艘船只读取一次；保持原 receiver、原单参数调用。普通覆盖、getter 返回函数、Proxy 函数、子类覆盖均不被绕过。
- 定制 roster getter、Engine 子类走原 roster 查询路径。这里只保证实际 hook / getter 合约，不宣称能识别浏览器中所有伪装成原生实例的恶意 Proxy/monkeypatch。
- 无跨帧 roster 缓存；动态 craft、部署及下一帧 roster 重新读取。

诊断通过 stdin/内存执行，构建产物与 JSON 均放 ignored artifacts；未新增项目测试文件、runner 或 npm 脚本。

## 短检查

- 原候选的 1,125 项断言覆盖 JSON/binary、深度与错误边界、容器/实例复用、动态 craft/capital 增删、投射物 ID 重排/插入删除的插值、乱序与重连、reserve→deployed、模块引用。相关输出仍保留，但不冒充当前修订版的完整重跑。
- 当前修订新增 19 项 getter/Proxy/定制 engine 差分：named/record/array 在 depth 0/63/64/65 的读取/写入/异常日志一致；定制 targeting 四种形式、own/prototype roster getter 以及子类路径一致。
- 以完整文本比较确认 generic unpack 已恢复基线；保留原 `Object.entries` 的先读齐值后操作目标语义。
- 单文件 oxlint 通过。未占用并行性能窗口跑全工作区 typecheck/build，统一集成验证交主代理。

证据：`artifacts/lan-restore-cpu-local/getter-proxy-roster-correctness.json` 与 `roster-validation.mjs`。

## 最终 roster-only A/B：保留

火控明确退出后，单独占用 20–40 秒窗口完成；结束立即通过任务消息归还主代理，独立 Chrome 与临时本地服务器已关闭，不追加实验。

- 同一冻结依赖图（现成 capture harness 的 `artifacts/lan-compute-baseline-2026-09-18.json`），只替换 CombatSnapshot；共用 Engine/Ship/Vector2 类型，各自独立创建真实 `createLanWorld`。pack/capture、codec 均相同。
- 使用已经真实 fixedUpdate 演进的 8/100 舰、tick 600/1200 fixture，不重跑长模拟。包含 8 舰 49–86 发、100 舰 524–547 发投射物；100 舰 tick 1200 有 9 艘已毁 root 舰船。
- Chrome 152 headless 主线程，cross-origin isolated。JSON.parse / binary decode、创建世界、capture/比较均在计时之外。预热 15 对，4 轮各 30 对，AB/BA 顺序交替，每格 120 对；重复已演进帧时 tick 单调增长，保留连续插值路径。
- 本次 **304 项断言** 全通过：8 个世界/codec 场景，各自验证正常、连续、乱序、重复 tick、显式 reset 后的完整投影、target ID、Ship/Vector2/组件/数组身份，以及每个计时轮次结束后的完整投影与 target ID。加此前当前源码的 19 项 hook/getter/Proxy 差分，共 323 项修订版检查。

单位 ms；正数表示候选中位耗时下降，负数表示回退：

| 舰船 | tick | 输入 | median 前→后 | mean 前→后 | p95 前→后 | median 下降 |
|---|---:|---|---:|---:|---:|---:|
| 8 | 600 | json | 0.645 → 0.655 | 0.671 → 0.666 | 0.915 → 0.790 | -1.6% |
| 8 | 600 | binary | 0.770 → 0.740 | 0.795 → 0.758 | 1.000 → 0.970 | 3.9% |
| 8 | 1200 | json | 0.650 → 0.630 | 0.673 → 0.640 | 0.965 → 0.815 | 3.1% |
| 8 | 1200 | binary | 0.810 → 0.770 | 0.839 → 0.778 | 1.060 → 0.920 | 4.9% |
| 100 | 600 | json | 5.555 → 4.865 | 5.802 → 5.076 | 7.255 → 6.380 | 12.4% |
| 100 | 600 | binary | 7.340 → 6.730 | 7.636 → 7.010 | 9.430 → 9.360 | 8.3% |
| 100 | 1200 | json | 6.190 → 5.750 | 6.319 → 5.815 | 7.090 → 6.760 | 7.1% |
| 100 | 1200 | binary | 7.775 → 7.215 | 7.862 → 7.295 | 8.805 → 8.085 | 7.2% |

**保留依据**：100 舰四组条件的 median 下降 **7.1%–12.4%**，四组各四轮（16 个分轮）中位数全部同向，均值/p95 也改善。8 舰收益小且混合，其中 tick 600 JSON 的 median 回退 1.6%（约 0.010 ms，各轮也为轻微回退），不能宣称小规模稳定提速。没有为了追求小常数继续扩展保护或加场景阈值。

最终证据：

- `artifacts/lan-restore-cpu-local/roster-chrome-final.json`：最终候选逐样本、四轮统计、UA、断言数量与源码 hash。
- `artifacts/lan-restore-cpu-local/getter-proxy-roster-correctness.json`：当前源码的原始 getter/Proxy/callback 日志差分。
- `artifacts/lan-restore-cpu-local/roster-validation.mjs`：同一冻结图的 baseline/candidate 诊断构建。
- `artifacts/lan-restore-cpu-local/browser-fixtures.json`：真实演进帧与完整 match。

最终源码 SHA-256：`a0cea301d3c49df9e2aa37cc74ad7998863b7e3310228b3a296f58a348a90537`。修改前整文件 SHA-256：`fccbb915a6047d3ce837fc440816142b0ac67c9a7beac5ccccf6d284e6443468`。

## 局限与集成

这不是 Worker + WebGL 或真实网络端到端 FPS 测量。它隔离了 apply，不含 decode、host fixedUpdate、渲染和传输，不能混入另一代理 codec 的收益。headless 配对重放使用真实演进后的帧，但并未同时渲染或继续模拟；主代理另做生产构建完整链路验收。

full workspace typecheck/build 由主代理在统一冻结图完成；这里单文件 lint、诊断构建/执行、diff 范围检查通过。没有更改更新率、精度或舰船规模。早期包含 fast-fields 的 `chrome-ab.json` / `formal-ab.json` 永远不是当前候选的最终证据。
