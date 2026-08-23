# handle-x-emf-img 任务清单

> 唯一可执行任务源：本文件。执行纪律遵循 do-long-task（小步推进、验证后勾选、动态补全先回写本文件并跑 `openspec validate handle-x-emf-img --strict`）。
> 证据落点约定：各阶段验证证据（命令、输出摘要、目检结论）写入本 change 的 `evidence/YYYY-MM-DD-*.md`，禁止散放 change 根目录。
> 行为契约见 `specs/docx-build/emf-image-conversion/spec.md`，技术决策见 `design.md`，背景见 `proposal.md` 与 `reports/2026-08-22-docx-x-emf-conversion-research.md`。

## 试点批次（Pilot Batch）

> 目的：在不触碰任何现有文件主链路的前提下，验证 `emf-converter` + `@napi-rs/canvas` 技术路线在真实 drill-docx 样本上可行（尤其 EMF+ dual 图表样本），再接入主管线。
> 完成标准：本地对至少 5 个真实 EMF 样本（至少 1 个为 EMF+ dual / Excel 图表来源）转换出非空 PNG，目视无空白、无整图错位；证据写入 `evidence/`。

- [ ] [新增] `scripts/build-doc-in-vercel/package.json` - 将 build-doc-in-vercel 声明为 pnpm workspace 子包（`scripts/*` 本就在 `pnpm-workspace.yaml` packages 内，无需改 workspace 配置）：`private: true`、name 对齐先例 scope 惯例（如 `@ruan-cat-temp/build-doc-in-vercel`）、不带 main/exports（tsx 直跑文件路径）；devDependencies 三项：`emf-converter`（锁精确版本 `2.0.2`，禁 `^`）、`@napi-rs/canvas`（当前 `1.0.7`）、`vitest`；`scripts.test` 为 `vitest run`；安装后核对 `pnpm-lock.yaml` 记录了子包依赖及平台二进制（win32-x64-msvc / linux-x64-gnu），并确认安装输出无 "Ignored build scripts" 警告（lock 被 gitignore，须以文件内容为证）
- [ ] [新增] `scripts/build-doc-in-vercel/emf/canvas-shim.ts` - 按 `design.md` 3.1 走 **HTMLCanvasElement/document 路径**（禁止注入 OffscreenCanvas：`convertToBlob` 参数名 `mime` 与库传入的 `type` 契约不符，且需 FileReader polyfill）：补 **4 个全局**——`document.createElement` 映射 `createCanvas(1,1)`、`HTMLCanvasElement` 空类 + `Object.setPrototypeOf(Canvas.prototype, HTMLCanvasElement.prototype)` 使 instanceof 分派成立、`createImageBitmap` 用 `loadImage` 实现并 **Proxy 包装附加 no-op `close()`**（emf-converter 在 drawImage 后调用 `bitmap.close()`，napi Image 无此方法）、`ImageData` 直接挂 @napi-rs/canvas 导出类（DIB 位图解码主路径 `new ImageData(...)`，Node 22 无原生全局）；安装幂等，模块加载时自动执行一次
- [ ] [新增] `scripts/build-doc-in-vercel/emf/convert.ts` - 对齐 emf-converter 真实 API（`convertEmfToDataUrl(ArrayBuffer): Promise<dataURL|null>`，无 PNG Buffer 入口、失败返回 null 不抛错）：封装 `convertEmfToPng(buffer): Promise<Buffer>` 含 Buffer→ArrayBuffer 转换、EMF/WMF 魔数分流（EMF 头 `0x00000001` / placeable WMF `0x9AC6D7`）到对应入口、null→显式 throw、dataURL→PNG Buffer 并校验 `\x89PNG` 魔数；`maxWidth`/`maxHeight` 默认 1024，不做兜底决策
- [ ] [新增] `scripts/build-doc-in-vercel/emf/poc.ts` - 创建 PoC CLI 脚本（tsx 运行）：入参为本地 `.emf` 文件路径与输出 `.png` 路径，调用 `convertEmfToPng` 完成单文件转换，用于试点目视验证与后续样本排查

## 主体任务（Main Tasks）

> 在试点批次验证通过后执行。验证顺序：先抽样统计与字体/测试基建，再接入 `transformers.ts` 主链路，最后容器级验证。

- [ ] [新增] `openspec/changes/handle-x-emf-img/evidence/YYYY-MM-DD-emf-sampling.md` - 从 `drill-docx/` 全量 docx 抽样统计：EMF 图片总量、EMF+ / dual / 经典 EMF 占比（可用 `emf-to-png` 的 `inspect()` 或自写魔数检测），承载调研报告 4.3 节步骤 1 的证据，并为试点与回归选样提供依据
- [ ] [新增] `scripts/build-doc-in-vercel/emf/assets/fonts/` - 放置随包携带的 OFL 授权中文字体文件（推荐 NotoSansSC/思源黑体，优先子集化控制体积并在文件头注释来源与许可证），供 Vercel 容器内注册（容器无任何中文字体，缺失则文字必然豆腐块）
- [ ] [新增] `scripts/build-doc-in-vercel/emf/fonts.ts` - 创建字体模块：初始化时 `GlobalFonts.registerFromPath` 注册 `assets/fonts/` 内字体（失败仅 `consola.warn` 不中断），导出 `fontFamilyMap`（键全部小写，至少覆盖 `simsun`/`宋体`/`calibri`/`cambria` → 注册字体别名）
- [ ] [新增] `scripts/build-doc-in-vercel/tests/fixtures/` - 按 `design.md` 6.2 fixture 清单放置样本：`classic.emf`（含 frame 头改写的 oversize 变体）、`emfplus-dual.emf`（须含位图记录）、`classic.wmf`、`text-sample.emf`（内嵌中文文字，drill-docx 抽取脱敏）与 `broken-trunc.emf`、`garbage.bin`、`not-emf.png`（构造负例），单文件 ≤ 100KB
- [ ] [新增] `scripts/build-doc-in-vercel/vitest.config.ts` - 子包内测试配置，参照 `packages/ai-rag-api/vitest.config.ts` 形态：`environment: "node"`、`include: ["tests/**/*.test.ts"]`
- [ ] [新增] `scripts/build-doc-in-vercel/tests/emf-converter.test.ts` - 按 `design.md` 6.3 用例矩阵实现 `describe("convertEmfToPng 转换封装")` 的 10 条用例（经典 EMF/EMF+ dual/WMF 正例、截断/随机字节/PNG 魔数/空 buffer 负例、超大尺寸钳制、maxWidth 限制、字体映射 smoke）；禁止 import `index.ts`
- [ ] [新增] `scripts/build-doc-in-vercel/tests/canvas-shim.test.ts` - 按 `design.md` 6.3 实现 `describe("canvas-shim 全局适配")` 的 7 条用例（createElement 可用、幂等、instanceof 分派、createImageBitmap 消费 Blob 且带 close()、无 OffscreenCanvas 全局、toDataURL 前缀、ImageData 全局可构造）
- [ ] [新增] `scripts/build-doc-in-vercel/tests/fonts.test.ts` - 按 `design.md` 6.3 实现 `describe("字体注册与映射")` 的 3 条用例（键全小写、必备映射覆盖、资产在位且注册失败不中断）
- [ ] [修改] `scripts/build-doc-in-vercel/transformers.ts` - 在 `docx2html()` 的 `convertImage` 回调中拆分 `unsupportedFormats` 黑名单：`x-emf`/`emf`/`wmf` 改为调用 `convertEmfToPng`，成功后**显式以 `.png` 扩展名落盘**（不得沿用现有 `imageName` 拼接——`split("/")[1]` 会产出 `.x-emf` 扩展名，仿照 L252 的 replace 先例）到 `docs/docx/images/{文档名}/` 并返回相对 `src`，异常时 `consola.warn` + 记入 `errorFilesPath` + 返回 `errorImgUrl`；`gif` 行为不变；新增 EMF/WMF 转换成功/失败计数器并入现有输出报告（现有 `imageTypesSet` 无失败通道且黑名单格式被排除在统计外）；`imageCounter` 递增位置不动（序号空洞属既有行为）
- [ ] [修改] `prompts/build-by-node-in-vercel.prompt.md` - 更新「不处理特定格式的图片」章节：从清单中移除 `x-emf`（`emf`/`wmf` 本不在现有清单内），仅保留 `gif` 维持不处理，避免历史规范文档误导后续代理
- [ ] [新增] `openspec/changes/handle-x-emf-img/evidence/YYYY-MM-DD-local-pipeline.md` - 本地管线级验证证据：**直接跑 `pnpm run build:doc-in-vercel`（tsx 直跑，禁用 `pnpm run build`——turbo inputs 不含 drill-docx 可能命中缓存跳过转换）**，核对 `docs/docx/**/*.md` 中原占位图位置变为 `.png` 扩展名的相对链接、EMF 转换成功/失败计数输出正确、构建无中断、序号空洞属预期，记录命令与输出摘要
- [ ] [新增] `openspec/changes/handle-x-emf-img/evidence/YYYY-MM-DD-vercel-build.md` - Vercel 容器级验证证据：走 `pnpm run deploy-vercel`（docs 项目 `small-alice-web-odse`）或 Git 集成触发真实构建（**不得使用 `.vercel/project.json` 当前凭据——其指向 nitro API 项目**），核对构建日志含 EMF 转换统计、中文字体渲染无豆腐块、无系统依赖缺失报错、构建时长与内存增长可接受，记录部署 URL 与日志摘要
- [ ] [新增] `openspec/changes/handle-x-emf-img/evidence/YYYY-MM-DD-visual-check.md` - 目视对比证据：抽取至少 5 张转换后 PNG 与 Word 原图对比（样本注明来源，本地 drill-docx 与 GitHub 仓库样本可能不一致），记录文字（重点中文）、图表、颜色三类要素的渲染质量结论与遗留瑕疵清单
- [ ] [新增] `openspec/changes/handle-x-emf-img/evidence/YYYY-MM-DD-ci-check.md` - CI 自检证据：任务合入 dev 后核对 `.github/workflows/ci.yaml` 的 ubuntu 构建日志（该 CI 完整执行 clone+docx 转换+vitepress+Nuxt 冒烟，`NODE_OPTIONS` 为 5120MB），记录构建时长、内存表现与 `图片处理失败` 条目数量

## 收尾门禁

> 以下全部满足后本 change 才允许进入 verify/archive 流程。

- [ ] 上述任务全部勾选完成，且 `openspec validate handle-x-emf-img --strict` 通过
- [ ] `agent-progress.md` 已更新最终 checkpoint，`agent-findings.md` 已沉淀本变更期间的失败索引与禁止重复路径
- [ ] `reports/2026-08-22-docx-x-emf-conversion-research.md` 中「实施前验证步骤」（报告 4.3 节）四步均有对应证据文件
