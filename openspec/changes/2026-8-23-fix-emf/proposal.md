## Why

现有 EMF/WMF 转换已能生成 PNG，但 Vercel 容器中大量中文文本出现整段空白或乱码。根因是 EMF 字体名映射缺口与随包字体子集缺字，导致容器无法依赖系统字体回退，必须补足可验证的文本渲染保障。

## What Changes

- 扩大随包中文字体子集，使当前文档集 EMF 正文字符集合得到完整覆盖，并保留可重复的覆盖校验流程。
- 扩展 EMF 字体名映射并为未预见的 faceName 提供注册字体兜底，避免容器回退至无 CJK 字形的默认字体。
- 增加字体映射、字体注册与字形覆盖回归测试，并将生产容器产物视觉抽查纳入验收。
- 更新字体资产说明，明确子集来源、覆盖范围与重出方式。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `docx-build/emf-image-conversion`: 强化 EMF 内嵌文本在无系统中文字体的构建容器中的字体匹配、字形覆盖和验收要求。

## Impact

- `scripts/build-doc-in-vercel/emf/fonts.ts`、字体资产及其测试。
- EMF/WMF 转换管线和 `build:doc-in-vercel` 的构建产物质量。
- Vercel 文档站点的生产部署与视觉验收流程。
