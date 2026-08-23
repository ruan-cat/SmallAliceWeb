# handle-x-emf-img 发现与风险

## 1. 当前权威性

- 调研事实源是 `reports/2026-08-22-docx-x-emf-conversion-research.md`（经复核代理纠错定稿）；本 change 的行为契约在 `specs/docx-build/emf-image-conversion/spec.md`，技术决策在 `design.md`，任务在 `tasks.md`。
- x-emf 跳过逻辑的历史位置：`scripts/build-doc-in-vercel/transformers.ts:220` 黑名单 `["x-emf", "gif", "wmf", "emf"]` → `utils.ts:181` 的 `errorImgUrl` 占位图。
- 运行形态事实：`turbo.json:50` 将 `//#build:doc-in-vercel` 挂在 `//#docs:build:run` 的 dependsOn；`.gitignore:56` 忽略 `docs/docx`——转换发生在 Vercel 构建容器内，产物不入库。**任何依赖 Windows 本地能力或系统级安装的方案默认不可用。**

## 2. 关键调研结论（决策依据）

- 当年纯 Node 失败三根因：sharp/libvips 无 EMF 解码器且无支持计划；浏览器不渲染 `image/x-emf` base64 data URI（commit `9792f47` 注释为证）；2025 年 npm 生态无 EMF/EMF+ 渲染实现。
- `emf-converter`（纯 TS、Apache-2.0、完整 EMF+ 记录集实现，2026 年新包）+ `@napi-rs/canvas`（Skia、零系统依赖、预编译二进制，当前 v1.0.7）是满足容器约束的唯一轻量路线；**该组合无公开先例，属首次落地**（2026-08-23 源码级复查确认 shim 依赖面封闭可控）。
- `emf-converter` 真实 API（dist 产物源码 grep + Node 22 实测，2026-08-23 二次复核修正）：导出为 `convertEmfToDataUrl(buffer: ArrayBuffer, options?): Promise<string | null>` 与 `convertWmfToDataUrl`；无 PNG Buffer 入口、**失败返回 null 不抛错**（封装层必须 null→throw）；options 为 `maxWidth/maxHeight/dpiScale(1-4)/maxCanvasDimension(8192)/maxRecords/fontFamilyMap`（键必须小写，源码 `map?.[face.toLowerCase().trim()]`）；输出经 instanceof 分派（OffscreenCanvas→convertToBlob+FileReader / HTMLCanvasElement→toDataURL）。
- **shim 依赖面最终结论（4 个全局）**：`document.createElement`、`HTMLCanvasElement`（prototype hack）、`createImageBitmap`（loadImage + **Proxy 附加 no-op close()**——emf-converter 在 drawImage 后调用 `bitmap.close()`，napi Image 无此方法）、`ImageData`（挂 @napi-rs/canvas 导出类——DIB 位图解码主路径 `new ImageData(...)`，Node 22 无原生全局）。不需要 FileReader/DOMMatrix/Path2D/OffscreenCanvas。**教训：外部 API 调研结论必须以 dist 产物源码 grep 实测为准，README 级调研会被推翻（首轮调研漏报 ImageData 与 close()，二次复核实测抓出）。**
- 已知渲染限制（可接受）：输出为光栅 PNG；ROP2 位运算近似、渐变不平铺、texture brush 退化；字体度量取决于宿主 Canvas 引擎。
- 量级数据：drill-docx 182 个 docx/doc 源 → 271 个 md 产物；占位图出现于 113 个文件共 405 处（EMF 转换量级上限）。

## 3. 已知风险与约束（2026-08-23 执行前隐患排查后扩充）

|                       风险                        |                                                                                                                                                                   约束/对策                                                                                                                                                                    |
| :-----------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|         `emf-converter` 较新且组合无先例          |                                                                                                                                     锁精确版本（当前 `2.0.2`，禁 `^`）；保留占位图兜底；抽样目检进验证门禁                                                                                                                                     |
|                   shim 设计定型                   |                                                               **必须走 HTMLCanvasElement/document 路径**，补 **4 个全局**（`document.createElement`/`HTMLCanvasElement`/`createImageBitmap`(含 no-op close())/`ImageData`）；不需要 FileReader/DOMMatrix/Path2D/OffscreenCanvas                                                                |
|              **中文字体容器内缺失**               |                                                                                                    Vercel AL2023 无任何中文字体；MUST 随包携带 OFL 字体（子集化）+ `GlobalFonts.registerFromPath` + `fontFamilyMap` 小写键；注册失败仅 warn                                                                                                    |
| pnpm `onlyBuiltDependencies` 不含 @napi-rs/canvas |                                                                                                                   该包无 install 脚本（registry 实证）理论不受影响；安装后核对 "Ignored build scripts" 警告，出现则补白名单                                                                                                                    |
|               EMF 全量失败构建绿灯                |                                                                                                     errorFiles 只打印不落盘、不影响退出码（transformers.ts:263; index.ts:341,352）；新增成功/失败计数并入报告；CI 关注 `图片处理失败` 突增                                                                                                     |
|                `.x-emf` 扩展名陷阱                |                                                                                                                  `split("/")[1]` 直接拼进 imageName（transformers.ts:212）；EMF 分支 MUST 显式 `.png`（仿 L252 replace 先例）                                                                                                                  |
|                     内存叠加                      |                                                                                                      base64 中转约 2.3 倍 × 405 张量级 × CI 5120MB（本地经验 8192MB，峰值主要来自 Nuxt prerender）；保持 `--concurrency=1`；试点实测峰值                                                                                                       |
|                   turbo 缓存坑                    |                                                                                                              `build:doc-in-vercel` 的 turbo inputs 不含 `drill-docx/**`；验证 MUST 直跑 `pnpm run build:doc-in-vercel` 绕过 turbo                                                                                                              |
|                     CI 影响面                     |                                                                                                      ci.yaml 在 ubuntu 完整跑 clone+转换+vitepress+Nuxt 冒烟（NODE_OPTIONS 5120MB）；本地样本与 GitHub 仓库可能不一致，目视结论不外推容器                                                                                                      |
|          `.vercel/` 指向 nitro API 项目           |                                                                                                                       容器验证走 `pnpm run deploy-vercel`（docs 项目）或 Git 集成，禁用当前 `.vercel/project.json` 凭据                                                                                                                        |
|                    vitest 基建                    | 测试落点已定 **B 方案：build-doc-in-vercel 升级为 workspace 子包**（先例 `scripts/decompress-porn-img-package/`；`scripts/*` 本就在 pnpm workspace packages 内），vitest/emf-converter/@napi-rs/canvas 进子包 devDependencies；**`index.ts:363` import 即执行 `main()`，测试禁止 import index.ts**；`imageTypesSet` 为模块级单例，跨用例需清理 |
|                     序号空洞                      |                                                                                                                     `imageCounter++`（L215）先于黑名单检查（L221）；转换失败回退占位图时序号占用、文件缺失属既有行为，不修                                                                                                                     |
|           `pnpm-lock.yaml` 被 gitignore           |                                                                                                                                                依赖解析以 lock 文件内容核对，不以 Git diff 为证                                                                                                                                                |
|       napi 原型链不可变（2026-08-23 实测）        |                                                           `Object.setPrototypeOf(Canvas.prototype, X)` 静默不生效（原型链 `CanvasElement → Object` 不可变）；shim 改用 `Object.defineProperty(HTMLCanvasElement, Symbol.hasInstance, { value: c => c instanceof Canvas })`，实测通过                                                           |
|       napi 原生类型检查（2026-08-23 实测）        |                                               `ctx.drawImage` 仅接受 CanvasElement/SVGCanvas/Image，Proxy 包装的 Image 抛 TypeError；且 emf-converter 的 deferred image 绘制包在 try/catch 中会**静默吞掉**该错误（只 warn 不中断）——shim 必须直接给 Image 实例挂 `close` 属性，禁止 Proxy 包装                                                |
|     emf-converter 容错语义（2026-08-23 实测）     |                                                                                record 流截断（保留头部）仍输出残片 PNG 不抛错；只有头部魔数非法/canvas 不可用/导出失败才返回 null——「截断输入」不是 throw 用例，测试断言按实测调整（design §6.3 用例 4 已同步）                                                                                |
| drill-docx 全库 100% EMF+（2026-08-23 全量统计）  |                                                                                           382 个 EMF 全部含 `EMF+` 签名，零经典 EMF、零 WMF；fixtures 的 `classic.emf` 实为 EMF+ dual，WMF fixture 为手工构造（evidence/2026-08-23-emf-sampling.md）                                                                                           |
|               PNG IHDR 宽高为大端序               |                                                                                                                              读 PNG 尺寸断言用 `readUInt32BE(16)/(20)`；vitest 首轮误用 LE 导致 3355443200 假失败                                                                                                                              |
|             Windows Git Bash 探针纪律             |                                                                                     `node -e`/`tsx -e` 多行脚本的 console.log 输出会被吞；shell cwd 会跨命令持久化（cd 进子包后相对路径重复）。探针一律写临时 .cjs/.ts 文件执行后删除，并显式 cd 回仓库根                                                                                      |

## 4. 禁止重复路径（调研已否决，不得再走）

- **libemf2svg 全家族**（C 库、npm `emf-to-png` 的 WASM、draw.io 内嵌 emf-svg.js）：EMF+ 记录支持率为 0%，EMF+ dual 只出经典层退化结果；GPL-2.0 传染（MIT 标注 + 内嵌 GPL wasm 属许可证冲突）。
- **shim 走 OffscreenCanvas 路径**：@napi-rs/canvas 的 `convertToBlob` 参数名是 `mime`，emf-converter 传 `{ type: 'image/png' }`，契约不成立（依赖 napi fallback 才能碰巧正确）；且需 FileReader polyfill（Node 22 无）。MUST 走 HTMLCanvasElement 路径。
- **Rust 现有 crate**（`emf-core` 0.1.0 WIP / `emfsdk` 预览级无 SVG）：不到生产可用度，6–12 个月后复评。
- **Rust 绑定 libemf2svg**（当年 FIXME 设想）：收益已被 WASM 包覆盖，GPL 静态链接传染，质量瓶颈在上游。
- **LibreOffice headless / Inkscape CLI**：容器内安装重（RPM 解压、冷构建 +2–4 分钟 / AL2023 无包）；Inkscape 质量全面劣于 LibreOffice。仅在主方案实测不合格时由用户决策升级为工作流级备选。
- **ImageMagick + libwmf**：libwmf 只支持 WMF；ImageMagick 的 EMF delegate 仅 Windows 构建可用，Linux 报 decoder not found。
- **node-canvas（Automattic）**：Node 22 有构建失败记录（#2448），系统依赖重，排除；备选只在 skia-canvas 中考虑。
- **Windows GDI+ PowerShell 预处理**：需把 `docs/docx` 移出 gitignore 的工作流变更，非本 change 范围。
- **云 API（CloudConvert 等）**：密钥管理、文件出内网、外部确定性依赖、持续费用。

## 5. 待办入口

- 试点批次执行：见 `tasks.md` 试点批次章节（4 项）。
- 实施前若 `emf-converter` 已发布新版本，允许升级到新精确版本，但须在 `agent-findings.md` 本节记录版本变化与理由。
- 剩余主体任务：本地管线验证（evidence/2026-08-23-local-pipeline.md）、Vercel 容器验证（evidence/2026-08-23-vercel-build.md）、目视对比（evidence/2026-08-23-visual-check.md）、CI 自检（合入 dev 后）、收尾门禁。
- **2026-08-23 完成态**：21/21 任务完成。部署与 CI 验证结论：Vercel 生产部署 READY（drill.ruan-cat.com）、CI ubuntu 403/403 EMF 零失败；容器内 `[emf-converter] Unhandled EMR record type: 90` 为库跳过个别记录（转换仍成功），若目视复核发现该类样本质量不合格，作为库升级/追加记录的追踪项。人工目视复核待办见 visual-check.md §5。
