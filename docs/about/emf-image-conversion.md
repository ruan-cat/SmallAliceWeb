# EMF 矢量图的特殊处理

本站的 docx 文档中包含 Windows EMF/WMF 矢量图。它们不能直接作为浏览器图片使用，因此构建时会将其转换为 PNG。本页说明转换链路、随包字体策略，以及为什么仓库维护了 `patches/emf-converter@2.0.2.patch`。

## 1. 为什么需要特殊处理

### 1.1 浏览器与构建容器都不能直接承担 EMF 渲染

- 浏览器不会可靠渲染 `image/x-emf`，即使将二进制转换为 data URL，也不能作为站点图片交付。
- Vercel 构建容器不是 Windows 图形环境，不能依赖 GDI、系统中文字体或安装额外系统包。
- `sharp`/libvips 不能作为 EMF 解码器，因此不能把 EMF 当作普通 PNG/JPEG 处理。

### 1.2 本站的目标

转换的首要目标是让图内文字完整可读、位置不明显错位，并在 Vercel Git 构建中可重复运行；它不承诺逐像素复刻 Windows GDI 的字形风格。

## 2. 转换链路

### 2.1 图片分流

`scripts/build-doc-in-vercel/transformers.ts` 在 Mammoth 提取 docx 内嵌图片后识别以下类型：

|          输入类型          |        处理方式        |       输出        |
| :------------------------: | :--------------------: | :---------------: |
| `image/x-emf`、`image/emf` | `convertEmfToPng` 渲染 |   同名 PNG 文件   |
|        `image/wmf`         | `convertEmfToPng` 渲染 |   同名 PNG 文件   |
|    PNG/JPEG/JPG 等位图     |   既有 `sharp` 流程    | 原格式或 PNG 文件 |

EMF/WMF 转换失败时，当前文档仍会回退到既有占位图并记录错误，不会中断整次文档构建。

### 2.2 运行时依赖

- `emf-converter@2.0.2`：解析 EMF/WMF record stream，并重放到 Canvas 2D。
- `@napi-rs/canvas`：在 Node/Vercel 中提供 Skia Canvas，不依赖浏览器 DOM 或系统 GUI。
- `scripts/build-doc-in-vercel/emf/canvas-shim.ts`：补齐 `document`、`HTMLCanvasElement`、`createImageBitmap` 与 `ImageData` 等浏览器接口。

`canvas-shim.ts` 中的 `Symbol.hasInstance` 与直接给 Image 实例添加 `close()` 是已验证的 napi 兼容约束；不要改回原型链 hack 或 Proxy 包装。

## 3. 字体与字符策略

### 3.1 随包字体

Vercel 容器没有可靠的 CJK 系统字体回退。`scripts/build-doc-in-vercel/emf/fonts.ts` 会注册仓库内的 `NotoSansSC-Regular.ttf`，并把常见 Office/中文字体名映射到 `NotoSansSC`。

未知 faceName 也会回退到该别名，优先保证可读性，而不是追求宋体、黑体、微软雅黑的原始视觉风格。

### 3.2 字符集门禁

`tests/fixtures/emf-text-coverage.txt` 固化当前文档集 EMF 正文字符，并由 `emf/font-coverage.ts` 读取 TTF cmap。测试会断言字符集是字体 cmap 的子集，防止后续重新子集化字体时重新引入豆腐块。

## 4. `emf-converter` 补丁的必要性

### 4.1 补丁如何生效

根 `pnpm-workspace.yaml` 中的 `patchedDependencies` 将 `emf-converter@2.0.2` 绑定到：

```text
patches/emf-converter@2.0.2.patch
```

因此本地和 Vercel 只要执行 `pnpm install`，都会应用同一补丁。不要直接编辑 `node_modules`；那种修改不会被版本控制，也不会在 Vercel Git 构建中重现。

### 4.2 补丁修复的三类 EMF 语义

|          EMF 语义          |                未补丁时的现象                 |                             补丁处理方式                              |
| :------------------------: | :-------------------------------------------: | :-------------------------------------------------------------------: |
|  `EMR_EXTTEXTOUTW.offDx`   |  整串文字绘制，图内标签重叠、错位或脱离图框   | 按 UTF-16 字符逐个绘制，并应用 X advance；支持 `ETO_PDY` 的 Y advance |
| Mapping mode + `rclBounds` | 图形与文字使用不同裁剪原点，出现固定 X/Y 偏移 |            mapping-mode 坐标同样减去 `rclBounds.left/top`             |
|     `ETO_GLYPH_INDEX`      |  glyph id 被误作 Unicode，显示为方块或占位符  |           按 source faceName 与受控 glyph id 表还原 Unicode           |

补丁还将 `LOGFONTW.lfFaceName` 的读取偏移修正为正确位置。正确 faceName 是字体回退与 glyph-index 映射的前提。

### 4.3 Glyph index 映射的边界

`ETO_GLYPH_INDEX` 保存的是源字体内部 glyph id，不是字符编码。Canvas 不能直接按该 id 绘制，且本站不能把 Windows 商业字体文件提交到仓库。

当前 `glyphIndexMap` 只收录已从当前文档集和本机原字体 cmap 反查确认的组合：黑体中的引号、省略号、逻辑与/或、不等号，以及 Calibri 中的左右单引号。未知 `(faceName, glyph id)` 不会被猜测性替换；应先取得原始字体或可靠参照，再新增映射和回归测试。

## 5. 维护与验证

### 5.1 修改补丁时

1. 先从真实 docx 提取能复现问题的 EMF fixture，写出失败测试。
2. 使用 `pnpm patch emf-converter@2.0.2 --edit-dir <目录>` 修改依赖。
3. 使用 `pnpm patch-commit <目录>` 更新 `patches/emf-converter@2.0.2.patch`。
4. 保留 `pnpm-workspace.yaml` 的 `patchedDependencies` 声明，并重新运行测试。

### 5.2 最小验证命令

```powershell
pnpm --filter @ruan-cat-temp/build-doc-in-vercel test
pnpm run build:doc-in-vercel
openspec validate 2026-8-23-fix-emf --strict
```

本地通过后，正式验收仍以 Vercel Git Integration 的构建日志和可见 Chrome 页面截图为准。重点检查图内文本是否可读、是否与图框对齐，以及是否仍出现方块/占位符。

## 6. 已知限制

- EMF 的完整 GDI/EMF+ 语义极多；本站只为实际文档集中的 record 和可复现问题增加补丁。
- 若后续引入未知 source font、未知 glyph id、旋转/剪裁复杂文本或新的 EMF+ 文本记录，需要新增 fixture 和独立验证，不能假定现有补丁覆盖。
- 生产验收判断“文本可读、无明显错位或占位”，不等同于 Windows GDI 的逐像素一致性。
