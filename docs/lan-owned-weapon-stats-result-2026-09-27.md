# 发射前单舰武器属性共享：否决并撤回（2026-09-27）

## 裁决
`VITE_LAN_WEAPON_STAT_SPAN` 候选**不保留**。11项有效正确性合同通过，但唯一无插桩完整步ABBA两组分别慢 **6.6088% / 3.8871%**，未达到事前约定的每组至少省5%。没有重跑计时、没有调整门槛、没有启动浏览器验收。没有稳态Hz或联机输入P95改善证据。继续优化的大目标仍未完成。

## 范围与来源
参见本目录 `lan-owned-weapon-stats-source-notes-2026-09-27.md`。基于本机原版0.98a-RC8 API/火控读取证据；本轮无UI、无原版实机操作。没有修改AutofireController、WeaponRange、数学求解、host.worker。没有降低Hz、实体数、精度、画质或放宽过载/权威检查。
区别于已否决的每getter标量组合及每aim准备复用：本候选只在私有Worker单舰发射前瞄准循环内，range/speed两个getter共享首次原完整modifiers合成；其它getter实时读取，发射前结束共享。热getter只比较活动指针身份；准入审核位于phase、writer family边界。未知回调回退。

## 有效验证
- 一次生产typecheck与8文件lint通过；脚手架修复后单文件lint通过。生产v3在有效合同/ABBA期间未变化。
- `validation-v3-corrected/contracts/proofs.json`：11项合同；保存每个case签名、740模块冻结SHA、A/B bundle SHA。唯一ABBA强制核对这些证据。
- 真实host init/reinit/default：176实体、734挂点；候选实开，默认不开；所有lease退出后撤销。
- 数值合同：6轮遍历全部船只；三武器类型、跨挂点惰性首次原组合、undefined无读、NaN/Infinity/-Infinity/-0、runtime数值、辅助链、父舰及技能状态；退出后flux/生命周期/ammo/runtime改变不复用旧值。
- 描述符/原型/实例/自定义系统/父链/预算回调拒绝；公开world及exact-only不能许可；异常、重入、同world及不同world嵌套正确撤销。
- 逐挂点aim/preAim/decide、隐藏tracker和RNG相同；组合计数59232 → 540。aim.json中历史字段solutions误统计了结果行数，不作为非空解数量证据；合同另有真实非空aim断言。
- 真实发射35步：1114次request、130枚projectile、25条beam；每次请求均已关闭span；异常finally验证通过。
- 60步技能/靠近开火/排散/低模块HP扰动逐步完整状态一致。
- 自然20步完整状态SHA：`bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224`。
- 自然270步完整状态SHA：`bf519eedd4419e5f13360306acbd08b5ca380116fe25e564f59d141212e067d6`。

## 非计时诊断：命中不等于提速
warm120瞄准段射手主system原合成 **1260750 → 55398（少95.60595%）**；实际9360个span。自然270步 **2979128 → 124346**；21060个span、270个phase。prepareAimQuery总调用均1522400，没有恢复旧prepare优化。
span只覆盖CombatEngine的combatShips写阶段；后续机翼/无人机更新不因这个开关自动获准。诊断使用源码观察钩子，不作为性能计时。

## 唯一ABBA
固定2玩家+20AI、三舰循环web_zhuyuan/web_gloriana/web_sc2_hyperion、seed917、3200DP，四个已有实验两臂同开。每臂独立隐藏Node，150步热身后120个无插桩完整fixedUpdate(1/60)。不计导入/启动/热身/最终witness序列化。

|臂|120步耗时ms|每步ms|
|---|---:|---:|
|A0|4231.3640|35.2614|
|B1|4511.0083|37.5917|
|B2|4460.1804|37.1682|
|A3|4293.2945|35.7775|

四臂终态SHA完全一致，均171活跃实体。`passesPrescribedGate=false` 才是裁决；测试进程exit=0仅说明ABBA收集与一致性断言正常，不表示性能过关。此次没有浏览器数据，不得把这些Node耗时当作浏览器Hz/CPU占用/联机P95。
减少1百多万次组合仍没有抵消新增路径总成本，说明不能根据命中率推定收益。生命周期审核、family重复检查、热getter额外分支及JIT/分配影响都可能贡献成本；本轮未做候选CPU归因，不将其中某项写成已证实唯一原因。

## 测试问题留痕
第一批validation-v3无效：复制脚手架的批量名称替换将开关变成了VITE_AI_OWNED_WEAPON_STATS，候选实际未启用；真实Worker覆盖、组合次数及撤销合同发现失败。修正为准确的VITE_LAN_WEAPON_STAT_SPAN，并加入bundle开关断言，作废旧证据后复核11项合同；生产字节未因这次修复变化。allSystems夹具亦改为返回合法数组的accessor，而不是非法function值。错误阶段未进行ABBA。

## 安全回退
回退前核对八文件绝对路径、当前candidate-v3 SHA以及七文件before字节SHA；全部一致。先归档8文件到rejected-source，再逐字恢复7旧文件并删除仅本轮新增的OwnedWeaponStatPhase.ts。写集外没有发现相对v3的漂移，回退全程写集外文件保持原字节。之后验证完整739模块源图与**本轮**baseline-browser逐文件相同，不涉及更早实验的738/726模块基底。
回退脚本首个入口因相对import多一级在模块加载期失败，尚未执行任何归档/生产写入；纠正工具脚本路径后，一次成功完成带SHA门闩的实际回退。
没有reset、暂存、提交、推送、发布或修改原版安装。已准备的浏览器runner未启动；它会检查passesPrescribedGate并拒绝此候选。

## 工件与后续约束
- `scripts/check-lan-owned-weapon-stats.mjs`：冻结历史回放合同；不要再次启动此候选ABBA。
- `artifacts/lan-owned-weapon-stats-20260927/candidate-v3-browser.json`：完整740模块待测时源图。
- 同目录 `validation-v3-corrected/contracts`、`abba-once/abba.json`：有效证据。
- 同目录 `revert-preflight.json`、`revert-verification.json`、`rejected-source`：回退证据和归档。

后续不再原样尝试增加同类短寿命缓存。若继续这个方向，先在已冻结失败候选上做一次**非性能验收性质的成本归因**，区分审核/边界管理与热getter、原组合实际成本，再决定是否有减少整段火控工作的结构性方案。不要为了降低审核成本放宽任意扩展回调的安全域，更不能因正确性通过而默认打开失败开关。
