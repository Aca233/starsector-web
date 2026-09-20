# AI 编成接入已保存装配（2026-09-20）

## 修改前最小对照

- 原版版本：本机 `../starsector-core/starsector.log:1` 为 0.98a-RC8。
- 原版证据：`../decompiled/starfarer_api_source/com/fs/starfarer/api/campaign/AutofitVariantsAPI.java:8` 按舰体查询目标装配。`../decompiled/starfarer_obf/com/fs/starfarer/coreui/refit/auto/SavedVariantData.java:64-79` 先 clone 保存装配，再加入可见列表；100-110 合并预设与最近装配；122-131 从可见列表解析目标装配，136 起初始化原版预设。反编译类提示依赖未加载，故只采用与 API 和本机数据吻合的装配选择/复制行为，不照搬混淆逻辑。
- 资源交叉验证：`../starsector-core/data/variants/onslaught/onslaught_Standard.variant:1-17` 明确保存 hullId、displayName、variantId、电容/耗散、hullMods、sMods，后续包含武器分组，不能只取 hullId 重建默认船。
- 原版实机界面：待核实；遵守不操作用户桌面的要求。联机 AI 编成是 Web 扩展，无原版同款房间界面可比；不宣称 UI 原版等价。
- 当前差异：LanAiFleet 的舰体浮窗仅枚举 nativeVariantsForHull；已保存方案虽然可通过独立的“本机方案 / 导入”入口使用，却未进入常用舰体配装列表。readLibrary 从当前浏览器源及 BASE_URL 的 localStorage 读取，并不跨地址/客户端共享。
- 预期行为：复用现有舰体→配装→队伍流程；在同一精确 hullId 下优先列出标注“已保存”的方案，再列原版/默认配装；不用基型装配代替 XIV。保存项和原版项 ID 分命名空间，重名仍独立。复制完整装配，不改库、本人草稿或基准。现有校验、错误解释、房主权限及服务端确认均保留。
- 刷新：打开编成、进入舰体列表、焦点恢复和跨标签页 storage 更新时读取当前库；不因此替换用户已选中的快照。库损坏显示既有错误，不写回。
- 附带必要检查：AI 装配去重签名原先漏 systemTypes/rightClickSystemType；不同自定义技能配置可能复用同一房间方案。补齐这两个战斗配置字段（包括模块），不改技能机制。
- 验证方法：隔离无头真实组件 + 本地临时联机服务，覆盖原版/已存混合、重复名称与原版 ID、精确舰体筛选、完整字段/模块复制、非法 OP 禁用、跨页刷新/重开、选择不提交、目标队伍添加/回执、库与本人草稿保持不变、空/损坏库、窄屏、键盘关闭；另测技能签名与现有联机回归、类型检查/lint。测试产物只写 artifacts，不打包发布或覆盖客户端。

## 验收结果

- `node --test scripts/check-ai-saved-loadouts.mjs scripts/check-ai-fleet-actions.mjs scripts/check-lan-deployment.mjs scripts/check-lan-room-workflow.mjs`：36/36 通过。覆盖技能列表（含顺序）、右键技能和子模块技能的独立方案签名，以及原有复制/移动/删除/并发、部署点与房间流程。
- `scripts/check-ai-saved-loadouts-browser.mjs`：隔离生产组件 + 真实临时 relay，7 组场景通过，pageerror=[]。验证已存/原版列表与数量、命名空间和重名、精确 XIV 舰体匹配、完整深复制、舰载机空槽位置保留、超 OP 原因及禁用；点击选择不发命令；实际发送/服务端保存字段与已保存设计一致；普通舰体/XIV 的目标队伍与确认正确；技能不同的重名方案不会去重；原方案库/本人草稿/基准原字节不变；跨标签更新与重开刷新不替换已选快照；空库/损坏库不覆盖且保留原版预设。
- 1440×900、390×900 截图均已查看，浮窗和队伍按钮位于屏幕内；键盘 Enter 关闭有效。截图：`artifacts/ai-saved-loadout-tests/saved-fit-desktop.png`、`saved-fit-1440.png`、`saved-fit-390.png`。日志：`artifacts/ai-saved-loadouts-browser.log`。模块技能签名已单测；完整模块舰的实际联机添加未单独实测，不以普通舰体测试冒充该项验收。
- TypeScript 全工程类型检查、修改文件 oxlint、git diff --check 通过；构建仅有既有大 chunk 提示。
- 只修改源码和隔离测试产物；未覆盖 dist、未发布/打包客户端、未更新正在运行的客户端、未操作桌面；未改闪现机制或未完成生涯内容。
