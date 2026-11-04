# 归档说明

本目录保存不应再被运行时直接加载、但仍需追溯的历史资料。

## 试炼制限意见

- `trial-rules-opinion-2026-11-03.csv`
  - 来源原件，编码为 GB18030/GBK。
  - 为保留原始提交状态，不转换、不改写。
- `trial-rules-opinion-2026-11-03.utf8.csv`
  - 内容等价的安全副本，编码为 UTF-8 with BOM。
  - 适合 GitHub、编辑器和跨平台工具直接查看。
- `trial-rules-opinion-initial.csv`
  - 更早的三条规则草案，仅作历史参考。

两份 2026-11-03 文件解码后的字段和文本已经逐项核对一致。正式维护版本是
`docs/trial-rules-plan.md`，运行时规则则是
`public/data/trial-rules.json`；归档 CSV 不再作为运行数据源。
