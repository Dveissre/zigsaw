# 静态数据来源

Web 版只复制游戏运行时需要的两个成品 JSON，不复制原始素材或生成脚本。

| Web 路径 | 原路径 | 用途 |
| --- | --- | --- |
| `public/data/char_sym.json` | `C:\Projects\Python\char_components\char_sym.json` | 汉字与 sym 部件 |
| `public/data/tongyong_hanzi.json` | `C:\Projects\Python\wordlist\tongyong_hanzi.json` | 三级通规字顺序 |

数据按原文件逐字节复制。更新数据时应从对应的成品文件重新复制，并重新运行 `npm test`。

