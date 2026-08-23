## Why

docx → markdown 转换管线（`scripts/build-doc-in-vercel`）自 2025-02-11 起，对 docx 内嵌的 `image/x-emf` 等矢量图一律跳过并返回 OSS 占位图（`scripts/build-doc-in-vercel/transformers.ts:220` 的黑名单 `["x-emf", "gif", "wmf", "emf"]`），文档站中来自 Excel 图表、Word 公式的图片全部显示为占位图。当年纯 Node 方案失败的原因是：sharp/libvips 没有 EMF 解码器、浏览器不渲染 `image/x-emf` 的 base64 data URI、npm 生态当时没有任何 EMF/EMF+ 渲染实现（commit `9792f47` 注释为证）。

2026-08-22 的调研报告（`reports/2026-08-22-docx-x-emf-conversion-research.md`，经复核代理纠错后定稿）确认了两件事：

1. **运行形态硬约束**：`turbo.json:50` 已把 `//#build:doc-in-vercel` 挂在 `//#docs:build:run` 的 `dependsOn` 中，`.gitignore:56` 忽略 `docs/docx`——转换实际发生在 Vercel 构建容器（Amazon Linux 2023、无 GUI、无系统级包管理自由度）内，方案必须零系统依赖。
2. **纯 Node 路线已可行**：2026 年新库 `emf-converter`（纯 TS、Apache-2.0、完整实现 EMF+ 记录集）+ `@napi-rs/canvas`（Skia 后端、零系统依赖、预编译多平台二进制）是满足该约束的唯一轻量路线。

本变更把调研结论落地为工程实现，让 EMF/WMF 矢量图以 PNG 形式真正进入文档站。

## What Changes

- 新增 `scripts/build-doc-in-vercel/emf/` 模块：canvas 全局 shim、`convertEmfToPng()` 转换封装、字体映射配置，全部为新增文件，不引入系统依赖。
- 修改 `scripts/build-doc-in-vercel/transformers.ts`：`docx2html()` 内 mammoth `convertImage` 回调中，黑名单分支拆分——`x-emf` / `emf` / `wmf` 三类改为调用转换模块输出 PNG 落盘；`gif` 维持现状（见 Non-goals）。
- 转换失败时回退现有 `errorImgUrl` 占位图并记录文件清单，构建不中断（保留既有兜底语义）。
- 根 `package.json` 新增 devDependencies：`emf-converter`（锁定精确版本）与 `@napi-rs/canvas`。
- 输出命名与落盘遵循现有规则：`docs/docx/images/{文档名}/{安全文件名}-{三位序号}.png`，HTML `img src` 为相对路径。
- EMF 内嵌文本通过随包携带的 OFL 中文字体（`GlobalFonts.registerFromPath` 注册）与 `fontFamilyMap` 小写键映射完成渲染（Vercel 容器无任何中文字体，不随包注册则文字必然豆腐块）。

## Capabilities

### New Capabilities

- `docx-build/emf-image-conversion`: docx 内嵌 EMF/EMF+/WMF 矢量图在构建管线内转换为 PNG 的行为契约——转换成功落盘、失败回退占位图、Vercel 构建容器零系统依赖可运行、文本字体映射。

### Modified Capabilities

- 无。现有 `transformers.ts` 图片处理行为的变化全部由上述新 capability 承载；`docx2html()` 对 png/jpeg 的既有处理不变。

## Impact

- **代码**：`scripts/build-doc-in-vercel/`（新增 `emf/` 模块、修改 `transformers.ts`）、根 `package.json`（devDependencies）、`pnpm-lock.yaml`（注意：该文件被 gitignore，无 Git diff 不能证明依赖解析未变化，需以 lock 内容核对）。
- **构建**：`build:doc-in-vercel` 在 Vercel 容器内的安装体积增加约（`@napi-rs/canvas` 平台二进制约 10MB 级 + `emf-converter` 纯 JS），构建时长影响需在验证阶段实测记录；Windows 本地开发与 Vercel 容器共用同一套代码。
- **产物**：`docs/docx/**/*.md` 中原本为占位图的 EMF 图片位置将变为真实 PNG 相对链接；产物不入库（gitignore），由每次构建重新生成。
- **测试**：新增 `scripts/build-doc-in-vercel/tests/` 目录存放 vitest 用例（符合项目 `**/tests/` 约定）。
- **验证证据**：抽样统计与渲染对比记录落盘到本 change 的 `evidence/` 日期化子目录，不散放 change 根目录。
- **外部依赖**：`emf-converter` 为 2026 年新包，无大规模用户验证——锁定精确版本、保留占位图兜底、抽样目检是既定风险对策。
- **Non-goals**：不处理 `gif`（sharp 本身支持 gif 解码，跳过 gif 是独立的历史决定，超出本变更边界）；不输出矢量 SVG（EMF+ 维度上生态为空）；不引入 LibreOffice/Inkscape/云 API/Rust 路线（调研报告已否决）；不改造图片目录结构与命名规则。
