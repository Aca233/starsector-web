# 产业真实运行getter与安装物品捕获（2026-09-20）

## 已连接

- 新增 OriginalIndustryRuntime：按实际Java类名生成扰乱key，读取明确捕获的Memory值与有序到期列表，返回operating、improved、getExpire和getDisruptedDays。没有推进游戏时间，也不把wasDisrupted当成当前状态。
- Java Boolean/string转换、Java trim边界、负/零期限true标志、重复timer第一条及负零均已保留。当前无标志但有timer时，isDisrupted=false而getDisruptedDays仍可为正，遵循原版getter而非自行修正。
- 原版存档解析器解码Memory d/e与SpID i/d，按每个产业只投影相关扰乱key，不复制其它私人Memory内容。SpecialItemData保留对象引用、id和可空data，内容仅作数据。
- 商业中心用真实运行类TradeCenter生成扰乱key，保存别名仍严格要求TradeCenter2。
- 初始化草稿接入新getter/物品记录；老capture缺新字段时仍明确pending，不假装正常运行。已知没有安装物品的337个产业不再保留“未知物品状态”缺口；9个实际有物品的产业仍需真实效果执行。
- 来源记录从12增至14文件，新增原版Memory.java、SpecialItemData.java。原版源save的campaign/descriptor内容哈希与之前捕获一致。

## 真实存档只读验证

重新运行安全捕获器和storage适配：65市场、346产业全部得到真实getter投影；此保存时刻346产业均没有扰乱标志（不是通过wasDisrupted推测）；9个SpID解码成功。225个产业的持久化flat supplyBonus继续保留。

发现原版实存档确有1个fullerene_spool。它的 +0.3 access及环境要求已初查原版，但尚未移植到港口各阶段；不能把“物品ID读取完成”算作“效果已完成”。另外8件属于现已支持的两种nanoforge和synchrotron，但完整安装物品回调/管理员/市场恢复仍未执行。

仅更新被Git忽略的artifacts/native-save-economy-{capture,report}.json与native-save-industry-storage-{draft,report}.json。未修改源存档，没有可交易快照、网络缓存或库存发布；65市场真实重应用仍pending，readyForAuthority=false。

## 验证范围

- 定向串行回归 **24/24通过**：runtime8项、storage7项、native-save9项，约3秒。
- 新增 **152组原版Java Memory/BaseIndustry getter差分**，覆盖全部30产业身份；之前120组storage恢复对照同次通过。
- 严格campaign类型通过；本轮8个JS文件单线程lint零diagnostics。
- 日志：artifacts/campaign-industry-runtime-regression.log、campaign-industry-runtime-types.log、campaign-industry-runtime-lint.log、campaign-industry-runtime-real-capture.log。

完整Memory.advance（含require/实体引用恢复）、物品生命周期、管理员/技能/监听器、世界网络/库存/月结及联机/UI验收仍未完成。全生涯目标保持进行中。本轮未操作桌面，未启动可见程序、子代理、暂存/提交/推送/打包/发布。
