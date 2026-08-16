# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-16
- Change：`ai-rag-phase2`
- 当前状态：superpowers → OpenSpec 永久迁移已完成并通过 GitHub 分支级自检；迁移治理任务 `tasks.md` 0.1 已可关闭。
- 唯一任务源：`openspec/changes/ai-rag-phase2/tasks.md`。
- 下一业务入口：`tasks.md` §2.1.1（真实 PostgreSQL lexical + pgvector provider）。真实 PostgreSQL、embedding、模型、生产浏览器和部署回归状态没有因本轮文档迁移发生改变。

## 2. 永久迁移结果

- 原 `docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md` 已从工作分支删除；GitHub contents API 返回 404。
- 原 `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md` 已从工作分支删除；GitHub contents API 返回 404。
- design 历史快照迁入 `history/2026-07-29-ai-rag-phase2-design.superpowers.md`，blob SHA 仍为 `4514e5c1abe6659d6c6d6a78a4d7c9c36834b8d8`。
- plan 历史快照迁入 `history/2026-07-29-ai-rag-phase2-plan.superpowers.md`，blob SHA 仍为 `58471a612223ff40e8197b129fbd08c4f1d6a00f`。
- GitHub compare 将二者识别为 rename，均为 `0 additions / 0 deletions`，证明历史内容未发生字节级重写。
- `history/2026-08-16-superpowers-migration.md` 已建立原路径、blob、OpenSpec 新路径、语义映射和纠偏规则。
- `proposal.md`、`design.md`、`tasks.md` 已重建为不依赖旧路径的当前事实源；6 份 specs 保持行为权威性且本轮未修改。

## 3. 自检结论

相对 `dev` 的第一阶段 compare 只有 8 个迁移相关文件：

1. `proposal.md`
2. `design.md`
3. `tasks.md`
4. `agent-progress.md`
5. `agent-findings.md`
6. 两个历史 snapshot rename
7. 一个 migration manifest

没有业务源码、测试、数据库 migration 或部署配置变更。P0/P1/P2 与 M1-M4 保持原有未完成语义；旧快照复选框没有反向污染当前状态。

本 cloud connector 会话没有本地工作树/CLI，因此本轮没有伪造 fresh `openspec validate ai-rag-phase2 --strict` 结果。首轮迁移已有 strict validate 历史记录；本轮新变更采用 GitHub tree、compare、blob SHA 与路径 404 完成迁移层验证。后续在本地 OpenSpec CLI 环境可补一次 fresh strict validation。

## 4. 继续执行规则

- 后续只从 `tasks.md` 读取下一项，不得恢复 `docs/superpowers` 两条旧路径。
- 历史原文只从 `history/*.superpowers.md` 审计，不得重新勾选其中任务。
- 新发现工作先进入 `tasks.md`；失败与禁止重复路径进入 `agent-findings.md`。
- 任何外部能力只有拿到自身真实证据后才允许勾选完成。
