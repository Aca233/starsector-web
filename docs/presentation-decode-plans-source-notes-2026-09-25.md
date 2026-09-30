# 显示解码事务暂存优化：修改前对照（2026-09-25）

原版0.98a-RC8 WeaponAPI.java:41/83/135确认实时角度/位置/规格接口。原版没有Web的本地Worker显示协议；本轮不改原版玩法/UI、数据字段、Float64或更新频率，以当前Decoder/Wire和冻结旧decoder为契约参照。不操作桌面，不宣称原版新画面验收。

## 定位证据
扩展既有benchmark-real-workers的诊断选项--profile main（要求--decode），独立无头浏览器主线程CDP采样。artifacts/presentation-decode-profile-20260925：200 Onslaught，150预热+60测量tick，两条臂；applyGraph自身652.702ms、apply自身307.992ms，整页GC160.627ms。此profile还含完整图审计，不把整页GC归因于decoder，也不用于优化百分比。

当前每个变化节点先建Plan，再建完整Entry，同时为无键/无引用/无metadata的节点创建空数组；完整图遍历对尚未出队的共享孩子反复入队。是内部暂存/分配成本，不是可以省略校验的依据。

## 方案与不变项
1. 私有冻结空keys/refs用于空列表；第一次引用时给该Plan分配独立可变数组，绝不写入共享空数组。Object形状仍逐Entry复制keys，防止入包消费后被调用者篡改。
2. Plan保存本包解析时的prior Entry；只读校验覆盖仍不写accepted map/links。全部校验后暂存新对象、typed存储和keys副本。若底层value不变可复用Entry身份，但直到对象写入和保留父节点重绑定完成，才提交kind/type/units/keys/refs/metadata。Entry不持有Plan/prior链。
3. 可达队列在发现时标记，避免同ID重复入队；依然以原BFS首次发现顺序检查每个节点、每条引用、metadata、完整存活数/单位数和不可达记录。不是增量跳过图校验。
4. 所有packet/header/epoch/revision/tick、字段/类型、危险属性、根/visuals、节点/元数据预算及typed替换回绑规则保留。格式非法包不修改既有显示/Entry/索引，也不消耗revision；随后同revision的合法包能成功。与旧实现一样，不承诺消费者恶意改私有表或给显示对象加setter后的任意写入异常回滚。

## 验证
在已有render-projection中扩展decoder事务合同：旧/新同包完整输出与别名对照，重复引用密集图，空/非空links转换、原Entry复用、删除重入、metadata转换、非法包多次拒绝与随后恢复、types/keys/危险字段、输入keys消费后修改隔离、typed resize及未更新父回绑。集中一次typecheck、改动文件oxlint、完整既有场景；只针对实际失败复查。
固定profile源图为baseline；candidate只替换Decoder，避免并发内容改动污染配对。一次真实200舰150预热+180测量无插桩比较完整往返+解码和P95，保留多核调度差异；无实际收益则精确撤回候选，不择优重跑，不提交/发布。
