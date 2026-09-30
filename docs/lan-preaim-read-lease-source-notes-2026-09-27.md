# 预瞄只读资格租约（修改前，2026-09-27）

## 原版与现状
重读本机0.98a-RC8反编译 private.java:237–265：阵营/可见性/角色、距离、提前量、射界、指定目标优先必须保留；不照搬反编译异常类型。此次不改玩法/UI、Hz、精度、实体、特效或碰撞/过载保护，没有原版实机操作。最近四实验基底诊断preAim包含253.171ms、hasNativeSystemStats包含49.637ms、allSystems自耗88.153ms（桶有重叠，不能相加）。已撤回的几何索引减少候选但完整步变慢；此方案完全不构建索引或删候选。

## 新边界
仅显式VITE_LAN_PREAIM_READ_LEASE=true和已开启的owned-interleaved writer证书，单舰组件/故障处理完成后、瞄准循环开始时打开租约，finally在实际发射前关闭。只惰性存储目标原hasNativePreAimRangeReads()的boolean；目标资格、存活/相位/阵营、范围、拦截、射界、武器角色仍全部原路径读取，正/负许可均不跨单舰循环。不得将纯读取许可当成命中或可开火结果。

只有已审计私有数据命令Worker、原始roster身份/长度和原生局部更新才能创建。根AI证书无此权限；陌生roster/射手/目标、关闭或phase失效返回undefined从而继续原现场检查。证书revision随invalidate/close变化，使未关闭的错误外部持有者也失效。当前循环只写挂点角度、tracker与请求，不改读取许可依赖的目标spec/系统definition/runtimeModifiers/parent；未知回调和插件保持整体回退，不支持同realm任意monkeypatch。

## 预注册
五生产文件before已保存。一次集中typecheck/lint与真实176实体734挂点合同：init/reinit/default、正负值缓存/新batch刷新、未知回调/复制名单/rootphase/close/invalidate/异常、逐挂点preAim及60完整固定步authority+隐藏tracker/RNG，必须实际命中并有真实发射。单次独立隐藏Node进程ABBA，四前置实验均true，150热身+120计时，每组整步至少省3%且完整终态相同才保留；不重跑择优、不改门槛。若过门槛，再运行一次既有真实全样式176实体浏览器含输入压力、800ms主机停顿ACK、同局重连；失败如实报告，不把离线收益当作实时延迟。默认关闭、不提交/发布/打包。
