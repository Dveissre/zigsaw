# ZIGSAW

一个简单的汉字拼装游戏。

## 技术栈

- Vite + TypeScript
- 纯静态部署，兼容 GitHub Pages
- 游戏进度保存在浏览器 `localStorage`

## 开发

需要 Node.js 22 或更高版本。

```powershell
npm ci
npx vite
```

主页面为 `/`，图鉴位于 `/atlas/`，写字台位于 `/gacha/`（原 `/test/` 重定向至主页）。

常用验证命令：

```powershell
npx tsc --noEmit
npm test
npm run test:trial
npm run smoke
npm run check:viewports
npx vite build
```

`npm run dev` 和 `npm run build` 会先运行生成 pre-hook，重写图鉴、部件统计、
词池和试炼规则池。只读排查或不打算刷新生成物时，使用 `npx vite` 与
`npx vite build`。

## 项目文档

- 代理与维护规则：[AGENTS.md](AGENTS.md)
- 跨对话交接索引：[docs/handoff/README.md](docs/handoff/README.md)
- 试炼架构：[docs/trial-architecture.md](docs/trial-architecture.md)
- 试炼规则计划：[docs/trial-rules-plan.md](docs/trial-rules-plan.md)
- 数据来源与生成关系：[docs/DATA_PROVENANCE.md](docs/DATA_PROVENANCE.md)
- 卡片配色规范：[docs/palette.md](docs/palette.md)

迁移仓库时必须同时保留源码、测试、脚本、运行时数据、SVG 部件、字体和
`data-source/wordlists/`，并保留 `.gitattributes` 的 LF 策略。更完整的迁移
快照与兼容要求见
[docs/handoff/README.md](docs/handoff/README.md)。
