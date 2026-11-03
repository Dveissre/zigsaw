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
| 2026-11-03 | data | 同步字表修正；新增 `12`（㇈）和 `342`（叀）SVG | [bugfix.md](bugfix.md) |
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

## 当前状态（2026-11-02）

- `main`、`origin/main` 和 `feature/trial-mode` 已同步到 `b774aad`。
- 本轮暂停、极矮视口和多行部件调整已同步到正式根页面 `/`；`/test/`
  保留为同一版本的备用测试入口，仍在 `bugfix/internal` 工作区，尚未提交。
- 未提交或合并任务仍以 `git status`、`git diff` 的实际结果为准。
