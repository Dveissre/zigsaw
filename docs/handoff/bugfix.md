# ZIGSAW Bugfix 运行约定与记录

总索引见 `docs/handoff/README.md`。复杂的跨分支功能单独记录在
`docs/handoff/features/`；本文件只保存 Bug 工作流和修复汇总。

本文用于另开一个对话集中处理内测 Bug，让主线对话继续推进“试炼模式”。

## 当前开发分工

- 主线对话：负责试炼模式的架构、规则、UI 和功能实现。
- Bug 对话：只处理现版本的复现、紧急修复、回归测试和发布前阻塞问题。
- 两边同时工作时必须使用不同的 Git worktree，不能同时编辑同一个目录。
- 未经用户明确要求，不提交、不推送。

## 项目快照（2026-11-01）

- 项目目录：`C:\Projects\Web\zigsaw`
- Bug worktree：`C:\Projects\Web\zigsaw-bugs`
- 技术栈：Vite + TypeScript
- 部署：GitHub Pages
- 数据存储：localStorage；没有后端
- 当前主线分支：`feature/trial-mode`，位于主 worktree
- 当前修复分支：`bugfix/internal`，位于 Bug worktree
- 当时 `main` 与 `origin/main` 位于 `003f9c1 fix: 2 New SVG`
- 主线 worktree 尚未合入此后的 Bug 修复和答案兼容层

## 开始 Bug 对话时先做什么

1. 运行 `git status --short`，记录已有改动。
2. 确认当前 worktree 和分支，避免与主线同时编辑同一目录。
3. 请用户尽量提供：
   - 页面路径：`/`、`/atlas/` 或 `/gacha/`
   - 浏览器、操作系统和设备型号
   - 视口尺寸或截图
   - 复现步骤
   - 期望行为与实际行为
   - 是否在无痕模式、其它浏览器或刷新后仍出现
4. 能稳定复现后，再定位代码；不要仅凭截图猜测原因。

推荐的新 worktree：

```powershell
git fetch origin
git worktree add C:\Projects\Web\zigsaw-bugs -b bugfix/live-internal origin/main
```

如 `bugfix/live-internal` 已存在，更换分支名。

## 开发环境

每次 `exec_command` 都必须显式使用 PowerShell：

```json
{ "shell": "powershell" }
```

常用命令：

```powershell
npm ci
npm test
npm run build
npm run smoke
npm run check:viewports
npm run dev -- --host 127.0.0.1 --port 5174
```

- 主线 `feature/trial-mode` 固定使用 `127.0.0.1:5173`，在
  `C:\Projects\Web\zigsaw` 中运行
  `npm run dev -- --host 127.0.0.1 --port 5173`。
- Bug 分支固定使用 `127.0.0.1:5174`。
- 两个分支可以同时打开；每个端口只保留一个 Vite 进程。
- 若页面突然出现旧版本，先检查监听进程，再改源码。
- `npm run build` 和 `npm run dev` 的 pre-hook 会重新生成图鉴索引和部件统计。

## 不可破坏的数据

以下内容包含用户或人工维护数据，修改前先确认：

- `public/data/char_sym.json`
- `public/data/tongyong_hanzi.json`
- `public/component_svg/`
- `public/data/component-assets.json`
- `public/data/char-detail/`
- `public/data/char-school.json`

以下文件由脚本生成，不应手工维护：

- `public/data/component-atlas.json`
- `public/data/component-atlas/*.json`
- `public/data/component-usage.json`
- `docs/component-usage.csv`

相关生成命令：

```powershell
npm run build:component-usage
npm run build:atlas
npm run build:trial-reports
```

## localStorage 数据

Bug 修复不得要求用户随意清除网站数据，否则可能丢失：

- 图鉴与部件收集
- Cris 余额
- 挑战纪录
- 设置与教程状态
- 写字台记录

调试验证时优先使用无痕窗口；需要构造状态时，在测试页面内单独设置。

## 关键代码入口

| 路径 | 职责 |
| --- | --- |
| `src/main.ts` | 首页、游戏页、结算页、模式切换和主 UI |
| `src/game/session.ts` | 游戏状态机、计时、答题、挑战进度 |
| `src/game/data.ts` | 字表、部件和拆法数据 |
| `src/game/records.ts` | 挑战纪录 |
| `src/game/collection.ts` | 图鉴和收集进度 |
| `src/game/gacha.ts` | 写字台抽卡算法 |
| `src/atlas-page.ts` | 图鉴页 |
| `src/gacha-page.ts` | 写字台 |
| `src/ui/` | 教程、设置、调试口令、部件排版和浮窗 |
| `src/styles.css` | 全站布局、响应式与动效 |
| `tests/` | Vitest 单元测试 |
| `scripts/smoke.mjs` | 主流程端到端检查 |
| `scripts/check-viewports.mjs` | 手机、平板、桌面溢出检查 |

`src/main.ts` 和 `src/styles.css` 是最容易发生主线/Bug 分支冲突的文件。两边并行时不要直接共用同一 worktree。

## 最近完成的修复

### 答案反馈与写字台

- `/test/` 中，手机键盘较高导致可视高度不足时会隐藏角标并压缩品牌页眉、
  HUD、部件、输入区和操作区，确保阶段提示、倒计时和部件保持可见；输入框重渲染时使用
  `preventScroll`。该布局现已同步到正式根页面。
- 挑战分享标题增加难度信息，格式为
  `◈ ZIGSAW - 挑战 - 入门/普通/专家`。
- 设置新增“难输入汉字”启用/排除选项，默认启用；排除后所有模式都不会出现
  基本多文种平面外字符。启用与排除共享同一个原有纪录键。
- 修复“难输入汉字”和“阶段 EX”共用 `.ex-toggle` 导致关闭 EX 时错误更新上方
  控件的问题；两者现在使用独立状态和滑轨。
- 暂停罚时时倒计时圆环的两段弧线短暂变红后恢复，暂停/播放符号保持原色。
- “结算”按钮横向宽度与作答状态三按钮行一致。
- 暂停/播放图标按圆环直径的 44% 缩放，桌面端与手机端保持相同比例。
- 电脑端圆环缩小至 55px（约原 82px 的三分之二），手机端仍为 52px；
  圆环保持右边界对齐，并与阶段栏垂直居中。
- 罚时闪红区分浅红轨道和深红进度弧线。
- 修复正式页启用实验模式后把数据根误设为站点父目录的问题；资源根现在通过
  `data-app-base` 显式指定，仅 `/test/` 使用 `../`。
- “囗”注记随正确后的主文字变浅，暂停铺黑时一起隐藏。
- 换题时显示当前题答案，部件卡使用与答案相同的深黄色铺色，900ms 后自动换题。
- 教程“04 图鉴”的三行说明改为一致的多段行距。
- 教程“02 挑战模式”增加挑战结算获得分光水晶的说明。
- 教程“03 练习 / 无尽模式”补充无法获得分光水晶。
- 教程图鉴示例中 SSR“与”的计数为 5。
- 写字台组字记录中的部件卡增加等级色方点；汉字格不加方点。
- Cris 不足按钮改为“Cris 图标 + 不足”，复用价格按钮的居中对齐。
- 新增 `14.svg`（乛）和 `44.svg`（勹）并加入组件资源映射。
- 字表更新后同步刷新图鉴、部件使用和统计测试；当前通规拆法为 9163。

### Chrome 软键盘

- `index.html` 已启用 `interactive-widget=resizes-content`。
- 手机端 `.app-shell` 使用 `100dvh`。
- 目的：Chrome Android 弹出键盘时收缩页面布局，而不是仅覆盖可视区域。
- 不要再通过反复清除 Chrome 缓存处理该问题。

### “囗”辨识

- 仅在游玩页为部件 `囗` 添加上移字形和“（国字框）”注记。
- 图鉴、教程、写字台和结算页保持普通部件显示。
- 相关代码：
  - `src/main.ts` 的 `renderComponent(..., true)`
  - `src/styles.css` 的 `.part.is-enclosed-frame`
  - `.part-note` 距卡片底部 3px

## Bug 修复要求

- 先复现，再做最小范围修复。
- 不顺手重构无关模块。
- 修改交互行为时优先补单测；修改布局时至少运行 `check:viewports`。
- 涉及主流程时运行 `smoke`。
- 完成后至少运行：

```powershell
npm test
npm run build
```

交付时说明：

- 根因
- 修改了哪些文件
- 如何验证
- 是否仍有浏览器或设备特例

记录方式：

- 小型修复直接追加到本文件，不为每个修复新建文档。
- 涉及新数据格式、跨模块协议或后续分支必须知道的功能，新增
  `docs/handoff/features/<name>.md`，并在 `README.md` 登记。
- 每次完成实质性修改后更新 `README.md` 的“最近交接”。

## 推荐严重级别

- P0：无法进入游戏、数据损坏、抽卡/图鉴状态丢失、构建或部署失败。
- P1：主要模式无法完成、明显布局遮挡、移动端无法输入、关键按钮失效。
- P2：视觉错位、低频交互异常、单浏览器兼容问题。
- P3：文案、轻微间距和非阻塞体验问题。

## 主线交接说明

主线下一步是试炼模式，当前方向为：

- 7 个阶段，每阶段 8 道普通题 + 1 道双字 BOSS。
- 普通题基础时间 30 秒，BOSS 基础时间 60 秒。
- 优先实现独立 `TrialSession`，不要继续把试炼分支塞进挑战模式状态机。
- 先完成无制限的完整七阶段流程，再逐条接入制限规则。
- 主线未完成的试炼代码不应成为内测 Bug 修复分支的依赖。
