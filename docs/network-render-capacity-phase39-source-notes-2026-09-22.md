# Phase39：绘制端观察与多纹理容量实验（实现前）

上一轮完成固定字段恢复，是进展，但五人Hz未稳定改善。本轮不把CPU微基准等同于联机流畅度。

## 原版证据/边界
已重新读取本机0.98a `../decompiled/starfarer_obf/com/fs/starfarer/renderers/damage/String.java:159–188`（stencil/alpha mask）和`OOoO.java:166`（整数热光通道），以及Web现有Canvas/精灵绘制。原版实际画面/操作待核实：禁止使用桌面，因此只做隔离无头Web像素等价，不冒充原版实机验证。

## 本轮观察改变了方向
对冻结Phase38源码的实际5人路径增加仅测试用纹理探针。16.287秒内，guest1没有任何舰体覆盖层上传，仍54Hz/48.4FPS；其他视点热光418/434/72/373次更新，API CPU累计约14–70ms（不含GPU finish），不能把该机制当作客机低Hz主因。因此**不做未被证据支持的Canvas/GPU热光重写**。

已有GPU查询显示绘制设备时间远低于整帧间隔；GL查询不包含浏览器合成/CPU调度，不能宣称GPU完全无负担。CPU主线程render样本约4–5ms，绘制有大量纹理/混合边界提交。下一步选择验证现有固定4纹理批处理的容量限制，而不是减少对象/特效。

## 最小候选
把已有有序多纹理批处理扩展到4/8/16，按实际MAX_TEXTURE_IMAGE_UNITS选择支持容量；shader使用静态sampler索引和分支外梯度，保持FIFO、primitive、alpha/additive、pass、flush、4096实例边界。默认生产暂保持4，先在完整渲染中对照。不能仅凭减少drawCall就启用：更大容量会增加绑定与分支成本，必须实际测量总render+GPU finish。

保持所有纹理、热度、精度、画质和战术信息。不改世界/预测/权威/Hz目标。相同场景MSAA/非MSAA、显式flush/resume、不同纹理数量、容量溢出、丢失/恢复逐像素比较；完整场景正反顺序及实际联机对照通过且有整体收益后才改默认，否则保留负证据并撤回未获益实现。
