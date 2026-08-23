# handle-x-emf-img 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-23
- Change：`handle-x-emf-img`
- 当前状态：**工件深化完毕且测试落点已定，任务尚未开始执行**（`tasks.md` 0/21 勾选：试点批次 4 + 主体任务 14 + 收尾门禁 3）。
- 本 checkpoint 动作（2026-08-23 续）：用户确认测试落点为 **B 方案——build-doc-in-vercel 升级为 pnpm workspace 子包**（先例 `scripts/decompress-porn-img-package/`）：试点首项任务改为新增子包 `package.json`（emf-converter 锁 2.0.2 + @napi-rs/canvas + vitest 进子包 devDependencies、`scripts.test = "vitest run"`）；原根级 vitest 任务删除；design §3 目录树与 §6.1、agent-findings 已同步。
- 本 checkpoint 动作：执行前隐患排查与测试设计（两个探索代理：仓库内部隐患 15 条 + 外部依赖源码级 API 核实）+ 复核代理 dist 产物实测二次纠错。关键产出：① emf-converter 真实 API 为 `convertEmfToDataUrl(ArrayBuffer): Promise<dataURL|null>`，失败返回 null 不抛错，封装层须 null→throw；② shim 定型为 HTMLCanvasElement/document 路径，**4 个全局**（含 `ImageData`——DIB 位图主路径依赖、`createImageBitmap` 须 Proxy 附加 no-op `close()`——napi Image 无此方法；此两处为首轮调研漏报、复核实测抓出）；③ 中文字体在 Vercel 容器内必须随包注册（新增字体资产任务）；④ design.md 新增 §6 测试设计（3 个测试文件 20 条用例矩阵 + 7 项 fixture 清单）；⑤ tasks.md 补全至 22 项；⑥ 风险与禁止路径回写 agent-findings.md（含元教训：外部 API 结论必须以 dist 产物源码 grep 实测为准）。
- 下一步：执行试点批次首项任务——新增子包 `scripts/build-doc-in-vercel/package.json` 并安装 devDependencies。
- 阻塞点：无。等待用户授权开始执行。

## 2. 继续执行规则

- 唯一任务源是本 change 的 `tasks.md`；行为契约见 `specs/docx-build/emf-image-conversion/spec.md`；技术路线与备选否决记录见 `design.md`。
- 试点批次（4 项）全部通过并落证据后才允许进入主体任务；`transformers.ts` 是唯一被修改的现有主链路文件，不得提前触碰。
- 每完成一个任务立即勾选并更新本文件；发现遗漏任务先回写 `tasks.md` 再继续，随后跑 `openspec validate handle-x-emf-img --strict`。
- 证据文件一律写入本 change 的 `evidence/YYYY-MM-DD-*.md`，不散放 change 根目录。
