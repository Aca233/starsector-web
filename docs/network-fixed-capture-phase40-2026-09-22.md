# Phase40：未通过的主机采集实验

不是新启用的性能功能。两种候选均保留为测试文件，生产CombatSnapshot与Phase40开始时完全相同。

1. 构建时固定字段读取，保留每帧Object.keys完整核对、Object.values原序和读取所有原字段；静态表来自同一22船实战。完整Chromium四对3/5顺序副本A/B、B/A未满足每对总P50至少降低5%的既定门槛。
2. 普通原生记录快速分类，精确Object.prototype后跳过重复instanceof检查；没有继承候选1。完整Chromium四对也未满足相同门槛。

两轮所有帧输出字节相同，每30tick恢复后完整世界一致；但等价不代表值得启用。采集阶段个别样本的改善没有稳定转化为总成本提升，故未接入实际房主，没有继续花时间做完整Node压缩流水线或多机Hz性能宣称。不得把未运行项目写成通过。

固定读取器源码从生产目录移到scripts/lib/native-record-readers-experiment.generated.ts；生成器/静态形状仅用于复现否决候选。原始Chromiumbundle、源SHA、原始样本均保留，后续修正显式control源路径记录与说明。首个shape采集脚本相对路径多一级导致构建失败，修正路径后采集成功；没有生产运行失败。unit与生成一致性等补验见验证清单。

精确比率见artifacts/network-stream-20260922/phase40/experiment-summary.json。未打包、发布或安装；不碰生涯。
