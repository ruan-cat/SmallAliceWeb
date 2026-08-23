# 2026-08-22 调研 docx 生成 x-emf 图片的转换方案

## 1. 项目现状：x-emf 在哪里被处理

### 1.1 当前生效的处理代码

x-emf 的识别与跳过发生在 `scripts/build-doc-in-vercel/transformers.ts` 的 `docx2html()` 函数内，位于 mammoth 的 `convertImage: images.imgElement()` 回调中。

格式识别处（`scripts/build-doc-in-vercel/transformers.ts:193`）：

```ts
/**
 * 图片格式
 * @description
 * 其返回格式类似于 image/x-emf ，所以这里要做数组切割 取第二个元素
 */
let contentType = image.contentType || "image/png";
```

跳过逻辑（`scripts/build-doc-in-vercel/transformers.ts:220`）：

```ts
// 处理特殊格式的图片
const unsupportedFormats = ["x-emf", "gif", "wmf", "emf"];
if (unsupportedFormats.includes(imageType)) {
	consola.warn(`跳过不支持的图片格式: ${imageType}，使用占位图片`);
	return {
		src: errorImgUrl,
	};
}
```

命中黑名单后返回 OSS 占位图（`scripts/build-doc-in-vercel/utils.ts:181` 定义的 `errorImgUrl`）。当前管线产物 `docs/docx/**/*.md` 中已存在大量该占位图链接（本地构建产物，可直接检索验证）。

### 1.2 图片处理管线完整流程

入口脚本为 `package.json` 中的 `build:doc-in-vercel`（`tsx ./scripts/build-doc-in-vercel/index.ts`），流程如下：

|     阶段     |                             处理内容                             |
| :----------: | :--------------------------------------------------------------: |
| 准备输出目录 |            清空并重建 `docs/docx` 产物目录（MD+图片）            |
|  获取文档源  |  `git clone --depth=1` 克隆 drill-docx 仓库（Windows 本地跳过）  |
|   数据预备   |              建立文件名索引（`dataPreparation.ts`）              |
|   格式转换   | TXT 直接写 MD；DOCX 走 `docx2html()` → `html2md()` → 删中间 HTML |
|   清理阶段   |                 `cleanMdFiles()` 清理 MD 脏数据                  |
|   输出报告   |                  打印错误文件列表和图片类型统计                  |

其中 DOCX 内图片的单张处理逻辑：

1. mammoth `convertImage` 回调拿到 `image.contentType`（如 `image/x-emf`）与 base64 数据；
2. 命名规则 `{安全文件名}-{三位序号}.{ext}`，落盘到 `docs/docx/images/{文档名}/`；
3. `png/jpeg/jpg` 交给 sharp 原格式压缩输出；其他光栅格式尝试 `sharp().toFormat("png")`；
4. `x-emf / gif / wmf / emf` 直接跳过返回占位图；
5. sharp 处理失败的也落占位图并记入错误清单。

### 1.3 历史演变（git 证据）

以下 4 个提交中，前 3 个落在已删除的旧脚本 `scripts/docx2md/index.ts` 上（该目录现已不存在），第 4 个落在 `docs/.vitepress/config.mts`。它们完整记录了当年的排查与放弃过程：

|   提交    |    日期    |                    说明                     |
| :-------: | :--------: | :-----------------------------------------: |
| `4ae3e98` | 2025-02-11 |    排查出 image/x-emf 错误（sharp 报错）    |
| `5bddadb` | 2025-02-11 | 尝试 base64 data URI 直接内嵌（失败被注释） |
| `9792f47` | 2025-02-11 |      暂时放弃 x-emf 的处理，留下 FIXME      |
| `f054254` | 2025-04-10 |   仅在 VitePress 侧加 assetsInclude 兼容    |

`9792f47` 中留下的注释是全仓库唯一解释「为什么不行」的原文：

```ts
// 如果是 x-emf 格式的图片 即矢量图
// FIXME: 尝试用 rust 调用 C++ 库，实现 emf 转 png。未来再说。
if (imageType === "x-emf") {
	// base64格式的图片 也不行。不能显示出来内容。
	// return {
	//     src: "data:" + image.contentType + ";base64," + imageBuffer,
	// };
	consola.warn(` 目前无法处理 ${imageType} 格式的图片。默认放弃。 `);
}
```

`f054254` 对应在 `docs/.vitepress/config.mts:61` 加了 `assetsInclude: ["**/*.emf"]`，但这只是让 Vite 不把 `.emf` 文件当未知资源报错，并不解决「EMF 无法被浏览器渲染」的本质问题。

### 1.4 关键运行形态事实

本次核实 `turbo.json` 与 `.gitignore` 发现一个对选型有决定性影响的事实：`turbo.json:50` 将 `//#build:doc-in-vercel` 挂在 `//#docs:build:run` 的 `dependsOn` 中（自 2026-07-25 提交 `3b9b5c0` 接入 Turbo 构建调度起生效），而根 `package.json` 的 `build` 正是 `turbo run //#docs:build:run`，Vercel 项目 `small-alice-web-odse` 的 Build Command 就是 `pnpm run build`。同时 `.gitignore:56` 忽略整个 `docs/docx` 目录（`git ls-files docs/docx` 为 0 个文件），产物不提交仓库。即当前实际工作形态是：

|                 形态                  |                                              说明                                              |      是否当前实际生效       |
| :-----------------------------------: | :--------------------------------------------------------------------------------------------: | :-------------------------: |
| 形态 A：本地/手动跑转换，产物提交仓库 |               `pnpm run build:doc-in-vercel` 本地执行，`docs/docx/**` 提交进仓库               | ❌ 产物被 gitignore，不入库 |
|     形态 B：Vercel 构建容器内转换     | `build` → turbo → 先跑 `build:doc-in-vercel`（容器内克隆 drill-docx 并转换）再 vitepress build |     ✅ 当前实际生效形态     |

**这意味着：EMF 转换必须发生在 Vercel 构建容器（Linux、无 GUI、无系统级包管理自由度）内**，是方案选型的硬约束。任何依赖 Windows 本地能力或重型系统安装的方案，都只能作为「改变工作流」的可选项，而非默认路线。

## 2. 为什么曾经的纯 Node TypeScript 方案做不到

### 2.1 根因一：sharp / libvips 没有 EMF 解码器

sharp 基于 libvips，而 libvips 官方从未提供 EMF/WMF 加载器，也没有支持计划（sharp 仓库 #2033、#1725、#3472 等 ISSUE 均确认）。理论上唯一路径是自编译带 ImageMagick delegate 的 libvips，但 ImageMagick 的 EMF delegate 依赖 Windows GDI，Linux 上不可用。当年管线里唯一的光栅化工具 sharp 面前，EMF 是死路。

### 2.2 根因二：浏览器不认 image/x-emf，base64 内嵌无效

2025-02-11 的 `5bddadb` 曾尝试把 EMF 以 `data:image/x-emf;base64,...` 直接内嵌进 HTML，但浏览器（Chrome/Edge/Firefox/Safari）没有任何一家原生支持渲染 EMF 矢量格式，`9792f47` 里被注释掉的 base64 代码就是这条路的墓碑。docx 里的 EMF 图片不转成 png/svg/jpeg 等通用格式，就没有任何下游消费方式。

### 2.3 根因三（本质）：EMF 是 GDI 绘图命令流，纯 JS 生态当年没有渲染器

EMF（Enhanced Metafile）不是位图格式，而是一串 Windows GDI 绘图指令的录制流（画线、填充、裁剪、坐标变换、文字排版……）。要「转换」它，等于要在目标平台重新实现一个 GDI 绘图引擎：

|            记录集             | 条数 |                            说明                             |
| :---------------------------: | :--: | :---------------------------------------------------------: |
| 经典 EMF（GDI，MS-EMF 规范）  | 105  |              Word 公式、老式粘贴生成的多是这类              |
| EMF+（GDI+，MS-EMFPLUS 规范） |  85  | Excel 图表、现代 Office 粘贴生成，多为 EMF+ dual 双记录格式 |
|      WMF（16 位老格式）       |  —   |               更老的格式，本项目黑名单里也有                |

参照系：C 语言世界最知名的 libemf2svg（kakwa 维护，118 stars）做了约十年，官方覆盖表是 105 条 EMF 记录中 37 条完整支持（35%）+ 33 条部分支持，而 85 条 EMF+ 记录的支持率为 **0%**。2025 年当时的 npm 上没有任何纯 JS 的 EMF 渲染实现（SheetJS 的 `wmf` 包只支持 WMF 且 2020 年后停更；draw.io 内嵌的 emf-svg.js 移植版只检测 EMF+ 不渲染）。所以在当年，纯 Node TypeScript 生态既没有现成轮子、也没有可 WASM 化的成熟底层，FIXME 里才会写下「用 rust 调 C++ 库」的设想。

### 2.4 关键分水岭：EMF+ 支持决定方案成败

本项目 docx 的来源是 Office 用户粘贴 Excel 图表/公式，这类 EMF 绝大多数是 **EMF+ 或 EMF+ dual** 格式。一个转换方案若不支持 EMF+ 记录集，对 Excel 图表会输出空白或残缺 SVG。这是后文所有方案质量分化的核心评估维度。

## 3. 转换方案全面调研

### 3.1 纯 Node / WASM 路线

#### 3.1.1 libemf2svg 家族（C 库及其 WASM/JS 移植）——对本场景结构性不成立

|                  候选                   |                 形态                 |                 EMF+ 支持                  |                 License                 |
| :-------------------------------------: | :----------------------------------: | :----------------------------------------: | :-------------------------------------: |
|        kakwa/libemf2svg（C 库）         |     C + CMake，需自建 Emscripten     | ❌ 0% 覆盖（issue #12 自 2017 年开放至今） |                 GPL-2.0                 |
| npm `emf-to-png` v0.2.1（2026-05 首发） | libemf2svg 的 WASM + resvg-js 光栅化 |    ❌ README 明言 EMF+ 不在稳定 API 内     | MIT 标注但内嵌 GPL wasm，存在许可证冲突 |
| draw.io 内嵌 emf-svg.js（112KB 纯 JS）  |            可抄的 JS 移植            |      ❌ 源码仅 detect and log，不渲染      |       Apache-2.0（文件级需复核）        |
|         cahirwpz/emf2svg 原仓库         |     已 404，npm 无 `emf2svg` 包      |                     —                      |                    —                    |

结论：这一族对「Excel 图表类 EMF+ dual」文件，最好情况只能渲染出经典层退化结果，EMF+ only 文件直接输出空白。且 GPL-2.0 对闭源管线有传染隐患（WASM 编译不改变 GPL 约束）。`emf-to-png` 的价值在于开箱即用 + 自带 `inspect()` 能检测文件是否含 EMF+ 记录，可作分级判断工具。

#### 3.1.2 `emf-converter` v2.0.2 —— 纯 Node 路线的真答案

- npm：`emf-converter`（2026-07-27 发布 v2.0.2，月下载约 22 万，Apache-2.0）；
- 形态：零依赖纯 TypeScript 库，解析 EMF/WMF/EMF+ 记录流并重放到 Canvas 2D，输出 PNG；
- **EMF+ 是一等公民**：源码内有约 70KB 的 EMF+ 专用实现（对象解析、状态机、绘制、文本图像、画刷、路径、位图解码、重放模块），每个模块配测试；README 宣称覆盖 300+ GDI 记录、完整 EMF+ 记录集、6 种裁剪布尔组合、GDI+ 线性/路径渐变、ROP2 映射、16 倍子像素精度世界坐标变换；
- 诚实声明的限制：ROP2 位运算用算术合成近似、渐变不平铺、texture brush 退化为黑、字体度量取决于宿主 Canvas 引擎（提供 `fontFamilyMap` 可把 Calibri 映射到 Carlito）；
- **Node 侧唯一门槛**：库优先使用全局 `OffscreenCanvas` 或 `document.createElement('canvas')`，Node 中需配 `@napi-rs/canvas` 写约 30–50 行 shim（挂 `globalThis.OffscreenCanvas`，补 `ImageData`/`DOMMatrix`/`FileReader`/`convertToBlob` 等全局）；
- `@napi-rs/canvas`（Skia 后端，2298 stars）：零系统依赖、无 postinstall、预编译 N-API 多平台二进制，Windows 与 Vercel 构建容器（Linux）均 `pnpm install` 即用，与现有 sharp 同级安装体验。

另有 `emf-renderer` v0.1.0（2026-07 首发即最新，MIT）同样纯 TS 宣称支持 EMF+，但成熟度远低于 emf-converter，只作备选观察。

#### 3.1.3 纯 Node 路线结论

**2026 年的现在，纯 Node 是可行的**——这正是「曾经不行、现在行」的原因：emf-converter（2026 年新库）补上了 EMF+ 渲染缺口，配合 @napi-rs/canvas 提供的 Canvas 实现，在无 GUI、无系统依赖的 Node 22 环境里可以完成 Excel 图表类 EMF → PNG 的转换。代价是输出为光栅 PNG（非矢量 SVG）、需要自写 canvas shim、候选包较新需锁版本并保留兜底。

### 3.2 Rust 路线 —— 回答「rust 行不行？」

**明确结论：现阶段不行（作为拿现成轮子的路线），当年 FIXME 设想的「rust 调 C++ 库」性价比也很低。**

|            crate             |      版本/时间      |                     状态                      |                                 能力                                 |
| :--------------------------: | :-----------------: | :-------------------------------------------: | :------------------------------------------------------------------: |
| `emf-core`（mythrnr/emf-rs） | 0.1.0，2026-08 首发 |      WIP，4 stars，作者自述记录未实现完       |                          EMF→SVG（不完整）                           |
|     `emfsdk`（KaiserY）      |   0.2.0，2026-07    |              预览级，约 45K SLoC              | EMF/EMF+/WMF 读写，渲染明确声明「只求预览不求像素保真」，无 SVG 输出 |
|   `wmf-core`（同 mythrnr）   |        0.1.1        |                    极早期                     |                               WMF→SVG                                |
|  libemf2svg 的 Rust binding  |          —          | **不存在**（crates.io 与 GitHub 均为 0 结果） |                                  —                                   |

三层理由：

1. **没有成熟轮子**：EMF 完整渲染 = 105 条 EMF + 85 条 EMF+ 记录 + GDI 语义（变换/裁剪/ROP/字体度量），参照 libemf2svg 十年才 35% 完整支持，自写以人月计；两个 2026 年新 crate（emf-core 发布仅数周、emfsdk 预览级）都不到生产可用度，建议 6–12 个月后复评。
2. **「Rust 绑 libemf2svg」已被更轻的方式实现**：别人已用 Emscripten 把 libemf2svg 编成 WASM 发了 npm（`emf-to-png`），零依赖即装即用；自己写 napi 绑定收益只剩性能（EMF 转换非性能敏感），代价是 1–2 周交叉编译矩阵工程。
3. **质量瓶颈在上游 C 库而非胶水层**：libemf2svg 的 EMF+ 覆盖为 0%，换 Rust 胶水不会变好，而本项目的 Excel 图表恰恰是 EMF+。另有 GPL-2.0 静态链接传染风险。

### 3.3 系统级工具路线

|                    方案                     |  Excel 图表(EMF+) 质量  |                                    系统依赖与体积                                     |                          Vercel 容器                          |  Windows 本地   | License  |
| :-----------------------------------------: | :---------------------: | :-----------------------------------------------------------------------------------: | :-----------------------------------------------------------: | :-------------: | :------: |
|            LibreOffice headless             |     ⚠️→✅ 开源最佳      |                          下载约 350MB / 装后 1.5GB，依赖链重                          | ⚠️ 可行但重（AL2023 仓库无包，需 RPM 解压，冷构建 +2–4 分钟） |   ✅ 装完即用   | MPL-2.0  |
|                Inkscape CLI                 |   ❌ 丢元素/字距错位    |                                        约 1GB                                         |                              ❌                               | ⚠️ 能装但质量差 | GPL-3.0  |
|            ImageMagick + libwmf             |            —            | libwmf 只支持 WMF；IM 的 EMF delegate 仅 Windows 可用，Linux 直接报 decoder not found |                              ❌                               |       ❌        |    —     |
| Windows GDI+（PowerShell + System.Drawing） | ✅ 满分（原生语义渲染） |                                 Windows 自带，零新增                                  |                     ❌ 无法进 Linux 容器                      | ✅ 保真度天花板 | 系统自带 |

要点说明：

- **LibreOffice headless** 是社区公认「Windows 之外最准确的 EMF 转换」（Stack Overflow 14103891），其 EMF 导入模块有 15 年积累、EMF+ 支持为开源工具中最完整；Node 侧用 `execa("soffice", ["--headless", "--convert-to", "png", ...])` 串行调用；已知瑕疵是无背景 PNG 补白底、分辨率需 FilterOptions 控制，推荐输出 PNG 走 sharp 后处理。
- **Windows GDI+** 路线（PowerShell 脚本调 `System.Drawing.Imaging.Metafile` 按 4 倍 Scale 栅格化）是保真度天花板——EMF 本质就是 GDI 绘图记录，Windows 原生渲染无任何兼容层损失，且零新依赖；但只能用于形态 A（本地预处理）。
- **云服务**（CloudConvert 免费 25 credits/天、GroupDocs 等）：技术上构建期可调用，但引入密钥管理、文件出内网、外部确定性依赖和持续费用，仅当 EMF 数量很少且不愿碰本地工具链时考虑。Gotenberg 不支持 EMF，排除。

### 3.4 全量方案对比总表

|                方案                 | EMF+ 质量 |   系统依赖   | Vercel 容器 | Windows 本地 |  Node 集成方式   |         License         |
| :---------------------------------: | :-------: | :----------: | :---------: | :----------: | :--------------: | :---------------------: |
| **emf-converter + @napi-rs/canvas** |    ✅     |      零      |     ✅      |      ✅      | 纯 import + shim |       Apache-2.0        |
|      **LibreOffice headless**       |   ⚠️→✅   |      重      |   ⚠️ 可行   |      ✅      |    execa CLI     |         MPL-2.0         |
|     **Windows GDI+ PowerShell**     |  ✅ 满分  |     自带     |     ❌      |      ✅      |    execa ps1     |        系统自带         |
|    emf-to-png（libemf2svg WASM）    |    ❌     |      零      |     ✅      |      ✅      |    纯 import     |     MIT+GPL 冲突 ⚠️     |
|            Inkscape CLI             |    ❌     |     1GB      |     ❌      |      ⚠️      |    execa CLI     |         GPL-3.0         |
|        ImageMagick + libwmf         |  不支持   |      —       |     ❌      |      ❌      |        —         |            —            |
| Rust 现有 crate（emf-core/emfsdk）  |    ❌     |      零      |     ✅      |      ✅      |    napi/wasm     | 待成熟（6–12 月后复评） |
|      自建 libemf2svg napi 模块      |    ❌     | 交叉编译矩阵 |     ✅      |      ✅      |     原生模块     |    **GPL-2.0 传染**     |
|      云 API（CloudConvert 等）      |    ⚠️     |  网络+密钥   |     ⚠️      |      ⚠️      |       REST       |        商业服务         |

## 4. 推荐路线

### 4.1 主推方案：emf-converter + @napi-rs/canvas（纯 Node，双端统一）

理由：

1. 它是全生态唯一经源码核实、完整实现 EMF+ 记录集的纯 TS 库，Apache-2.0 商业友好，半年 40+ 次发版、模块配测试；
2. `@napi-rs/canvas`（Skia）零系统依赖、预编译多平台二进制，与现有 sharp 同级安装体验——**这是满足 1.4 节确认的 Vercel 构建容器硬约束（无 GUI、无系统包自由度）的唯一轻量路线**，同时 Windows 本地开发也能用同一套代码；
3. 不改变现有管线架构：EMF → PNG 后继续走 sharp 压缩落盘，只是把黑名单分支换成转换分支。

落地要点：

- 写约 30–50 行 canvas shim（`globalThis.OffscreenCanvas` 指向 `createCanvas`，补 `ImageData`/`DOMMatrix`/`FileReader`/`convertToBlob`）；
- 处理字体：Linux 容器缺微软字体，用 `fontFamilyMap` 把 Calibri→Carlito 等映射，或 `GlobalFonts.register` 注册字体文件；
- 锁定精确版本（包较新），保留「转换失败落占位图」的现有兜底逻辑；
- 输出为 PNG 光栅；若未来必须要矢量 SVG，当前生态没有能正确处理 EMF+ 的 SVG 生成器（libemf2svg #51 PR 未合并），SVG 路线需等上游。

### 4.2 备选与增强

- **备选：LibreOffice headless**——若实测 emf-converter 对本仓库真实样本（Excel 图表）渲染质量不合格，LibreOffice 是质量上限更高的自托管方案；但在当前实际生效的 Vercel 构建形态下代价显著（AL2023 仓库无包，需 RPM 解压进项目目录 + `LD_LIBRARY_PATH`，冷构建 +2–4 分钟、约 1.5GB 临时磁盘），仅在质量要求压倒构建成本时选择。
- **工作流变更选项：Windows GDI+ 本地预处理**——需先把 `docs/docx` 从 gitignore 中放出、改为「本地预转换产物入库」的工作流，才能用 PowerShell + System.Drawing 以最高保真度预转 PNG；属于改变构建链形态的方案，不改动工作流则不可用。
- **分级策略（可选优化）**：接入 `emf-to-png` 的 `inspect()`（或自写 20 行 EMF 头检测）区分经典 EMF 与 EMF+，经典 EMF 走轻量 WASM 转换、EMF+ 走主转换器，压缩最重路径的调用次数。

### 4.3 建议的实施前验证步骤

1. 从 drill-docx 仓库抽样统计：EMF 图片总量、EMF+ / dual / 经典 EMF 占比（用 `inspect()` 即可）；
2. 取 5–10 个真实 Excel 图表 EMF 样本，本地跑 emf-converter 渲染，与 Word 原图目视对比；
3. 在 Vercel 构建容器（当前实际生效形态，见 1.4 节）验证 @napi-rs/canvas 安装与 shim 行为；
4. 上述验证通过后，再走 `openspec/changes/handle-x-emf-img` 变更流程落地实施（该目录当前为空，待启动）。

## 5. 风险与注意事项

|         风险项          |                                                              说明与对策                                                              |
| :---------------------: | :----------------------------------------------------------------------------------------------------------------------------------: |
|       候选包较新        | emf-converter（2026-03 创建、2026-06 起高频迭代）与 emf-renderer（v0.1.0）均无大规模用户验证，锁精确版本 + 保留占位图兜底 + 抽样目检 |
|       GPL 许可证        |       libemf2svg 系（含 emf-to-png 内嵌 wasm、自建 napi 绑定）为 GPL-2.0，闭源管线需规避静态集成；独立进程 CLI 调用可降低风险        |
|        字体差异         |                         Linux 容器无 Calibri 等微软字体，文字度量会漂移，需 fontFamilyMap 映射或注册替代字体                         |
|   输出为 PNG 而非矢量   |                                emf-converter 输出光栅；矢量 SVG 路线在 EMF+ 维度上生态为空，暂不可得                                 |
| Vercel 形态的体积与时长 |                                若走 LibreOffice 备选，冷构建 +2–4 分钟、约 1.5GB 临时磁盘，需评估缓存                                |

## 6. 结论速览

1. **处理位置**：`scripts/build-doc-in-vercel/transformers.ts` 的 `docx2html()` 内 mammoth 图片回调，`unsupportedFormats` 黑名单命中即返回 OSS 占位图（`transformers.ts:220`）。
2. **当年纯 Node 不行的原因**：sharp/libvips 无 EMF 解码器且无支持计划；浏览器不渲染 `image/x-emf` 使 base64 内嵌失败；EMF 是 GDI/GDI+ 命令流，实现渲染器等于重写一个 GDI 引擎，而 2025 年 npm 生态没有任何 EMF/EMF+ 渲染实现。
3. **Rust 行不行**：现阶段不行——没有成熟 crate（emf-core/emfsdk 均为 2026 年 WIP），绑定 libemf2svg 性价比低且受 GPL 约束，质量瓶颈在上游；建议 6–12 个月后复评 emfsdk。
4. **纯 Node 还行不行**：行了——2026 年新库 `emf-converter`（纯 TS、Apache-2.0、完整 EMF+）+ `@napi-rs/canvas`（零系统依赖）组合可在当前实际生效的 Vercel 构建容器与 Windows 本地统一落地，为当前最优解；LibreOffice headless 为质量备选（Vercel 下代价重），Windows GDI+ 仅在改为本地预处理工作流时可用。
5. **运行形态提醒**：经 `turbo.json:50` 核实，`build:doc-in-vercel` 已挂在 `pnpm run build` 依赖链中、`docs/docx` 产物被 gitignore 不入库——转换实际发生在 Vercel 构建容器内，这是选型必须满足的硬约束。
