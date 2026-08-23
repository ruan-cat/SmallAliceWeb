<!-- 正在做 -->

# 2026-08-23 任务接力：修复 EMF 矢量图转换的文本丢失

> 本文件是给**执行 agent** 的接力文档。任务来源：`prompts/index.md` 009（用户登记），调研已由上一轮 agent 完成，**修复尚未实施**。

## 1. 任务目标

修复生产站点（drill.ruan-cat.com）docx 转 PNG 时 EMF 图片内嵌文本（尤其中文）丢失/乱码的问题。用户要求不在此前轮次实施，由接手的 agent 完成修复、部署与验收。

## 2. 必须先读的上下文工件

|                           工件                            |                                    用途                                    |
| :-------------------------------------------------------: | :------------------------------------------------------------------------: |
|      `reports/2026-08-23-emf-text-loss-research.md`       |                      根因分析（三因量化 + 实验证据）                       |
|      `reports/2026-08-23-emf-text-loss-solution.md`       |                   **推荐方案 A 与实施清单（按此执行）**                    |
| `openspec/specs/docx-build/emf-image-conversion/spec.md`  | 主 spec（EMF 转换行为契约，本任务在其上补充文本质量要求时可走新增 change） |
|  `openspec/changes/archive/2026-08-23-handle-x-emf-img/`  |     上一任务全量工件（design/findings/evidence，了解已有实现细节与坑）     |
|        `scripts/build-doc-in-vercel/emf/fonts.ts`         |                     待修改的字体映射模块（当前 12 键）                     |
| `scripts/build-doc-in-vercel/emf/assets/fonts/README.md`  |                   字体子集化重出流程（§1.3 含变体表坑）                    |
|                  `prompts/index.md` 009                   |                            任务原文 + 用户截图                             |
| 主 spec 之外可参考：`design.md §3.4/§6`（归档 change 内） |                           字体策略与测试设计原案                           |

## 3. 已完成的调研结论（接手即可用，勿重复调研）

1. **根因 1（P0）**：382 个 EMF 实测字体名中「**黑体 4147 次**」（最高频）、Tahoma 108、Franklin Gothic Book 57、Segoe UI 12 均不在 `fontFamilyMap`（当前 12 键）。`emf-converter` 的 `mapFontFamily` 未命中时原样使用 faceName，容器内 skia 回退默认字体（无 CJK）→ **整段中文丢失**；
2. **根因 2（P0）**：EMF 正文出现 821 个不同汉字，当前子集字体 cmap 568 项，**446 字（54.3%）缺字形** → 豆腐块/空白；
3. **根因 3（流程）**：Windows 本地 skia 可回退系统字体（DengXian 实验中本地正常），容器无系统字体 → **本地"正常"≠容器正常，验收必须看部署产物**。
4. 实验目录：`C:\Users\pc\AppData\Local\Temp\emf-text-exp\*.png`（a1/a2/b1-b4/c1）可复现（脚本已清理，可按 solution 文档说明重写）。

## 4. 实施步骤（from solution.md §4，简述）

1. **重出字体资产**：提取 EMF 文本全集（记录 84 偏移 32 起 UTF-16LE + EMF+ DrawString 字串）→ fontTools 子集化 NotoSansSC → 断言 `text_chars ⊆ cmap` 零缺字 → 替换 `assets/fonts/NotoSansSC-Regular.ttf`（目标 ≤600KB，更新 README 资产说明）；
2. **fonts.ts**：`fontFamilyMap` 补「黑体/simhei/tahoma/franklin gothic book/segoe ui」等键；实现 A1（GlobalFonts 别名注册，先实测 napi 同文件多别名是否可行）或 A2（动态/静态全量映射清单）兜底；
3. **本地验证**：vitest（fonts 用例扩展：黑体键、回退不抛错）+ 本地管线基线（不作为容器验收）；
4. **部署验收（权威）**：按项目既定流程 `git commit`（分门别类）→ push dev（CI）→ fast-forward main（Vercel 生产）→ 抽查 009 截图对应图 + ≥5 张中文字本（黑体/宋体/微软雅黑样本）逐一与 Word 原图对比，结论写入 evidence；
5. **收尾**：`prompts/index.md` 009 标记完成；建议按 004 模式补 openspec change 工件（可选，若走 spec 流程则基于主 spec 新增文本质量要求）；更新 README §5 已知限制文字。

## 5. 关键纪律（本仓库约定）

- 开发在 `dev` 分支；部署触发方式：dev push（CI）→ `git push origin dev:main`（Vercel Git 集成生产部署）；**不要用 `pnpm run deploy-vercel`**；
- git 提交：用 git-commit 技能分门别类、commitlint 预校验；`.gitattributes` 已含 `*.ttf/*.emf/*.wmf/*.bin` binary 规则（无需再改）；`docs/docx`、`drill-docx`、`pnpm-lock.yaml` 均被 gitignore（依赖以 lock 文件内容核对）；
- 验证必须 tsx 直跑 `pnpm run build:doc-in-vercel`（turbo inputs 不含 drill-docx，`pnpm run build` 可能命中缓存跳过转换）；
- 容器内验收别信本地像素：用部署后站点图片；
- 若改动了 emf 模块行为，记得同步 `emf/` 内 JSDoc 注释与归档 change 的 design.md 无必要（已归档），但**主 spec** 可走新 change 增量更新。

## 6. 完成定义（Definition of Done）

- [ ] 字体资产重出且 `text_chars ⊆ cmap` 断言通过（零缺字）
- [ ] fontFamilyMap 覆盖全部实测 faceName；未映射名有兜底（A1 或 A2 实测生效）
- [ ] vitest 全绿（含新增字体用例）；本地管线零失败
- [ ] 生产部署后：009 截图对应图片与 ≥5 张中文字样本目视通过（无整段空白/豆腐块），对比结论与截图入 evidence
- [ ] CI（ubuntu）成功且 `EMF/WMF 转换统计: 成功 N 失败 0`
- [ ] prompts/index.md 009 标记完成；本接力文档标注"已完成"或归档处理
