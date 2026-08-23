## Purpose

定义 docx 转换管线对 EMF/EMF+/WMF 矢量图的转换行为：以纯 Node 依赖（`emf-converter` + `@napi-rs/canvas`）在 Vercel 构建容器内把矢量图渲染为 PNG，替代现状的直接跳过占位；失败时保留占位图兜底，构建不中断。

## ADDED Requirements

### Requirement: EMF/WMF 矢量图转换为 PNG

docx 转换管线 MUST 将 mammoth 提取出的 `image/x-emf`、`image/emf`、`image/wmf` 图片渲染为 PNG 并落盘，替代直接返回占位图。

#### Scenario: 转换单张 EMF 图片成功

- **WHEN** `docx2html()` 的 `convertImage` 回调收到 `contentType` 为 `image/x-emf` 的图片数据
- **THEN** 通过 `emf-converter` 配合 `@napi-rs/canvas` 渲染为 PNG
- **AND** 按现有命名规则落盘到 `docs/docx/images/{文档名}/{安全文件名}-{三位序号}.png`
- **AND** HTML `img` 的 `src` 指向该文件的相对路径 `./images/{文档名}/{图片名}`

#### Scenario: EMF+ 记录的图片正常渲染

- **WHEN** 图片为 EMF+ 或 EMF+ dual 格式（Excel 图表、现代 Office 粘贴的常见形态）
- **THEN** 渲染走 `emf-converter` 的完整 EMF+ 记录集实现，不因含 EMF+ 记录而输出空白或直接失败

#### Scenario: WMF 图片同样被转换

- **WHEN** 图片 `contentType` 为 `image/wmf`
- **THEN** 走与 EMF 相同的转换路径输出 PNG

#### Scenario: 转换计数纳入输出报告

- **WHEN** 一次完整构建结束
- **THEN** 输出报告能区分「EMF/WMF 转换成功数」与「EMF/WMF 转换失败回退数」，与现有图片类型统计并列

### Requirement: 转换失败回退占位图

转换失败的 EMF/WMF 图片 MUST 回退到现有 `errorImgUrl` 占位图，MUST NOT 中断整次构建。

#### Scenario: 渲染抛出异常

- **WHEN** `emf-converter` 渲染过程抛出异常（如不支持的记录、损坏的数据）
- **THEN** 捕获异常并输出警告日志
- **AND** 该图片的 `img src` 返回 `errorImgUrl` 占位图
- **AND** 该 docx 文件路径与图片名记入错误文件清单
- **AND** 构建流程继续处理后续图片与文档

#### Scenario: 转换输出无效

- **WHEN** 渲染返回空数据或长度异常（小于现有 `imageBuffer.length < 10` 同等门槛）的 PNG
- **THEN** 视为失败并按占位图回退，不落盘无效文件

### Requirement: Vercel 构建容器零系统依赖运行

EMF 转换能力 MUST 在 Vercel 构建容器（Amazon Linux 2023、无 GUI、无系统级包安装）内随 `build:doc-in-vercel` 正常运行。

#### Scenario: 容器内完整构建

- **WHEN** Vercel 执行 `pnpm run build`（经 `turbo.json` 依赖链触发 `build:doc-in-vercel`）
- **THEN** `emf-converter` 与 `@napi-rs/canvas` 仅通过 `pnpm install`（预编译二进制）即可工作，不依赖 `dnf`/`apt`/外部进程
- **AND** 含 EMF 图片的 docx 正常产出带 PNG 的 markdown，构建不因 EMF 转换失败而中断

#### Scenario: Windows 本地与容器行为一致

- **WHEN** 在 Windows 本地执行 `pnpm run build:doc-in-vercel`
- **THEN** EMF 转换走同一套代码与 shim，不需要平台分支

### Requirement: EMF 内嵌文本的字体保障

EMF 内嵌文本 MUST 通过随包注册的中文字体与 `fontFamilyMap` 映射完成渲染，MUST NOT 因字体缺失导致构建失败。

#### Scenario: 容器内中文文本渲染

- **WHEN** EMF 记录中的文本使用宋体、Calibri 等 Office/中文字体，且运行环境（Vercel 构建容器）未安装任何中文字体
- **THEN** 通过随包携带的 OFL 字体文件完成 `GlobalFonts.registerFromPath` 注册，并以 `fontFamilyMap` 小写键映射到注册字体完成渲染
- **AND** 转换产物中的中文文本不出现整片空白或豆腐块

#### Scenario: 字体注册失败不中断构建

- **WHEN** 字体文件缺失或注册失败
- **THEN** 仅输出警告日志并继续构建
- **AND** 该失败只影响图片文字渲染质量，不构成构建失败
