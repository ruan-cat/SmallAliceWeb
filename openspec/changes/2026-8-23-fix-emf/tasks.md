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
- [ ] 4.6 [部署] `small-alice-web-odse` - 推送 `dev`、确认 CI 后 rebase 到 `main` 触发 Vercel Git 集成，并用可见 Chrome 的 Agent Browser 复测五个用户页面。
- [ ] 4.7 [证据] `openspec/changes/2026-8-23-fix-emf/evidence/2026-08-23-text-layout-regression-verification.md` - 记录 GDI+ 对照、Vercel SHA/日志、五页截图和仍未映射 glyph 的风险。
