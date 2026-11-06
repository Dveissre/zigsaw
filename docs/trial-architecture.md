# 试炼模式代码结构

## 单一事实来源

试炼分为四个明确层：

| 层 | 路径 | 责任 |
| --- | --- | --- |
| 运行时规则 | `public/data/trial-rules.json` | 唯一可被游戏加载的活动规则、显示数据、选池策略和判题策略 |
| 规则校验 | `src/game/trial-rules.ts` | v3 数据契约、枚举校验、逐幕星级池与无重复抽选 |
| 会话引擎 | `src/game/trial.ts` | 题目生成、卡片消费、判题、计时、历史与结算状态 |
| 页面适配 | `src/main.ts`、`src/styles.css` | DOM、输入、动画和页面导航 |

`src/game/trial-runtime-data.ts` 只负责按规则加载拼音、繁简、格式塔、词池和
扩展答案数据。页面不得继续堆叠规则专属的数据加载条件。

每次创建 `TrialSession` 时，会按阶段星级池预生成整局七幕规则；调试覆写只
替换当前幕，不改变本局后续已抽选结果。

规则文案固定分为：

- `description.public`：普通玩家看到的短规则。
- `description.debug`：调试模式追加显示的参数说明。
- `description.internal`：开发维护用的完整效果说明，不进入 UI。

`docs/trial-rules.csv` 是 32 条活动规则的六列审阅表，列为中文名、英文名、id、
星级、显示规则和调试规则。它只维护活动规则清单；归档规则不混入此表。
应用新的 opinion 时使用
`npm run apply:trial-rules-opinion -- <opinion.csv>`；脚本只更新名称、英文名、
星级和两层显示文案，并同步当前审阅表。

## 退役规则

- 活动规则不得引用退役规则。
- 退役规则不得留在 `public/data/trial-rules.json`。
- 退役规则不得出现在调试制限选择器或 `public/assets/trial-rules/`。
- 所有退役规则统一存放在 `docs/archive/trial-rules/`，并以
  `registry.json` 为索引。
- 每条退役规则至少包含规则快照、说明文档和图标；视觉专属 CSS 可以保存在
  同一目录，但不得被运行时 CSS/JS 直接加载。

## 规则扩展顺序

1. 先确定是否能由现有 `TrialRulePolicy` 表达；能表达时不增加规则 ID 分支。
2. 新数据类别做成独立加载器，并由 `trialRuleDataRequirements()` 声明依赖。
3. 在 `trial-rules.json` 增加规则，不改页面中的模式枚举。
4. 为选池、生成、判题和撤回分别补自动测试。
5. 运行 `npm run check:trial-rules` 与 `npm run test:trial`。

## 测试流程

- `npm run check:trial-rules`：检查活动规则 ID、幕次引用、图标路径，以及归档
  注册表、快照、说明、图标和运行时隔离。
- `npm run test:trial`：运行规则数据、会话引擎和运行时数据依赖测试。
- `npm test`：先执行规则一致性检查，再运行完整测试集。

当前规则通过只代表白模和单规则逻辑通过。正式发布前仍需进行跨规则抽查、桌面
和手机端视口检查，以及开发/生产构建检查。
