# GenericPluginManager：可 checkpoint 规则（0.98a-RC8）

## 原版证据 → 行为 → 当前差异
- decompiled/starfarer_obf/com/fs/starfarer/campaign/GenericPluginManager.java:22–84：saved plugins 在 transientPlugins 前；remove 同时移除两仓库；getPluginsOfClass 返回新列表；hasPlugin 使用 getClass()==clazz 而非 instanceof；pick 初始 best=-1，仅非负且严格更高 priority 替换。
- decompiled/fs.common_obf/com/fs/util/container/repo/ObjectRepository.java:32–47,90–151：仓库 contains/add/remove 去重；新对象按加入顺序追加各类型列表；writeReplace 保存 Object.class 列表，readResolve 逐项 add 重建。
- 同目录 FastIterationClassifier.java:24–48：分类是自身 class、全部 superclass/interface（递归）的 closure。类型枚举顺序不改变同一类型列表内的插件加入顺序。
- starfarer_api_source/.../GenericPluginManagerAPI.java：优先级常量 0/100/200/300/400/500/MAX_INT，负值表示不处理；BaseGenericPlugin.java:getHandlingPriority 原版为 0。
- CampaignEngine.java:269,1292–1293,1308–1309：新 Engine 构造真实空 manager，getter 返回同一对象。原版 readResolve 的 null 初始化是原生存档语境；Web 旧 checkpoint 的字段缺失表示未捕获，不能据此冒造空历史。

## 本块表示与边界
描述符保存 objectRef/classId/types/data，无函数；types 是实际 class assignability closure。按当前受支持的默认 Object.equals 身份语义；自定义 equals/hashCode 仍未支持；不模拟自定义 equals/hashCode 插件或可替换 ObjectRepository classifier/listener。
一个 canonical 描述符表 + saved/transient 两组有序 objectRef，可 JSON checkpoint，跨仓库同一插件可出现两次；读列表返回 canonical 实际描述符，不克隆对象。
Web 运行 checkpoint 保留当时两仓库，不能冒称 Java 原生 save 的 transient 丢弃/readResolve。旧 manager 或任一仓库缺失均拒绝查询，不自动迁移。
priority 仅通过显式同步 reader 获取，int32 验证；不为未知类假定 BaseGenericPlugin 的 0。pick 先取候选快照，回调期间 add/remove 不改变此次候选遍历，重复跨仓库候选会调用两次 reader。

## UI / 验证
纯规则，无 UI；不操作桌面或原版实机。不改 Runtime、DModManager、公共测试和状态门。仅定向静态检查，提供最少断言由主代理合并验证；readyForAuthority=false/status unavailable 保持。


## 精确接口 / Runtime 集成点（本任务不改 Runtime）
从 OriginalCampaignEngine.mjs 导入 originalCampaignGenericPlugins(engine)，从 OriginalGenericPlugins.mjs 导入其余规则：
~~~ts
createOriginalGenericPluginDescriptor(objectRef, classId, extraTypes = [], data = null)
// 自带 concrete class / java.lang.Object / GenericPlugin 三个保证类型；extraTypes 补真实父类/接口 closure。
createOriginalGenericPluginManager()
addOriginalGenericPlugin(manager, descriptor, isTransient = false): void
removeOriginalGenericPlugin(manager, descriptor): void
originalGenericPluginsOfClass(manager, typeId): OriginalGenericPluginDescriptor[]
hasOriginalGenericPlugin(manager, exactClassId): boolean
pickOriginalGenericPlugin(manager, typeId, params, {
  readGenericPluginPriority(descriptor, sameParams): number // 同步 int32，不缓存
}): OriginalGenericPluginDescriptor | null
~~~

manager = {scope:'native-generic-plugin-manager',objects:[...canonical descriptors],plugins:[...saved refs],transientPlugins:[...transient refs]}。
描述符 = {objectRef,classId,types:string[],data:JsonValue}；支持直接使用描述符或调用创建函数。创建函数仅复制 payload，不保存 reader。直接描述符的 types 必须包含保证的三个类型；ClassLoader 不同的类应使用不同 classId，不能把同名类混为一类。
查询返回 canonical 实际描述符；新增同一 objectRef 的另一个对象拒绝为 split identity，而不是按 JSON 值判等。JSON checkpoint 恢复后请使用当前查询返回的 descriptor，不拿旧进程对象去 remove。

新 createOriginalCampaignEngineState 已设置 genericPlugins:createOriginalGenericPluginManager()。engine validator 只验证存在的字段，不为旧 checkpoint 造字段；originalCampaignGenericPlugins 查询缺字段/null/坏仓库时拒绝。无需 Runtime 另行懒初始化。

## 最少可合并断言（合成插件 fixture；不代表任何内置 DMod 实现）
使用既有场景中的 assert；导入上述规则和 ORIGINAL_GENERIC_PLUGIN_TYPE。以下代码本任务不执行，留给主代理一轮场景验证。
~~~js
const manager = createOriginalGenericPluginManager();
const a = createOriginalGenericPluginDescriptor('plugin-a', 'fixture.Derived', ['fixture.Base']);
const b = createOriginalGenericPluginDescriptor('plugin-b', 'fixture.Derived', ['fixture.Base']);
addOriginalGenericPlugin(manager, a, true); // earlier transient still follows all saved entries
addOriginalGenericPlugin(manager, b);
addOriginalGenericPlugin(manager, a);
addOriginalGenericPlugin(manager, a); // same repository de-duplicates identity
assert.deepEqual(originalGenericPluginsOfClass(manager, 'fixture.Base'), [b, a, a]);
assert.equal(hasOriginalGenericPlugin(manager, 'fixture.Base'), false);
assert.equal(hasOriginalGenericPlugin(manager, 'fixture.Derived'), true);
const params = {}, calls = [];
assert.equal(pickOriginalGenericPlugin(manager, 'fixture.Base', params, {
  readGenericPluginPriority: (p, actual) => {assert.equal(actual, params); calls.push(p); return 0;},
}), b); // 0 is accepted; strict > retains first tie
assert.deepEqual(calls, [b, a, a]);
assert.equal(pickOriginalGenericPlugin(manager, 'fixture.Base', params, {readGenericPluginPriority: () => -1}), null);
const restored = JSON.parse(JSON.stringify(manager));
const list = originalGenericPluginsOfClass(restored, ORIGINAL_GENERIC_PLUGIN_TYPE);
assert.equal(list[1], list[2]); // canonical object sharing survives plain JSON checkpoint
removeOriginalGenericPlugin(restored, list[1]);
assert.deepEqual(originalGenericPluginsOfClass(restored, 'fixture.Base'), [list[0]]);
assert.throws(() => pickOriginalGenericPlugin(manager, 'fixture.Base', params, {readGenericPluginPriority: () => Promise.resolve(1)}), /synchronous/);
assert.throws(() => pickOriginalGenericPlugin(manager, 'fixture.Base', params, {readGenericPluginPriority: () => 2147483648}), /int32/);
// 使用场景已有真实新建 engine；不造 world。
assert.equal(originalCampaignGenericPlugins(engine), engine.genericPlugins);
const legacyEngine = {...engine}; delete legacyEngine.genericPlugins;
assert.throws(() => originalCampaignGenericPlugins(legacyEngine), /history required/);
assert.equal(Object.hasOwn(legacyEngine, 'genericPlugins'), false);
~~~
可选快照断言：priority reader 首次调用时 remove(a)，此次候选仍为 [b,a,a]，后续 a 的 reader 仍须各调用一次；不在 MAX_INT 早停。

## 本轮验证结果
- 两个实现文件的 node --check 已通过。
- 两个声明文件的定向 strict tsc 已通过（TYPE_EXIT=0）。
- 四个代码/声明文件的定向 oxlint 已通过（LINT_EXIT=0）。
- 未运行公共检查、功能探针、短/长场景或全套；上述断言尚未执行，供主代理合并一轮验证。未进行原版实机 oracle。
