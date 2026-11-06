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
- `trial-rule-opinion-1105.csv`
  - 2026-11-05 三条补充规则的原始文件，编码为 UTF-8 with BOM。
  - 保持原始字节不变，不转换、不改写。
- `trial-rule-opinion-1105.utf8.csv`
  - 2026-11-05 原件的 UTF-8 with BOM 安全副本。
- `trial-rules/trial-rules-opinion-2026-11-07.csv`
  - 2026-11-07 规则文案 opinion，UTF-8 with BOM。

两份 2026-11-03 文件解码后的字段和文本已经逐项核对一致。正式维护版本是
`docs/trial-rules-plan.md`，运行时规则则是
`public/data/trial-rules.json`；归档 CSV 不再作为运行数据源。

2026-11-05 原件与安全副本的 SHA-256 相同：
`10DF3208F6F7FBC0D578F35DBA96A2347236EAB8914605F35FC1BFCFB8EDFB7A`。

归档原件保留提交时的英文名 `Recherché`；正式计划中该规则已改名为
`Selcouth`，稳定 ID 为 `selcouth`。

## 退役的试炼制限

所有已经从运行时规则表移除、但需要保留实现或设计历史的制限规则，统一存放于
[trial-rules/](trial-rules/README.md)。每项规则均使用相同的规则快照、说明文档
和图标结构，并由 `registry.json` 统一登记。

当前包括赋格曲与双重曝光。`public/data/trial-rules.json` 是唯一运行时规则
来源，归档目录不得被游戏直接加载。
