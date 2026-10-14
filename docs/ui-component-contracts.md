# UI 组件与样式契约（2026-10-01）

应用从 index.css 加载 core/components.css 和 combat-presentation.css。公共控件的基础规则只在 core 中维护；页面几何进入所属页面 owner，旧文件路径仅作兼容导入。

## 使用

- 通用按钮/弹窗：core/UI；原有文字按钮/框架：core/NativeControls；NativeChrome 为兼容重导出。
- Picker 负责集合键盘焦点；页面保留选中值与业务回调。
- Stepper 保留既有输入/加减回调，不另建状态模型。
- Tooltip/EquipmentTooltip 负责信息层，领域数据留在 studio/network；真实点击目标不套新布局包装。
- PageState 提供真实缺失依赖和恢复入口；不使用伪造数据填空。

## Modal 页面配置

Modal 的基础布局在 modal-layout.css 的 ds-components 层；页面用 ds-pages 配置面板上的变量。例：

```css
@layer ds-pages {
  .ui-modal.example-picker {
    --ds-modal-panel-width: 500px;
    --ds-modal-panel-max-width: calc(100vw - 28px);
    --ds-modal-header-display: none;
    --ds-modal-body-flex: 1 1 auto;
    --ds-modal-body-overflow-y: auto;
    --ds-modal-footer-gap: 8px;
  }
}
```

可配置 panel 的 width/max-width/height/max-height/min-height/overflow-x/y，header/body/footer 的 display/flex/间距/对齐及每侧 padding。变量默认值就在 owner 中，不在页面重复基础 header/body/footer 布局。每侧 padding 单独配置，避免部分覆盖失去原值。

关闭、Esc、Tab、背景 inert 和焦点归还由 Modal 统一维护；页面勿再创建自己的键盘循环。退出时长与 motion-state 同源，减少动效优先。

## 主题、移动及兼容

Vanguard 默认为根 data-ui-theme=vanguard；?ui=classic 回退。皮肤保留当前 paint 级联，禁止将未完成迁移的覆盖直接搬进低优先级层。

手机粗指针条件下，菜单/弹窗/列表的控件与范围滑杆使用 44px 目标；复选框/单选框通过关联 label 扩大目标。舰体图面挂点保留准确位置和缩放，不用重叠的大按钮覆盖相邻挂点。

不恢复用户确认删除的 native-menu 字体；NativeBitmapText 是系统文字兼容包装。动态位置、仪表、阵营色和首次挂载隐藏等内联值见 audit/inline-styles-reviewed.json；不能仅为减少计数删除必要参数。
