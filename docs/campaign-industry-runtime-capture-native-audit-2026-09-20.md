# 产业扰乱/物品保存态getter：实现前对照（2026-09-20）

## 原版证据

本机0.98a-RC8，先核对原版再编码；不操作桌面/窗口，不使用子代理。

- BaseIndustry::getDisruptedKey 返回 $core_disrupted_ + 实际Java类simpleName；产业别名不是此key。特别是commerce保存名TradeCenter2，运行类TradeCenter。
- BaseIndustry::isDisrupted 调用 market.getMemoryWithoutUpdate().is(key,true)，不读取wasDisrupted。getDisruptedDays读取getExpire，只有<0才返回0；-0仍保留。
- Market::getMemoryWithoutUpdate 只在null时new Memory，不更新/推进到期时间。
- Memory::readResolve为空的data/expire/require/reqFor补集合。getExpire按原顺序返回第一条同key计时，不要求data存在。is(boolean)先contains，再getBoolean；getBoolean来自getString().toLowerCase().trim().equals("true")，不是JS truthiness；Java trim只剔除U+0000..U+0020。present但null的value在原版getString抛错，不能作为false悄悄接受。
- Memory::advance才扣时间，并在严格timeLeft<0时unset。当前getter不应自动清掉负/零期限的true标志。require/reqFor也不在此次getter执行。
- CampaignGameManager记录Memory的d/e/r/rF别名，MExp的k/t别名，st/bp/fp/ip标量别名；CoreLifecyclePluginImpl记录SpecialItemData别名SpID与i/d属性。SpecialItemData保留id及可空data，不执行其中字符串。

## 实际捕获证据与当前差异

只读检查当前65市场：Memory都有可解析的d字段，此保存点未发现产业扰乱标志/到期项。9个安装物品中包含2种nanoforge、synchrotron以及1个fullerene_spool；旧capture只留下引用，没有解码对象。spool在ItemEffectsRepo内实际改变港口access +0.3，并有环境限制，目前规则未支持，不能因为读取到物品ID就当作效果执行完成。

## 实施

新增独立原版getter函数，输入明确的disruption值及保序到期列表，输出operating/improved/getDisruptedDays；不推进时间，不用旧wD替代，不声称管理员已重应用。

capture按每个已知产业实际运行类投影所需memory key，不复制其它私人memory内容；解码实际SpecialItemData字段。新字段可选以读取旧capture：旧capture缺runtime证据时仍标记未捕获，不能默认正常运营。未知产业原有unsupported标记保留，不擅自运行其类。source provenance增补Memory.java/SpecialItemData.java。

storage draft消费新的已核实getter和物品记录，同时保留所有未实现的物品效果与管理员/监听器重应用边界；全经济readyForAuthority继续false。

## 验证

Java探针直接抽取Memory的is/getBoolean/getString/getExpire及BaseIndustry的getDisruptedDays/isDisrupted/isImproved，覆盖字符串/布尔/数值、到期正零负、重复计时、无data但有计时、TradeCenter别名。合成XML覆盖别名、引用、非法类型、物品data原样保留、未知插件和旧capture兼容。重新捕获真实存档仅写忽略的artifacts，核对源字节和私有输出不进Git。

这不是内存事件advance、installed item apply或完整econPostSaveRestore；无UI修改/验收。
