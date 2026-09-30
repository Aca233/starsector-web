# Worker火控静态资格见证：来源与失效域（2026-09-25）

## 原版与行为边界
本机原版证据沿用已核实的0.98a来源：decompiled/starfarer_api_source/com/fs/starfarer/api/combat/ShipAPI.java:75 getShipTarget、281 isAlive、336 isPhased。它们是实时状态接口，不授权跨舰更新缓存目标/相位/存活。该轮不改玩法、UI、模拟/显示频率、精度、实体数或发射顺序；无新增原版实机/UI结论，未操作桌面。优化对象是Web私有Worker的纯读资格检查，不是原版算法替换。

## 当前差异与拟实现
FireControlQueryRoster.begin在每舰运动/系统/维修之后重新遍历全部舰艇；200舰约40000次hasOwnedFireControlReadHooks/步。旧CPU采样仅定位该函数为热点，不是预计提升百分比。
仅在已登记的闭合Worker中，给每行创建阶段内guard：保存Ship构造时登记的原生装甲/护盾回调身份；缓存通过审核的spec、主系统definition、防御definition身份。不变的配置资格不重复查WeakSet/解析船插。Ship.spec来自immutableCopy私有登记，递归复制冻结；Registry原生定义的私有WeakSet只在模块初始化建立，不接受后续扩展注册。

## 不能缓存的部分
每个begin仍遍历每个当前名单成员，实时检查伤害/相位效果Map、own-property覆盖、护盾/装甲/过载回调、runtimeModifiers、父舰/载机、拦截器、系统链和systems长度。spec/definition身份变化时重新审核，不沿用旧资格；同长度名单替换/排序时重建对应guard。Native system getter递归检查的防御链仅在已确认main.auxiliary===defense且defense无auxiliary后可改成两个原生definition查询。时间位置、目标、距离、阵营、可见性、命中结果不进入guard。通用可变/外部引擎继续原有反射资格路径；guard不序列化，不跨帧保存。

## 验证计划
冻结完整旧/新源图。集中typecheck、改动文件oxlint、既有combat-ai；扩展活状态反例、配置/组件/名单替换和恢复，并与冻结旧函数比较。无插桩真实Worker200舰150预热+180测量，保留完整显示、权威/隐藏火控/RNG校验；报告调度状态与owner新批次，不能将重试差异归为算法收益。无可靠收益则精确恢复本轮生产改动，不覆盖其它任务。

## 定向归因补验（看到首轮结果后预先约定）
首轮自动调度180对测量显示模拟均值-2.17%、交付-0.49%，但P95恶化且owner新批次before33/after18，不能确认算法收益。保留全段原始数据，不删峰值、不覆盖首轮；只追加一次固定串行before/after对照（同为200舰、150预热+180测量），脚本新增--serial-pair仅将测试初始化multicore设置为false，默认/生产策略不变。此补验用于归因，不替代自动模式的退化结果。既有fire-query-audit另做55tick激活/恢复核对，不将其插桩耗时当速度结论。
