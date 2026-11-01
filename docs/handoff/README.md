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
| 2026-11-01 | bugfix | 设置增加“难输入汉字”排除选项；修复与阶段EX的切换冲突；同步最新字表 | [bugfix.md](bugfix.md) |
| 2026-11-01 | bugfix | 挑战分享增加难度；同步最新字表和生成统计 | [bugfix.md](bugfix.md) |
| 2026-11-01 | bugfix | 教程图鉴段距、挑战结算说明、练习限制文案、换题黄色铺卡 | [bugfix.md](bugfix.md) |
| 2026-11-01 | feature | 单向答案兼容展开接入 `GameData.accepted()` | [answer-compat.md](features/answer-compat.md) |
| 2026-11-01 | data | 字表更新并刷新图鉴、部件使用和计数测试 | [bugfix.md](bugfix.md) |
| 2026-11-01 | bugfix | 囗注记、换题揭示、教程计数、写字台方点、Cris 不足按钮、新增 SVG | [bugfix.md](bugfix.md) |
| 2026-11-01 | feature | 汉字释义浮窗的静态分片和按需加载方案 | [char-detail.md](features/char-detail.md) |

## 当前状态（2026-11-01）

- 答案兼容层已在 `bugfix/internal` 工作区实现并通过测试，尚未由用户提交。
- `main` 当前尚未包含本轮答案兼容层和最新字表生成结果。
- 主线 `feature/trial-mode` 目前仍在 `55eb499`，合入 `main` 前需要自行同步。
- 未提交或合并任务仍以 `git status`、`git diff` 的实际结果为准。
