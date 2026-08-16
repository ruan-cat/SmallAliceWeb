# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-16
- Change：`ai-rag-phase2`
- 当前阶段：执行 superpowers → OpenSpec 永久迁移收尾，等待分支级 diff / 路径 / blob SHA 自检后关闭迁移任务。
- 唯一任务源：`openspec/changes/ai-rag-phase2/tasks.md`。
- 当前业务待办入口仍为 `tasks.md` §2.1.1；工件迁移不得改变 PostgreSQL、embedding、模型、生产浏览器或部署回归的外部门禁状态。

## 2. 本轮迁移动作

- 将旧 design 原 blob `4514e5c1abe6659d6c6d6a78a4d7c9c36834b8d8` 迁入 `history/2026-07-29-ai-rag-phase2-design.superpowers.md`。
- 将旧 plan 原 blob `58471a612223ff40e8197b129fbd08c4f1d6a00f` 迁入 `history/2026-07-29-ai-rag-phase2-plan.superpowers.md`。
- 新增 `history/2026-08-16-superpowers-migration.md`，记录字节级历史保全、语义映射、纠偏关系和完成门禁。
- 重写 `proposal.md` / `design.md` / `tasks.md` 的迁移权威性说明，使当前工件完全独立于原 `docs/superpowers` 路径。
- 删除两个旧 `docs/superpowers` 文件路径。

## 3. 状态保护

- 6 份 `specs/ai-rag/*/spec.md` 的行为权威性保持不变，本轮不虚构新增业务完成状态。
- 已完成基线仍是结构化知识、API 离线合同、Chat UI/transport、VitePress 来源锚点、部署基础、runtime assembly。
- P0/P1/P2 与 M1-M4 的未完成状态保持；历史快照中的复选框不参与判断。
- Neon 命名继续区分 project `neon-smallalice-ai-rag` 与 database `neondb`。

## 4. 待执行自检

迁移任务 0.1 只有在以下分支级验证完成后才能勾选：

1. `history/*.superpowers.md` 的 blob SHA 与原文件 SHA 完全相同。
2. 两个原 `docs/superpowers/...` 路径已不存在。
3. 与 `dev` 的 changed files 只包含 OpenSpec 工件和两个旧文件删除。
4. diff 未把任何 P0/P1/P2 或 M1-M4 错误升级为完成。
5. PR 复核确认没有重新建立第二套可执行任务源。

本 cloud connector 会话无法直接运行本地 `openspec validate ... --strict` CLI；不得把首轮迁移曾有的 strict validate 记录冒充本轮 fresh validation。本轮将使用 GitHub tree/diff/blob/path 证据完成迁移层自检；后续有本地 CLI 环境时可再补 fresh strict validation。
