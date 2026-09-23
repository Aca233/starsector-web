# Native colony management UI — 2026-09-22

## 最小原版对照（先于组件代码）

- 基线：本机 Starsector 0.98a-RC8 反编译与原版资源。仅后台文件工作；不操作桌面、不启动浏览器、不运行检查。
- 截图证据：docs/campaign-implementation-progress-2026-09-19.md:301–306 记录用户五张原版核心界面截图与管理布局还原；docs/campaign-native-live-network-audit-2026-09-21.md:1371 标明 acc5b25f 原版截图为综合管理/殖民地页。初始最小对照时未取得附件路径，后续用户补充后已用图片工具实际查看 C:/Users/Aca/AppData/Local/Temp/codex-clipboard-acc5b25f-5232-4c1b-8457-fadf8c49dbf1.png：1922×1112，标题 Starsector 0.98a-RC8；八列表格、五页签、右栏统计与底部导航均可见。原图左表约936px、右栏280px、间距10px；对应覆盖既有 CSS 主区宽1228px、顶部页签与主体间距10px。截图为空列表状态，右侧0/2、+4等是那一存档的值，绝不复制成当前玩家数据。此前所看的 artifacts/campaign-native-management-1920.png 是旧 Web 截图，只用于现有布局参考。
- 原版 command/OutpostListPanel.java:93–140：8列表格名称/环境/位置/稳定/规模/净收益/科技/管理员，行高68；名称按建立日期、环境按天然条件数、位置按距离，不能随意改为字母/地名字典排序；右侧 OutpostStats 汇总与分配管理员。
- OutpostListPanel.java:298–350：点击殖民地行进入该市场详情；租用仓库走地图，不能把任意受控市场当作已殖民星球。本轮只能使用服务端显式授权投影，缺储存市场类型则不伪造其行为。
- command/OutpostItemRow.java:168–217：稳定/规模、真实月净收益、星体类型及天然条件；“科技”是正在使用的 AI核心/特殊物品而非科技等级。缺字段显示 — 与原因，不拿 factionId / 任意条件 / 零值冒充。
- ui/marketinfo/IndustryListPanel.java:103–169：可见产业按原版 spec.order，后接真实待建队列；原生工业图块190×95图片+15标题+3间距、4列3行、图块间距20。它是原版产业设施图阵，不是新设计的圆角统计卡片。
- ui/marketinfo/intnew.java:238–282、373–432：第一次点击待建项进入本项移除/其他项交换模式；第二次点击本项退款移除，点击另一项交换两者；右键队列项回到普通模式。没有上下移动按钮或额外确认弹窗，不自行添加快捷键。该交换分支有 CFR void 异常，结合实际 queue API/投影契约，仅提交权威端已支持的交换动作。
- IndustryListPanel.java:309–337：原版“新建工业设施或建筑物...”打开 IndustryPickerDialog，选择确认后入队扣费。本轮没有该弹层的已核实画面/完整候选服务，按钮禁用并说明缺口，不自行画建设表单或跳过选择确认直接扣款。

## 预期布局 / 数据边界

- 仅新增 NativeColonyManagement.tsx/.css 与本文档；复用 CoreScreen 和既有 Management 的页签、左主区+右信息栏，保留底部导航，不新建阻断模态层。
- 殖民地表格来自 Rawls 的 server/campaign/native/ColonyManagement 投影。只接受 view/locked/onAction/onClose 等 props；不 fetch、不改共享对象、不推断拥有权、不本地乐观修改队列/金钱。
- 未接入的管理汇总、天然条件图标、管理员、位置图等保持明确未知；遵照主线定稿：view=null 明示 host 未配置归属，不能转成空列表；view.rows=[] 才显示真实空列表，范围仍仅服务端绑定的管理列表。原版含义所需排序字段不完整时，保留原排序并禁用相关排序，而不是采用自创排序规则。
- 选择殖民地查看真实产业和待建队列；只对权威允许的待建项走原版二次点击移除/交换；已在建、升级、拆除、AI核心、特殊物品等未支持操作禁用说明。
- 市场详情的完整 CARGO 导航、概览/商品/管理员弹层不在本组件实现范围；不把有限产业详情冒充完整原版市场界面。最终交付会写明精确 props/action 契约。

## 统一验收方法（本子任务不运行）

1. 用真实管理投影显示多殖民地，核对原版表头/右栏、未知字段与 blocker、切换/退出；同分辨率对照原图，禁用及选择状态仍需验收。
2. 实际队列先点选，再点自身取消/点另一项交换；右键退出，不出现自创确认框。locked/事务中/队列更新或市场切换不得提交旧选择，不在客户端模拟退款或重排。
3. 服务端返回拒绝时显示错误、保留权威视图；无效资源路径/图片失效显示明确缺口，不用图生成/占位图。新建候选弹层继续禁用直至原版流程核实并接好服务。

## 类型/主线协调更新

- 已与 Rawls 对齐并直接 import type NativeColonyManagementView / NativeColonyMarketRow / NativeColonyAction 等，顶层是 rows，不是早期提议的 markets。queue 使用 canCancel/canSwap/mutationBlocker/cancelBlocker/swapBlocker 及 buildTimeDays；绝不自行推断支付权限。
- 主线负责 D 开关、Escape 退出、屏蔽地图/能力操作；组件无 document/window 键盘监听，不重复注册，不改变世界暂停规则。
- Props 当前为 view、locked、pending?、onAction?、onClose、notice?；onAction 接共享 NativeColonyAction 联合，主线应返回在真实事务及权威视图刷新后才 settle 的 Promise。同步/异步错误可显示，不本地修改退款或顺序。pending/locked 和本地 inFlight 同时阻止重复提交。
- Rawls 此轮只定义 GET buildOptions:null，尚无 inspect-build 结果类型；本组件不抢先发明候选DTO/authority动作。当前新建入口禁用并呈现真实 buildOptionsBlocker，后续可在原右栏接主线的真实候选视图（非自造弹窗）。

## 本轮交付 / 剩余边界

- 三个独占新增文件已成形，未编辑其他 client、App/API/protocol、server 投影、测试或任何 shader；未运行检查、测试、浏览器或桌面操作。新文件均以 wx 创建。
- 已接 Rawls 的真实 queue.buildTimeDays（CSV int 工期）、cost（实际队列付费值）及取消/交换原因。单项队列仍可取消，但没有交换目标；第一次点击仅选中，第二次才调用主线事务。右键只退出队列选择，不擅自增加键盘快捷键或确认弹窗。
- 队列的 ref/id/顺序/费用/能力发生变化、市场切换或 locked/pending 改变时，组件通过 keyed 子视图清掉旧移除/交换模式；不以 item 存在推断权限。主线仍须在提交时复核 world/market/queue 身份及修订。
- 既有产业与队列分开处理：真实 construction 进度才画进度条；未知不填0%。当前按服务端产业顺序展示（投影无 spec.order/hidden），未实现完整原版动态排序/隐藏规则；原版 currentName/currentImage 的插件动态覆盖仍未投影，只有实际原版 CSV title/icon。
- 表格天然状况图标、相对位置图/距离/燃料、人口增长、科技项、建立日期、管理员排序、OutpostStats 汇总均未完整投影，显示明确未知/禁用而非合成。表头排序全部暂禁用，以免默认字母排序篡改原版语义；不是完整综合管理交付。
- 殖民地选中后的有限产业页沿用主区+右栏，依据源码的原版4列产业图阵实现，但原版完整CARGO市场详情切页/概览未接入；本组件内部返回列表只是该有限视图的导航，不宣称原版完整跳转已复刻。所获原版截图只有空列表，非空行/产业页/悬停/动作模式仍待同分辨率视觉验收。
- 新建候选/支付确认不在本轮抢实现：与 Rawls 确認本轮没有独立 inspect-build 结果类型；pending 已预留，后续真实 buildOptions 类型与事务应由主线定稿后再接入右栏，不用 React 自创模态框顶替原版流程。

## 追加建造选择/确认：最小对照（代码前）

- 已阅读 OriginalColonyConstructionCommands.d.mts 的 OriginalColonyConstructionBuildOption/BuildInspection；只消费显式 inspect-build 事务结果，GET view.buildOptions:null 原样保留。cost 是真实候选 getter 转成的 int 报价；specCost 仅目录基线，绝不能用来扣款。
- 原版 IndustryPickerDialog.java:78–127：设施名称270、类型100、建造时间/建造成本/基础维护成本/当前维护成本各125；44px行高、10行可见区域、10px边距；底部从左到右返回/建造/离开，按钮170×25。文本/列宽/按钮有明确源码证据，不自创建设表单。
- IndustryPickerDialog.java:184–198、210–223、284–307：条件或资金不足的行禁用；选中可用候选后“建造”dismiss(0)，IndustryListPanel 在回调入队扣款。“离开”dismiss(1)；“返回”仅针对分组类别。没有第二个confirm框。
- 候选行 obf ..._cfr_13.java:66–82、92–152：实际 getBuildTime/getBaseUpkeep/isIndustry/isStructure 与现有维护倍率用于附加列；现有 BuildOption 尚未返回这些真实getter值，所以这些列显示—，不套用spec基线或tags猜插件行为。名称/图片/实际cost/禁用原因采用真实事务结果。
- 原版建造弹层截图仍未提供；已查看的acc5b25f只为空殖民地表。本轮实现已证实的原版选择器内容，内嵌于现有产业详情主区，不新造居中模态框、全息外框、背景遮罩或未核实快捷键。完整弹层外观/悬停详情/分组返回仍为具体缺口，而非把建设入口无限期灰掉。
- Props 扩展 buildOptions:{marketId,inspection}、quoteRevision、当前revision；都来自主线。每次点击“新建”显式发送inspect-build；仅该请求之后得到、市场匹配且quoteRevision===revision的报价可选/确认；revision变化、市场切换、lock/pending变化或报价变化清空选择，过期报价允许显式重新核实，不自动GET或计时构造候选。
- onAction 扩展 inspect-build / build，后者仅含选中industryId与真实expectedCost；不发specCost，不本地扣款/乐观入队。D/Escape仍只由主线处理。未运行检查。

## 最终集成契约（覆盖前文“新建入口暂禁用”的首轮状态）

- NativeColonyManagementProps 保留 view/locked/pending?/onClose/notice?，新增 buildOptions?:{marketId:string,inspection:DeepReadonly<OriginalColonyConstructionBuildInspection>}|null、quoteRevision?:number|null、revision?:number|null。
- onAction 的 NativeColonyAction（组件模块导出，亦名 NativeColonyManagementAction）为四种判别联合：inspect-build + marketId；build + marketId/industryId/expectedCost；cancel-construction + marketId/industryId；swap-construction + marketId/industryId/otherIndustryId。后两种队列操作逻辑未重做。
- 主线处理 inspect-build 后，把真实返回inspection、其marketId以及事务提交后的world revision一起保存为buildOptions/quoteRevision，同时传当前revision。组件要求quoteRevision大于本次inspect发出前的revision且等于当前revision，因此旧查询/晚到旧报价不能确认。任何后续world revision变化都要求显式重新核实。
- 建造入口在onAction已接、当前revision有效且市场无mutationBlocker时可用；GET的NATIVE_COLONY_BUILD_NOT_EVALUATED不再作为永久禁用理由。点击启动真实inspect，不自动调用纯GET候选。选择服务端enabled候选后点击建造，传真实option.cost作为expectedCost；不收取specCost。
- 主线onAction应返回等待真实事务与权威view刷新完成的Promise；失败必须reject以显示错误。成功build后返回产业/队列；不乐观扣钱或预插入队列。世界/会话切换时主线应重挂组件并清掉旧报价。
- 价格确认是原版“选中条目→点击建造”，不另造第二个确认弹窗；全局D/Escape仍归主线。原版类别返回按钮因grouped-choice未支持而明确禁用，unsupportedChoices逐项说明，不把不支持插件当作不存在。
- 本轮具体仍缺：原版建造弹层截图与全息外框、完整原版动态排序/tooltip、分组候选，及真实候选类型/getBuildTime/getBaseUpkeep/当前维护费/玩家余额/工业数上限的投影。六列表保留对应列显示—，不以tags/specCost/12槽位猜值。本次实现的是可执行选择与价格确认的原版内容内嵌版，不冒充完整模态外观已验收。
- 只编辑本任务三个文件；未运行检查/测试/浏览器/桌面操作。交主线一次集成验收。

## 集成收尾（停止扩展）

- 已只读核对 App：它在 window keydown 处理前检查 defaultPrevented，统一负责 D/Escape；本组件没有独立Escape/keydown监听，不存在本组件先关闭选择页又让App关闭管理页的双重处理，也不新增快捷键。
- App 的真实事务处理可 resolve(false) 表示拒绝/暂未成功；组件已按该约定返回失败，不关闭建造选择页、不报告成功，交主线notice与原请求重试继续处理。props/action契约不变。
- 当前只交付既有管理表、建设选择/真实价格确认、队列取消/交换。未运行检查，剩余验收由主线集中执行。
