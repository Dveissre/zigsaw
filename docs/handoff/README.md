# ZIGSAW 跨对话交接

这里是各 Git 分支和 Codex 对话之间共享上下文的唯一入口。

## 文件规则

- `README.md`：索引、最近交接和当前工作状态。
- `bugfix.md`：Bug 工作流、运行约定和已完成修复汇总。
- `features/<name>.md`：复杂功能的数据契约、入口、非目标、测试和已知限制。
- 小型修复不单独建文件；复杂功能才建立独立 feature 文档。
- 每次实质性修改后更新本页“最近交接”，再更新对应汇总或 feature 文档。

不要依赖另一个对话的记忆。代码、测试和本目录中的已提交文档才是共享依据。

## 开始工作或合并其它分支前

先查看本目录近期变化：

```powershell
git log --oneline -5 -- docs/handoff
git log --name-status -1 -- docs/handoff
```

其它分支合并 `main` 后，应再次执行这些命令，并阅读本次变化的文件。

## 当前分工

| 工作区 | 分支 | 默认端口 | 责任 |
| --- | --- | --- | --- |
| `C:\Projects\Web\zigsaw` | `feature/trial-mode` | `5173` | 主线、试炼模式 |
| `C:\Projects\Web\zigsaw-bugs` | `bugfix/internal` | `5174` | 现版本 Bug、兼容修复 |

两个 worktree 可以并行运行，但每个端口只能有一个 Vite 进程。

## 最近交接

| 日期 | 类型 | 内容 | 文档 |
| --- | --- | --- | --- |
| 2026-11-07 | bugfix | 同步 `origin/main@4c3ce9f`；写字台“结算本轮”改为卡片区右上角渐变条，并同步试炼 smoke 文案 | [gacha-rewards.md](features/gacha-rewards.md)、[bugfix.md](bugfix.md) |
| 2026-11-07 | trial | 化约论的两张展开部件卡复用黄色提示样式；BOSS 两次展开的四张卡统一标黄 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-07 | trial | 三星制限统一加时 30%；茁轧限定三级字；预制件改用普通卡样式并归档旧黄色样式 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-07 | trial | 中止后可消耗换题额度复活；所有换题只替换当前题面；失与得改为 90 秒；失韵法重新启用按字序分组 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-07 | ui | 试炼结算新增四档标题与红色字、移除平均用时、加入挑战模式同款分享；普通模式隐藏失败后的继续键；按 `390×430` 键盘后视口压缩守幕布局并固定 6–10 卡分行 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-07 | tuning | 心盲症更名为盲视/Anopia 并改为 1.5/6 秒；极简主义更名为简赅；回声室加入非强制部件去重权重 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-07 | feature | 规则数据升级 v3；七幕制限按 0/1/1/2/2/2或3/3 星级池随机抽取，同局避免重复；进入幕前按规则加载依赖 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-07 | feature | 试炼换题改为全流程累计预算且原地换题；首页增加 1–7 Center-focus Carousel 与说明 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-07 | feature | 试炼增加换题预算、失败后继续、阶段间主动结算与新结果标题；调试覆写按星级排序 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-07 | copy | 应用规则文案 opinion；新增试炼专用调试密钥、调试参数文案与简化覆写控件；归档原始 opinion | [trial-mode.md](features/trial-mode.md) |
| 2026-11-07 | copy | 规则文案拆为显示/调试/内部三层；调试模式显示红色参数说明；`trial-rules.csv` 升级为六列审阅表 | [trial-rules.csv](../trial-rules.csv) |
| 2026-11-07 | refactor | 抽离试炼运行时数据加载与规则行为查询；退役样式迁入归档；新增规则/归档一致性与分组测试命令 | [trial-architecture.md](../trial-architecture.md) |
| 2026-11-07 | archive | 统一试炼退役规则目录；赋格曲与双重曝光均从运行时移除并保存规则快照、图标与休眠代码索引 | [registry.json](../archive/trial-rules/registry.json) |
| 2026-11-05 | bugfix | 修复格式塔 BOSS 多解展示、重复答案字与四卡 BOSS 排布；完善配对检查 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-05 | feature | 实装格式塔；两卡与四卡线索、直接拆法种子和 BOSS 替代配对检查 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-05 | feature | 实装茁轧；双重曝光完成验证后因定位重复退役 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-05 | plan | 整理三条补充制限：赋格曲、双重曝光、茁轧；归档原始意见与 UTF-8 安全副本 | [trial-rules-plan.md](../trial-rules-plan.md) |
| 2026-11-05 | feature | 实装枝指；N 级部件按关联字数加权，干扰卡经唯一答案检查 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-05 | feature | 实装通配符；唯一答案筛选、BOSS 每答案一张 Cris 白板 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-05 | feature | 三秋树图鉴同时收录简繁；实装预制件及候选池分析 | [trial-mode.md](features/trial-mode.md)、[trial-rules-plan.md](../trial-rules-plan.md) |
| 2026-11-05 | feature | 实装化约论；兼容部件展开、展示卡替代答案与整幕来源去重 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-04 | feature | 新增紧凑存档码 beta，支持复制与二次确认导入；`.zsave` 仍为主要方案 | [save-code.md](features/save-code.md) |
| 2026-11-04 | feature | 写字台结算按钮移位；多部件组字奖励 Cris 并增加卡片槽位与结算反馈 | [gacha-rewards.md](features/gacha-rewards.md) |
| 2026-11-04 | feature | 合并试炼主线；新增可迁移的加密存档；练习无尽改为题数行单键开关 | [save-archive.md](features/save-archive.md)、[bugfix.md](bugfix.md) |
| 2026-11-04 | feature | 实装指差确认、三秋树；迁移拼音和繁简运行数据 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-03 | feature | 试炼规则数据层升级 v2；实装四分法并同步急板显示名 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-03 | data | 同步字表修正；新增 `12`（㇈）和 `342`（叀）SVG | [bugfix.md](bugfix.md) |
| 2026-11-03 | plan | 正式整理制限规则计划；归档 GBK 意见表并生成三类候选池报告 | [trial-rules-plan.md](../trial-rules-plan.md) |
| 2026-11-03 | feature | 试炼接入急板、极简主义、繁缛；规则数据解耦、逐字撤回与规则图标框 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-03 | feature | 试炼规则前置：时限状态化、标准/展示卡分离、题库可用性预检 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-02 | feature | 试炼白模接入 `/test/`：七阶段、8题+BOSS、分步双字提交与撤销 | [trial-mode.md](features/trial-mode.md) |
| 2026-11-02 | feature | 调整图鉴完成度里程碑；整理部件目录与关联字分类 | [atlas-classification.md](features/atlas-classification.md) |
| 2026-11-02 | feature | 图鉴部件可达性、EX 属性与稀有度分类规则 | [atlas-classification.md](features/atlas-classification.md) |
| 2026-11-02 | feature | `/test/` 隔离测试页：暂停控制、暂停半时、极矮视口和多行部件布局 | [pause-controls.md](features/pause-controls.md) |
| 2026-11-02 | bugfix | 矮视口/键盘弹出时压缩游戏布局并避免输入框自动居中滚动 | [bugfix.md](bugfix.md) |
| 2026-11-01 | bugfix | 设置增加“难输入汉字”排除选项；修复与阶段EX的切换冲突；同步最新字表 | [bugfix.md](bugfix.md) |
| 2026-11-01 | bugfix | 挑战分享增加难度；同步最新字表和生成统计 | [bugfix.md](bugfix.md) |
| 2026-11-01 | bugfix | 教程图鉴段距、挑战结算说明、练习限制文案、换题黄色铺卡 | [bugfix.md](bugfix.md) |
| 2026-11-01 | feature | 单向答案兼容展开接入 `GameData.accepted()` | [answer-compat.md](features/answer-compat.md) |
| 2026-11-01 | data | 字表更新并刷新图鉴、部件使用和计数测试 | [bugfix.md](bugfix.md) |
| 2026-11-01 | bugfix | 囗注记、换题揭示、教程计数、写字台方点、Cris 不足按钮、新增 SVG | [bugfix.md](bugfix.md) |
| 2026-11-01 | feature | 汉字释义浮窗的静态分片和按需加载方案 | [char-detail.md](features/char-detail.md) |

## 当前状态（2026-11-07）

- `feature/trial-mode` 已同步到 `origin/main` 的 `e5d3903`，并保留指差确认等未提交工作。
- `bugfix/internal` 已在工作区合入该版本，但按约定没有创建 merge commit；
  后续提交、推送和 `main` 合并由用户执行。
- `/test/` 提供挑战、试炼与练习入口；正式 `/` 仍只提供挑战与练习。
- 练习模式下的“无尽”已改为题数行右侧单键开关；开启时题数控件置灰禁用。
- Bug worktree 的开发端口仍为 `5174`，试炼主线 worktree 为 `5173`。
- 试炼已接入四分法、急板、失与得、拾级、五个奇境、五个厄境、指差确认、三秋树、
  化约论、预制件、通配符、枝指、茁轧、格式塔、简赅、短视、繁缛、
  盲视与回声室。赋格曲与双重曝光已统一归档，代码与测试保留但不再可进入。
- 完整制限规则目录与实装批次见 `docs/trial-rules-plan.md`。
- 未提交或合并任务仍以 `git status`、`git diff` 的实际结果为准。
