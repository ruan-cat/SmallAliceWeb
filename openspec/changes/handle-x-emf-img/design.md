# handle-x-emf-img 技术设计

> 调研依据：`reports/2026-08-22-docx-x-emf-conversion-research.md`（2026-08-22 定稿，经复核代理纠错）。本文只记录决策与约束，不重复调研全文。

## 1. 背景与硬约束

- EMF（Enhanced Metafile）是 Windows GDI/GDI+ 绘图命令流，非位图；转换等于在目标平台重放 GDI 绘图语义。
- 本项目 docx 源（drill-docx）中的 EMF 多来自 Excel 图表/Word 公式，主流形态是 **EMF+ 或 EMF+ dual**——「是否支持 EMF+ 记录集」是方案质量分水岭。
- **运行形态硬约束**：`turbo.json:50` 把 `//#build:doc-in-vercel` 挂在 `//#docs:build:run` 的 `dependsOn`；`.gitignore:56` 忽略 `docs/docx`。转换实际发生在 Vercel 构建容器（Amazon Linux 2023、无 GUI、无系统级包管理自由度）内，因此方案 MUST 零系统依赖、仅靠 `pnpm install` 生效。
- 当年（2025-02）失败根因：sharp/libvips 无 EMF 解码器且无支持计划；浏览器不渲染 `image/x-emf` base64 data URI；npm 生态当时无 EMF/EMF+ 渲染实现。

## 2. 选型决策

### 2.1 主方案：emf-converter + @napi-rs/canvas

|    维度     |                                                     说明                                                     |
| :---------: | :----------------------------------------------------------------------------------------------------------: |
|  转换内核   |       `emf-converter`（纯 TS、零依赖、Apache-2.0）：解析 EMF/WMF/EMF+ 记录流重放到 Canvas 2D，输出 PNG       |
| Canvas 实现 | `@napi-rs/canvas`（Skia 后端）：预编译 N-API 多平台二进制、零系统依赖、无 postinstall，与 sharp 同级安装体验 |
|  EMF+ 支持  | 源码核实为完整一等实现（对象/状态/绘制/文本图像/画刷/路径/位图/重放模块各配测试），这是 Excel 图表场景的关键 |
| 双端一致性  |                        Windows 本地与 Vercel 容器同一套代码，仅 shim 层适配 Node 全局                        |
|  已知限制   |  输出为 PNG 光栅（非矢量 SVG）；ROP2 位运算近似、渐变不平铺、texture brush 退化；字体度量取决于宿主 Canvas   |

安装约束：`emf-converter` 锁定精确版本（不用 `^` 前缀），`@napi-rs/canvas` 可用常规 semver 范围。

### 2.2 否决的备选路线（不可重复走）

|                              路线                              |                                                                      否决理由                                                                      |
| :------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------: |
| libemf2svg 系（C 库 / WASM / draw.io 移植 / npm `emf-to-png`） | EMF+ 记录支持率为 0%（上游 issue #12 自 2017 年开放至今），EMF+ dual 只能渲染经典层退化结果；GPL-2.0 传染（MIT 标注 + 内嵌 GPL wasm 属许可证冲突） |
|            Rust 现有 crate（`emf-core` / `emfsdk`）            |                         均为 2026 年 WIP（0.1.0/0.2.0、预览级、无 SVG 输出）；自写完整渲染器以人月计；建议 6–12 个月后复评                         |
|            Rust 绑定 libemf2svg（当年 FIXME 设想）             |                                收益已被 WASM 包覆盖；1–2 周交叉编译矩阵工程；GPL 静态链接传染；质量瓶颈在上游 C 库                                 |
|                      LibreOffice headless                      |    开源质量最佳但容器内需 RPM 解压 + `LD_LIBRARY_PATH`，冷构建 +2–4 分钟、约 1.5GB 临时磁盘；仅在主方案实测质量不合格时作为工作流级备选重新评估    |
|                          Inkscape CLI                          |                                    EMF+ 渐变未完整实现、丢元素/字距错位，质量全面劣于 LibreOffice；AL2023 无包                                     |
|                      ImageMagick + libwmf                      |                           libwmf 只支持 WMF；ImageMagick 的 EMF delegate 仅 Windows 构建可用，Linux 报 decoder not found                           |
|                   Windows GDI+（PowerShell）                   |               保真度天花板但进不了 Linux 容器；需把 `docs/docx` 移出 gitignore 改为本地预处理工作流，属工作流变更，非本 change 范围                |
|                   云 API（CloudConvert 等）                    |                                                   密钥管理、文件出内网、外部确定性依赖、持续费用                                                   |

## 3. 模块设计

新增 `scripts/build-doc-in-vercel/emf/` 模块，全部为新增文件，不动现有文件的公共入口。以下 API 事实均经 emf-converter v2.0.2 与 @napi-rs/canvas v1.0.7 源码核实（2026-08-23 执行前复查）。

```plain
scripts/build-doc-in-vercel/
├── package.json            # workspace 子包声明（B 方案，先例 decompress-porn-img-package）
│                           # devDeps: emf-converter(锁版本)/@napi-rs/canvas/vitest；scripts.test
├── emf/
│   ├── canvas-shim.ts   # Node 环境浏览器全局适配（走 HTMLCanvasElement 路径，幂等）
│   ├── convert.ts       # convertEmfToPng(buffer): Promise<Buffer> 封装（EMF/WMF 分流）
│   ├── fonts.ts         # 字体注册（GlobalFonts.registerFromPath）+ fontFamilyMap 映射
│   ├── poc.ts           # 试点用 PoC CLI（单文件转换，目视验证）
│   └── assets/fonts/    # 随包携带的中文字体文件（OFL 授权，优先子集化）
├── vitest.config.ts          # 子包测试配置：node env + tests/**/*.test.ts
└── tests/
    ├── fixtures/                    # 从 drill-docx 抽取脱敏的真实 EMF 样本 + 构造负例
    ├── emf-converter.test.ts        # convertEmfToPng 用例矩阵
    ├── canvas-shim.test.ts          # shim 全局适配用例矩阵
    └── fonts.test.ts                # 字体注册与映射用例矩阵
```

### 3.1 canvas-shim.ts 设计要点（源码级结论）

emf-converter 的 canvas 获取优先级是全局 `OffscreenCanvas` → `document.createElement('canvas')`，且输出导出用 **`instanceof` 分派**（`canvas instanceof OffscreenCanvas` → `convertToBlob`；`canvas instanceof HTMLCanvasElement` → 同步 `toDataURL`）。**shim 必须走 HTMLCanvasElement/document 路径**，不得注入 `OffscreenCanvas`，原因：

1. @napi-rs/canvas 的 `convertToBlob` 参数名是 `mime`，而 emf-converter 传的是 `{ type: 'image/png' }`——依赖 napi 层的 fallback 行为（`options?.mime || 'image/png'`）才能得到正确 mime，契约上不成立；
2. OffscreenCanvas 路径还需要 FileReader polyfill（Node 22 无原生 FileReader）；
3. napi Canvas 原生具备同步 `toDataURL('image/png')`，与 HTML 分支完全吻合；不注入 OffscreenCanvas 全局时，emf-converter 的 `typeof OffscreenCanvas !== 'undefined'` 检查安全短路（typeof 对未声明变量不抛 ReferenceError）。

shim 只需补 **4 个全局**（emf-converter 运行时全局依赖面经 dist 产物源码 grep + Node 22 实测复核，不需要 FileReader/DOMMatrix/Path2D/OffscreenCanvas——Blob/atob/TextDecoder Node 22 原生已有）：

|           全局           |                                                                                                                                                                                                                        实现方式                                                                                                                                                                                                                         |
| :----------------------: | :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| `document.createElement` |                                                                                                                                                                                         映射到 `createCanvas(1, 1)`（emf-converter 拿到后自行赋 width/height）                                                                                                                                                                                          |
|   `HTMLCanvasElement`    |                                                                                    空类 + **`Object.defineProperty(HTMLCanvasElement, Symbol.hasInstance, { value: (c) => c instanceof Canvas })`** 使 instanceof 分派成立（2026-08-23 试点实测修正：`Object.setPrototypeOf(Canvas.prototype, ...)` 对 napi 内部原型 `CanvasElement → Object` 静默不生效，禁止再用）                                                                                    |
|   `createImageBitmap`    | `async (blob) => { const img = await loadImage(Buffer.from(await blob.arrayBuffer())); (img as any).close = () => {}; return img; }`——**直接给实例挂 no-op `close()`，禁止 Proxy 包装**（2026-08-23 测试实测修正）：napi `drawImage` 对参数做原生类型检查（仅接受 CanvasElement/SVGCanvas/Image），Proxy 包装会被拒绝抛 TypeError，且 emf-converter 的 deferred image 绘制包在 try/catch 中会静默吞掉该错误导致位图不绘制；实例挂属性不影响原生类型判定 |
|       `ImageData`        |                                                                                                                            直接挂 @napi-rs/canvas 导出的 `ImageData` 类——emf-converter 的 DIB 位图解码主路径调用 `new ImageData(...)`（含位图记录的经典层/EMF+ dual 样本必经），Node 22 无此原生全局，缺失即 ReferenceError                                                                                                                             |

shim 安装必须幂等（重复调用无副作用、引用不漂移），并在模块加载时自动执行一次。

### 3.2 convert.ts 设计要点（对齐 emf-converter 真实 API）

emf-converter 的真实导出是 `convertEmfToDataUrl(buffer: ArrayBuffer, options?): Promise<string | null>` 与 `convertWmfToDataUrl(...)`，**没有 PNG Buffer 直出入口，失败时返回 null 而不抛错**。封装层职责：

- 入参 `Buffer` → `ArrayBuffer` 转换（`buffer.buffer.slice(byteOffset, byteOffset + byteLength)`）；
- **EMF/WMF 分流**：contentType 或魔数判定后分别调用 `convertEmfToDataUrl` / `convertWmfToDataUrl`（EMF 头首 4 字节为 record type `0x00000001`；placeable WMF 魔数为 `0x9AC6D7` 前缀）；
- **null → throw**：返回 null（无效文件或 canvas 不可用）时抛出显式错误，交由 `transformers.ts` 调用侧走占位图兜底；
- dataURL → PNG `Buffer`（`Buffer.from(dataUrl.split(',')[1], 'base64')`），输出前校验 PNG 魔数 `\x89PNG`；
- 尺寸选项：默认按 EMF 头物理尺寸渲染（`dpiScale` 默认 1，库自身 clamp 1–4），`maxWidth`/`maxHeight` 上限取 1024（与现有 sharp 压缩语义衔接），`maxCanvasDimension` 用库默认 8192；
- 失败语义：封装层向上抛出异常（含 null 转换），自身不做兜底决策，保持单一职责。

### 3.3 transformers.ts 接入方式

`docx2html()` 的 `convertImage` 回调中，将 `unsupportedFormats` 黑名单拆分：

- `x-emf` / `emf` / `wmf` → 调用 `convertEmfToPng()`，成功后**显式生成 `.png` 扩展名落盘**（不得沿用现有 `imageName` 拼接——`split("/")[1]` 会产出 `.x-emf` 扩展名文件；仿照现有 L252 的 `imageName.replace(/\.[^.]+$/, ".png")` 先例）、返回相对 `src`；异常时 `consola.warn` + 记入错误清单 + 返回 `errorImgUrl`；
- `gif` → 维持现状（占位图），本 change 不改其行为；
- 统计：现有 `imageTypesSet` 只记成功类型且为模块级单例；新增 EMF/WMF 转换「成功/失败」计数器并入输出报告（`index.ts` 的 `outputProcessReport` 消费链），弥补「失败只打印、构建绿灯」的静默问题；
- 序号语义保持现状：`imageCounter++` 先于黑名单检查，转换失败回退占位图时序号被占用、文件缺失属既有行为（sharp 失败同样如此），不改动递增位置。

### 3.4 字体策略（升级：容器内注册字体是硬需求）

drill-docx 为中文文档项目，EMF 内嵌文本几乎必然使用中文/Office 字体（宋体、Calibri 等）。**Windows 本地由系统字体解析，Vercel AL2023 构建容器没有任何中文字体**——不随包注册字体，容器内文字必然渲染为空白/豆腐块。因此：

- `emf/assets/fonts/` 引入 OFL 授权中文字体文件（推荐 NotoSansSC/思源黑体，**优先子集化控制体积**，全量约 10MB 级，子集后可压到 MB 级以内）；
- `fonts.ts` 在初始化时 `GlobalFonts.registerFromPath(fontPath, alias)`，并导出 `fontFamilyMap`（键必须小写，如 `{ simsun: "NotoSansSC", "宋体": "NotoSansSC", calibri: "NotoSansSC", cambria: "NotoSansSC" }`）传入转换 options；
- 字体缺失或映射不全只影响该图片文字渲染质量，不构成构建失败；
- `GlobalFonts` 注册失败（文件缺失）必须 `consola.warn` 并继续，不得中断构建。

## 4. 风险与对策（执行前隐患排查结论，2026-08-23）

|                                                 风险                                                  |                                                                   对策                                                                   |
| :---------------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------: |
|                    emf-converter + @napi-rs/canvas 组合**无公开先例**（首次落地）                     |                              shim 依赖面已源码级穷举（3 个全局）；试点批次先在本地跑通真实样本再接入主管线                               |
|                                     中文字体容器内缺失（豆腐块）                                      |             随包携带 OFL 字体（子集化）+ `GlobalFonts.registerFromPath` + `fontFamilyMap` 小写键映射；注册失败只 warn 不中断             |
|                 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 不含 @napi-rs/canvas                 |      该包无 install 脚本（registry 实证），理论不受 pnpm 10 拦截影响；安装后核对 "Ignored build scripts" 警告，出现则补白名单并重装      |
|                    EMF 全量失败时构建绿灯（errorFiles 只打印不落盘、不影响退出码）                    |                  新增成功/失败计数并入 `outputProcessReport`；evidence 记录失败数；CI 日志关注 `图片处理失败` 条目突增                   |
| 内存叠加：base64 中转约 2.3 倍放大 × 405 张量级上限 × CI `--max-old-space-size=5120`（本地经验 8192） |                                    试点实测峰值；保持 `--concurrency=1` 串行；Vercel/CI 真实日志验收                                     |
|                             turbo 缓存不含 `drill-docx/**`（inputs 缺失）                             |                验证一律直接跑 `pnpm run build:doc-in-vercel`（tsx 直跑绕过 turbo），不得用 `pnpm run build` 验证转换行为                 |
|                  CI 影响面：ci.yaml 在 ubuntu 完整跑 clone+转换+vitepress+Nuxt 冒烟                   |                   合入 dev 后核对 CI 日志；本地 drill-docx（手工拷贝）与 GitHub 仓库样本可能不一致，目视结论不外推容器                   |
|                        `.vercel/` 目录当前指向 nitro API 项目（非 docs 项目）                         |              容器级验证走 `pnpm run deploy-vercel`（small-alice-web-odse）或 Git 集成，不得误用 `.vercel/project.json` 凭据              |
|                                   `index.ts` import 即执行 `main()`                                   | vitest 用例**禁止 import `index.ts`**，只 import `emf/` 模块；`transformers.ts` 顶层仅有模块级 `imageTypesSet`，可安全导入但跨用例需清理 |
|                                  `emf-converter` 较新、无大规模验证                                   |                                          锁精确版本 `2.0.2`；保留占位图兜底；抽样目检进验证门禁                                          |
|                        序号空洞（转换失败时 `imageCounter` 已递增、文件缺失）                         |                             既有行为（sharp 失败同样如此），不改动；evidence 中记录空洞属预期，避免验证误判                              |
|                                     `pnpm-lock.yaml` 被 gitignore                                     |                                             依赖解析以 lock 文件内容核对，不以 Git diff 为证                                             |

## 5. 验证策略

1. **试点（本地）**：从 `drill-docx/` 抽取真实 EMF 样本（覆盖经典 EMF 与 EMF+ dual），独立 PoC 脚本转换并目视对比 Word 原图（直接跑 PoC CLI，不经 turbo）；
2. **单测**：vitest 用例按第 6 节测试设计执行（fixture 用脱敏后的真实小样本）；
3. **管线级（本地）**：完整跑 `pnpm run build:doc-in-vercel`（tsx 直跑，**不要用 `pnpm run build`**——turbo inputs 不含 drill-docx 可能命中缓存跳过转换），核对 `docs/docx/**/*.md` 中原占位图位置变为 PNG 链接、无构建中断；
4. **容器级（Vercel）**：走 `pnpm run deploy-vercel`（docs 项目 small-alice-web-odse）或 Git 集成触发真实构建，核对构建日志中 EMF 转换统计与产物链接（历史教训：Vercel 新增依赖必须以真实构建日志验收安装链）；
5. **CI 自检**：合入 dev 后核对 ci.yaml 的 ubuntu 构建日志（NODE_OPTIONS 5120MB 下的内存与时长表现）；
6. 每阶段的证据（命令、输出摘要、目检结论）落盘 `openspec/changes/handle-x-emf-img/evidence/YYYY-MM-DD-*.md`。

## 6. 测试设计（用例矩阵）

### 6.1 测试基建约定

- 运行器 vitest（`import { test, describe } from "vitest"`，`describe` + `test` 结构），用例文件 `*.test.ts`，位于子包 `scripts/build-doc-in-vercel/tests/`（**用户已确认 B 方案：build-doc-in-vercel 升级为 workspace 子包**，先例 `scripts/decompress-porn-img-package/`，vitest 与转换依赖进子包 devDependencies，`scripts.test = "vitest run"`）；
- vitest 配置参照 `packages/ai-rag-api/vitest.config.ts` 形态：`environment: "node"` + `include: ["tests/**/*.test.ts"]`；
- **禁止 import `scripts/build-doc-in-vercel/index.ts`**（import 即执行完整构建）；只 import `emf/` 模块与 `transformers.ts`（后者若被 import，用例间需手动清理模块级 `imageTypesSet`）；
- fixture 一律从 `drill-docx/` 抽取脱敏，单文件 ≤ 100KB。

### 6.2 fixture 清单

|        文件        |                            来源/构造方式                             |                                                   用途                                                   |
| :----------------: | :------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------: |
|   `classic.emf`    |    drill-docx 真实样本（Word 公式类，全库实测 100% 为 EMF+ dual）    |               EMF+ 转换正例；改写头部 bounds/frame 声明尺寸字段得 `oversize` 变体供用例 8                |
| `emfplus-dual.emf` |           drill-docx 真实样本（Excel 图表类，含位图记录）            |                       EMF+ dual 转换正例、`createImageBitmap`/`ImageData` 路径覆盖                       |
|   `classic.wmf`    |    手工构造最小合法 placeable WMF（46 字节，全库无真实 WMF 样本）    |                                               WMF 分流正例                                               |
| `text-sample.emf`  | drill-docx 真实样本（注意\_v3.80 升级说明.docx image3，含 CJK 码点） |                                          用例 10 字体映射 smoke                                          |
| `broken-trunc.emf` |                 真实样本头部 + 主体截断（2048 字节）                 | 截断容忍行为正例（实测：emf-converter 对 record 流截断容错，输出残片 PNG 而非异常；用例 4 按此实测断言） |
|   `garbage.bin`    |                               随机字节                               |                                               非法输入负例                                               |
|   `not-emf.png`    |                            任意 PNG 字节                             |                                                 魔数负例                                                 |

### 6.3 用例矩阵

**`emf-converter.test.ts` — describe("convertEmfToPng 转换封装")：**

|  #  |                              test 用例                              |                                                          断言要点                                                          |
| :-: | :-----------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------: |
|  1  |                     经典 EMF 样本转换为非空 PNG                     |                                      输出以 `\x89PNG` 魔数开头、长度大于阈值、非 null                                      |
|  2  |                    EMF+ dual 样本转换为非空 PNG                     |             同上；不因含 EMF+ 记录输出空白（长度下限）；含位图记录时覆盖 `createImageBitmap`/`ImageData` 路径              |
|  3  |           WMF 样本分流到 `convertWmfToDataUrl` 并输出 PNG           |                                                            同上                                                            |
|  4  |                       截断的 EMF 输入不抛异常                       | `resolves` 且输出合法 PNG（emf-converter 实测对 record 流截断容错，输出残片而非 null；null→throw 语义仍由用例 5/6/7 覆盖） |
|  5  |                        随机字节输入抛出异常                         |                                                     `rejects.toThrow`                                                      |
|  6  |                 PNG 字节（非 EMF 魔数）输入抛出异常                 |                                              `rejects.toThrow`，不产出伪 PNG                                               |
|  7  |                         空 buffer 抛出异常                          |                                                     `rejects.toThrow`                                                      |
|  8  | 超大尺寸样本（frame 头改写变体）被 `maxCanvasDimension` 钳制不崩溃  |                                              正常返回或抛出可控错误，进程不崩                                              |
|  9  |                   `maxWidth`/`maxHeight` 限制生效                   |                                       输出宽度不超过 1024（从 PNG IHDR 读尺寸断言）                                        |
| 10  | fontFamilyMap 含中文字体映射时含文字样本（`text-sample.emf`）不抛错 |                                                smoke 级（像素级断言不可行）                                                |

**`canvas-shim.test.ts` — describe("canvas-shim 全局适配")：**

|  #  |                              test 用例                               |                                               断言要点                                                |
| :-: | :------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------: |
|  1  |          `document.createElement("canvas")` 返回可用 canvas          |                               有 `getContext("2d")`、可赋 width/height                                |
|  2  |                             重复安装幂等                             |                            二次执行不抛错、`globalThis.document` 引用不变                             |
|  3  |                         instanceof 分派成立                          |                      `createCanvas` 产物 `instanceof HTMLCanvasElement` 为 true                       |
|  4  | `createImageBitmap` 消费 Blob 返回可 drawImage 且带 `close()` 的对象 | 有 width/height、可被 5 参数 drawImage、`close()` 为可调用 no-op（emf-converter 在 drawImage 后调用） |
|  5  |                     未注入 OffscreenCanvas 全局                      |                     `typeof OffscreenCanvas === "undefined"`（保证走 HTML 分支）                      |
|  6  |          canvas `toDataURL("image/png")` 输出 dataURL 前缀           |                                       以 `data:image/png` 开头                                        |
|  7  |                     `ImageData` 全局存在且可构造                     |                  `new ImageData(1, 1)` 不抛 ReferenceError（DIB 位图解码主路径依赖）                  |

**`fonts.test.ts` — describe("字体注册与映射")：**

|  #  |          test 用例           |                                   断言要点                                    |
| :-: | :--------------------------: | :---------------------------------------------------------------------------: |
|  1  |   fontFamilyMap 键全部小写   |              遍历断言（emf-converter 契约：键为小写 face-name）               |
|  2  |         必备映射覆盖         |                    至少含 simsun/"宋体"/calibri/cambria 键                    |
|  3  | 字体文件存在且注册函数不抛错 | 检查 `assets/fonts/` 资产在位；注册失败仅 warn（mock 路径缺失场景验证不中断） |

### 6.4 transformers 层验证方式（不进单测）

`docx2html()` 的 `convertImage` 回调由 mammoth 内部驱动、`index.ts` import 即执行，不适合单测；该层的验证走管线级证据：本地 `pnpm run build:doc-in-vercel` 全量跑 + `evidence/` 记录（PNG 链接核对、转换计数输出、`.png` 扩展名正确、失败回退占位图、序号空洞属预期）。

## 7. 非目标

- 不处理 `gif`；不输出矢量 SVG；不改造图片目录结构与命名规则；不引入 LibreOffice/Rust/云 API；不把 `docs/docx` 移出 gitignore（不做本地预处理工作流变更）。
