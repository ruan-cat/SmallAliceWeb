## Why

二期 AI 化任务（RAG 知识库问答系统）最初由 superpowers 设计/计划台账管理，但该形式无法作为 do-long-task 跨 checkpoint 的稳定事实源。二期已经迁入 OpenSpec：`openspec/changes/ai-rag-phase2` 负责承载意图、设计、行为规格、唯一任务源、进度与风险。本次迁移收尾进一步取消对 `docs/superpowers` 原路径的依赖，把两份旧工件的原始 blob 完整保存到本 change 的 `history/`，并永久删除旧路径。

## What Changes

- OpenSpec change `ai-rag-phase2` 是二期 AI RAG 长任务的唯一承载；`tasks.md` 是唯一可执行任务源。
- 旧 superpowers 设计/计划的**完整原始内容**以相同 Git blob SHA 保存到：
  - `history/2026-07-29-ai-rag-phase2-design.superpowers.md`
  - `history/2026-07-29-ai-rag-phase2-plan.superpowers.md`
- `history/2026-08-16-superpowers-migration.md` 记录原路径、blob SHA、语义映射、纠偏关系和完成门禁。历史快照只作证据，不具有任务状态权威性。
- 永久删除：
  - `docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`
  - `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`
- 6 个能力规格继续作为行为事实源：知识源同步、Hybrid Search、流式问答 API、Chat UI、来源溯源、部署与资源契约。
- 二期系统全貌保持不变：`docs/docx` 结构化知识准备与增量对账；Neon + drizzle + pgvector；PostgreSQL 词法检索 + 向量检索 + 标准 RRF；独立 Nitro v3 API；Element Plus X + `markstream-vue` + `@ai-sdk/vue`；VitePress 稳定来源锚点；Vercel 双项目部署。
- 迁移动作只收敛任务工件，不把历史文字中的未验证状态升级为已完成；真实 PostgreSQL、embedding、模型和生产回归仍以 `tasks.md` 的未完成项为准。

## Capabilities

### New Capabilities

- `ai-rag/knowledge-sync`: `docs/docx` Markdown 扫描、结构化 chunk、内容哈希增量对账、单文档事务替换、同步记录与受控触发。
- `ai-rag/hybrid-search`: PostgreSQL 词法全文检索 + pgvector 余弦向量检索 + 标准 RRF，以及固定评估集对比。
- `ai-rag/chat-api`: `/v1/chat`、`/v1/search` 与知识同步相关路由的流式响应、zod 校验、错误映射和运行时装配合同。
- `ai-rag/chat-ui`: `Bubble` / `BubbleList` / `Sender` 唯一对话主线、`markstream-vue` 唯一流式 Markdown 主线、`@ai-sdk/vue` transport/abort 与减少动态效果策略。
- `ai-rag/source-citation`: 确定性 `headingAnchor`、VitePress 构建期锚点、`sourceUrl#headingAnchor` 来源跳转。
- `ai-rag/deployment`: Vercel 双项目、固定 Neon 资源、官方 `neon` CLI、Corepack 与生产同步触发契约。

### Modified Capabilities

无。一期 `ai-chat-packages` 行为规格不因本次工件迁移改变。

## Impact

- **任务管理**：只允许读取 `openspec/changes/ai-rag-phase2/tasks.md` 判断当前完成状态。`history/*.superpowers.md` 中任何 `- [ ]` / `- [x]` 都只是迁移前文本。
- **迁移可追溯性**：历史快照与原文件复用相同 blob SHA，因此删除旧路径不会丢失任何原始设计、计划、代码草图、更新记录或验收文字。
- **代码包**：`packages/ai-rag-core`、`packages/ai-rag-api`、`packages/ai-vue`、`packages/ai-vitepress-plugins`、`ai-vue-doc`；本次不修改业务代码。
- **文档站**：`docs/docx` 仍是唯一知识源；VitePress 来源锚点行为不变。
- **云资源**：Neon 组织 `org-super-fog-48541962`、项目 `patient-cloud-43432277`、项目名 `neon-smallalice-ai-rag`，实际业务数据库 `neondb`；Vercel 项目为 `small-alice-web-odse` 与 `smallalice-docs-ai-nitro-api`。
- **外部门禁**：真实 PostgreSQL/embedding/模型/生产浏览器与部署回归不因文档迁移自动完成。
