# 赋格曲 / Fugue

## 状态

- 归档日期：2026-11-07。
- 不再注册到运行时 `public/data/trial-rules.json`。
- 不再出现在调试制限选择器中，也不参与正式幕次抽样。
- 实现代码与自动测试保留为休眠参考，避免未来重新评估时从头实现。
- 规则定义快照：[fugue.rule.json](fugue.rule.json)。
- 图标：[fugue.svg](fugue.svg)。

## 归档原因

双题槽同时运作使答中区和计时区形成两套并列焦点。桌面端尚可容纳，但手机端
必须在极窄半栏中同时展示题干、计时、卡片和守幕记录，结果既没有保留原游戏的
阅读节奏，也显著增加了交互歧义。当前判断是：该规则的核心问题不是继续微调
尺寸可以解决，因此停止维护并归档。

## 已实现行为

- 左右两道普通题分别计时，共享本幕 8 道普通题队列。
- 共用答题框；提交同时检查左右两侧，恰好一侧可接受时自动归属。
- 两侧都可接受或都不可接受时均拒绝提交，不消耗卡片。
- 普通题答对后只给作答侧补题，另一侧保持当前题目和倒计时。
- 队列耗尽后，两侧分别进入独立守幕关卡。
- 守幕各使用 6–8 张卡组成两个不同汉字，答中、提交记录、撤回和计分互相独立。
- 生成时排除会令同一单字同时成为左右两侧合法提交的守幕组合，也排除最后三道
  普通题答案与任一守幕合法单字重合的情况。

## 休眠实现索引

- 会话与出题逻辑：`src/game/trial.ts`
  - `FugueState`、`FugueSlotState`
  - `buildFugueStage()`、`submitFugue()`、`completeFugueBossSide()`
  - `startFugueTimer()`、`freezeFugueTimers()`、`tickFugue()`
- 页面渲染：`src/main.ts`
  - `renderFugueGame()`
  - `renderFugueSlotMarkup()`
  - `updateFugueTimers()`
- 样式：[fugue.css](fugue.css)，已从运行时样式表移出。
- 测试：`tests/trial.test.ts` 中双题槽生成、补题和守幕歧义筛选用例。

恢复该规则时，应重新评估双题槽在手机端的输入模型，而不是直接把归档配置
复制回运行时 JSON。
