# 静态数据来源

Web 版只复制游戏运行时需要的成品 JSON，不复制原始素材或生成脚本。

| Web 路径 | 原路径 | 用途 |
| --- | --- | --- |
| `public/data/char_sym.json` | `C:\Projects\Python\char_components\char_sym_optional.json` | 汉字与 sym 部件，包含等级 3 可选拆法 |
| `public/data/tongyong_hanzi.json` | `C:\Projects\Python\wordlist\tongyong_hanzi.json` | 三级通规字顺序 |
| `public/data/char-detail/*.json` | `C:\Projects\Python\wordlist\char_detail.json` | 结算卡按需读取的汉字读音、释义、例词与古籍征引 |
| `public/data/char-school.json` | `C:\Projects\Python\wordlist\shizi_biao.json`、`xiezi_biao.json` | 识字表、写字表所在年级与册次 |
| `public/data/component-usage.json` | 由通规字表和 `char_sym.json` 生成 | 每个部件在全部通规拆法中的使用次数，供图鉴使用 |
| `public/component_svg/*.svg` | 项目内试行矢量图 | 未收录或 Unicode 支持较差的 sym |
| `docs/component-usage.csv` | 从 `component-usage.json` 导出 | 可直接查看的部件使用次数表 |
| `docs/component-glyph-priority.csv` | `C:\Projects\Python\char_components\component_glyph_priority.csv` | 多字符 sym 名的补字优先级 |
| `docs/component-glyph-priority-missing.csv` | 本地根据 `component-assets.json` 导出 | 尚未配置 SVG 的补齐清单 |

数据按原文件逐字节复制。更新数据时应从对应的成品文件重新复制，并重新运行 `npm test`。

`component-assets.json` 使用 sym ID 映射 SVG。SVG 保留原始
`0 0 1024 1024` 画布，通过 CSS mask 继承部件文字颜色；未配置 SVG 的
sym 自动回退到 `char_sym.json` 中的文字名称。

带 `N` 后缀的 SVG 是同一 sym ID 的定稿替代版本。例如 sym `425` 应引用
`component_svg/425N.svg`；无后缀旧文件只作为设计过程稿保留，不参与运行时映射。

`component-usage.json` 与 `component-usage.csv` 由
`npm run build:component-usage` 自动生成。`npm run dev` 和 `npm run build`
都会先执行该命令，因此拆字表更新后只需重新启动开发服务或重新构建，统计会自动更新。
统计范围为《通用规范汉字表》全部 8105 字，每套拆分方式分别计入；重复部件
在一次拆分中出现两次，也按两次计。

释义源文件约 12 MB，不直接发布。运行
`npm run build:details -- "C:\Projects\Python\wordlist\char_detail.json"`
后按汉字码点的低 8 位生成 256 个分片。某字被点击时只请求它所在的分片，
并在内存和版本化的 CacheStorage 中缓存。

`char-school.json` 由
`npm run build:school -- "C:\Projects\Python\wordlist"`
从识字表和写字表的 `index` 字段生成。两个原表较大的元数据、字表副本与课文分组
不会进入 Web 运行时；页面只读取“字 → 识字册次 / 写字册次”的紧凑索引。

补字优先级按该 sym 在《通用规范汉字表》中覆盖的字数降序排列；
覆盖数相同时，按首次出现的通规序号排序。

