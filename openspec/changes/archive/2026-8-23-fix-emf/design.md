## 1. Context

当前转换模块仅注册一个 `NotoSansSC` 字体别名，并以有限的静态 `fontFamilyMap` 传入 `emf-converter`。该库在查表未命中时原样使用 EMF faceName；Vercel AL2023 容器没有可靠的 CJK 系统字体回退。现有 199KB 字体子集也只覆盖文件名字符，不能覆盖 EMF 正文。

本设计落实 `proposal.md` 中的契约，并沿用既有的单字体注册架构，避免 fork `emf-converter` 或引入系统字体依赖。

## 2. Goals / Non-Goals

**Goals:**

- 让当前已记录的 EMF 正文字符在容器中由随包字体可重复渲染。
- 让已观测字体名与未来未显式列举的 faceName 都落到已注册的 CJK 兼容字体。
- 将“字符集覆盖”和“容器产物可读”分别纳入自动化与生产验证。

**Non-Goals:**

- 不追求宋体、黑体、微软雅黑等原始字体的字形风格完全一致；本次保证优先级是文本完整可读。
- 不修改 `emf-converter` 上游，不将全量 17MB 字体纳入仓库，也不让构建时动态下载字体。
- 不把 Windows 本地像素比对作为生产验收替代品。

## 3. Decisions

### 3.1 以可追溯字符清单重出单一 Noto Sans SC 子集

将已从 EMF 记录提取的正文字符集合固化为受版本控制的测试 fixture，并合并 ASCII、数字、中英文常用标点生成字体子集。使用现有 FontTools 流程在开发环境重出固定常规字重字体；构建与 Vercel 只消费已提交的 `.ttf`，不依赖 Python 或外部网络。

选择子集而不是全量字体，以维持 ≤600KB 的仓库与部署体积目标；选择单一字体而不是按原字体分发多份字体，以把本次改动聚焦在可读性。

### 3.2 显式映射加运行时默认映射，而不依赖 Skia 回退

在 `fonts.ts` 保留并补齐实测字体名的显式映射，便于审计实际来源；同时以兼容 `Record<string, string>` 读取语义的默认映射，使未知 faceName 也解析为已注册别名 `NotoSansSC`。因此上游库读取 `fontFamilyMap[normalizedFaceName]` 时不会把未知名字原样交给容器 Skia。

不采用同一字体文件注册大量别名的方案：该行为依赖 napi canvas 的多别名细节且无法覆盖任意未来字体名。也不 fork 上游库：默认映射在现有接口内即可实现并减少维护面。

### 3.3 使用轻量 cmap 校验形成二进制资产回归门禁

新增仅解析 TTF cmap 所需格式的本地测试工具，由 Vitest 读取字符清单与字体资产，断言字符集合是 cmap 的子集。此校验不依赖 CI 是否预装 FontTools，且直接验证随包二进制而不是仅验证子集化命令曾执行。

FontTools 保留为重出资产的开发工具；字体 README 记录命令、输入清单、体积和字形数，便于后续文档集更新时再生。

### 3.4 建立“单测 → 直跑管线 → CI → 生产视觉”的分层验收

字体映射与 cmap 覆盖由 `scripts/build-doc-in-vercel` 的 Vitest 覆盖；转换行为仍通过现有 EMF fixtures 回归。管线验证必须直跑 `pnpm run build:doc-in-vercel`，规避 Turbo 未将外部 `drill-docx` 纳入输入导致的缓存假通过。生产验收通过有意义提交触发 Git 集成部署，遵循 `dev` 到 `main` 的既有发布路径，且不使用 `pnpm run deploy-vercel`。

## 4. Risks / Trade-offs

- [新文档带来未收录字符] → 使用字符清单与 cmap 测试在资产更新时显式暴露缺口，并在 README 中保留重出流程。
- [默认映射掩盖字体样式差异] → 保留关键字体的显式条目；本变更以可读性为验收目标，风格保真留待独立变更。
- [Windows 本地通过、Linux 容器仍异常] → 生产部署后抽查真实 PNG，结论与截图写入 change evidence。
- [二进制字体误作文本处理] → 沿用现有 `.gitattributes` 的 `*.ttf binary` 规则，并在提交前检查属性与实际 diff。

## 5. Migration Plan

1. 先提交字体映射与 cmap 覆盖的试点测试，确保其能在当前资产上暴露缺字或缺映射。
2. 重出并替换字体资产，更新 README 与测试清单，运行子包 Vitest 和直跑转换管线。
3. 在 `dev` 提交并推送，通过 CI 后将同一提交推进至 `main` 触发 Vercel 生产部署。
4. 在生产站点验证样本 PNG；若字体资产或默认映射导致渲染退化，回退该提交以恢复上一版已部署转换行为。

## 6. 文本布局与 glyph-index 回归

### 6.1 GDI 逐字符 advance

`EMR_EXTTEXTOUTW` 的 `offDx` 是按 UTF-16 code unit 给出的 advance，不能用整串 Canvas `fillText` 代替。存在有效 `offDx` 时按字符绘制，并为 `ETO_PDY` 同时应用 Y advance；没有 `offDx` 时维持整串绘制。

### 6.2 Mapping-mode 统一裁剪原点

GDI 普通图元与 mapping-mode 文本都必须相对同一个 `rclBounds.left/top` 输出。否则带 `SetWindowOrg/SetWindowExt` 的文本不会减去裁剪原点，和已裁剪的多边形框产生固定偏移。

### 6.3 Glyph index 的源字体映射

`ETO_GLYPH_INDEX` 的 UTF-16 值是源字体 glyph id，不是 Unicode。先按正确的 `LOGFONTW.lfFaceName` 偏移读取 source faceName，再用受版本控制的 glyph id → Unicode 表转换已观察组合；未知 glyph id 保留原值并作为后续资产/映射缺口暴露，不伪造字符。

## 7. SVG 双输出 POC 与全量质量门禁

### 7.1 只新增明确 SVG API，不改变 PNG 默认契约

`emf-converter@2.0.2` 公开入口和当前项目调用链均固定为 PNG。因此 pnpm patch 必须新增独立的 `convertEmfToSvgDataUrl` 与 `convertWmfToSvgDataUrl`，并保留既有 PNG API、默认 Canvas 路径和 PNG 语义不变。项目封装层新增 `convertEmfToSvg`。

2026-08-24 经用户明确授权，EMF/WMF 文档图片默认落盘格式切换为 SVG；`transformers.ts` 仅对 `x-emf`、`emf`、`wmf` 分支写入 `.svg`，其余 PNG/JPEG/GIF 处理语义不变。此切换以 Dual 记录仅回放 GDI 回退层的真实 WPS/GDI+ 对照为前提，仍需 Production Git Integration 与目标图截图复验。

### 7.2 主画布使用 SvgCanvas，临时位图画布继续使用 Raster Canvas

SVG 主画布通过 `createCanvas(width, height, SvgExportFlag.ConvertTextToPaths)` 创建，并以 `SvgCanvas.getContent()` 导出 UTF-8 SVG。`ConvertTextToPaths` 使构建期已确认的字体轮廓固定在输出内，避免终端用户浏览器缺少 NotoSansSC 时再次产生文字回退。

处理 DIB 的 `putImageData()` 与异步 deferred image 路径必须继续创建普通 Raster Canvas，再以 `drawImage()` 嵌入 SVG。这样产物中的路径、形状和文字保持矢量，源文件本来就是位图的内容以局部 `<image>` 存在；禁止用一张全画布 PNG 作为 SVG 的唯一内容。

### 7.3 现有坐标和字形修复是 SVG POC 的前置回归

SVG 后端复用已经验证的 `gmx/gmy/gmw/gmh`、frame 尺寸和 `EMR_EXTTEXTOUTW` 逐字符逻辑。`offDx`/`ETO_PDY`、mapping-mode frame、`ETO_GLYPH_INDEX` 三类 fixture 必须同时生成 PNG 和 SVG，并分别断言 SVG 的结构与由浏览器渲染后的几何结果；不得把 SVG `<text>` 合并为整串从而丢失逐字 advance。

### 7.4 先分类审计，再决定生产默认格式

全量审计输出每张 EMF/WMF 的稳定标识、源格式、SVG/PNG 生成状态、画布尺寸、局部位图数量和视觉缺陷分类。自动化只负责发现无输出、非法 SVG、整图 PNG 外壳、尺寸偏差和已知 fixture 的结构退化；乱码、相对错位、重复和裁断仍须与 Windows GDI+ 参照及可见 Chrome 截图人工判读。

ROP2、复杂 region combine、EMF+ DrawDriverString 与递归嵌套 metafile 都是阻断默认切换的高风险类别。它们必须拥有真实样本和 GDI+ 对照，或在审计报告中被显式隔离为 PNG 回退类别；禁止静默降级。

### 7.5 测试基线不依赖可归档的 OpenSpec evidence

全量审计生成的 JSON 既是 change evidence，也是可复跑的测试基线，但两者的生命周期不同。Vitest 必须只从 `scripts/build-doc-in-vercel/tests/fixtures/` 下受版本控制的清单副本读取基线，禁止硬编码 `openspec/changes/**/evidence/**` 路径。基线保存每个媒体的相对 DOCX 路径、ZIP entry 名、长度、SHA-256 与 record 审计；测试通过显式本地源目录重新提取二进制、重新计算哈希和重新运行 record 审计，确保清单不是自证。

全量 SVG 契约测试按 SHA-256 去重转换当前基线中的每个输入，再将结果关联回所有引用条目。它只能断言转换不失败、SVG 根元素/viewBox/矢量语义和非全画布 PNG 外壳，不能从 record 风险或 SVG 结构推导乱码、错位、重复、裁断或占位符已修复。专用本地命令缺少完整 DOCX 源目录时必须失败；常规快速 Vitest 不得静默跳过或假装跑过全量输入。

### 7.6 受限 ROP3 DIB 掩膜不能在 SVG 裁剪边界泄漏为点阵

真实 `关于地图活动镜头` 输入使用成对的 `EMR_STRETCHDIBITS`，`dwRop` 分别为 `SRCAND`（`0x008800C6`）与 `SRCPAINT`（`0x00EE0086`）。当前回放器把两者无条件作为普通 `drawImage` 处理；PNG 基线的目标带恰好干净，但 SVG 将局部 Raster Canvas 导出为 `<image>` 并与 clipPath 组合后，黑白掩膜在框体外泄漏为稀疏蓝色点阵。一次性取消 SVG 最大尺寸的受控实验仍存在 1,760 个异常像素，不能作为修复。

转换器仅在 SVG Canvas 下识别相邻、目标区域相同且 ROP 互补的该受限组合，并跳过这对错误掩膜的 `<image>/<use>` 输出；真实 fixture 的 GDI 回退向量记录已完整表达蓝色框体、边框、文字和连线。不得降低整张 EMF 为单一 PNG，也不得改变 PNG 或不含该组合的 DIB 路径。未实现的其他 ROP3 组合继续记录为高风险，不能伪称本次已获得通用 ROP3 保真。

## 8. 追加迁移计划

1. 先让 SVG 结构回归测试在当前实现上因缺少 API 而失败，再最小化补丁新增 SVG 主画布与导出函数。
2. 在项目封装中增加 SVG Buffer 校验，验证 MIME、根元素、viewBox 和非全画布 PNG 外壳；不接入 `transformers.ts` 默认输出。
3. 对真实 EMF+、offDx、mapping 和 glyph-index fixture 运行 SVG 结构检查与可见 Chrome 截图，逐项比较 Windows GDI+ 参照。
4. 建立全量转换清单与缺陷分类；只有所有阻断类别都有对照结论时，才提交独立任务决定是否将文档站默认图片格式切为 SVG。
