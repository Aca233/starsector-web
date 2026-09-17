# 共用原版 UI 基础层

## 目的

原版风格不是仅复制窗口位置。页面共同使用原作字形、八片边框、切角按钮和面板材质；业务组件只负责布局、数据和操作。暂停菜单不再私有一套皮肤，舰船设计也不再承担公共 UI 组件的实现。

## 组件入口

- `src/ui/NativeChrome.tsx`：NativeButton、NativeButtonLabel、NativeFrame、NativeBorder、NativeMaterial。
- `src/ui/NativeBitmapText.tsx`：按原作 glyph atlas 绘制文字，同时保留可访问 DOM 文本；字体加载失败或自定义名称包含字库外字符时回退真实中文 TTF，不替换用户文字。
- `src/ui/native-fonts.ts`：字库解析、原作字符 advance/kerning、缓存和按角色预加载。正文 atlas 在使用时加载。
- `src/ui/native-chrome.css`：唯一的公共字体/边框/按钮/材质定义。不要在业务 CSS 另写重复描边、滤色边框或系统字体替代。
- `src/ui/core/UI.tsx`：现有 Button、Modal 和 ConfirmDialog 已接入基础层，保留按钮回调、inert、焦点恢复、Esc 栈和 Tab 导航。

## 使用

~~~tsx
import { NativeButton, NativeFrame } from "../ui/NativeChrome";
import { NativeBitmapText } from "../ui/NativeBitmapText";
import { Modal } from "../ui/core/UI";

<NativeButton shortcut="W" onClick={save}>确认</NativeButton>
<NativeButton font="action" align="right" onClick={resume}>返回游戏</NativeButton>
<NativeFrame surface="solid" className="inventory-panel">{inventory}</NativeFrame>
<Modal title="装配方案" surface="solid" onClose={close}>{variants}</Modal>
<NativeBitmapText font="caption">典范级</NativeBitmapText>
~~~

NativeFrame 的 surface 为 solid（实底）、glass（原版半透明扫描线）、none（只有边框）。Modal 默认 glass；武器编组使用 solid。尺寸、排列和滚动属于业务页面，不因更换皮肤而改变。已有 Modal 自带边框，不要在里面再加一个空 NativeFrame 造成双框。

字号角色：action 对应原作 orbitron24aabold（菜单大按钮）；button 对应 orbitron20aa（普通按钮/标题）；caption 对应 orbitron12condensed（短信息）；body 对应 insignia15LTaa（正文）。普通长段落仍用可选择的 DOM 文本和原版正文 TTF。

## 资源依据

- combat/E.java：500×293 窗口、7px 内边框、10px 内容留白、220×30 按钮、3px 行间隔、TL/BR 切角、右对齐及上述字体角色。
- class/I.java 和 class/o0oo_0.java：ui_border1 的八片原图，黑色 125/175 alpha 扫描线与噪点层。网页不再叠加额外 CSS 金属线或边框滤色。
- ui/u_0.java、settings.json：按钮底色 [31,94,112,175]、文字 [170,222,255,255]、noiseColor [40,152,176,255]。
- 原作已生成的中文动态字图复制于 graphics/fonts/dyn_font/cache/s1.00-688f35f416ad1cd2；网站资源在 public/game-assets/graphics/fonts/native-menu。无需运行时访问本地游戏安装。
- 正文为已打包的方正兰亭中粗黑；新增标题字库由本地 typefaces.dat 的锐字逼格青春粗黑体记录提取。去掉雅黑优先回退，保留原版中文作为默认。

## 已接入的界面

首页/舰船设计操作按钮、设计主框、武器类型/来源筛选、舰船插件筛选、武器组、装配方案、模拟选择、游戏设置、帮助与确认弹窗，以及战斗 Esc 菜单。原有 NativeRefit 导出保留兼容转发；新功能应直接从 NativeChrome 导入。

专用武器列表、数值条、HUD 和挂点仍保留各自原作布局，不把所有内容强行套成同一种卡片。此基础层并不意味着原版全部界面或内容已经完全复刻。

## 核验

- 1920×1080 暂停菜单为 500×293；每个 Modal 只有一套八片边框；菜单三项均使用 action 原图字形。
- 1048×788 与 1920×1080 插件展开不改变改装窗口边界；筛选字图未裁切。
- 武器详情保持左侧视口定位，不因像素对齐移到列表上方。像素对齐只平移视口大小的遮罩，不 transform 内容面板，以免重设 fixed 后代的定位基准。
- 实际战斗 ready；菜单/设置/帮助期间 combatTime 不动，Esc 逐层返回、长按不闪切、空格暂停保持，结束模拟后会话 disposed 且设计草稿不变。
- 图片记录：artifacts/native-refit/native-pause-skin-v2.png、native-pause-full-v2.png、native-shared-groups-v2.png。独立浏览器核验，无 pageerror；typecheck、lint、build 通过。未新建测试框架或测试文件。


## 装配方案与武器窗口（第二轮截图对照）

- 装配选择不再使用保存列表弹窗：采用 814×498 外框（800px 原作内部宽度）、300px 右侧预览、原版方案缩略图和保存当前配置的舰体剪影。原作依据为 coreui/refit/auto/G.java。支持本地预览、确认应用、撤消、命名保存、重命名、确认删除；隐藏原版方案可在当次窗口内恢复。
- `SourceVariantPicker` 按需加载轻量原作 `refit-variants.json`，无需加载完整内容百科。可改装舰体的 246 个原版目标方案已逐个验证可转换；适配缺项在说明中列出，有装配错误则禁止确认。
- 未连接战役货舱、仓库、市场和资金系统，相关选项保留位置但禁用，并明确说明模拟装备库。升级/随机策略未移植也禁用。自动装配仅预览补齐空挂点，使用真实兼容规则与 OP 预算；不是原作完整自动装配算法。强化舱壁、防爆舱门和清空/保留装配选项使用实际设计数据。
- 武器窗口为 380px 列表 + 420px 相邻详情，6 个原作类型/来源按钮，搜索、势力和预算筛选收纳在 [F] 控件内，未删功能。列表使用无限模拟装备库，不伪造原作截图中的 100 件库存。
- 原始武器文案及署名由 `refit-weapon-tooltips.json` 提供。精确度/转向等级按原作 Oo0O/BaseWeaponSpec 的区间转换。默认显示原始射程和属性，点击“原始数据”切换舰装后数据；实际安装始终使用当前装配预算。Ctrl 对比与 F2 百科保持可用。
- 桌面改装主框上限 1020×746，不再随大显示器放大到全屏。1048×788 与 1920×1080 下安装插件不改变主框尺寸；武器详情与列表相邻不重叠。
- `import-native-catalog.mjs` 同步生成这两个轻量数据文件；网页运行不访问游戏安装目录。

回归记录：独立浏览器验证预览后取消不修改草稿；确认原版方案后武器变更且可撤消；命名保存、重命名、删除确认与隐藏/恢复方案可用；自动装配从空船补装后受 OP 预算限制；搜索千兆加农炮可安装并撤消；Ctrl 显示 13 行参数对比；原始射程 700 与舰装后 1400 分开显示；F2 嵌套百科与 Esc 返回正常，无残留 inert、无 pageerror。近景截图在 artifacts/native-refit/native-variants-closeup-v3.png 与 native-weapons-closeup-v3.png。
