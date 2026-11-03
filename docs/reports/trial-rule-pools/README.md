# 试炼制限候选池报告

由以下命令生成：

```powershell
npm run analyze:trial-rule-pools
```

统计口径：

- 普通题库范围为通用规范汉字表一级、二级。
- 使用当前 `char_sym.json` 的全部可用拆法。
- 保留增补平面字符。
- 与 `GameData.isCharSelectable()` 一致，任一拆法含不可渲染部件时排除整字。
- CSV 使用 UTF-8 BOM，便于 Excel 直接打开。

文件：

- `inspissation-part-counts.csv`：2–8 部件汉字的字数与拆法数。
- `gestalt-component-pairs.csv`：按答案兼容层展开后，答案数不超过 3 的部件对。
- `outland-composites.csv`：五类厄境的基础部件、附着部件组合及结果字。
- `summary.json`：总数、分类计数和 `char_sym.json` 来源哈希。

厄境结果字不限制在一二级字表，因为该字只用于干扰卡展示；基础部件仍限制为
正常试炼题中可出现的部件。

格式塔按答案字符去重，不按拆法数计数。答案会先沿
`char_sym_answer_compat.json` 递归展开，再判断是否覆盖给定的部件对。
