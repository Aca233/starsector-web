# 实际混编记录布局专用恢复（实施前，2026-09-27）

## 依据与范围
原版0.98a-RC8，重新定位 ../decompiled/starfarer_api_source/com/fs/starfarer/api/combat/WeaponAPI.java 的getAmmo/getCurrAngle/getCooldownRemaining实时只读接口；本次只改Web接收恢复内部，不改原版字段/玩法/布局/频率。无原版实机/界面验收，不操作桌面。

当前740模块三舰混编完整链路采样：模拟40.808%、capture13.963%、encode9.615%、decode4.727%、apply24.379%（互斥stage归因；剩余GC/工具/摘要等）。apply内unpackRecord self17.286%、unpackDisplay self25.916%、assertDataField self17.271%。这不是无profiler性能或浏览器Hz/P95。

六个代表快照tick0/20/60/150/210/270，37个实际记录布局、其中23个不在已有36个有限模板中；642091个被处理记录字段中的568418个（88.526%）走通用恢复。slotId行多loadedMissileLevels、name系统行新增字段、shield首字段voidShield及自定义武器布局使旧匹配失效。不能沿用旧64原生舰全部命中的结论。

## 候选
只将实际出现的23个合法、有限、有序布局加入既有构建期表，总59项（原上限64不变），按原generator产生显式字段写入。未知/新增/重排布局仍通用路径；没有eval/Function、动态网络代码、形状授权、省略guard、旧值GET、嵌套depth、错误顺序或写回。所有接收端对任意坏包的校验保持。

同时修正既有compiled-vs-generic合同：此前未配置external baseline时两个入口可指向同一专用表；参考端现在显式清除本调用layouts.records，确保确实运行通用循环，而不是比较同实现。

写集：scripts/lib/display-restore-shapes.json、src/network/DisplayRecordRestore.generated.ts、scripts/check-native-capture.mts。其余生产源不改；不启用display-v2、presentation/serializer Worker或GPU，不降低精度/画质/实体/Hz/过载保护。

## 一次验收及门槛（运行前固定）
整块完成后一次typecheck、改动lint、生成表--check和既有check-native-capture。每个59布局覆盖depth0/63/64、guard拒绝、proxy values/descriptor/get/set顺序、嵌套向量与异常；真实三舰pipeline逐步完整帧bytehash/接收图摘要/authority及隐藏tracker/RNG相等。

性能只一次独立隐藏Node A0/B1/B2/A3；当前同源冻结图，两玩家+20AI三舰循环、seed917、3200DP、四既有模拟实验共同开启。每臂150热身+120完整模拟/capture/encode/decode/apply，无profiler/计数。两组完整五段均各至少省5%，decode+apply两组均各至少省10%，权威三段每组不能慢超过3%；状态/完整wire/接收图必须相同才保留。不能用未改simulation变快代替接收改善；不重测择优、不改门槛。过离线门槛才一次既有双无头浏览器场景；Node结果不当Hz/真实输入P95。失败先核对全写集current/before SHA与绝对路径，归档后精确撤回全部三文件。

## 集中验证中发现的既有fixture阻断（尚未运行性能）
生产typecheck、改动lint、generator --check通过；60步完整真实混编pipeline逐步authority/wire/接收图一致。旧check-native-capture在注册测试前因PulseDrive导入NativeSystemFactory而抛Native system removed: orion_device，未执行任何测试；不恢复已移除原版机制来绕过。定向给同一既有runner加入NATIVE_CAPTURE_RECORD_ONLY，只抽取同一份全布局合同及真实codec依赖，避免无关已退休fixture；不复制/简化合同，不取消guard/depth/Proxy顺序检查。追加第四写集scripts/check-native-capture.mjs（已存before）；完整旧suite仍标记未通过，不能冒充全项目回归。性能门槛不变，只有相关合同真实通过才运行。
