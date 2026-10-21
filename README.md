# ZIGSAW

ZIGSAW 的 Web 版工作目录。

## 本地运行

```powershell
cd C:\Projects\Web\zigsaw
npm install
npm run dev
```

浏览器打开 `http://127.0.0.1:5173`。Vite 默认启用热更新：修改 `src/` 下的文件后，浏览器会在不刷新整页的情况下更新模块；修改 `public/data/` 下的 JSON 时页面会整页刷新。

## 调试

先在一个终端运行 `npm run dev`，再从 VS Code 的“运行和调试”中选择 `Chrome: ZIGSAW` 或 `Edge: ZIGSAW`。

用开发者工具的响应式模式检查这些视口：

- 360 × 800：窄屏手机
- 390 × 844：常见手机
- 768 × 1024：平板
- 1280 × 800：桌面

布局断点是 `640px`：设置区在两种视口下保持单列，游戏内容随屏幕宽度缩放。

开发服务器运行时，可以自动检查四个视口是否横向溢出、静态数据是否加载成功：

```powershell
npm run check:viewports
```

## 检查

```powershell
npm test
npm run smoke
npm run build
npm run preview
```

`npm run smoke` 会使用本机 Chrome 跑通设置、答错、暂停、正确作答和结算流程。

`npm run preview` 默认地址是 `http://127.0.0.1:4173`，用于检查生产构建。

## 记录

无尽和挑战模式的记录使用 `localStorage`，按完整参数组合分别保存，不需要后端。

## 部署

`.github/workflows/deploy-pages.yml` 会在推送到 `main` 分支后构建并发布 `dist/`。GitHub 仓库需在 Pages 设置中选择 GitHub Actions 作为发布来源。

