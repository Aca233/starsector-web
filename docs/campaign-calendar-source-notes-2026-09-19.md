# 原版生涯星历／时间模块：实现、证据与接入合同（2026-09-19）

## 范围与交付状态

已实现 `reference.calendar@1.0.0`，服务名 `calendar`。纯计算，不读取系统时间，不引用 world/client，不提交命令，不推进或暂停世界时钟。只新增以下五个文件；未改 Types、WorldState、ReferenceRuleset、PlayerProjection、Worker 或任何 client 文件，也未提交／发布。

- `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/rules/OriginalCalendar.mjs`
- `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/rules/OriginalCalendar.d.mts`
- `C:/Program Files (x86)/Starsector/starsector-web/src/campaign/data/reference-calendar.json`
- `C:/Program Files (x86)/Starsector/starsector-web/scripts/check-campaign-calendar.mjs`
- `C:/Program Files (x86)/Starsector/starsector-web/docs/campaign-calendar-source-notes-2026-09-19.md`

**这不是整个生涯模式完成声明，也不是原版完整新游戏的端到端运行声明。** 日期结论来自创建流程源码追踪，以及直接执行安装目录原生 CampaignClock 的对照；自定义脚本／Mod 仍可能改变开局。

## 1. 已核实的原版行为

以下源码路径以 `C:/Program Files (x86)/Starsector/` 为根；完整 SHA-256 见文末和 JSON。

### CampaignClock 与日期系统

`decompiled/starfarer_obf/com/fs/starfarer/campaign/CampaignClock.java`：

- 17–25 行：`SECONDS_PER_GAME_DAY = 10.0f`，构造 `new GregorianCalendar(206, 0, 1)` 并保存毫秒 timestamp。**构造时是 c206-01-01 00:00:00，不是必然的可玩开局时刻**。
- 28–36 行：读档从 timestamp 重建 GregorianCalendar；`set(year, month, day)` 的 month 为 **0-based**，而 `getMonth()` 对外加一为 **1-based**。`set` 本身没有同步 timestamp（原生探针已确认），所以导入工具不能把可能未同步的 timestamp 和 cal 字段混用。
- 50–68 行：每次 `advance(float amount)` 先执行 `(int)(amount / secondsPerDay * 86400.0f)`，再 `cal.add(Calendar.SECOND, n)`；`getHour()` 取 24 小时制。
- 76–86 行：`convertToDays = seconds / 10`；`convertToSeconds = days * 10`；`convertToMonths = seconds / 10 / 30`。**30 是近似月转换的除数，不是日历月长**。这个模块不覆盖既有后勤／经济换算。
- Java 默认 GregorianCalendar 不是纯公历：c1582-10-15 以前用儒略历，之后用格里高利历。c300 和 c1500 都是闰年；c1700／1900 不是；c2000 是。不能用 JS Date、Intl 或简单 `year % 100` 规则代替。
- c1582-10-04 的下一天是 c1582-10-15；5–14 日不存在。1582 年实际 355 天，10 月实际流逝 21 天，但 `getActualMaximum(DAY_OF_MONTH)` 仍是 **31**。因此 `daysInMonth()` 返回最大合法日号，不应被当作跨该月的实际流逝天数。
- `decompiled/starfarer_obf/com/fs/starfarer/campaign/econ/reach/ReachEconomyStepper.java:110–112` 也明确通过 `getActualMaximum(5)` 获取当月上限。
- 原生 cal 的构造／读档使用 JVM 默认时区；timestamp 是 Java 的 epoch 毫秒，不是 `world.clock.gameSeconds`。没有原生时区和纪元映射的裸 timestamp 不允许直接导入本合同。

### 为什么普通开局不是 1 月 1 日

1. `CampaignEngine.java:281` 创建 CampaignClock；`CampaignGameManager.java:382` 创建新引擎。
2. `campaign/save/return.java:44,221–226` 的 `withTimePass` 初始为 true。
3. `CampaignGameManager.java:415,441–480` 读取该开关，进入新游戏快速推进。执行 **120 × 2 次 advance(2.5f)**，再 **30 次 advance(0.06666667f)**。
4. 调用 CampaignClock 后，每次主循环增加 21600 个历法秒；每次尾循环增加 576 个历法秒；共 **5,201,280 历法秒 = 60 天 04:48:00 = 名义 602 gameSeconds**。
5. 构造日期加该预演，得到 **c206-03-02 04:48:00**。测试直接执行实际 jar 里的 CampaignClock 重放这些调用，得到相同结果。
6. `starsector-core/data/campaign/rules.csv:2931–2940`：教程与跳过教程分支里的 `#NGCSetWithTimePass false` 都是注释，**两者都保留预演**。
7. 同文件 2956、2970 行：两个开发分支明确执行 `NGCSetWithTimePass false`，因此对应 **c206-01-01 00:00:00**。`customDevStart` 只是这里一个特定开发选项，不等于所有用户自定义开局。
8. `NGCAddStandardStartingScript.java:43–70,72–216` 的教程／跳过差异是场景、舰队、剧情、教程脚本；此文件没有设置或推进日历。`CampaignTutorialScript.java:121–123` 在 fast advance 时直接返回。
9. 创建流程还运行 sector generator、创建前后脚本和 Mod hooks（GameManager 403、413、432、447、548、556 行等）；API `NGCSetWithTimePass` 可改变预演开关，`getCal()` 允许自定义日期。**因此没有可证明覆盖任意 Mod／自定义开局／旧存档的统一默认日期。**

`createNewGameEpoch` 只接受明确选定的 `tutorial`、`skip-tutorial`、`development-no-time-pass` 三种已核实流程。它不会读取本机已启用 Mod，不会替主线程判断正在创建哪类世界；调用者必须确认场景符合对应流程。其他开局用 `createEpoch` 提供实际日期和来源。

### 原版 HUD 不是 getDateString 的整行布局

`decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/Oo0o.java:39–59,64–68,81–91`：

- 整块约 **150 × 28**；上方左标签“日期”，右标签“星历年”，字体 `graphics/fonts/victor10.fnt`。
- 下方是独立的短月份、`日号 + "日,"`、年号三块，字体 `graphics/fonts/orbitron20aa.fnt`。月／日控件各宽 50，年控件宽 100 且右对齐；不要改成网页日期选择器布局。
- 日内进度由 `(hour + minute / 60f) / 23f` 得出，再用严格 `> 0.2f/0.4f/0.6f/0.8f` 切为 `0/.25/.5/.75/1`；忽略秒，不是连续 24 小时进度条。实现用 `Math.fround` 复现这些 Java float 运算。
- 本地汉化的 `getShortMonthString` 含对齐空格，5 月只有一个前导空格，1–4、6–9 月有三个；不擅自“修正”。`monthText` 保留原串，HUD 渲染需要保留空白；可用固定格布局，而不是浏览器自动折叠空白。
- `getDateString`：`"   3月 2, c206"`；`getShortDate`：`"206.3.2"`；`getCycleString`：`"c206"`。HUD 的 `cycleText` 只是 `"206"`。
- 格式证据属于这份本地汉化安装，不据此编造英文版月名。更换语言／历法应通过对应 provider 或显式版本化规则，不在浏览器用系统 locale 临时改写。

## 2. 持久纪元合同

持久 JSON（示例是明确选定的标准新游戏完成预演、且 Web 世界尚未开始计时时）：

```json
{
  "schemaVersion": 1,
  "providerId": "reference.calendar",
  "providerVersion": "1.0.0",
  "calendarSystem": "julian-gregorian-1582",
  "timeBasis": "fixed-civil",
  "secondsPerDay": 10,
  "atGameSeconds": 0,
  "date": { "cycle": 206, "month": 3, "day": 2, "hour": 4, "minute": 48, "second": 0 },
  "source": "reference-calendar.json:local-0.98a-RC8-zh-2026-09-19:tutorial"
}
```

- `atGameSeconds` 表示 **date 对应的权威 gameSeconds**，不要求为零，不代表现实 Unix 时间。`date` 和 `atGameSeconds` 必须一起原子持久化。
- `createEpoch({date, atGameSeconds, source})` 三项必需。date 的年月日必需，只有新建输入允许省略时分秒（补零）。**持久态六个日期字段都必需**；读档不能补缺失值。
- source 必须非空且不超过 1024 字符，记录场景配置版本或导入／人工迁移来源。自定义日期不接受“猜测默认”。
- 纪元只在世界创建、已验证存档导入或显式迁移时产生；不能在每个投影／玩家加入／重新连接／加载时重新创建，不能用当前格式化日期反复重新锚定，否则会丢失不足一秒的相位。
- 保存完整年月日时分秒而非原生 Java 毫秒 timestamp；原版档导入需要在其原生日历／时区中恢复 civil fields，再把这些字段与导入时权威 gameSeconds 对齐。此模块没有实现 Java 存档解析器。
- 未知 schema/provider/version/system/rate 或未知字段报错；禁止自动采用最新版或默认历法。
- 范围明确为 AD/cycle **1..9999**、整数时分秒、gameSeconds **0..1,000,000,000**。没有 BCE/零年、闰秒或任意巨整数支持。越界或投影超范围明确报错，不让 Date 溢出/自动滚月。该界限是当前 Web provider 的数值合同，不是原版 Java 的上限。
- 输入不被修改，返回值冻结且可序列化；声明类型可直接赋给现有 `JsonValue`。

### 明确的 Web 策略差异

原生每次 advance 都把浮点结果截为整数历法秒；这不满足任意批次等价。原生探针实测：100 次 `.001f` = 800 历法秒，而一次 `.1f` = 864 历法秒。**单靠总 gameSeconds 无法还原任意原生调用历史的截断损失**。

本模块从固定 anchor 对绝对 `(gameSeconds - atGameSeconds) * 8640` 换算，只在查询最终完整历法秒时 floor；不会累计每次查询误差。接近整数的浮点表示噪声，用 `8 × EPSILON × max(1, |elapsed|, gameSeconds×8640, anchor×8640)` 容差吸附到整数。该容差也意味着相邻 ULP 的“刚好前一瞬”不应被解释为不同可见秒；不会把明显不足一秒的时间量四舍五入。

没有修改 tick、时间倍率、暂停、离线推进、联机遭遇时间策略。现有 `tick / 60` 的权威时钟可直接投影，每 tick 对应 144 历法秒。时区固定为 **fixed-civil**（每个历法日 86400 秒），不采用主机夏令时；这在未来公历年代跨 DST 时不等同于任意机器默认时区的 GregorianCalendar。它是联机确定性策略，已保存于合同，不是假称逐比特复现所有 Java 时钟调用。

## 3. 给主线程的接入步骤

### 注册与锁定

将 `originalCalendarProvider` 注册到现有 RuleRegistry，profile 选择 `providers.calendar = 'reference.calendar'`，并显式升级 ruleset profile 版本。不需要为此增加第二个 world.advance handler。provider capabilities：

- `persistent-calendar-epoch`
- `absolute-calendar-projection`
- `native-calendar-hud`

### 纪元位置与生命周期

现有 WorldState 的扩展键必须以某个已选 provider 的 `id + ':'` 开头，因此推荐：

```js
const calendar = rules.services.calendar;
const key = 'reference.calendar:epoch'; // 导出 ORIGINAL_CALENDAR_EPOCH_KEY
const epoch = calendar.createEpoch({
  date: scenario.calendarDate,
  atGameSeconds: world.clock.gameSeconds,
  source: scenario.calendarSource,
});
// 仅在创建世界/受控迁移事务中写入，不在投影时写入。
world.extensions[key] = { id: key, version: 0, schemaVersion: 1, data: { epoch } };
```

已明确选择原版流程时，可以改用：

```js
calendar.createNewGameEpoch({ start: 'tutorial', atGameSeconds: world.clock.gameSeconds });
```

如果 Web 已在世界时钟上执行了 602 秒预演，应锚定在**该时刻**，不能再对日期额外加 602 秒。若根本不是原版开局场景，不要为了填满 HUD 调用这个 helper。

替换 provider 时推荐继续约定 `${world.rules.providers.calendar.id}:epoch` 这个命名模式，由新 provider 自行实现日期／HUD结构和迁移；原版纪元不能被无声解释为别种日历。

加载时先校验 rules lock，再通过已锁定服务 `calendar.validateEpoch(extension.data.epoch)` 校验内部合同，并验证该纪元在 `world.clock.gameSeconds` 可投影。当前 WorldState 只校验扩展外壳，主线程需要加上服务层验证，不能以外壳通过等同于日期有效。

已有无纪元档：不自动猜 `c206-03-02` 或 `c206-01-01`。应明确显示日期不可用并提供受控迁移策略。无效／版本不符的已存在纪元应报告保存数据问题，不能伪装成正常默认值。

### 在 CampaignWorker 内投影

```js
// 与主线程的真实已锁定 services 路径一致，不额外 import 一套硬编码原版计算。
const ext = world.extensions['reference.calendar:epoch'];
const calendarHud = ext
  ? rules.services.calendar.hudAt(ext.data.epoch, world.clock.gameSeconds)
  : null; // 主线程定义明确 unavailable 状态；不能由客户端猜纪元。
```

HUD 读取 `dateLabel/cycleLabel/monthText/dayText/cycleText/dayProgress`。只发送所需投影，不必暴露 source、完整 rules evidence、其他舰队信息；日历是世界公共时间，与舰队后勤的权限检查分开。重连时复用现有纪元，其他玩家不能各自设置全世界时间。

### 完整 API

| `rules.services.calendar` 方法 | 入参 | 返回 |
|---|---|---|
| `createEpoch` | `{date, atGameSeconds, source}` | 完整不可变 epoch |
| `createNewGameEpoch` | `{start, atGameSeconds}` | 限定流程的完整 epoch |
| `validateEpoch` | 未知持久 JSON | 校验后的独立不可变 epoch；不迁移 |
| `dateAt` | `(epoch, gameSeconds)` | `{cycle,month,day,hour,minute,second}` |
| `hudAt` | `(epoch, gameSeconds)` | date + 原版 HUD 分块、格式串与进度 |
| `formatHud` | 完整六字段 date | HUD 投影，独立于时钟 |
| `isLeapCycle` | cycle | bool |
| `daysInMonth` | `(cycle, month)` | 月最大日号（见改历缺口说明） |

模块同时导出相应具名纯函数；无需把 World 对象传入。所有服务方法／provider metadata 均冻结；没有命令写权限和对其他 service 的依赖。

## 4. 验证结果与复跑

在项目根运行：

```powershell
node scripts/check-campaign-calendar.mjs --native
npx oxlint src/campaign/rules/OriginalCalendar.mjs scripts/check-campaign-calendar.mjs
npx tsc --noEmit --strict --skipLibCheck false --target ES2023 --module NodeNext --moduleResolution NodeNext src/campaign/rules/OriginalCalendar.d.mts
```

已运行结果：**16/16 通过**（包括原生 oracle），目标文件 lint 和独立声明严格类型检查通过。

- 跨秒／日／各种月长／周期；c300 儒略闰年、公历世纪规则、1582 缺口、低年号和上界。
- 显式开局来源、教程／跳过／开发差异、非零 gameSeconds anchor、防止重复计算预演。
- 单批、7200 次逐 tick、非均匀批次读取同一绝对时刻结果完全一致；不修改输入；JSON 往返一致。
- 缺失／错误版本、非法年月日时分秒、数值字符串、NaN/Infinity、超范围等拒绝，不宽松滚月。
- 原版中文标签、独立 HUD 字段、空格、逗号、c 前缀；全天所有 1440 分钟的 Java float 进度公式对照。
- 四种 Node 主机时区输出相同；现有 RuleRegistry 可注册／锁定／替换；存入 provider 命名空间扩展能通过现有 WorldState。
- 内存中的严格 TypeScript consumer 验证 provider 可注册、epoch/HUD 可作为 JsonValue、必填字段及只读约束；不写共享 contract/config/构建产物。
- `--native` 会逐项核验下列 **15 个 SHA-256**，用 JDK `javac --release 17` 编译一个临时探针，再以游戏自带 JRE 17 加载实际的 `starfarer_obf.jar` / `starfarer.api.jar` / `fs.common_obf.jar`。核对 **1194 个日期向量**、构造／预演／格式、原版分批截断差异。临时源文件和 class 在测试后删除，不改原版文件。
- 不带 `--native` 也可运行：原生对照项明确 skip，其余 15 项执行，不假称原生对照成功。需要 JDK 的机器可以用 `CALENDAR_JAVAC` 指定 javac；源哈希变化应重新审计，不绕过。

## 5. 来源哈希（SHA-256）

本地 `starsector-core/starsector.log` 首行标示 **0.98a-RC8**。这证明本地参考版本名称，不证明所有安装文件都是未修改上游；汉化字符串按实际安装保存。下列路径根均为 `C:/Program Files (x86)/Starsector/`，完整证据也封装在 reference JSON 与 provider evidence 中。

| 来源文件（相对于上述安装根） | SHA-256 |
|---|---|
| `decompiled/starfarer_obf/com/fs/starfarer/campaign/CampaignClock.java` | `00c00d08296811f9d3031a35660ddd9c7fdc652eae30b26595605a59051bd3f9` |
| `decompiled/starfarer_obf/com/fs/starfarer/campaign/ui/Oo0o.java` | `0db778582d8f6dbffe9d1d5cdd9221188017138ebb5411d7b65cd052d7af3084` |
| `decompiled/starfarer_obf/com/fs/starfarer/campaign/save/CampaignGameManager.java` | `8ebf0c86c896768c7bd4d124fba4b2005e2f185bcf0e2ad377b355995836ddc5` |
| `decompiled/starfarer_obf/com/fs/starfarer/campaign/save/return.java` | `a0b2d2d5b70a98b54d2859557a0ed45037941a5bb7416e189dcfbc7374194409` |
| `decompiled/starfarer_obf/com/fs/starfarer/campaign/CampaignEngine.java` | `5d3916a830fcef1a28bf51f78d229987bfaf47fe0ca897aa4ab34e30ec186267` |
| `decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/rulecmd/NGCAddStandardStartingScript.java` | `1b21efe03ee78f9d4a73a506924d84e2087a852687062aaf776bece39fb337a0` |
| `decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/rulecmd/NGCAddDevStartingScript.java` | `4f75d7ac1bcce77208170ce51c9010330e98ff0c1fa255cbb5e5fecdff40a64b` |
| `decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/rulecmd/NGCSetWithTimePass.java` | `fd7c8f9c580b11518cc7e7a450bee14acf894d3d66c4dc0e9c19837b86b4c18f` |
| `decompiled/starfarer.api/com/fs/starfarer/api/impl/campaign/tutorial/CampaignTutorialScript.java` | `655d25a71a5097b7fd4e81b502f03666dd92a151aa23400a07a7ce5a44fcf6e2` |
| `decompiled/starfarer_obf/com/fs/starfarer/campaign/econ/reach/ReachEconomyStepper.java` | `fb141d643b8dd3ad5b7ff43f1756b269571188be291e20c042eaa37e5ce18f99` |
| `decompiled/starfarer_api_source/com/fs/starfarer/api/campaign/CampaignClockAPI.java` | `9a2542551993b9cda90786ab0b64347c153d35675a6e278553a45b9a37e16402` |
| `starsector-core/data/campaign/rules.csv` | `e828b6c228db9515217a380f8539cac7528296e3fe19aa570b978c6401bf27b4` |
| `starsector-core/data/config/settings.json` | `96f3f6aa457e85ab6480bf302e35d3e8df390339321711b982d45fbe71c4dfa9` |
| `starsector-core/starfarer_obf.jar` | `8ae5516bf879ec068d206714fd67b90ebfa113c990f9e473357a5923b9700d6a` |
| `starsector-core/starfarer.api.jar` | `0798e624c949657ab524188928bb13d618a70cb451dc7da9789545569a05081b` |

## 主线程接入补充

主线程已在0.8.0规则锁注册calendar，并以通用provider validator在Repository create/read及Kernel命令前后校验纪元。开发世界显式设置不预演测试纪元；其他存档没有epoch则保持未知。`projectWorld`/`validateWorld`服务方法为此次集成补充，客户端读取World Worker投影；没有修改共享世界推进速率。5项存档/投影/事务集成测试在 `scripts/check-campaign-calendar-integration.mjs`；独立native oracle16项也由主线程复跑通过。
