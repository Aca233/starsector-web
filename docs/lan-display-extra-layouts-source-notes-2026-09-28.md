# 新展示布局静态恢复候选（2026-09-28）

上一轮已完成270帧参考/观察审计，13.3%字段覆盖不是猜测。依据冻结审计的热字段量选最多16个未命中且单项≥总字段1%的布局；选择结果在编码前保存，不从性能成绩挑形状。当前原生记录每次仍完整采样、编码、解码，不改发送路径。

原版依据同network-replica-apply / 本日ArmorGridAPI.java:11–36；网络中间恢复没有对应原版玩法算法。此候选不改玩法/UI、更新Hz、精度、字段、实体、回执、过载门槛或接收拒绝规则；原版实机不涉及且未验证。

仅在构建期生成有限的TS函数，不eval/Function，不编译网络提供代码。default-off VITE_LAN_EXTRA_DISPLAY_LAYOUTS。既有36个静态布局优先，额外表只在完整已校验keys数组精确匹配后选用。每字段执行原value读取→depth检查→assertDataField→eager previous读取→标量写/递归；省掉动态键索引，不跳校验、不缓存可变对象许可、未知/增删/重排键全部回退。

先备份DisplaySnapshotCodec；新增额外形状清单、可复现生成脚本与生成TS。冻结当前before/after/disabled和资源/依赖，保留其他任务的所有更改。完整正确性包含新增布局guard/read/write/异常顺序、方法/访问器、旧字段保留、嵌套对象身份、深度边界、增删改/重排回退、60步扰动真实host五段、权威/隐藏状态与receiver图。既有LAN display场景集中运行一次。

预登记唯一ABBA：150冷步+120热步，完整simulation/capture/encode/decode/apply；两对热改善各≥3%、冷回退各≤3%、init增量≤max(10ms,10%)。flags、来源、顺序见preregistration.json。失败精确撤回且不择优重测；离线过门槛后才进入后台生产式浏览器验收。Node不等于联机输入→画面延迟证据。

## 后续裁决
离线ABBA通过；生产式基线/候选均持续过载且输入测量未开始。候选保留默认关闭，不晋升、不声称联机已提速。完整证据见同日lan-display-extra-layouts-result文档；v1加载器目录前置错误与v2真实功能失败已分开归档。
