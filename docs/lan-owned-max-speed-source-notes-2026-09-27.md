# 私有Worker最大航速标量读取（2026-09-27，编码前）

## 证据与边界
上一回合属于进展：扫描内motion复用行为正确但唯一ABBA第二组失败，两个生产文件已精确撤回、725模块before基底一致；目前无活跃测试或外部阻塞。本轮不重开逐障碍资格/缓存候选。

重新读取本机0.98a-RC8反编译 `../decompiled/starfarer_obf/com/fs/starfarer/combat/entities/Ship.java:3587–3592`（getMaxSpeed委托有效速度）及 `entities/ship/null.java:452–486`（disabled=1、速度/加减速/转向分别取值与最小值）。只对Web已有公式进行计算优化，不改玩法或UI，也不宣称完成原版实机等价。

TacticalNavigation中只取getMotionStats().maxSpeed的调用仍会计算整个运动记录：转向、加减速、损坏引擎漂移、侧移和allSystems读取。上轮79→1证明冗余，但附加逐障碍回调资格检查没有通过整步门槛。这里保留**每次实时读取**，只避免生成不会使用的字段和对象。

## 实现方案
1. 提取ShipMotion现有最大速度公式为共同内部函数，完整shipMotionStats与新标量路径共用；保留浮点运算顺序、phase减速、disabled/minimum、NaN/Infinity/负零行为，避免两套公式漂移。
2. 新readNativeMotionMaxSpeed只由已获权限的导航入口调用；该入口只在host私有域显式VITE_LAN_OWNED_MAX_SPEED=true下工作。不保存船/结果，未启用保持原getMotionStats调用。每次重新用现有readNativeMotionModifiers门槛检查本舰/父舰runtime、未知定义/aux；失败直接走原完整getMotionStats。调用者getMotionStats不是原生、漂移函数被替换也完整回退。已知纯原生modifier读法允许省掉其它字段；普通公开对象不进入该权限。
3. 只替换TacticalNavigation直接取maxSpeed的7处（以实际源码匹配计数为准），其它整套运动使用点不动。原导航reuseMotion、障碍/相位回调、几何判断/顺序、index、forecast、频率、实体全部不变。不检查/缓存全场目标；未知障碍回调若改变观察舰数据，下一个标量调用直接读新数据；若安装未知修饰，实时门槛自动回退。
4. 修改前后源冻结；恢复须逐文件候选hash核对。默认关闭，不提交、打包、发布。

## 预注册验证
真实三舰、2玩家+20AI、seed917、3200DP、176实体/734挂点；前三个保留实验在A/B均true。初建/重建/默认关闭、逐实体各种状态的maxSpeed精确值、未知system/aux/parent/runtime/getMotionStats/drift回退与异常序、已有导航场景/回调边界、60完整步权威与隐藏tracker/RNG完全一致。一次typecheck/改动lint/合同，失败只定向修复。

唯一ABBA，每臂150热身+120完整fixedUpdate；两组整步各至少降低3%且四臂终态hash一致才保留。**本轮预先改为每臂独立Node子进程（顺序、隐藏）**，隔离前面合同与各bundle的堆/JIT生命周期；计时不含启动/导入/预热/终态序列化。此举不证明上轮波动由GC造成，也不重测上轮失败候选，不拿新绝对耗时与旧进程比较。依然不择优重跑。

离线通过才做一次既有完整无头联机场景，完整CSS/资产/源冻结；否则回撤且不运行浏览器。仍过载则不声称输入P95或稳态Hz改善，目标仍active。

## 首次检查与具体修复
类型/lint和5项合同通过；仅A0计时已执行后，夹具错误地要求战斗270步后的活跃实体仍176而失败（实际自然推进后的活跃名单171；world初始化已严格断言176）。修正为相同初始176及四臂终态实体/hash完全一致，不减少负载。保留并复用唯一已测A0，要求before bundle字节相同，不重测挑分；B1/B2/A3此前均未执行。
进一步静态复核并用独立短探针确认：启用模式下被替换为accessor的getMotionStats读取两次。仅修正导航包装器捕获一次方法并保留receiver，新增启用模式accessor合同。v1探针实际trace为access/access/call，预期access/call；普通默认路径原来即通过。此前没有候选B计时，所以不存在用修复挑选B成绩。修改后重新定向验证本块，再续完同一个有间隔披露的ABBA；不拿它声称统计显著性。

## 最终否决
唯一独立进程ABBA整步+4.304%/−1.941%，两组均未达到−3%门槛。已hash核对后精确撤回3个生产文件，完整725模块before一致。候选/脚本仅用于历史重放；不运行浏览器、不默认启用、不发布。
