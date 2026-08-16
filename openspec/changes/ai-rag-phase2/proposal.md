## Why

二期 AI 化任务（RAG 知识库问答系统）此前由 superpowers 台账（`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md` 与 `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`）管理，台账停更于 2026-08-07，且无法支撑跨 checkpoint 的恢复续跑。本次将该长任务整体迁移到 OpenSpec 长任务体系（do-long-task）：`tasks.md` 成为唯一任务源，规格与设计迁入标准工件链，进度与失败记录固定在 change 根目录的 `agent-progress.md` / `agent-findings.md`，保证后续执行不依赖聊天记忆。

## What Changes

- 新增 OpenSpec change `ai-rag-phase2`，作为二期 AI RAG 长任务的唯一承载：迁移全部设计细节（技术栈选型、模块设计、职责边界、部署契约）与实施进度（已完成模块的验证证据 + 剩余 P0/P1/P2 外部门禁）。
- 新增 6 个能力规格：知识源同步、Hybrid Search、流式问答 API、Chat UI 集成、来源溯源、部署与资源契约。
- 二期系统全貌（由本 change 的规格与任务描述）：`docs/docx` 知识源结构化 chunk 与增量对账；Neon + drizzle + pgvector 数据层；词法 + 向量 Hybrid Search 与 RRF 融合；独立 Nitro API（`/v1/chat`、`/v1/search`、`/v1/knowledge/sync`、`/v1/knowledge/sync-runs`）；前端以 `vue-element-plus-x` 与 `markstream-vue` 为唯一 UI/Markdown 主线，`@ai-sdk/vue` 负责 transport；VitePress 构建期稳定标题锚点支撑来源跳转；Vercel 双项目部署。
- 标记旧 superpowers 台账为已取代（文件保留，顶部标注指向本 change），不再作为任务管理源。
- 本 change 不混入与二期无关的改动；一期 `build-ai-chat-packages` change 已全量完成，其规格保持不变。

## Capabilities

### New Capabilities

- `ai-rag/knowledge-sync`: 知识源同步与文档管理——`docs/docx` Markdown 扫描、结构化 chunk（标题路径/锚点/图片 URL）、内容哈希增量对账、单文档事务替换、同步记录与受控触发。
- `ai-rag/hybrid-search`: Hybrid Search 混合检索——PostgreSQL 词法全文检索 + pgvector 余弦向量检索 + RRF 融合，以及固定评估集对比。
- `ai-rag/chat-api`: 流式问答 API 与运行时装配——`/v1/chat` 检索增强流式回答、zod 输入校验、双凭据鉴权、错误映射与 `503 RAG_NOT_CONFIGURED` 未装配契约。
- `ai-rag/chat-ui`: Chat UI 集成——`Bubble`/`BubbleList`/`Sender` 唯一对话主线、`markstream-vue` 唯一流式 Markdown 主线、`useKnowledgeChat` transport/abort、减少动态效果偏好。
- `ai-rag/source-citation`: 来源溯源——确定性 `headingAnchor`、`sourceUrl`/`sourceHref` 映射、VitePress 构建期锚点注入与来源卡片跳转。
- `ai-rag/deployment`: 部署与资源契约——Vercel 双项目架构（Mode A 产物搬运）、Neon 固定资源标识、官方 `neon` CLI 强制与 `neonctl` 禁止、Corepack 环境变量、生产同步触发（Cron/上游调用）。

### Modified Capabilities

无。一期 `ai-chat-packages` 的规格行为不变。

## Impact

- **任务管理**：`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`、`docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md` 被取代（保留并标注）；`openspec/changes/ai-rag-phase2/*` 成为唯一任务载体。
- **代码包**：`packages/ai-rag-core`（结构化知识准备）、`packages/ai-rag-api`（Nitro API）、`packages/ai-vue` / `ai-vitepress-plugins` / `ai-vue-doc`（消费方与文档站）。
- **文档站**：`docs/.vitepress/config.mts`（`installVitePressHeadingAnchors` 挂接）、`docs/.vitepress/theme/index.ts`（AiChat shell 挂载）、`docs/docx`（唯一知识源，271 份 Markdown）。
- **云资源**：Neon（组织 `org-super-fog-48541962`、项目 `patient-cloud-43432277`、Vercel 关联数据库 `neon-smallalice-ai-rag`）；Vercel 双项目（`small-alice-web-odse` 文档站、`smallalice-docs-ai-nitro-api` Nitro API）。
- **外部门禁**：真实 PostgreSQL 检索、embedding 凭据、模型服务、浏览器回归与部署授权仍属于待办，不由本 change 的迁移动作替代。
