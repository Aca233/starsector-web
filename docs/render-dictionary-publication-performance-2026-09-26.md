# 武器显示字典同帧登记去重：性能验收（2026-09-26）

## 结论：否决并精确撤回

减少私有Map get/set没有转化为完整路径收益。唯一正式200舰配对中，编码均值增加3.45%，六个区间全部非改善；Host完整交付均值增加1.54%，P95增加1.74%，五个区间退化。因此不保留候选，不将操作数下降包装成加速，也不未经证据将退化归因于JIT或GC。

已按修改前原字节恢复唯一生产文件RenderWeaponDictionary及原render测试入口；专项辅助合同已归档至candidate目录。恢复后完整320模块与baseline一致，上一轮已接受的避碰扫掠边界预拒绝与原Encoder保持不变。没有恢复Git HEAD或覆盖其他任务改动。本轮没有留下新的生产提速。

## 候选及语义边界

详见render-dictionary-publication-source-notes-2026-09-26.md。私有Interned条目增加publication身份标记，begin/finish更新空token；每次project仍读取、校验全部原显示字段、颜色与MIRV数据，并进行原Object.is比较。仅在sample未改变且canonical条目已成功登记于本次live表时跳过重复字典get/set；标记只在live.set成功后写入。

源WeaponSpec仍可变，不按武器id缓存，不省略真实验证，不改变频率、精度、实体、协议或UI。共享此字典的experimental ShipDisplayLane不是默认LAN HUD/prediction通道。原版证据为本机0.98a-RC8 WeaponAPI.java:158、185、262的当前角度/位置/规格接口；Web字典无原版算法对应，未做原版实机/视觉验收。

## 集中正确性检查与定向修复

TypeScript退出0（9005ms），三处lint退出0（103ms）。首次专项合同被真实声音资源校验拒绝：测试没有初始化AssetManager，实际manifest中存在的burn_drive_activate.ogg未加载。原完整render场景当时尚未执行。

只修测试初始化：调用生产AssetManager.loadManifest加载实际public/game-assets/asset-manifest.json的数据URL，未mock validator、伪造资产或修改生产候选。保留首次失败日志及validation.json；定向补两份脚本lint和相关既有场景，不重跑typecheck。复查均退出0，完整原render场景506941断言通过。

专项59个分组断言比较4636次project的完整spec、canonical身份和存活大小轨迹；覆盖4类源getter/重入begin/finish/project及3类拒绝/恢复。错误恢复以旧实现为准，不承诺旧实现不存在的事务回滚。私有Map get由4771减至333，set由4636减至198；这是去重可达的操作数证据，不是性能百分比。

experimental ShipDisplayLane的24个包逐字节一致、18次解码及6次ACK一致，覆盖reset与跳帧。仅为相关合同，不代表真实LAN延迟或默认联机链路验收。

## 唯一正式性能配对

既有benchmark-real-workers --host-pipeline --serial-pair；200 Onslaught、seed917、dt=1/60，150预热+180测量；独立无头Edge153、16逻辑CPU、crossOriginIsolated。参考/旧/新按既有串行配对推进，无CPU/GC/阶段/字段计数插桩，没有重复抽样择优或删峰值。

完整冻结320模块，前后唯一生产差异是RenderWeaponDictionary；measured与candidate一致，测量后源/工具漂移均为空。两臂测量区间均为serial，workers/freshBatches/invalidated均0，没有改生产多核选择条件。

| 指标 | 旧均值ms | 新均值ms | 均值变化 | 旧P95ms | 新P95ms | P95变化 |
|---|---:|---:|---:|---:|---:|---:|
| 模拟 | 31.577 | 31.852 | +0.87% | 39.080 | 37.910 | -2.99% |
| 编码 | 15.923 | 16.472 | +3.45% | 18.840 | 19.225 | +2.04% |
| Worker往返 | 47.843 | 48.692 | +1.77% | 57.260 | 57.400 | +0.24% |
| Host呈现处理 | 8.937 | 8.962 | +0.28% | 10.570 | 11.445 | +8.28% |
| Host完整交付 | 56.806 | 57.681 | +1.54% | 67.230 | 68.400 | +1.74% |

| tick区间 | 编码变化 | Host交付变化 |
|---|---:|---:|
| 151–180 | +5.00% | +1.49% |
| 181–210 | +4.61% | +0.94% |
| 211–240 | +4.41% | +0.94% |
| 241–270 | +4.38% | +2.99% |
| 271–300 | +3.02% | +2.99% |
| 301–330 | +0.01% | -0.10% |

末段编码实际变化+0.00929%（表中按两位小数显示），不能算改善。未修改的模拟P95下降2.99%，不作为候选收益；Host呈现P95增加8.28%也如实保留。六段不是独立复现试验，不能与前轮不同源码/环境的绝对毫秒拼接计算收益。Host交付不包含网络、渲染、屏幕等待或input-to-photon。

真实Worker中660次包/witness等对照一致，662次完整显示图对照共18103234节点；11个检查点×两臂权威状态、隐藏火控和RNG一致。语义通过不等于性能合格。

## 回退、保留记录及后续方向

Dictionary恢复SHA256：514910033a5ca86435d21952765924a5f820717bd7ab03f2bd1ac512fb2cc958；render测试入口恢复db45b7805cd9bc6fa40bcc056e752ba106e8abd7df887d2c8f2efadef250822f。上一接受TacticalNavigation仍为2a8157e968e25d33f63889c9816626a1ee624974c88aa671901f17e01a838562；Encoder仍为0ad5ef3e354ff9acbc4e54eaf624503b2bb4639f8103a80cbd3a601cfa302f4f。

恢复前核对候选hash，恢复后核对原字节与320模块baseline。没有在回退后重新运行整套检查或正式基准。专项helper及两份候选源码归档在artifacts/render-dictionary-publication-20260926/candidate/；完整源图、差异、合同、失败和复查日志、performance-analysis.json、result.json、rollback.json及acceptance.json均保留。

下一轮优先研究整张显示图的遍历、投影构建和数据布局成本，不再原样复活本轮Map token缓存或前轮标量写入微调。新的布局方案仍须证明所有字段、可变源、回调、别名和旧包行为保持一致；当前未实施，也不承诺收益。

基准退出0（68119ms），无待轮询进程。本轮未启动子代理、操作可见窗口/键鼠、暂存/提交/推送、打包/发布或修改原版安装内容。总优化目标继续active。
