# handle-x-emf-img 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-23
- Change：`handle-x-emf-img`
- 当前状态：**14/21 完成**（试点 4 + 统计/字体/测试 7 + 主链路接入 2 + 本地管线 1），`openspec validate --strict` 通过。
- 本 checkpoint 动作：
  - 试点 8/8 真实 EMF+ dual 样本转 PNG 成功（证据 `evidence/2026-08-23-emf-pilot.md`）；
  - 全量统计：382 个 EMF 100% EMF+、零经典/零 WMF（证据 `2026-08-23-emf-sampling.md`）；
  - 字体：NotoSansSC 子集化 199KB/931 字形 + fonts.ts（12 键全小写），napi 注册与中文渲染实测通过；
  - 测试：fixtures 9 项 + vitest.config + 3 文件 20 用例，`pnpm test` 20/20 通过；
  - transformers.ts 接入（gif 维持跳过，EMF/WMF 转 PNG 落盘 + 成功/失败计数入报告）；prompt 文档同步；
  - 本地管线：`pnpm run build:doc-in-vercel` 直跑 exit 0，产物反推 382 进 382 出零失败、零 emf/wmf 扩展名残留（证据 `2026-08-23-local-pipeline.md`）。
- 执行中实测修正（design/findings 已同步）：① napi Canvas 原型不可变 → Symbol.hasInstance；② napi drawImage 原生类型检查 → 禁止 Proxy 改实例挂 close；③ emf-converter 截断容错（残片 PNG 不抛错）；④ PNG IHDR 大端。
- 下一步：任务 16（目视对比证据，自动化部分）→ 任务 15（Vercel 容器验证，需部署授权）→ 任务 17（CI 自检，需合入 dev 后核验）→ 收尾门禁。
- 阻塞点：**Vercel 部署与 git 提交需用户授权**（任务 15/17 前置）；目视抽查建议用户协助人眼复核。

## 2. 继续执行规则

- 唯一任务源是本 change 的 `tasks.md`；行为契约见 `specs/docx-build/emf-image-conversion/spec.md`；技术路线与备选否决记录见 `design.md`。
- 每完成一个任务立即勾选并更新本文件；发现遗漏任务先回写 `tasks.md` 再继续，随后跑 `openspec validate handle-x-emf-img --strict`。
- 证据文件一律写入本 change 的 `evidence/YYYY-MM-DD-*.md`，不散放 change 根目录。
