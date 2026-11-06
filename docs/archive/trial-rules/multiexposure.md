# 双重曝光 / Multiexposure

## 状态

- 归档日期：2026-11-05。
- 不再注册到运行时 `public/data/trial-rules.json`。
- 不再出现在调试制限选择器中，也不参与正式幕次抽样。
- 规则定义快照：[multiexposure.rule.json](multiexposure.rule.json)。
- 图标：[multiexposure.svg](multiexposure.svg)。

## 归档原因

该规则与预制件同样通过合并两张卡来缩短题面，生态位重复；同时它要求玩家辨认
互相重叠的部件轮廓，难度更多来自视觉辨形而不是汉字拆解判断。

## 已实现行为

- 道中关卡从答案拆法中选取两个部件，叠印在同一张卡上，两个组件都必须使用。
- 普通题复用预制件的 3–9 部件范围和对应长度权重。
- 守幕关卡从两个答案的全部来源部件中选择两组互不重叠的部件叠印。
- BOSS 原始拆法合计 8–10 张，叠印后显示 6–8 张。
- 叠印卡内部保存两个组件；BOSS 中可跨答案分别消费，全部耗尽后卡片消失。
- 叠印主题使用浅青灰绿色，避开稀有度色、预制件黄色和错误反馈红色。

## 休眠实现索引

- 卡片构造：`src/game/trial.ts` 的 `makeOverlayCard()`。
- 普通题选卡：`resolveOverlayForWay()`。
- BOSS 选卡与分配：`overlay-components` 分支及
  `assignPrefabricatedBossAnswers()` 的共享消费逻辑。
- 页面渲染：`src/main.ts` 的 `displayMode === "overlay"` 分支。
- 样式：[multiexposure.css](multiexposure.css)，已从运行时样式表移出。
- 当前没有独立的 double-exposure 规则测试；与其共享的复合卡测试仍覆盖
  组件构造、消费和结算拆分。

恢复规则前应重新区分它与预制件的玩法定位，不能直接把归档配置复制回运行时
规则表。
