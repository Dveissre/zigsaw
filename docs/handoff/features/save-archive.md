# 可迁移存档文件

索引：`docs/handoff/README.md`

## 状态

已实现本地进度导出、导入和覆盖确认。入口在设置浮窗的“存档”行，
位于“Git页”上方。实现位于 `src/game/save.ts`，单元测试位于
`tests/save.test.ts`。

## 文件格式

- 扩展名建议为 `.zsave`；文件是约 1 KB 量级的 JSON envelope。
- 下载名格式为 `zigsaw-YYMMDD-XXXX.zsave`；`XXXX` 是四位大写 base36
  随机码，用于区分同一天多次下载。
- 外层格式为 `zigsaw-save`，当前 `formatVersion: 1`。
- 正文使用 AES-GCM 加密；payload 当前为 `version: 1`。
- 每次导出生成新的 12 字节随机 IV。
- 加密密钥由应用内置盐派生，用于防止直接查看和意外篡改，不是用户密码，
  因而不能抵抗有能力逆向分析前端的攻击者。
- 导入时限制文件大小、IV/ciphertext 结构和正文大小；解密或校验失败不会写入
  `localStorage`。

## 版本兼容

- `readSaveArchive()` 先识别 envelope 的 `formatVersion`，再解密正文并调用
  `migrateSavePayload()`。
- 当前迁移链至少包含 payload v0 → v1。未来修改存档字段时，应新增迁移步骤，
  不修改历史版本解析逻辑。
- 当前页面拒绝高于自身支持版本的存档；新版本应用负责读取旧版本文件。
- 托管键使用白名单。存档中若出现未知键会拒绝导入，避免向站点存储注入任意项。

## 托管数据

以下当前存储键会导出，并在确认覆盖时作为一组原子替换：

- `zigsaw.collection.v2`
- `zigsaw.collection.v1`（旧图鉴兼容）
- `zigsaw.records.v1`
- `char-rush.records.v1`（旧纪录兼容）
- `zigsaw.cris.v1`
- `zigsaw.trial.inspissation.recentLongChars`

导出只包含实际存在的键；导入后，托管键中文件未包含的项会被移除。托管键之外的
`localStorage` 项不变。游戏设置目前只存在于当前页面会话，没有持久化，因此
不属于存档。

## 覆盖流程

1. “下载”读取当前托管键，生成加密文件。
2. “上传”先完整读取、解密、校验并迁移文件，此阶段不写入。
3. 校验成功后显示“覆盖当前存档？”确认浮窗；取消会丢弃候选数据。
4. 确认后先保存内存中的旧快照，再替换全部托管键；写入异常会尽力回滚。
5. 成功覆盖后刷新页面，让图鉴、纪录、Cris 等 store 重新从存储加载。

## 验证

- 单测覆盖加密往返、明文不泄漏、v0 → v1 迁移、未知键拒绝、篡改拒绝、
  托管键完整替换和写入失败回滚。
- Playwright 已验证下载、取消确认、确认覆盖后刷新恢复旧值。
- `npm run smoke` 增加“存档行位于 Git 页上方”和双按钮断言。
