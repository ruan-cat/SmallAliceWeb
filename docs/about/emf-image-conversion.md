# EMF/WMF 图像转换的实现历程与质量门禁

本站的 DOCX 文档中含有 Windows EMF/WMF 矢量图。浏览器不能可靠显示这些格式，Vercel Linux 构建容器也不能调用 Windows GDI，因此构建链必须把它们转换为浏览器可用的图片。

这不是一次“把格式换成 PNG/SVG”就结束的工作。EMF 保存的是 GDI/GDI+ 绘图命令流：字体、字形 id、坐标变换、裁剪、位图掩膜和双记录回放都会影响最终画面。本页记录问题如何被发现、每一阶段解决了什么，以及哪些风险仍未关闭。

## 1. 读者先看结论

目前 EMF/WMF 默认落盘为 SVG；PNG/JPEG/GIF 等普通位图仍走原有流程。转换器运行在 Node/Vercel 中，依赖受版本控制的 `emf-converter` 补丁、`@napi-rs/canvas` 和随包中文字体。

已完成的阶段成果包括：中文文字不再因容器缺字而整段空白、`offDx` 文本不再被整串重叠绘制、mapping-mode 与 glyph-index 的已知回归已被 fixture 覆盖、EMF+ Dual 双层重放导致的错位已修复，以及地图活动镜头的 SVG 框体点阵已在本地 GDI+/Chrome 对照中消失。

这不代表所有 EMF 图形已经逐像素等同于 Windows GDI。复杂裁剪、未知 ROP3、递归 metafile 等类别仍要逐样本复核；本轮点阵补丁尚需通过 Git Integration 发布，由维护者在生产页面做人工验收。

## 2. 为什么不能直接把 EMF 当普通图片

### 2.1 浏览器、Vercel 与 Windows GDI 的能力不同

- 浏览器不会可靠渲染 `image/x-emf` 或 `image/wmf`。
- Vercel 构建容器不是 Windows，不能依赖 GDI、系统中文字体或桌面 GUI。
- `sharp`/libvips 不是 EMF 解码器，不能替代 GDI/GDI+ record 回放。
- Windows GDI+ 是定位和对照基线，不是生产构建运行时。

### 2.2 本站的质量目标与边界

|        目标        |                           当前含义                            |
| :----------------: | :-----------------------------------------------------------: |
|     可重复构建     | 同一 Git 提交在本地和 Vercel 使用相同的字体、补丁和 pnpm 依赖 |
|    文字完整可读    |  中文、已映射 glyph 和常见 Office 字体不出现整段空白或豆腐块  |
| 相对几何不明显失真 | 文本、框体、箭头和裁剪区域以真实 GDI+ 参照与 Chrome 截图复核  |
|    不承诺的内容    |   不承诺所有 EMF+/ROP3/GDI 语义、原字体风格或逐像素完全等同   |

## 3. 当前转换链路

### 3.1 图片分流与默认产物

`scripts/build-doc-in-vercel/transformers.ts` 在 Mammoth 提取 DOCX 内嵌图片后分流：

|            输入类型             |                    处理方式                     |   落盘格式   |
| :-----------------------------: | :---------------------------------------------: | :----------: |
| `image/x-emf`、`image/emf`、WMF | `convertEmfToSvg` 与受控的 `emf-converter` 补丁 |    `.svg`    |
|       PNG/JPEG/GIF 等位图       |                既有 `sharp` 流程                | 保持原有语义 |

EMF/WMF 单张失败只记录错误并继续处理其他文档；它不应让整次文档构建中断。但“转换成功”只说明产物生成，不能替代视觉质量结论。

### 3.2 运行时依赖与补丁位置

- `emf-converter@2.0.2`：解析 EMF/WMF record 并回放 Canvas 2D 指令。
- `@napi-rs/canvas`：在 Node/Vercel 中提供 Skia Canvas；SVG 主画布的文字会转为轮廓，避免终端浏览器缺字体再次回退。
- `scripts/build-doc-in-vercel/emf/canvas-shim.ts`：提供最小 `document`、`HTMLCanvasElement`、`createImageBitmap`、`ImageData` 兼容层。
- `patches/emf-converter@2.0.2.patch`：由根 `pnpm-workspace.yaml` 的 `patchedDependencies` 应用；本地和 Vercel 执行 `pnpm install` 都会获得同一补丁。

不要直接修改 `node_modules`。正确流程是 `pnpm patch` 编辑依赖、`pnpm patch-commit` 生成补丁、再以真实 fixture 验证。

## 4. 处理历史与阶段成果

### 4.1 第一阶段：容器中文文字丢失

最早的生产问题是图内中文整段空白、乱码或豆腐块。调查证明这不是 UTF-8 解码问题，而是 EMF `faceName` 无法命中容器字体、随包字体子集也缺少正文字符。

处理结果：

- 注册 `NotoSansSC-Regular.ttf`，为宋体、黑体、Calibri、Tahoma、Segoe UI 等已观测字体提供映射。
- 未知 `faceName` 统一回退到已注册的中文字体别名，优先保证可读性。
- 从实际 `Canvas.fillText` 文本提取字符集，并以 TTF cmap 测试约束字体子集。
- 用生产 Git Integration 构建日志和可见 Chrome 抽样验证“没有整段空白/豆腐块”。

### 4.2 第二阶段：文本布局、mapping-mode 与 glyph-index

文字可读后，用户仍发现标签重叠、框体偏移和符号占位。根因拆成三个独立问题：`EMR_EXTTEXTOUTW.offDx` 是逐 UTF-16 字符的 advance、mapping-mode 的 frame/bounds 不能重复裁剪、`ETO_GLYPH_INDEX` 保存的是源字体 glyph id 而不是 Unicode。

处理结果：

- 有 `offDx` 时逐字符绘制，并支持 `ETO_PDY` 的 Y advance。
- 以 Windows GDI+ 的 frame 尺寸和首字符坐标为回归门禁，修正 mapping-mode 的重复扣减问题。
- 按 source faceName 与已反查 glyph id 维护受控映射；未知 glyph 不猜测替换。

### 4.3 第三阶段：EMF+ Dual 双层回放

部分 Office/WPS 生成的 EMF 是 EMF+ Dual：同一图同时带 EMF+ 主记录和 GDI 回退记录。转换器若两层都重放，会出现整套文字、箭头和框体重影错位。

处理结果：识别 EMF+ Header 的 Dual 标志后，仅回放经真实 GDI+/WPS 对照确认正确的 GDI 回退层。`portrait-high-contrast.emf` 回归以“原始 Dual 与屏蔽 EMF+ comment 后的 GDI-only PNG 哈希一致”为门禁。

### 4.4 第四阶段：从 PNG 兼容基线到 SVG 默认输出

SVG 不是“外层套一张 PNG”。主画布保留路径、形状和文字轮廓；原始 DIB/位图可作为局部 `<image>` 存在，但不允许整图退化为唯一位图。

处理结果：补丁新增独立 SVG API，项目封装保留显式 PNG API。针对 EMF+、`offDx`、mapping-mode 和 glyph-index fixture 同时检查 PNG 基线、SVG 根元素、viewBox、矢量图元和浏览器几何结果。

### 4.5 第五阶段：全量审计与人工门禁

少量页面通过不能外推全量质量。当前审计基线包含 195 个 DOCX、399 个 EMF、0 个 WMF；每条媒体记录相对 DOCX 路径、ZIP entry、字节数、SHA-256 与 record 风险。

`test:audit-corpus` 会重新从完整本地 DOCX 源目录提取所有媒体，验证清单未漂移，并按 SHA-256 去重转换 SVG。它能证明来源一致性和输出结构，但不会把“SVG 可解析”误报为文字、裁剪或图层视觉通过。

### 4.6 第六阶段：地图活动镜头的框体点阵

用户在 `关于地图活动镜头` 的蓝色框体边缘发现一整条稀疏点阵。定位过程如下：

1. 从 DOCX 提取 `word/media/image2.emf`，Windows GDI+ 对照没有点阵，排除源文件本身和网页 CSS 缩放。
2. 在生产 SVG 原始尺寸中复现点阵，确认问题发生在转换器 SVG 输出，不是页面缩放伪影。
3. 解析到 16 对相邻、同目标区域的 `EMR_STRETCHDIBITS`，ROP 为 `SRCPAINT` 与 `SRCAND`；旧 SVG 会导出 16 个局部 `<image>/<use>`。
4. 在真实 Chrome SVG DOM 中临时移除这 16 个 `<use>`，点阵归零，且框体、文字和连线与 GDI+ 对照一致。
5. 补丁仅在 SVG Canvas 下跳过“相邻、同目标、ROP 互补”的受限掩膜对；PNG 和其他 DIB/ROP3 分支保持不变。

阶段成果：真实 fixture 的 SVG 从 16 个 `<image>/<use>` 变为 0，本地完整重建和 Chrome HTTP 截图均确认点阵消失。该规则不是通用 ROP3 实现；未知 ROP3 仍列为风险。

## 5. 自动化验证与人工验收

### 5.1 日常回归

```powershell
pnpm --filter @ruan-cat-temp/build-doc-in-vercel test
openspec validate 2026-8-23-fix-emf --strict
```

### 5.2 全量本地语料门禁

```powershell
$env:EMF_AUDIT_SOURCE_ROOT = (Resolve-Path "drill-docx").Path
pnpm --filter @ruan-cat-temp/build-doc-in-vercel test:audit-corpus
pnpm run build:doc-in-vercel
```

缺少 `EMF_AUDIT_SOURCE_ROOT` 时，全量命令会明确失败，不能静默 skip 后报告通过。

### 5.3 生产验收的正确含义

正式发布必须由 `main` 的有意义 Git commit 触发 Vercel Git Integration，不能以本地 `vercel deploy` 或本地构建代替。验证时应查看 Git checkout SHA、构建日志、目标资源和目标图视口；`naturalWidth`、MIME、资源加载数或单张缩略图都不足以证明布局正确。

截至本文更新，地图活动镜头点阵修复已完成本地 GDI+/Chrome 验证，尚待本轮 Production Git Integration 发布后的维护者人工确认。

## 6. 仍未关闭的风险

- `插件类型.docx` 的复杂裁剪/位图 SVG 曾在蓝色椭圆节点后产生 GDI+ 原图没有的灰色矩形，仍需单独定位。
- 复杂裁剪、ROP2、未知 ROP3、`DrawDriverString`、递归内嵌 metafile 和未知 glyph 都不能因某个 fixture 通过而自动关闭。
- 默认 SVG 已改善多类真实样本，但全量审计、覆盖清单逐图截图与生产人工验收仍是独立门禁。

处理 EMF 的原则始终不变：先固定真实输入和 GDI+ 参照，再写能失败的回归，最后以可见 Chrome 复核输出。没有证据的“转换成功”，不等于图形质量通过。
