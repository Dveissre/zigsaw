# 静态数据来源

Web 版只复制游戏运行时需要的两个成品 JSON，不复制原始素材或生成脚本。

| Web 路径 | 原路径 | 用途 |
| --- | --- | --- |
| `public/data/char_sym.json` | `C:\Projects\Python\char_components\char_sym_optional.json` | 汉字与 sym 部件，包含等级 3 可选拆法 |
| `public/data/tongyong_hanzi.json` | `C:\Projects\Python\wordlist\tongyong_hanzi.json` | 三级通规字顺序 |
| `public/component_svg/*.svg` | 项目内试行矢量图 | 未收录或 Unicode 支持较差的 sym |
| `docs/component-glyph-priority.csv` | `C:\Projects\Python\char_components\component_glyph_priority.csv` | 多字符 sym 名的补字优先级 |
| `docs/component-glyph-priority-missing.csv` | 本地根据 `component-assets.json` 导出 | 尚未配置 SVG 的补齐清单 |

数据按原文件逐字节复制。更新数据时应从对应的成品文件重新复制，并重新运行 `npm test`。

`component-assets.json` 使用 sym ID 映射 SVG。SVG 保留原始
`0 0 1024 1024` 画布，通过 CSS mask 继承部件文字颜色；未配置 SVG 的
sym 自动回退到 `char_sym.json` 中的文字名称。

补字优先级按该 sym 在《通用规范汉字表》中覆盖的字数降序排列；
覆盖数相同时，按首次出现的通规序号排序。

