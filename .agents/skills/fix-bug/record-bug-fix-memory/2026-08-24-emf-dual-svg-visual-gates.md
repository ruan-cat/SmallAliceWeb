# 2026-08-24 EMF+ Dual 与 SVG 视觉门禁

## 1. 问题现象

文档站把真实 EMF 转为图片后，用户发现关系图中的文字、箭头和框体整体错开或重叠。把输出改成 SVG 后，`关于高级角色肖像` 的 Dual 关系图改善明显，但全量审计又发现 `插件类型` 图在生产 SVG 中出现 GDI+ 原图没有的灰色矩形。

## 2. 实际根因

`portrait-high-contrast.emf` 是 EMF+ Dual：同一输入含 EMF+ 图元和 GDI 回退图元。转换器此前同时回放两层，造成成套重复和相对错位。正式补丁识别 EMF+ Header 的 Dual 标志后跳过 EMF+ comment，只回放该文档集实测正确的 GDI 回退层。

SVG 不是自动保真层。`插件类型` 的真实 SVG 虽是 `image/svg+xml`、含路径和局部 `<image>`，但复杂裁剪/位图路径仍产生额外灰色矩形；这是独立于 Dual 双回放的未修复视觉风险。

## 3. 关键误导点

- 白底蓝字和细线是 WPS/GDI+ 原始设计，不能把低对比当作主要故障；正确对照是文字、箭头和框体的相对位置。
- PNG/SVG MIME、`naturalWidth`、路径数量和“转换成功 421 张”只证明产物可加载，不能证明布局正确。
- Agent Browser 默认启动失败或 typed MCP 无响应，不代表 VitePress SSR 无法展示客户端图片。Windows 上应显式启动隔离 profile 的本机 `chrome.exe`，再通过 CDP 接管现有可见页面。
- 一个高风险样本通过不能外推全量。全量清单显示 399 个 EMF 都命中 Dual、复杂裁剪和位图风险，49 个还含 glyph-index 文本。

## 4. 有效修复

- 在 `patches/emf-converter@2.0.2.patch` 中识别 EMF+ Dual，并避免双层 replay；真实 fixture 以“原始 Dual PNG 与屏蔽 EMF+ comment 的 GDI-only PNG SHA-256 相等”作为回归门禁。
- 通过 patched `emf-converter` 和 `@napi-rs/canvas` 的 `SvgCanvas` 输出真实 SVG；EMF/WMF 默认落盘为 `.svg`，保留 PNG/JPEG/GIF 原始分支及显式 PNG API。
- 新增 `emf/audit.ts`、`emf/audit-manifest.ts` 与测试，直接从 DOCX ZIP 中央目录生成稳定 SHA-256 风险清单，跳过 `~$` Office 锁文件而不修改原文档。

## 5. 验证方式

- `pnpm --filter @ruan-cat-temp/build-doc-in-vercel test`：审计加入后为 35/35 通过。
- `openspec validate "2026-8-23-fix-emf" --strict`：通过。
- Git Integration Production `main@54e1532`、`dpl_J6jGa8LpiMchKGri6DMd4ECL6UjW` Ready：高级角色肖像目标资源为 HTTP `200 image/svg+xml`，并由本机 Chrome + Agent Browser CDP 截图确认 Dual 错位消失。
- 全量清单：195 个有效 DOCX、399 个 EMF、0 个 WMF；同一清单连续两次生成的 SHA-256 一致。
- 反例门禁：`插件类型.docx` 的 `image1.emf` GDI+ 参照和生产 SVG 视口截图明确不一致，生产图多出灰色矩形；因此 6.6/6.7 不得关闭。

## 6. 后续约束

- 每次 EMF/SVG 修复都必须同时检查真实 fixture、Windows GDI+、本机 Chrome 目标图截图和 Production 目标图截图；资源加载统计只能辅助。
- 生产验收必须使用用户给出的原始 `.html` URL。默认 Agent Browser 失败时，先走“独立 Chrome profile + `--remote-debugging-port` + `agent-browser --cdp`”链路，不能归因于 SSR。
- 对复杂裁剪、位图、ROP2、DrawDriverString 和递归 metafile，SVG 可生成不等于质量通过；没有真实样本和 GDI+ 对照时必须保留风险或明确 PNG 回退，不得静默宣称保真。
- 默认 SVG 变更已经上线，但全量质量门禁未完成。后续优先定位 `插件类型-001.svg` 的局部 `<image>`、clip/save-restore 或 Dual 状态泄漏。
