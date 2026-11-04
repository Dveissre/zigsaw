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
| 2026-11-04 | feature | 写字台结算按钮移位；多部件组字奖励 Cris 并增加卡片槽位与结算反馈 | [gacha-rewards.md](features/gacha-rewards.md) |
| 2026-11-04 | feature | 合并试炼主线；新增可迁移的加密存档；练习无尽改为题数行单键开关 | [save-archive.md](features/save-archive.md)、[bugfix.md](bugfix.md) |
| 2026-11-04 | feature | 实装失与得、拾级、五个奇境变体、短视、心盲症并统一试炼文案 | [trial-mode.md](features/trial-mode.md) |
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

## 当前状态（2026-11-04）

- `origin/main` 已更新到 `21cce3e` 的试炼模式版本。
- `bugfix/internal` 已在工作区合入该版本，但按约定没有创建 merge commit；
  后续提交、推送和 `main` 合并由用户执行。
- `/test/` 提供挑战、试炼与练习入口；正式 `/` 仍只提供挑战与练习。
- 练习模式下的“无尽”已改为题数行右侧单键开关；开启时题数控件置灰禁用。
- Bug worktree 的开发端口仍为 `5174`，试炼主线 worktree 为 `5173`。
- 试炼已接入四分法、急板、失与得、增稠、五个奇境、极简主义、短视、繁缛
  与心盲症。
- 完整制限规则目录与实装批次见 `docs/trial-rules-plan.md`。
- 未提交或合并任务仍以 `git status`、`git diff` 的实际结果为准。
