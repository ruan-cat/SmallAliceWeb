# 2026-08-16 superpowers → OpenSpec 永久迁移清单

## 1. 迁移结论

二期 AI RAG 长任务已经永久迁入 `openspec/changes/ai-rag-phase2`。自本迁移提交起：

- `openspec/changes/ai-rag-phase2/tasks.md` 是**唯一可执行任务源**。
- `proposal.md` 只定义变更动机、范围与能力边界。
- `design.md` 是当前技术决策与被取代方案的规范化事实源。
- `specs/ai-rag/*/spec.md` 是用户可见/系统行为的规范事实源。
- `agent-progress.md` / `agent-findings.md` 只承担 do-long-task checkpoint、证据索引、风险与禁止重复路径。
- 本目录中的 `*.superpowers.md` 是**不可执行、不可回写状态的历史证据快照**；其中的复选框、旧实现草图、旧状态数字均不得覆盖当前 OpenSpec 工件。

原始 `docs/superpowers/...` 两个文件路径在本迁移中永久删除。后续代理不得重新创建这些路径，也不得重新建立第二套 superpowers 任务台账。

## 2. 字节级历史保全

迁移采用 Git blob 复用，而不是摘要重写。下列 OpenSpec 历史文件直接引用原文件的同一个 blob SHA，因此迁移前后的历史快照内容完全一致：

| 原路径（迁移后删除） | 原 blob SHA | OpenSpec 历史快照 |
| --- | --- | --- |
| `docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md` | `4514e5c1abe6659d6c6d6a78a4d7c9c36834b8d8` | `history/2026-07-29-ai-rag-phase2-design.superpowers.md` |
| `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md` | `58471a612223ff40e8197b129fbd08c4f1d6a00f` | `history/2026-07-29-ai-rag-phase2-plan.superpowers.md` |

历史快照顶部仍可能出现“旧文件保留”等迁移前措辞；那是快照本身的一部分。**关于迁移后的文件位置与权威性，以本清单和当前核心 OpenSpec 工件为准。**

## 3. 语义吸收映射

### 旧 design → 当前 OpenSpec

- 背景、学习者定位、作品目标、最终技术栈、学习路径、M1-M4、风险和简历展示验收 → `proposal.md`、`design.md`。
- `docs/docx/**/*.md` 唯一知识源、图片仅 URL 元数据、禁止 OCR/多模态 → `design.md` + `specs/ai-rag/knowledge-sync/spec.md`。
- Element Plus X / `markstream-vue` / `@ai-sdk/vue` 职责边界、减少动态效果、停止生成 → `design.md` + `specs/ai-rag/chat-ui/spec.md`。
- Chunk、稳定 `headingAnchor`、`sourceUrl#headingAnchor` → `design.md` + knowledge-sync/source-citation specs。
- Neon、drizzle、pgvector、官方 `neon` CLI、pooled/non-pooled URL、HNSW/余弦 → `design.md` + deployment/hybrid-search specs。
- Nitro v3 API、流式 Response、zod、错误映射、`503 RAG_NOT_CONFIGURED` → `design.md` + chat-api spec。
- 检索、RRF、评估、ReRank → `design.md` + hybrid-search spec。

### 旧 plan → 当前 OpenSpec

- 已有仓库证据的结构化知识、API 离线合同、UI/transport、VitePress 锚点、部署资源、runtime assembly → `tasks.md` 已完成基线区。
- 真实 PostgreSQL、embedding、增量同步、生产装配、生产浏览器回归 → `tasks.md` P0。
- Shiki、同步触发、真实评估调优、构建/部署回归 → `tasks.md` P1。
- README、30–60 秒演示视频 → `tasks.md` P2。
- Chroma 学习实验因缺仓库证据 → `tasks.md` 历史学习区保持未完成，不得由旧复选框反推完成。
- 旧计划的长篇高频更新记录 → 历史快照保存；当前 checkpoint 只保留在 `agent-progress.md`，关键失败/约束只保留在 `agent-findings.md`。

## 4. 已明确纠偏的旧表述

旧快照与当前工件冲突时，必须采用以下当前规则：

1. Nuxt API 倾向 → **独立 Nitro v3 API**，不引入 Nuxt API/Bun。
2. `x-markdown-vue` → **`markstream-vue@1.0.8`**。
3. “BM25” → **PostgreSQL 词法全文检索**；未经真实评估不得称 BM25。
4. 旧加权/score RRF 草图 → **标准 RRF `1/(k+rank)`，默认 `k=60`**。
5. `conversations/messages/embeddings` 概念草图 → 当前核心持久化 **`documents/chunks/knowledge_sync_runs`**，向量位于 `chunks.embedding`。
6. 数据库 Markdown 阅读器/“展开原文” → **VitePress 静态来源 `sourceUrl#headingAnchor`**。
7. 自动滚动 → `vue-element-plus-x@1.3.98` 上游单消息缺陷下 **固定 `auto-scroll=false`**，重新开启前必须单独复验。
8. `neon-smallalice-ai-rag` 是 Neon **project name**；实际业务 database 为 **`neondb`**。
9. 旧 `16 文件 / 51 用例` 仅为 2026-08-10 点时快照；无 fresh rerun 时不得覆盖当前 OpenSpec 记录的 `15 文件 / 49 用例` 基线。

## 5. 完成门禁

本迁移只有同时满足以下条件才可在 `tasks.md` 标记完成：

- 两个 `history/*.superpowers.md` 与原 blob SHA 完全一致。
- 两个 `docs/superpowers/...` 原路径在工作分支不存在。
- 核心 OpenSpec 工件不再把原路径当作现存任务源或依赖入口。
- `tasks.md` 保持唯一可执行任务源，现有 P0/P1/P2 与 M1-M4 状态没有被历史复选框污染。
- 6 份行为规格保持当前权威性；迁移本身不得虚构 PostgreSQL、embedding、模型或生产回归已经完成。
- Git diff 只包含本次迁移所需的 OpenSpec 文档变更与两个旧文件删除。
