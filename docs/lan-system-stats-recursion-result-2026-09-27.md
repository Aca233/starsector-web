# 系统列表来源诊断结果（2026-09-27）

只做20个初始完整模拟步的调用计数，不做性能ABBA、不修改生产行为。完整176实体734挂点；四个现有实验均开启。

第一份透明getter探针发现hasNativeStats总递归353839次，同一次根调用重复15173次（4.288%），全部集中于NONE。Registry已采用WeakSet身份查找，因此没有新增注册缓存或递归Map。

第二份源码内插桩保持模块捕获的原生函数身份；首次构建后发现计数断言写成5、实际6（Ship/ShipSystem各有isPhased），模拟尚未开始。仅修正为明确六个文件:getter断言后运行，失败记录保留。

allSystems合计1692701次；互斥来源：phase 1327052（78.40%）、owned 16640、exact 140560、stats 11813、其它196636。phase包含两个类的isPhased，inclusive桶彼此重叠，不能相加。所有深度最终归零，exclusive之和等于total。

原样、透明探针、源码插桩完整authority+隐藏tracker/RNG终态均bc891a0f1c7b8da97559620bf2b36b6c7c35bbe3adde8467c4b6ec1b9b3ad224。计数不是CPU耗时/Hz/P95。生产仍为原726模块基底；此前系统列表、预瞄索引/许可缓存、LAN相位接线候选均未复活。

证据：artifacts/lan-system-stats-recursion-20260927/result.json、contexts-result.json、contexts-repair-audit.json、contexts-run.log、contexts-exit.json。
