# 二期 AI RAG 任务清单

> **本文件是二期 AI RAG 长任务的唯一任务源**，迁移自 `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`（旧台账停更于 2026-08-07，2026-08-16 迁移并核实；旧台账与旧设计文档保留但不再作为任务管理源）。
>
> - **勾选语义**：`[x]` = 迁移时已有可复核验证证据（旧台账 §5.2/§5.4 + 2026-08-16 代码核实）；`[ ]` = 未完成或等待外部授权。
> - **验证纪律**：只有满足验收标准才勾选完成；本地构建成功不能证明 Neon/Vercel/模型服务可用；外部步骤执行前先记录授权、目标资源、脱敏命令与预期证据。

## 1. 已完成基线任务（迁移时已具备可复核验证证据）

### 1.1. 结构化知识准备

- [x] 1.1 结构化知识准备：Markdown 扫描与结构化 chunk 合同（落地于 `packages/ai-rag-core`）
  - 落地明细：
    - `markdown-chunk.ts`：`targetTokens: 500` / `overlapTokens: 50` / `tableRowsPerChunk: 12` / `profileVersion: "markdown-structure-v1"`；先按 H1/H2/H3 构造语义块（标题进入 `headingPath`），普通段落超限才递归切分并保留 overlap；超长表格按连续行组拆分并重复表头；图片 URL 只进 `imageUrls` 不进 chunk 文本；同一源文件 `chunkIndex` 从 0 连续递增
    - `heading-anchor.ts`：`rag-heading-` 前缀 + SHA-256 base64url 摘要（`sourcePath`、完整 `headingPath`、`headingIndex` 以 `"\u0000"` 分隔拼接）；无标题根块使用 `rag-document-<sourcePath-digest>` 且 `headingIndex: -1`
    - `source-url.ts`：移除 `docs/` 前缀、`.md` → `.html`、逐段 `encodeURIComponent`
    - `rrf.ts`：RRF 融合 `k=60`，非法 k 抛 `RangeError`
    - `vitepress-heading-anchor.ts`：markdown-it 扩展，挂接于 `docs/.vitepress/config.mts`（构建期锚点注入见 1.4）
  - 证据：`pnpm --filter @ruan-cat-drill-doc/ai-rag-core test` 4 文件 15 用例通过、typecheck 通过（对应旧计划任务 1.2）
  - 残余边界：未接入真实语料 embedding 与向量写入
  - 验收标准见 `specs/ai-rag/knowledge-sync/spec.md` 需求 2 与 `specs/ai-rag/source-citation/spec.md` 需求 1

### 1.2. API 离线合同

- [x] 1.2 API 离线合同（`packages/ai-rag-api`）
  - 落地明细：
    - 5 个路由：`chat.post` / `search.post` / `knowledge/sync.post` / `sync.get` / `sync-runs.get`，未装配一律返回 `503 RAG_NOT_CONFIGURED`，不以空结果或 accepted 伪造成功
    - 鉴权双凭据（`auth.ts`）：POST 校验 `NITRO_KNOWLEDGE_SYNC_TOKEN`、GET 校验 `CRON_SECRET`
    - 错误映射：zod → 400、鉴权失败 → 401/403、并发同步 → 409、未预期 → 500，统一 `{success, code, message, data}`，HTTP 状态码必须真实
    - 同步记录 schema：`knowledge_sync_runs` 五计数（扫描/未变化/新增/更新/删除）+ `failedFiles` + 起止时间；`specs/ai-rag/knowledge-sync/spec.md` 需求 4 要求的"写入 chunk 数"字段当前表 schema 尚无，属 2.1.2 实现时的扩展决策点（见 `agent-findings.md` 迁移备注）
    - pgvector migration（`drizzle/0000_ai_rag.sql`）：`CREATE EXTENSION vector`、`documents`/`chunks`/`knowledge_sync_runs` 三表、HNSW `vector_cosine_ops` 索引、`embedding vector(1536)`，云端已执行（见 1.5）
    - Hybrid Search 注入合同（`hybrid-search.ts` + `postgres-search.ts`）：RRF 融合；参数化 `websearch_to_tsquery('simple')` + `<=>` 余弦、executor 注入不建连、1536 维校验
    - 离线评估：`evaluator.ts` + `data/eval-questions.json` 固定 10 题三策略（lexical/vector/hybrid）
    - 只读 CLI：`knowledge:prepare:dry-run` 强制显式 `--dry-run`，实际运行 271 份 Markdown / 5534 chunk / `failedFiles: []`
    - 聊天安全边界：503 `RAG_NOT_CONFIGURED` 四路由统一
  - 证据：`pnpm --filter @ruan-cat-drill-doc/ai-rag-api test` 15 文件 49 用例通过、typecheck 通过、`build:vercel` 通过
  - 残余边界：无真实 PostgreSQL lexical/vector provider 装配、无真实 embedding、无真实同步事务
  - 验收标准见 `specs/ai-rag/chat-api/spec.md` 需求 1-5 与 `specs/ai-rag/hybrid-search/spec.md` 需求 1-4

### 1.3. Chat UI 与 transport

- [x] 1.3 Chat UI 与 transport（本地完成，生产端到端属外部门禁）
  - 落地明细：
    - `AiChat.vue` 真实 import `vue-element-plus-x` 的 `Bubble`/`BubbleList`/`Sender` 与 `markstream-vue` 的 `MarkdownRender`，禁止同职责本地组件
    - 助手正文 `mode="chat"`；默认 `smoothStreaming="auto"` 与 `typewriter`、固定 `fade=false`；`prefers-reduced-motion: reduce` 时关闭正文 typewriter 与淡入动画，但保留内容流、Markdown 解析与 `final` 收敛
    - `external + isResponding` 时提供可见、可访问的"停止生成"按钮（复用 `@ai-sdk/vue` `stop()` 事件链）
    - 来源 footer（`sourceHref`/`label`）
    - `@ai-sdk/vue@1.2.12` 仅装配于 `ai-vitepress-plugins` 的 `useKnowledgeChat`：`useChat` 管理 transport/state/abort、来源帧只传 `{id, label, sourceHref, snippet?}`、每轮请求先清空 SDK `data` 再按新助手消息 ID 隔离来源、`503 RAG_NOT_CONFIGURED` 可展示可关闭
  - 证据：`ai-vue` 4 文件 15 用例、`ai-vitepress-plugins` 3 文件 8 用例（含真实 `useChat` + Node HTTP data-stream 测试）、两包 typecheck/build 通过
  - 残余边界：未验证生产 Nitro server/模型/数据库/生产装配；真实浏览器回归未通过（历史 `agent-browser` Chrome 无法启动，见 2.1.4）
  - 验收标准见 `specs/ai-rag/chat-ui/spec.md` 需求 1-5

### 1.4. 文档站与锚点

- [x] 1.4 文档站与锚点（VitePress 构建期稳定锚点注入）
  - 落地明细：
    - `ai-rag-core` 提供 markdown-it 扩展（`vitepress-heading-anchor.ts`），在 `docs/.vitepress/config.mts` 挂接，构建期以与 chunk 相同的 AST 与 `headingPath`/`headingIndex` 算法为每个 H1/H2/H3 写入稳定 DOM id，不依赖 VitePress 默认 slug
    - `docs/.vitepress/theme/index.ts` 挂载 `AiChatVitePressShell`
    - 完整 `docs:build` 通过：9 successful / 6600 文件 / 退出码 0（须 `NODE_OPTIONS=--max-old-space-size=8192` 串行构建，Windows Nitro prerender 峰值约 7 GiB）
    - `ai-vue-doc` 显式约束 `@ztl-uwu/nuxt-content@2.13.9`、`h3@1.15.11`、`@vueuse/nuxt@14.3.0`（Content API 兼容，修复 `Could not load @vueuse/nuxt` 事故）
  - 残余边界：外部部署回归未执行（Git 集成部署链路已于 08-10 修复，见 2.2.4）
  - 验收标准见 `specs/ai-rag/source-citation/spec.md` 需求 3-4

### 1.5. 部署与资源

- [x] 1.5 部署与资源（Vercel 双项目与 Neon 资源已上线）
  - 落地明细：
    - Vercel 双项目架构：`small-alice-web-odse`（VitePress 文档站）+ `smallalice-docs-ai-nitro-api`（Nitro API），Mode A 产物搬运到仓库根 `.vercel/output`（`--dereference` 实体化 5 个 `.func`）
    - 根 `vercel.json` 已删除（破坏性变更，双项目配置维护在各自云端 Project Settings）；部署前必须 `vercel link --project <name> --yes` 切换单槽绑定
    - Neon migration 云端执行：vector 0.8.0、`documents`/`chunks`/`knowledge_sync_runs` 三表、HNSW 余弦索引（Neon MCP `run_sql` 独立复核）
    - 7 个 `NITRO_*` 环境变量跨 production/preview/development 三环境接线
    - 生产域名 `https://smallalice-docs-ai-nitro-api.ruan-cat.com/` 上线：`GET /v1/knowledge/sync-runs` 返回 200、sync 端点鉴权 401/200 正确
    - `compatibilityDate` 锁定 `2024-09-19`
    - Corepack 事故已修复：三环境 `ENABLE_EXPERIMENTAL_COREPACK=1`，git-push 远程构建链路恢复（构建日志确认 using pnpm v10.29.2）
  - 残余边界：`POST /v1/search` 与 `/v1/chat` 生产返回 500（空库/网关运行时问题，需真实装配后重验，见 2.1.3）
  - 验收标准见 `specs/ai-rag/deployment/spec.md` 需求 1-3、5-6

### 1.6. 运行时装配工厂

- [x] 1.6 运行时装配工厂（旧计划 Task 5，离线 fake provider 边界）
  - 落地明细：
    - `rag-assembly.ts` 提供 `createRagRuntimeContext`：database/embedding/model/sync 四类 provider 显式注入、不读裸 `process.env`、不建连接；缺配置抛 `RagRuntimeNotConfiguredError`（503）、provider 错误映射 `RagRuntimeProviderError`（500），不生成半成品 context
    - `plugins/rag.ts` 装配插件：六项配置门禁（`databaseUrl`/`openaiApiKey`/`chatModel`/`embeddingModel`/`knowledgeSyncToken`/`cronSecret`），模块级单例 + request 钩子挂载 `event.context.rag`
    - `runtime-assembly.test.ts` + 路由真实 Nitro/H3 harness（`chat-http`、`rag-http`，真实 `createApp`/`app.fetch`）
  - 证据：api 全包 49 用例含其内、复核通过（旧台账 2026-08-03）
  - 残余边界：sync provider 仍为离线 fake（`createSync` 硬编码 `{accepted: true, dryRun}`、`syncRuns` 返回 `[]`），未连接真实 PostgreSQL 持久化——这是 2.1 待办要替换的目标
  - 验收标准见 `specs/ai-rag/chat-api/spec.md` 需求 6

## 2. 待办任务（外部门禁，保持未勾选）

> 以下任务均受外部授权/凭据/部署门禁约束。执行前先按顶部"验证纪律"记录授权、目标资源、脱敏命令与预期证据；本地构建成功不构成完成证据。

### 2.1. P0 真实数据链路与生产装配

- [ ] 2.1.1 装配真实 PostgreSQL 词法+向量 provider 到同步与聊天服务（旧 P0 1，对应旧计划任务 2.1）
  - 进入条件：用户明确允许数据库操作，且 Vercel 环境变量已安全拉取
  - 所需证据：脱敏后的 migration、provider 集成测试、目标数据库查询结果
  - 当前状态：等待外部授权
  - 操作步骤（自旧计划任务 2.1 Step 0/0.1/2.2 迁移）：
    - 执行顺序：`pnpm run neon:guard`（守卫失败即停止本任务）→ 用户确认官方 `neon` 已安装并完成认证 → `vercel env pull .env.local --environment=development` → `neon projects get patient-cloud-43432277 --output json` 核对 → `pnpm --filter @ruan-cat-drill-doc/ai-rag-api db:migrate` → `neon psql` 验证 vector 扩展与 HNSW 索引
    - 资源核对命令（官方 `neon`）：`neon projects list --output json`、`neon branches list --project-id <neon-project-id> --output json`、`neon databases list --project-id <neon-project-id> --branch-id <branch-id> --output json`、`neon roles list --project-id <neon-project-id> --branch-id <branch-id> --output json`
    - `neon:guard`：仅 Windows 扫描仓库可执行文件并排除依赖目录、构建产物与守卫自身；Linux/macOS/Vercel 构建环境直接成功
    - 禁止 `neonctl`（含 `--help`/`--version` 等只读检查，Windows CPU 自旋事故路径）及 `npx` 临时替代；代理不得自行安装、认证或读取 CLI 凭据
    - `vercel env pull` 只在本地 `.gitignore` 保护的文件中读取变量，禁止在终端输出、日志、测试快照、报告或 Git 中写入连接串
    - 连接串分工：应用运行使用 pooled URL（通常 `POSTGRES_URL`）；Drizzle migration 只使用非 pooled URL（通常 `POSTGRES_URL_NON_POOLING`）；缺少非 pooled URL 时停止迁移，不能把 pooled URL 冒充 DDL 连接
    - 固定资源：组织 `org-super-fog-48541962`、项目 `patient-cloud-43432277`、Vercel 关联数据库 `neon-smallalice-ai-rag`（项目内实际数据库名为 `neondb`）；不得创建第二个同用途 project 或 database
    - `neon psql` 验证输出只记录扩展名、版本、表与索引名（`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';`、`SELECT indexname FROM pg_indexes WHERE tablename = 'chunks';`），通过后才允许第一次文档同步
    - 词法检索为参数化 `websearch_to_tsquery('simple')` + `ts_rank_cd`：这是 PostgreSQL 词法全文检索，不是 BM25，未经真实中文语料评估验证前不得标注为 BM25
    - 每次实际云端操作留下不含密钥的执行记录（执行时间、已确认认证状态、工作目录、脱敏命令模板、目标 project/branch/database、退出码、验证结果）；异常时记录 PID、父进程、CPU 二次采样与监听端口
  - 验收标准见 `specs/ai-rag/hybrid-search/spec.md` 需求 1-2 与 `specs/ai-rag/deployment/spec.md` 需求 3-4

- [ ] 2.1.2 生成真实 embedding，执行增量对账、单文档事务替换与 PostgreSQL advisory lock（旧 P0 2，对应旧计划任务 3.1 Step 4）
  - 进入条件：已有可用 OpenAI/embedding 凭据及目标数据库
  - 所需证据：同步运行记录、失败文件记录、重复同步不重算的证据
  - 当前状态：等待外部授权
  - 增量对账契约（自旧计划任务 3.1 Step 4 迁移）：
    - 先完整生成本轮文件清单，逐个计算 `contentHash`，与 `documents` 的 `sourcePath`、内容哈希、`profileVersion`、embedding 模型版本比对
    - 新增或变化文件：先切分 + 生成 embedding 并写入临时结果，全部成功后以单文档事务替换旧 chunk；单个文件失败时旧版本保持可检索，并计入同步记录的失败文件列表
    - 未变化文件不重复切分或调用 embedding（作为"重复同步不重算"的证据）
    - 仅当文件清单完整生成且无扫描错误时，才删除本轮缺失的 `sourcePath` 及其 chunk；部分扫描或读取失败时跳过删除阶段
    - 写入 `knowledge_sync_runs`：状态、扫描数、未变化数、新增数、更新数、删除数、失败文件和起止时间
    - 同步入口只扫描 `NITRO_KNOWLEDGE_SOURCE_ROOT` 指向的 `docs/docx` 目录，不得接收客户端传入的 Markdown 内容或文件路径
    - 使用 PostgreSQL advisory lock 拒绝并发同步，不能用仅在单个 Serverless 实例有效的进程内锁
    - embedding 首期固定配置：`provider: "openai"`、`model: "text-embedding-3-small"`、`dimension: 1536`、`batch_size: 100`；维度变更须作为一次迁移与全量重嵌入处理，禁止混写同一 `embedding` 列
  - 验收标准见 `specs/ai-rag/knowledge-sync/spec.md` 需求 3-5

- [ ] 2.1.3 装配生产 `event.context.rag`，把 Hybrid Search 与流服务接入 `/v1/chat` 与 `/v1/search`（旧 P0 3，对应旧计划任务 3.1 Step 6 与设计 3.13）
  - 进入条件：检索 provider、模型配置和部署环境均可用
  - 所需证据：真实端到端流式响应、来源 DTO、503 非装配分支
  - 当前状态：部署基础设施已就绪；sync 为离线 fake、生产 `POST /v1/search` 与 `/v1/chat` 500 待重验（空库/网关运行时问题，非部署问题）
  - 流式问答契约（自旧计划任务 3.1 Step 6 迁移）：
    - 基于检索上下文（Top-5）组装 system prompt；回答为每个观点标注 `[来源N]`，资料不足时说明「根据现有资料无法回答」
    - RAG_PROMPT 固定模板：`你是一个知识库问答助手。请根据以下参考资料回答用户问题。如果参考资料中没有相关信息，请如实说明。` 参考资料：`{context}`，问题：`{question}`，回答要求：1. 基于参考资料如实回答；2. 标注每个观点的来源，格式：[来源 N]；3. 如果资料不足，说明「根据现有资料无法回答」
    - 直接返回 `result.toDataStreamResponse()`（AI SDK 标准流式 Response，data-stream content-type），不得再包装为 JSON，不得在返回该 Response 后改写状态码或响应头
    - zod 校验：`message: z.string().min(1)`、`conversationId: z.string().optional()`，失败返回 400
    - 来源数据帧：`toDataStreamResponse({ data })` 返回 `{id, content（截取前 200 字符）, score, sourcePath, sourceUrl, headingPath, headingIndex, chunkIndex, headingAnchor, imageUrls}`；`sourceUrl` 由 `sourcePath` 派生且不入库
    - 错误映射：zod → 400、鉴权失败 → 401/403、并发同步 → 409、未预期 → 500，HTTP 状态码必须真实
  - 验收标准见 `specs/ai-rag/chat-api/spec.md` 需求 1-5

- [ ] 2.1.4 生产后端驱动的浏览器回归：真实页面流式可见性、点击中止与已接收内容保留
  - 覆盖场景：真实页面流式可见性、点击"停止生成"触发 abort、已接收内容保留且入口消失
  - 状态区分：本地浏览器交互已验证（2026-08-03 系统 Chrome + 受控 fetch 流：首段内容可见、停止按钮出现、AbortSignal 触发、停止后内容保留且按钮消失，旧台账 5.4 有记录）；**生产后端驱动的端到端回归未验证**（历史本地 `agent-browser` Chrome 无法启动为已知障碍，已记录于 `agent-findings`）
  - 验收标准见 `specs/ai-rag/chat-ui/spec.md` 需求 4

### 2.2. P1 验证与回归

- [ ] 2.2.1 验证 `@shikijs/stream` 与 `markstream-vue` 的代码块高亮兼容性（旧 P1，对应旧计划任务 3.2 Step 4）
  - 进入条件：前述 Markdown renderer 已接入，版本与组件 API 已锁定
  - 所需证据：真实 Markdown 表格、未闭合代码块、XSS、长回复与流结束测试；再单独证明 Shiki 适配边界
  - 当前状态：Markdown 本地完成；Shiki 适配未证实，禁止接入
  - 操作细节（含 2026-08-03 spike 结论）：
    - 接入前必须锁定版本并以真实组件 API spike 验证代码块、未闭合代码块、表格、长回复与 XSS 防护；缺任一证据不得宣称兼容或接入
    - spike 结论：`@shikijs/stream@4.4.1` Vue 入口提供 `ShikiStreamRenderer(stream)` 与 `ShikiCachedRenderer(code, lang, theme, highlighter)`；`markstream-vue@1.0.8` 的 `MarkdownRender` 通过 `codeRenderer: 'pre' | 'shiki' | 'monaco'`、`codeBlockStream` 与 `MarkdownCodeBlockNode` 管理代码块；当前没有已证实的 fenced-code 注入点可以直接接收 `@shikijs/stream` 的 renderer/stream，因此不安装、不接入、不宣称兼容
    - 后续优先在锁定版本后验证 `markstream-vue` 自带 `codeRenderer="shiki"` 路径，再决定是否保留独立 `@shikijs/stream`
    - 验证失败时保留 `markstream-vue` 的安全默认渲染（`html-policy="escape"`），不得假定两者兼容
  - 验收标准见 `specs/ai-rag/chat-ui/spec.md` 需求 6

- [ ] 2.2.2 提供 `rag:sync` 与可选 `rag:watch`，并配置生产同步触发（旧 P1，对应旧计划任务 3.1 Step 5）
  - 进入条件：同步服务可连接目标数据库（依赖 2.1.1/2.1.2）
  - 所需证据：本地一次同步、监听变更与受控鉴权触发的日志
  - 当前状态：依赖 P0 同步服务
  - 操作细节（自旧计划任务 3.1 Step 5 迁移）：
    - 开发环境：`pnpm rag:sync` 一次性同步命令；可选 `pnpm rag:watch` 监听 `docs/docx` 后触发同一同步服务
    - 生产环境：上游 DOCX 转换写入 Markdown 后，调用携带 `NITRO_KNOWLEDGE_SYNC_TOKEN` 的 `POST /v1/knowledge/sync`；Vercel Cron 调用 `GET /v1/knowledge/sync` 时由平台注入 `Authorization: Bearer $CRON_SECRET`
    - 鉴权函数必须接受两种受控凭据，不得假定 Cron 可以携带上游的自定义 token
    - 一次性命令、POST 与 Cron 三种触发方式必须复用同一同步服务（同一套切分、哈希与删除语义）
    - 同步频率属于部署配置，不写死在业务代码（由变更频率、Vercel Cron 套餐限制与 embedding 成本共同决定）
  - 验收标准见 `specs/ai-rag/knowledge-sync/spec.md` 需求 5

- [ ] 2.2.3 用真实索引运行评估集并产出调优结果（旧 P1，对应旧计划任务 2.3 与 4.1）
  - 进入条件：词法、向量与 embedding provider 全部可用（依赖 2.1.1/2.1.3）
  - 所需证据：固定题集输出、参数集、命中率与选型理由
  - 当前状态：依赖 P0 检索服务
  - 操作细节（自旧计划任务 2.3/4.1 迁移）：
    - 固定题集：`data/eval-questions.json` 至少 10 个固定问题，每个问题分别以 lexical、vector、hybrid 三策略执行检索
    - 评估输出为 JSON：包含命中率与关键词覆盖率等指标（`pnpm tsx src/scripts/run-eval.ts > docs/eval-results.md`）
    - 参数集：`{chunkSize: 300, overlap: 30, topK: 5}`、`{chunkSize: 500, overlap: 50, topK: 10}`、`{chunkSize: 800, overlap: 100, topK: 15}`，按 hitRate 比较并给出选型理由
    - 默认配置基线（自旧计划任务 4.1 迁移，作为对比参照）：chunk `{chunkSize: 500, overlap: 50, separators: ["\n\n", "\n", "。", "！", "？", ". "]}`；search `{topK: 10, rerankTopK: 5, scoreThreshold: 0.5}`；embedding `{model: "text-embedding-3-small", dimension: 1536, batchSize: 100}`
    - HNSW 近似检索必须与无索引的精确检索对比后，才作为生产默认
  - 验收标准见 `specs/ai-rag/hybrid-search/spec.md` 需求 5

- [ ] 2.2.4 完整 `docs:build` 回归与外部部署回归（旧 P1）
  - 当前状态：当前工作区构建退出码 0、9 successful / 6600 文件（2026-08-03 复验）；Git 集成部署回归（008/009 修复后）未执行
  - 操作细节：
    - 完整构建须 `NODE_OPTIONS=--max-old-space-size=8192` 且串行构建（Windows Nitro prerender 峰值约 7 GiB），不得因短时无输出并行重启或提前终止；完整日志留存于 `.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/`
    - 部署回归进入条件：用户明确授权部署，且生产环境变量、检索 provider 与流服务均已完成装配（依赖 2.1）
    - 部署回归所需证据：脱敏后的部署记录、部署 URL、真实流式问答与来源跳转回归
    - Git 集成部署链路已于 08-10 修复（三环境 `ENABLE_EXPERIMENTAL_COREPACK=1`，构建日志确认 using pnpm v10.29.2），外部部署回归待执行
  - 验收标准见 `specs/ai-rag/deployment/spec.md` 需求 1、6

### 2.3. P2 展示与文档

- [ ] 2.3.1 完善 README（旧 P2，对应旧计划任务 4.2）
  - 内容：功能/技术栈/演示截图；AI 知识库问答系统模板见旧计划任务 4.2；另有旧设计文档 §8.2 简历项目描述模板（AI 知识库问答系统简介 + 技术栈清单）可作为 README 与简历文案参考
    - 核心功能：`docs/docx` 知识源增量同步与同步记录、Hybrid Search 混合检索、流式问答与来源溯源、实时响应与交互
    - 技术栈：Frontend Vue3 + Element Plus X；Backend 独立 Nitro API；Database Neon + pgvector；AI OpenAI + Vercel AI SDK
  - 进入条件：本地端到端功能可演示（依赖 2.1/2.2）

- [ ] 2.3.2 录制并上传 30-60 秒演示视频（旧 P2，对应旧计划任务 4.2 Step 2）
  - 进入条件：本地端到端功能可演示，且用户授权外部上传
  - 所需证据：文档链接、视频地址与可访问性验证
  - 当前状态：视频上传等待用户授权
  - 操作细节：准备 30-60s 功能演示视频，上传至 YouTube/Bilibili

## 3. 历史学习任务（无仓库证据）

> 旧计划第一周的本地学习实验（Chroma 向量库）没有仓库证据，未入库。真实实现以 `ai-rag-core` / `ai-rag-api` 为准；以下任务保持未勾选，不构成 M1 里程碑的完成证据。

### 3.1. Chroma 本地环境搭建与 OpenAI 封装

- [ ] 3.1 Chroma 本地环境搭建与 OpenAI 封装（旧任务 1.1）
  - 范围：`src/lib/chroma.ts`（Chroma 客户端封装）、`src/lib/openai.ts`（OpenAI embedding 封装）、`src/scripts/local-rag-demo.ts`（本地 RAG 演示脚本）
  - 状态：学习实验未入库，无仓库证据
  - 说明：真实扫描/切分已由 `ai-rag-core` 落地并验证（见 1.1）；真实 embedding 边界见 2.1.2

### 3.2. Chroma 全链路检索 demo

- [ ] 3.2 Chroma 全链路检索 demo（旧任务 1.3）
  - 范围：`src/scripts/rag-demo.ts`（全量 `docs/docx` → 结构化 chunk → embedding → 检索 → 带标题段落来源的回答），demo 截图 `docs/screenshots/rag-demo-01.png`
  - 状态：学习实验未入库，无仓库证据
  - 说明：真实扫描/切分已由 `ai-rag-core` 落地并验证（见 1.1）；全量 embedding → 检索 → 回答的真实链路属 2.1 外部门禁

## 4. 里程碑状态（M1-M4）

> 映射旧计划"实施检查清单"。勾选语义与顶部说明块一致：只有满足完成标准且证据可复核才勾选；迁移时已有证据的里程碑才标 `[x]`。

- [ ] M1 最小 RAG 闭环（Chroma demo 无仓库证据）
  - 完成标准：能从文档检索相关内容并回答
  - 交付物：本地 demo 截图（`docs/screenshots/rag-demo-01.png` 未入库）
  - 说明：旧计划 M1 三项中，Chunk 切分实现已由 `ai-rag-core` 落地并验证（见 1.1）；Chroma 本地环境与第一个检索 demo 无仓库证据（见 3.1/3.2）

- [ ] M2 Hybrid Search（离线合同已完成；"可对比效果"依赖真实索引运行，保持未勾选）
  - 完成标准：支持关键词 + 向量混合检索，可对比效果
  - 交付物：评估结果表（未产出，待 2.2.3）
  - 说明：RRF 融合（`rrf.ts`）、词法/向量检索注入合同（`postgres-search.ts`）与固定 10 题三策略评估器已离线落地（见 1.2）；完成标准中的"可对比效果"与交付物"评估结果表"依赖真实索引运行（2.2.3 未勾选），按本文件顶部勾选语义保持 `[ ]`

- [ ] M3 完整问答系统（API 离线合同与本地 UI 完成，真实链路待 2.1）
  - 完成标准：知识源同步 → 检索 → 流式回答 → 来源展示
  - 交付物：可演示作品
  - 说明：Nitro 五路由离线合同、Chat UI 与 transport 本地完成（见 1.2/1.3）；真实同步、检索、模型与生产装配链路待 2.1

- [ ] M4 简历作品集（README/视频待 2.3）
  - 完成标准：完整的项目 README、技术博客或演示视频
  - 交付物：GitHub 仓库
  - 说明：README 完善与演示视频待 2.3
