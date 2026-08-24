## 1. 试点批次（字体名解析闭环）

> 目的：以最小改动验证上游读取字体映射时，已知缺口和未知 faceName 都会落到已注册别名，而不依赖 Skia 系统回退。
> 完成标准：试点测试先复现缺口，再在不修改转换入口的前提下通过 `pnpm --filter @ruan-cat-temp/build-doc-in-vercel test`。

- [x] 1.1 [修改] `scripts/build-doc-in-vercel/tests/fonts.test.ts` - 先新增黑体、Tahoma、Franklin Gothic Book、Segoe UI 与任意未知字体名的映射断言；在实现前记录其失败结果。
- [x] 1.2 [修改] `scripts/build-doc-in-vercel/emf/fonts.ts` - 补齐实测 faceName 的显式小写映射，并实现所有未知字符串键解析至 `NotoSansSC` 的默认映射；使试点断言通过且不改变注册失败仅告警的语义。
- [x] 1.3 [验证] `scripts/build-doc-in-vercel/tests/fonts.test.ts` - 运行子包 Vitest，确认字体名映射、未知 faceName 兜底与现有注册断言全部通过。

## 2. 主体任务（字体资产与字形覆盖）

> 在试点批次通过后执行。目标是使受版本控制的 EMF 正文字符集与随包 TTF 的 cmap 建立可自动验证的闭环。

- [x] 2.1 [新增] `scripts/build-doc-in-vercel/tests/fixtures/emf-text-coverage.txt` - 固化从当前文档集 EMF 记录提取的正文字符集合，并加入 ASCII、数字及中英文常用标点；保持 UTF-8 文本且说明其来源。
- [x] 2.2 [新增] `scripts/build-doc-in-vercel/emf/font-coverage.ts` - 实现仅覆盖 TTF cmap 所需格式的读取工具，导出可供 Vitest 断言字符码点是否存在的接口，不引入运行时或 CI 外部依赖。
- [x] 2.3 [修改] `scripts/build-doc-in-vercel/tests/fonts.test.ts` - 使用字符清单和 cmap 读取工具新增“EMF 正文字符集是字体 cmap 子集”断言；在替换资产前确认测试能暴露现有缺字。
- [x] 2.4 [修改] `scripts/build-doc-in-vercel/emf/assets/fonts/NotoSansSC-Regular.ttf` - 按字符清单与 README 的 FontTools 流程重出固定常规字重子集，保证 cmap 零缺字且文件体积不超过 600KB。
- [x] 2.5 [修改] `scripts/build-doc-in-vercel/emf/assets/fonts/README.md` - 更新字体大小、字形数、字符集来源、零缺字校验方式及后续重出步骤，不保留“仅文件名覆盖”的过期说明。
- [x] 2.6 [验证] `scripts/build-doc-in-vercel/tests/fonts.test.ts` - 运行 `pnpm --filter @ruan-cat-temp/build-doc-in-vercel test`，确认映射、注册、cmap 覆盖及既有 EMF/WMF 转换用例全绿。
- [x] 2.7 [验证] `scripts/build-doc-in-vercel/index.ts` - 直跑 `pnpm run build:doc-in-vercel`，记录 EMF/WMF 转换成功/失败统计；不得以 Turbo 缓存命中的 `pnpm run build` 代替本项。

## 3. 发布与生产验收

- [x] 3.1 [验证] `.gitattributes` - 在提交前确认 `*.ttf`、`*.emf`、`*.wmf` 仍为 binary 属性，并以 `git diff --check` 与属性检查排除字体二进制被文本化的风险。
- [x] 3.2 [验证] `.gitignore` - 确认 `docs/docx`、`drill-docx`、`.vercel` 和 `pnpm-lock.yaml` 的本地生成物仍被忽略，且本变更未误纳入它们。
- [x] 3.3 [提交] `scripts/build-doc-in-vercel/emf/fonts.ts` - 使用 `git-commit` 技能按字体逻辑、二进制资产/测试与 OpenSpec 工件的实际边界审查并创建有意义的 `dev` 提交；仅暂存本 change 关联文件，保留用户已有 `prompts/index.md` 改动。
- [x] 3.4 [部署] `scripts/build-doc-in-vercel/emf/assets/fonts/NotoSansSC-Regular.ttf` - 推送 `dev` 并确认 CI Ubuntu 构建成功后，将同一已验证提交推进 remote `main` 触发 `small-alice-web-odse` 的 Git 集成生产部署；禁止使用 `pnpm run deploy-vercel`。
- [x] 3.5 [新增] `openspec/changes/2026-8-23-fix-emf/evidence/2026-08-23-production-visual-verification.md` - 使用 Vercel 部署信息与 agent-browser 抽查 009 对应图片及至少五张含中文 EMF 文本样本，记录 URL、截图路径、逐项比对结论、CI 统计和未解决风险。
- [x] 3.6 [修改] `prompts/index.md` - 仅在 3.5 的生产视觉证据证明无整段空白和豆腐块后，将 009 标为已完成；若验收失败，保留未完成状态并将失败原因回写到本任务清单。

## 4. 文本布局与 glyph-index 质量回归

- [x] 4.1 [调试] 用户给出的五个生产页面与截图 - 复现图内文本错位、重影和占位符，提取对应 DOCX 内的 EMF 输入并用 Windows GDI+ 生成原图参照。
- [x] 4.2 [测试] `scripts/build-doc-in-vercel/tests/emf-converter.test.ts` - 新增真实 `offDx`、mapping-mode 和 `ETO_GLYPH_INDEX` EMF fixtures；在实现前记录 5→17 次绘制、+25/+46 原点偏差和 glyph `Ċ` 占位的失败结果。
- [x] 4.3 [修改] `patches/emf-converter@2.0.2.patch` - 通过 pnpm patch 补逐字符 advance、mapping-mode 裁剪原点、正确 `lfFaceName` 偏移和 glyph-index 映射消费；在项目转换入口传入已反查的黑体/Calibri 映射。
- [x] 4.4 [验证] `scripts/build-doc-in-vercel` - 运行完整子包 Vitest 和 `pnpm run build:doc-in-vercel`，确认回归测试、全量 EMF/WMF 统计和原始图参照均通过。
- [x] 4.5 [提交] 当前 change 关联文件 - 审查 pnpm patch、测试 fixture、OpenSpec 工件和用户已有 `prompts/index.md` 修改的边界后，创建有意义的 `dev` 提交。
- [x] 4.6 [部署] `small-alice-web-odse` - 推送 `dev`、确认 CI 后 rebase 到 `main` 触发 Vercel Git 集成，并用可见 Chrome 的 Agent Browser 复测五个用户页面。
- [x] 4.7 [证据] `openspec/changes/2026-8-23-fix-emf/evidence/2026-08-23-text-layout-regression-verification.md` - 记录 GDI+ 对照、Vercel SHA/日志、五页截图和仍未映射 glyph 的风险。

## 5. 生产视觉回归纠偏

- [x] 5.1 [调试] 用户生产截图与 Windows GDI+ 原图 - 对照标题、战斗和数据存储图的背景图元、边框和文字坐标，确认重复裁剪或图层重绘的确切来源。
- [x] 5.2 [测试] `scripts/build-doc-in-vercel/tests/emf-converter.test.ts` - 将 mapping-mode 回归断言改为 GDI+ 对照的坐标，并新增图元与文字相对位移门禁；必须先在当前错误实现下失败。
- [x] 5.3 [修改] `patches/emf-converter@2.0.2.patch` - 仅修正已证明的 mapping-mode 坐标变换，避免对 non-mapping EMF、offDx 和 glyph-index 分支造成行为漂移。
- [x] 5.4 [验证] `scripts/build-doc-in-vercel` - 完整子包 Vitest、针对三个真实 fixture 的本地 PNG/GDI+ 对照，以及 Vercel 生产可见 Chrome 原始尺寸复测。

## 6. SVG 双输出 POC 与全量质量门禁

> 追加范围以真实 SVG 图元和 GDI+ 对照为验收，不将“能生成 `.svg` 文件”当作质量结论。PNG 是兼容基线，POC 通过前不得替换默认生产格式。

- [x] 6.1 [工件] `openspec/changes/2026-8-23-fix-emf/{proposal.md,design.md,specs/docx-build/emf-image-conversion/spec.md,tasks.md}` - 记录 SVG POC 的混合矢量边界、PNG 兼容约束、文字轮廓策略、高风险类别和后续默认格式切换门禁；回读并运行 `openspec validate "2026-8-23-fix-emf" --strict`（2026-08-24：Change is valid）。
- [x] 6.2 [测试] `scripts/build-doc-in-vercel/tests/emf-converter.test.ts` - 先新增真实 EMF+、offDx、mapping-mode 与 glyph-index fixture 的 SVG POC 断言：API 不存在时应 RED（2026-08-24：4 个新增用例均以 `convertEmfToSvg is not a function` 失败，既有 25 个测试通过）；通过后必须验证 SVG MIME/根元素/viewBox、可见矢量图元、已映射 glyph，以及拒绝唯一全画布 PNG `<image>`。
- [x] 6.3 [修改] `patches/emf-converter@2.0.2.patch` - 在不改变既有 PNG API 的前提下，新增 SVG 输出 API、SvgCanvas 主画布工厂和 `getContent()` 导出；DIB 与 deferred image 的临时画布保持 Raster Canvas，必要时作为局部 `<image>` 嵌入，不允许整图 PNG 外壳（2026-08-24：`pnpm patch-commit` 已重新安装生成补丁）。
- [x] 6.4 [修改] `scripts/build-doc-in-vercel/emf/{canvas-shim.ts,convert.ts}` - 新增 SVG 专用 shim/封装和 SVG Buffer 校验，保留 PNG shim、PNG 签名校验及 `convertEmfToPng` 原契约；对 SVG 文本使用文字轮廓输出，且保留 fontFamilyMap 与 glyphIndexMap。
- [x] 6.5 [验证] `scripts/build-doc-in-vercel/tests/emf-converter.test.ts` - 完整子包 Vitest 必须同时覆盖 PNG 基线和 SVG POC；逐项核验 17 字 offDx、841×335 frame/首字坐标、glyph `…` 与 EMF+ dual 图元，并记录 RED→GREEN 命令输出（2026-08-24：RED 为 4 个 `convertEmfToSvg is not a function`；GREEN 为 `pnpm --filter @ruan-cat-temp/build-doc-in-vercel test` 29/29 通过）。
- [ ] 6.6 [审计] `scripts/build-doc-in-vercel/emf` - 实现或运行可重复的全量 EMF/WMF 清单，按乱码、错位、重复、裁断、占位符和高风险 record 分类；每个类别至少固定一个真实 fixture 与 Windows GDI+ 参照，审计结果写入 change evidence。
  - [x] 6.6.1 [测试基线] `scripts/build-doc-in-vercel/tests/fixtures/emf-audit-corpus-manifest.json` - 将完整清单复制为转换子包受版本控制的稳定基线；Vitest 禁止读取 `openspec/changes/**/evidence/**`，以保证 change 归档后仍可复跑。
  - [x] 6.6.2 [测试] `scripts/build-doc-in-vercel/tests/emf-audit-corpus.test.ts` - 在显式本地 DOCX 源目录下逐条重新提取媒体，断言相对路径、ZIP entry、字节数、SHA-256 与 record 审计结果匹配基线；缺少目录必须明确失败，不能 skip。
  - [x] 6.6.3 [测试] `scripts/build-doc-in-vercel/tests/emf-audit-corpus.test.ts` - 按 SHA-256 去重转换全量 EMF/WMF，逐项验证 SVG 根元素、viewBox、矢量语义与非全画布 PNG 外壳，并把每个清单引用关联到转换结果；结构通过不得标记视觉类别通过。
  - [x] 6.6.4 [验证] `scripts/build-doc-in-vercel/package.json` - 新增并运行显式本地 `test:audit-corpus` 命令；常规子包 Vitest 保持快速，专用命令输出条目数、去重载荷数、转换结果与仍需 GDI+/Chrome 的风险类别。
  - [x] 6.6.5 [测试] `scripts/build-doc-in-vercel/tests/emf-converter.test.ts` - 固化 `关于地图活动镜头.docx` 的 `word/media/image2.emf` 真实 ROP3 fixture 与 Windows GDI+ 参照；先断言 PNG/SVG 中框体下方的空白带无稀疏点阵并记录 RED。
  - [x] 6.6.6 [修改] `patches/emf-converter@2.0.2.patch` - 仅对相邻、同目标区域且互补的 `SRCAND`/`SRCPAINT` `EMR_STRETCHDIBITS` 跳过 SVG 错误掩膜输出；不修改 PNG 或不含该组合的 DIB 路径，也不把整图降级为 PNG。
  - [x] 6.6.7 [验证] `scripts/build-doc-in-vercel` - 子包 Vitest 同时验证 PNG/SVG 的点阵带消失、GDI+ fixture 几何保持，重跑全量审计并记录未覆盖 ROP3 的风险。
- [ ] 6.7 [视觉验证] 本机 Google Chrome + Agent Browser - 按 `reports/2026-8-24-use-agent-browser/2026-08-24-agent-browser-local-chrome-and-route-incident.md` 先审计本地 SVG POC，再对生产指定三页和覆盖清单抽样逐图截图判读；不得用图片加载统计或全页缩略图替代目标图视口证据。
- [ ] 6.8 [决策] `openspec/changes/2026-8-23-fix-emf/evidence` - 汇总 SVG 与 PNG 相对 GDI+ 的分类结论、未通过类别和生产默认格式决策；只有 6.5 至 6.7 对默认切换无阻断项时，才新增单独任务修改 `transformers.ts` 以 `.svg` 作为默认落盘格式。
- [x] 6.9 [用户授权的默认切换] `scripts/build-doc-in-vercel/transformers.ts` - 按 2026-08-24 用户明确指令，将 EMF/WMF 分支改为调用 `convertEmfToSvg` 并以 `.svg` 落盘；保持 PNG/JPEG/GIF 分支不变。重建本地文档，确认真实 EMF 产物为 SVG，再按 Git Integration 重新发布 Production 并用 Agent Browser 检查生产 SVG 的资源扩展名和目标图布局（`main@54e1532`、`dpl_J6jGa8LpiMchKGri6DMd4ECL6UjW` Ready；目标资源 HTTP `200 image/svg+xml`，目标图视口截图已人工判读）。
