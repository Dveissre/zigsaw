# 汉字释义浮窗 Handoff

本文记录 ZIGSAW 结算页汉字释义浮窗的实现方式，重点是可迁移到其他纯静态
Web 项目的部分。游戏规则、结算矩阵和主题色体系不在本文范围内。

## 1. 目标与约束

- 无后端，部署在 GitHub Pages 等静态环境。
- 不随游戏首屏下载完整释义库。
- 点击某个结算卡时，只加载该字需要的数据。
- 释义读取后缓存，同一页面会话中重复查看不重新请求。
- 页面本身保持无滚动；浮窗正文内部滚动。
- 桌面和手机共用一套结构，按视口调整字号和头部布局。
- 视觉保持硬直角、低装饰，不使用圆角、发光或非 EX 主题渐变。

## 2. 当前文件

| 路径 | 职责 |
| --- | --- |
| `src/game/details.ts` | 释义分片与教材索引的类型、请求、解析和缓存 |
| `src/ui/char-detail.ts` | 浮窗控制器、信息头和释义 HTML 渲染 |
| `src/main.ts` | 结算卡入口、浮窗 DOM、事件委托和拆字回调 |
| `src/styles.css` | 浮窗、引用、例词、响应式与关闭按钮样式 |
| `scripts/build-char-detail-shards.mjs` | 把完整释义库拆成 256 个静态分片 |
| `scripts/build-school-index.mjs` | 从识字表、写字表生成紧凑教材索引 |
| `tests/char-detail.test.ts` | 释义 HTML 结构与层级测试 |
| `scripts/smoke.mjs` | 点击、加载、关闭、键盘、手机布局等端到端检查 |

## 3. 数据准备

### 3.1 释义分片

源文件：

```text
C:\Projects\Python\wordlist\char_detail.json
```

源文件不直接放入 Web 发布目录。运行：

```powershell
npm run build:details -- "C:\Projects\Python\wordlist\char_detail.json"
```

脚本按汉字 Unicode 码点的低 8 位分片：

```ts
const shard = char.codePointAt(0)! & 0xff;
const filename = `${shard.toString(16).padStart(2, "0")}.json`;
```

生成：

```text
public/data/char-detail/00.json
...
public/data/char-detail/ff.json
```

当前 21,041 条记录分为 256 片，中位片约 43 KB，最大片约 70 KB。
这比首次下载约 12 MB 的完整 JSON 稳定得多。

### 3.2 小学教材索引

来源：

```text
C:\Projects\Python\wordlist\shizi_biao.json
C:\Projects\Python\wordlist\xiezi_biao.json
```

运行：

```powershell
npm run build:school -- "C:\Projects\Python\wordlist"
```

生成：

```text
public/data/char-school.json
```

只保留以下紧凑结构：

```json
{
  "庞": {
    "read": ["四上"],
    "write": ["四上"]
  }
}
```

完整字表、课文分组和其他元数据不进入运行时。UI 负责把 `read` / `write`
渲染成“识字表 四上 / 写字表 四上”。

## 4. 加载与缓存

`CharDetailStore` 是跨浮窗实例复用的唯一数据入口：

```ts
const detail = await charDetails.get(char);
const school = await charDetails.school(char);
```

- `get()` 只请求目标汉字所在的分片。
- 分片 Promise 按 shard 编号去重，避免快速重复点击造成并发重复请求。
- 同一分片解析一次后保存在内存 `Map` 中。
- 教材索引只在第一次查看释义时请求一次。
- 生产环境优先读取版本化 CacheStorage；失败时回退到网络。
- 开发环境使用 `no-cache`，便于修改数据后立即刷新查看。
- 修改分片内容时应同步提升 CacheStorage 版本名。
- `localStorage` 适合存纪录和小设置，不适合存释义库。

## 5. 浮窗结构

使用原生 `<dialog>` 和 `showModal()`：

```html
<dialog class="char-detail-dialog">
  <article class="char-detail-panel">
    <header class="char-detail-header">
      <button data-detail-close aria-label="关闭">SVG 斜十字</button>
      <div class="char-detail-identity">汉字与等级</div>
      <dl class="char-detail-facts">
        <div>读音</div>
        <div>Unicode</div>
        <div>识字表 / 写字表</div>
        <div>拆分</div>
      </dl>
    </header>
    <div class="char-detail-content"></div>
    <footer class="char-detail-footer">来源说明</footer>
  </article>
</dialog>
```

加载时先在正文显示“正在载入释义”，避免点击后无反馈。释义和教材信息使用
`Promise.all` 并行读取，教材读取失败不应阻断释义正文。

桌面端头部为左右两栏；手机端保留两栏，但缩窄字头栏和标签栏。汉字栏使用相同
左右内边距，保证汉字在矩形内真正水平居中。

## 6. 释义正文

每个读音是一组 `<section>`，每组内的义项使用带显式编号的网格布局：

```html
<li class="detail-explanation">
  <span class="detail-number">1</span>
  <div class="detail-body">...</div>
</li>
```

不要用义项自身上的绝对定位编号。编号和正文作为同一网格的两列，才能保证第一项
和后续项严格对齐。

古籍征引和例词直接展开：

- 不显示“古籍征引”“例词”等可见标题。
- 不添加分组上方的横线。
- 征引用左侧竖线和引用块表达层级，不使用序号。
- 征引中的目标字用主题色和字重突出，不加下划线。
- 例词使用定义列表，词条和解释保持可扫描的两列关系。

所有来自 JSON 的文本必须经过 HTML 转义；目标字高亮应在切分文本后逐段转义，
不能先拼 HTML 再整体转义。

## 7. 拆字信息

拆字优先取 `char_sym.json` 中该字的最短有效方案：

- 忽略只有一个部件的整字自指项。
- 选部件数最少的方案。
- 部件数相同时保留原数组中最早的一项。
- 页面显示按原始顺序以空格分隔，例如“广 尢 丿 丶”。

当前实现由 `GameData.shortestDecomposition()` 提供，UI 只接收一个格式化回调，
避免把游戏数据和浮窗视图耦合在一起。

## 8. 结算卡入口

每张结算卡保存目标字，并通过事件委托处理鼠标和键盘：

```html
<li
  class="review-card"
  role="button"
  tabindex="0"
  data-review-char="庞"
  aria-label="查看「庞」的释义"
>
```

行为要求：

- 鼠标点击打开。
- Enter 或 Space 打开。
- 关闭按钮、遮罩点击和 Esc 均可关闭。
- 原生 dialog 关闭后应恢复到原先获得焦点的结算卡。

如果卡面答案可能来自“同部件异字”的输入，传给浮窗的应是最终展示的输入字，
而不是题目最初预设的答案字。

## 9. 响应式与视觉

- 浮窗宽度桌面约 760 px，手机为视口宽度减安全边距。
- 浮窗高度不超过动态视口，只有正文滚动。
- 桌面正文约 16 px，手机约 14 px。
- 关闭键是无边框 SVG 斜十字；自动聚焦时也不要出现矩形 focus 框。
- 页脚固定在正文区底部。
- `prefers-reduced-motion` 下关闭浮窗入场动画。

## 10. 验证清单

```powershell
npm test
npm run build
npm run smoke
npm run check:viewports
```

至少覆盖：

- 点击分片路径正确，一次点击只请求一个释义分片。
- 重复打开同一字时命中缓存。
- 读音、Unicode、教材册次和拆分均显示。
- 多音字能显示全部读音。
- 未收录字显示空状态而不是报错。
- 网络失败显示失败状态，关闭后可重试。
- 征引高亮、例词、多义项层级正确。
- 关闭按钮、Esc、遮罩和键盘 Enter/Space 可用。
- 360×640、390×844 和桌面视口无水平溢出、页面无整体滚动。

## 11. 迁移到其他项目

1. 复制并改造两个数据构建脚本。
2. 把生成目录放进项目的静态资源目录。
3. 移植 `CharDetailStore`，按目标数据格式调整类型。
4. 移植 `CharDetailView` 和对应 CSS。
5. 在触发元素上放入 `data-review-char`，用事件委托调用 `open(char, meta)`。
6. 把游戏内拆字逻辑封装成 `(char) => string` 回调传入，不要在视图模块直接读取
   游戏数据。
7. 更新数据来源文档和缓存版本。
8. 用真实手机视口检查长释义、多音字和教材双标签的换行。
