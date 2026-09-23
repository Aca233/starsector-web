# 生涯真实存档经济输入进展（2026-09-20）

## 本轮实际推进

从只含两个市场的组合夹具转向本机原版存档的真实经济输入。新增离线只读适配器 `scripts/lib/campaign-native-save.mjs` 与显式CLI `scripts/capture-campaign-native-save.mjs`（及类型声明），不启动游戏、不执行存档类、不写原版存档。原版先行证据见 `campaign-save-economy-native-audit-2026-09-20.md`。

- 按根世界的 Economy → ReachEconomy → markets 引用链提取注册名单；不能用全文件第一个 market 或任意星球条件市场代替它。保留市场和商品原生顺序。
- XStream z/ref按全文件对象身份解析，支持前向引用和市场/商品回链；同类商品指向同一MarketDemand。保留真正的需求类对象，而不是为蓝龙虾复制一套独立需求。
- 保存Java float精度、modifier顺序和临时修改器计时。保存的modified单独标注为缓存，不冒充readResolve后的权威值。
- 存档中的商品库存、持久化需求/greed、贸易修正、市场stat和产业配置可被提取；缺失的产业供需/收支、网络对象和价格calculator明确标为待恢复，不填零或构造虚假价格。
- 输出保留未解码对象的引用位置及插件扩展字段名，不声称已恢复其状态。未实例化的商品也不会自动补成“已存在且数值为零”的市场商品。
- 拒绝DTD/实体声明、悬空/重复身份、非法数据/深度、异主市场引用、版本/压缩格式不匹配及当前启用mod。XML中的文本/类名只作数据，绝不作为命令运行。
- CLI只允许把捕获写到项目内被Git忽略的artifacts，拒绝输出到输入存档目录、源码目录、链接/非文件；写出前重读核对输入未变化，UTF-8解码保持原始字节哈希。使用项目现有开发工具链中的sax；没有修改共享package.json、锁文件或发布配置。

## 原版实存档结果（私有细节只在本机artifacts）

| 内容 | 数量 |
| --- | ---: |
| 注册市场 | 65 |
| 已实例化商品状态 | 870 |
| 共享需求类对象 | 1170 |
| 产业 | 346 |
| 保存前被清理、需post-save恢复的产业 | 346 |
| 商品临时修改器 | 17 |

捕获为0.98a-RC8未压缩、无启用mod的本机保存态。原版源码12个文件的SHA-256记录在本地capture的formatEvidence，源campaign与descriptor各有内容哈希。工具前后比较及随后独立核对均未改动源文件。私有输入及报告分别存放在 `artifacts/native-save-economy-capture.json`、`artifacts/native-save-economy-report.json`，git check-ignore确认两者被忽略，不加入测试夹具或发布资源。

**关键发现**：BaseIndustry.doPreSaveCleanup主动清掉supply/demand/income/upkeep；CoreLifecyclePluginImpl在读档/保存后先重建再reapply。读取文件不等于原版加载完成，更不等于可以开始交易。当前capture始终readyForAuthority=false，没有安装进Corvus世界、没有发布market snapshot、没有改变用户存档或默认规则锁。

## 对下一步的具体约束

真实产业中尚未覆盖的商品插件有48个实例，分为：lightindustry 16、refining 12、orbitalworks 8、fuelprod 5、commerce 4、lionsguard 1、cryosanctum 1、techmining 1。另有13个条件ID尚未被当前环境适配器识别，完整清单在本地报告。并非所有条件都必然有经济效果，需要源码确认后分类，不能一律跳过或套默认hazard。

下一步优先补四类实际生产产业的原版回调，再补其余插件/条件以及真实管理员、监听器与逐getter依赖，随后执行原版post-save恢复顺序、全组网络、月账和权威发布。不能只给已支持的Corvus局部市场盖“全组完成”标记。保存态采集不是Web存档转换器，也不是可玩生涯功能。

## 本轮验收

- 新增6项只读适配器测试：注册名单/共享对象、float与计时、恢复缺口、恶意/损坏XML、非法版本/引用/插件类、CLI路径和原文件不变；专项通过。
- 全campaign回归：647项，642通过，0失败，5项既有可选探针跳过，见 `artifacts/campaign-native-save-regression.log`。
- 严格campaign类型与全tsc-b：均exit 0，见 `artifacts/campaign-native-save-types.log`。
- 6个实现/声明/测试文件定向oxlint：exit 0，见 `artifacts/campaign-native-save-lint.log`。不声称旧契约文件或全仓库lint无警告。
- 暂存区为空；tracked diff --check通过。未暂存、提交、推送、打包或发布，保留无关引擎/网络/桌面/发布修改。

仍未进行原版实机或Web同状态UI验收；用户继续使用电脑，不操作窗口、键鼠，不使用子代理。完整生涯（原版UI、势力/自创势力、殖民地、任务/战斗及独立/合作流程）仍未完成，目标保持进行中。


### 2026-09-20后续：已执行产业storage初始化，不等于完整恢复

新增只读adapter已从本地capture初始化346产业storage并保留真实持久化bonus（225个产业有非空flat supplyBonus）。输出为独立私有草稿；原capture保持不变，65市场仍需真实conditions/admin/industries重应用及网络/库存恢复。readyForAuthority仍false。详见campaign-industry-storage-restore-progress-2026-09-20.md。
