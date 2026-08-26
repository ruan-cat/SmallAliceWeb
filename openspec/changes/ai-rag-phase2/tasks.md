# 二期 AI RAG 任务清单

> **本文件是 `ai-rag-phase2` 的唯一可执行任务源。**
>
> 2026-08-16 完成 superpowers → OpenSpec 永久迁移：旧 design/plan 的原始 blob 保存于 `history/*.superpowers.md`，原 `docs/superpowers/...` 路径删除。历史快照中的任何复选框都不具有当前任务状态权威性。
>
> - `[x]`：存在可复核完成证据。
> - `[ ]`：未完成、证据不足或等待外部授权。
> - 本地 test/build 不能代替 Neon、数据库、模型、生产浏览器或部署的真实证据。
> - 新发现的工作必须先写入本文件，禁止恢复第二套 superpowers 任务台账。

## 0. 工件迁移治理

- [x] 0.1 [docs] `openspec/changes/ai-rag-phase2/**` - 永久吸收并删除旧 superpowers 二期工件
  - 原始来源：
    - `docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md`
    - `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`
  - 历史保全：原 blob 已以相同 SHA 保存到 `history/2026-07-29-ai-rag-phase2-*.superpowers.md`。
  - 当前语义：设计进入 `design.md`；行为进入 6 份 specs；当前/剩余工作进入本文件；checkpoint 与失败进入 agent 文件。
  - 完成证据：GitHub compare 将两份旧文件识别为 100% rename（0 additions / 0 deletions）；history 新路径 SHA 与原 SHA 完全一致；两个原路径在工作分支均返回 404；相对 `dev` changed files 仅包含 OpenSpec 迁移工件与两次 rename，没有业务代码；P0/P1/P2 与 M1-M4 未被历史复选框污染。
  - 迁移映射：`history/2026-08-16-superpowers-migration.md`。

## 1. 已完成基线

### 1.1 结构化知识准备

- [x] 1.1 [code/test] `packages/ai-rag-core/**` - Markdown 扫描、结构化 chunk、稳定锚点、来源 URL、标准 RRF
  - 默认 chunk：500 tokens / overlap 50 / tableRows 12 / profile `markdown-structure-v1`。
  - 标题锚点：`sourcePath + headingPath + headingIndex` 的 SHA-256 base64url；无标题根块使用文档锚点；`chunkIndex` 连续。
  - 图片只进入 `imageUrls`，不进入文本与 embedding。
  - RRF 当前语义为标准 `1/(k+rank)`、`k=60`，旧加权草图已废弃。
  - 历史证据基线：`ai-rag-core` 4 测试文件 / 15 用例与 typecheck 通过。
  - 残余：未构成真实 embedding/数据库写入证据。

### 1.2 API 离线合同

- [x] 1.2 [code/test] `packages/ai-rag-api/**` - Nitro 路由、错误映射、离线检索/评估/prepare 合同
  - 路由：chat/search/sync POST/sync GET/sync-runs GET。
  - 未装配统一 `503 RAG_NOT_CONFIGURED`，禁止空结果/accepted 假成功。
  - zod 400、鉴权 401/403、并发同步 409、未知 500；HTTP 状态必须真实。
  - PostgreSQL lexical/vector SQL 采用 executor 注入，离线不建真实连接；embedding 维度校验 1024。
  - 固定 10 题 lexical/vector/hybrid 评估器已存在，但未以真实索引运行。
  - `knowledge:prepare:dry-run` 只扫描/切分并输出 JSON，历史实测 271 Markdown / 5534 chunks / `failedFiles: []`，不生成 embedding、不写库。
  - 历史证据基线：`ai-rag-api` 15 测试文件 / 49 用例、typecheck、`build:vercel` 通过。2026-08-10 的 16/51 只作点时快照，未 fresh rerun 前不得覆盖本基线。

### 1.3 Chat UI 与 transport

- [x] 1.3 [code/test] `packages/ai-vue/**`, `packages/ai-vitepress-plugins/**` - Element Plus X + markstream-vue + `@ai-sdk/vue` 本地合同
  - `Bubble` / `BubbleList` / `Sender` 与 `MarkdownRender` 真实 import；禁止同职责本地替代。
  - Markdown：`mode="chat"`、流式 `final`、`smoothStreaming="auto"`、typewriter、`fade=false`；reduced-motion 关闭动画但不关闭内容流。
  - 停止生成复用 SDK `stop()`，生成中存在可访问停止入口并保留已收内容。
  - `useKnowledgeChat` 管 transport/state/abort；来源按新助手消息 ID 隔离。
  - `vue-element-plus-x@1.3.98` 当前固定 `auto-scroll=false`，防单消息上游异常。
  - 历史证据：`ai-vue` 4/15、`ai-vitepress-plugins` 3/8 测试，以及 typecheck/build；本地真实 SDK data-stream/abort 合同已覆盖。
  - 残余：生产后端驱动的浏览器端到端回归仍未完成。

### 1.4 VitePress 来源锚点与文档构建

- [x] 1.4 [code/test/build] `docs/.vitepress/**`, `packages/ai-rag-core/**` - 稳定标题锚点与来源 URL
  - VitePress 构建使用与 chunk 相同的 AST/headingIndex/headingAnchor 算法，不依赖默认 slug。
  - `sourceUrl` 由 `sourcePath` 移除 `docs/`、`.md → .html`、路径段 URL 编码生成。
  - 历史完整 `docs:build`：9 successful、约 6600 产物、退出码 0；Windows 需约 8 GiB Node 堆并串行。
  - `ai-vue-doc` 保留已验证的 Nuxt Content/H3/VueUse 显式依赖兼容矩阵。

### 1.5 部署与 Neon 基础设施

- [x] 1.5 [infra/docs] Vercel + Neon - 已建立双项目、数据库 schema 与基础鉴权
  - Vercel：`small-alice-web-odse` + `smallalice-docs-ai-nitro-api`。
  - Neon：organization `org-super-fog-48541962`；project `patient-cloud-43432277` / name `neon-smallalice-ai-rag`；业务 database `neondb`。
  - migration 历史证据：vector extension、`documents`/`chunks`/`knowledge_sync_runs`、HNSW cosine index 已建立。
  - `ENABLE_EXPERIMENTAL_COREPACK=1` 三环境基线与 Git 集成构建兼容事故已记录。
  - 残余：真实 search/chat 生产闭环仍需 P0 装配后重验；基础设施存在不能替代业务链路完成。

### 1.6 Runtime assembly 离线工厂

- [x] 1.6 [code/test] `packages/ai-rag-api/server/runtime/**`, `server/plugins/rag.ts` - 显式 provider 注入与失败合同
  - 工厂不读裸 `process.env`、import 时不建连接；database/embedding/model/sync 均由 factory 注入。
  - 缺配置保持 503；provider 初始化错误保持 500；不生成半成品 context。
  - 真实 Nitro/H3 内存 harness 覆盖 route 消费装配 context。
  - 残余：sync provider 仍有离线 fake 边界，必须由 2.1.2 替换。

## 2. 待办任务

### 2.1 P0：真实数据链路与生产装配

#### 2.1.0 1024 维契约迁移试点

- [x] 2.1.0a [code/db/test] `packages/ai-rag-api/server/db/schema.ts`, `packages/ai-rag-api/drizzle/**`, `packages/ai-rag-api/server/search/postgres-search.ts` - 将 embedding schema、pgvector 检索常量与校验从 1536 切换为 1024；migration 必须删除并重建 HNSW 余弦索引，执行前只读核对 `chunks` 行数与当前向量维度；禁止新旧向量混写。
  - 若 development `chunks` 为空，可直接执行受控列类型迁移；若已存在 1536 维数据，必须先影子生成 1024 维向量并原子替换，不得直接截断或 cast 覆盖。
  - 完成证据：migration 文件、数据库 schema 核对、HNSW 索引核对、1024 维检索 SQL smoke。
  - 2026-08-20 证据：`pnpm run neon:guard` 通过；development 数据库迁移前 `chunks_count=0`、`documents_count=0`、`embedding_type=vector(1536)`、存在 `chunks_embedding_hnsw_cosine_idx`；已应用 `0002_switch_embedding_to_bge_m3_1024.sql`；迁移后核对为 `chunks_count=0`、`documents_count=0`、`embedding_type=vector(1024)`，HNSW 余弦索引仍存在；`pnpm --filter @ruan-cat-drill-doc/ai-rag-api test` 覆盖 1024 维检索 SQL 与 schema migration smoke。

- [x] 2.1.0b [code/test] `packages/ai-rag-api/server/providers/**`, `packages/ai-rag-api/server/plugins/rag.ts`, `packages/ai-rag-api/src/runtime-config.ts` - 接入 Cloudflare Workers AI OpenAI-compatible embedding provider，固定 endpoint、model、批量 100、输入顺序和 1024 维有限数值校验。
  - 请求使用 `POST /client/v4/accounts/{account_id}/ai/v1/embeddings`，body 使用 `model` + `input`；不得发送 `dimensions`/`output_dimensionality` 伪造维度能力。
  - 凭据仅允许通过显式 runtime config 注入 `NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN`、`NITRO_EMBEDDING_MODEL`；不得 import 时建立连接或输出 token。
  - 完成证据：provider 单元测试、真实单条 Cloudflare smoke（脱敏记录维度/数量/有限性）、运行时装配测试。
  - 2026-08-24 证据：Development Vercel env 从忽略的 `.env.ai-rag-phase2.smoke` 安全读取；现有 provider 真实调用返回单条 `count=1`、`dimensions=1024`、`finite=true`，批量 5 条均为 `1024` 维有限数值。`pnpm --filter @ruan-cat-drill-doc/ai-rag-api test` 为 18 个文件 / 70 个用例通过，typecheck 通过。

- [x] 2.1.1 [code/infra/test] `packages/ai-rag-api/**` - 装配真实 PostgreSQL lexical + pgvector provider
  - 进入条件：用户明确允许数据库操作；安全获得 Vercel development 环境变量；用户已完成官方 `neon` CLI 安装/认证。
  - 执行门禁：先 `pnpm run neon:guard`；禁止 `neonctl`、包装器或 `npx` 临时替代。
  - 先 `vercel env pull .env.local --environment=development`，只在本地受忽略文件读取变量；禁止输出连接串。
  - 应用运行使用 pooled URL；migration 只用 non-pooled URL。缺 non-pooled URL 时停止。
  - 核对固定 Neon project/database，不得新建同用途资源。
  - lexical 采用 PostgreSQL FTS + `ts_rank_cd`；未经真实中文/技术术语评估不得称 BM25。
  - pgvector 采用 `<=>` cosine；验证 vector extension 和 HNSW index；HNSW 需与精确检索对比。
  - 完成证据：脱敏 migration/查询记录、provider 集成测试、真实目标数据库 lexical/vector 查询结果。
  - 2026-08-24 阶段证据：development 只读核对为 `vector(1024)`、HNSW 索引存在，真实 lexical/vector 查询均可执行但因 `documents=0`、`chunks=0` 返回 0 条；事务内 `EXPLAIN` 证明 HNSW 计划可被选用。HNSW 与精确检索的召回对比必须等待 §2.1.2 受控同步写入样本后完成，本项在该比较前保持未勾选。
  - 2026-08-24 完成证据：真实同步后数据库有 160 个 chunk；同一 Cloudflare 1024 维查询向量下，强制 HNSW 与强制精确扫描均返回 5 条，排序 ID 完全一致。

- [x] 2.1.2 [code/db/test] `packages/ai-rag-api/**` - 使用 Cloudflare `@cf/baai/bge-m3` 真实 embedding、增量同步、单文档事务、advisory lock、同步记录
  - 进入条件：真实 database provider + 可用 embedding 凭据。
  - 当前 embedding：Cloudflare Workers AI `@cf/baai/bge-m3` / 1024 / batch 100；Nitro 调用 OpenAI-compatible `/v1/embeddings`，不使用 Cloudflare Worker binding 作为 Vercel Nitro 的隐式依赖。
  - 真实同步前必须完成 1 条维度 smoke 与 5–10 条批量 smoke；所有向量必须是 1024 维有限数值。
  - 当前 §2.1.1 已完成真实运行时连接、schema、索引和空库查询的只读核对；虽然其 HNSW/精确召回比较仍待数据样本，本项的受控同步前提已经满足。
  - 未变化文件必须跳过重嵌入；变化文件先构建完整新版本，再单文档事务替换；失败保留旧版本。
  - 只有完整扫描成功后才删除缺失来源；扫描失败时禁止删除。
  - PostgreSQL advisory lock 拒绝并发同步，冲突返回 409。
  - 同步的 session-level advisory lock 必须由私有 `NITRO_SYNC_DATABASE_URL` 注入 non-pooled URL 持有；检索/聊天仍使用 pooled `NITRO_DATABASE_URL`，不得因连接分工改变资源或创建第二个数据库。
  - `knowledge_sync_runs` 补齐/验证扫描、未变化、新增、更新、删除、**写入 chunk 数**、失败文件、状态和起止时间。
  - 完成证据：真实同步运行记录、重复同步不重算、失败回滚/保留旧版本、并发冲突、数据库行验证。
  - 2026-08-24 阶段证据：真实 Nitro POST 扫描 290 个文件，受 100 条上限约束产生 partial run；Development 数据库现有 15 documents / 160 chunks。单文档同步写入 18 chunk；重复同步 `unchangedFileCount=1`、`writtenChunkCount=0`、embedding 调用为 0；受控 chunk 写入失败后旧 chunk 指纹保持不变。并发 409 尚未取得，保持未完成。
  - 2026-08-24 完成证据：以 scanner gate 固定首轮持锁窗口时，真实 Development service 的第二轮 dry-run 返回 `ApiHttpError(409, KNOWLEDGE_SYNC_CONFLICT)`；同步 HTTP handler 将该业务错误稳定映射为 HTTP 409。新增回归覆盖，防止测试时序把非并发请求误判为锁失效。

- [x] 2.1.3 [code/model/test] `packages/ai-rag-api/**` - 生产装配 Hybrid Search + 模型到 `/v1/search` 与 `/v1/chat`
  - 进入条件：2.1.1、2.1.2 的真实 provider 可用，模型配置已授权。
  - chat 检索 Top-K 上下文，Prompt 要求 `[来源N]` 与资料不足声明。
  - 直接返回 AI SDK data-stream `Response`；来源帧包含稳定 source/heading 元数据。
  - 未装配仍必须 503；不得用空库/默认模型/空上下文掩盖配置失败。
  - 完成证据：真实 `/v1/search` 返回、真实流式 `/v1/chat`、来源 DTO、错误状态、未装配 503 回归。
  - 2026-08-24 证据：Development Nitro `/v1/search` 对真实 160 chunk 数据库返回 HTTP 200、3 条来源 DTO（含 `sourcePath`、`sourceUrl`、`headingAnchor`）；`/v1/chat` 返回 HTTP 200、`x-vercel-ai-data-stream: v1`、来源数据帧与内容帧。JSON 列由当前 PostgreSQL driver 作为字符串返回的映射缺口已修复，未装配路由 503 由 H3 回归覆盖。

- [ ] 2.1.3a [code/config/infra/test] `packages/ai-rag-api/**` - 双协议聊天模型注册表、Anthropic Messages adapter 与 Vercel 环境变量迁移
  - 公开配置必须由类型化注册表保存 `openai-responses` 与 `anthropic-messages` 两个 provider 的 `baseUrl`、`model`、`protocol`，并固定 `activeProvider: "anthropic"`；不得新增 `NITRO_BASE_URL`、`NITRO_CHAT_MODEL` 或 provider 选择环境变量。
  - OpenAI 保留 `gpt-5.6-luna` + Responses provider；Anthropic 使用 `claude-sonnet-5[1m]` + base URL `https://api.code-tab.com/v1`，实际请求 `/v1/messages`；两个 adapter 均输出既有 AI SDK Data Stream，保留来源帧与 abort 合同。
  - runtime 只读取 `NITRO_OPENAI_API_KEY` 与 `NITRO_ANTHROPIC_API_KEY`；激活 provider 缺少对应密钥时拒绝装配，未激活 provider 的密钥缺失不得阻塞；密钥不得写入代码、测试快照、报告或终端输出。
  - Vercel `smallalice-docs-ai-nitro-api` 的 development、preview、production 删除 `NITRO_BASE_URL` 与 `NITRO_CHAT_MODEL`，保留原 `NITRO_OPENAI_API_KEY`，并在收到用户密钥后新增 `NITRO_ANTHROPIC_API_KEY`；变更前完成脱敏变量盘点与受 gitignore 保护的本地备份。
  - 完成证据：注册表/运行时/两个 adapter 单元与受控 fetch 测试；真实 `/v1/messages` smoke 记录 headers、`message_start`、首个文本 delta、`message_stop` 的时间线；120 秒为慢响应观察点，420 秒为硬上限；三环境变量名称核对与不泄密证据。
  - 2026-08-26 本地与环境证据：新增 `@ai-sdk/anthropic@1.2.12`；API 包 25 个测试文件 / 89 个用例、typecheck、`build:vercel` 通过；真实 SDK 受控 fetch 已断言 `/v1/messages`、`anthropic-version`、`x-api-key`、Anthropic Messages body 和 SSE 文本增量转 Data Stream。三环境备份已完成，旧变量已删除，新 key 已接入；Development 被 Vercel 平台标记为 Non-sensitive。尚未取得真实上游事件时间线，任务保持未勾选。
  - 2026-08-26 配置入口证据：`nitro.config.ts` 已改为直接 `defineConfig` 并内联 `runtimeConfig`；`src/runtime-config.ts` 只保留类型合同。Vercel 变量备份已保存到受 `.gitignore` 保护的 `.env.ai-rag-phase2-backup.*` 文件；旧变量已删除，Anthropic key 已接入三个环境，但 Development 被 Vercel 平台强制标记为 Non-sensitive，需单独解决或取得用户对该平台限制的明确接受。

- [ ] 2.1.4 [browser/e2e] 文档站 + 生产 Nitro - 生产后端驱动浏览器回归
  - 生产模型请求由注册表的 `activeProvider: "anthropic"` 决定，必须实际发送 Anthropic Messages `POST https://api.code-tab.com/v1/messages`，body 至少包含 `model: "claude-sonnet-5[1m]"`、`system`、`messages`、`stream: true` 与 `max_tokens`。
  - 上游必须按 Anthropic Messages SSE 事件解析并转发文本增量、完成和错误状态；不得以 `/v1/models`、HTTP 200 或仅来源帧推断模型可用。
  - Nitro 聊天装配必须使用 Anthropic adapter；OpenAI Responses adapter 仍须保留并由受控测试覆盖，两个上游协议不得在前端或路由层混用。
  - 真实页面发送问题 → 首段流式内容可见 → 停止入口出现 → 点击停止触发 abort → 已接收内容保留 → 状态收敛。
  - 来源卡片必须跳到真实 VitePress `sourceUrl#headingAnchor`。
  - 完成证据必须包含：生产浏览器 Network 中的实际 `/v1/messages` 流式请求（脱敏）、Anthropic SSE 文本增量与 `message_stop`、停止后的上游 abort、已接收内容保留、来源跳转截图；本地受控 fetch 流或 HTTP 200 不能代替本任务。
  - 失败控制：工具缺失、外部权限缺失或同一阻塞连续三次出现时，立即停止自动续跑，在 `agent-progress.md` 记录阻塞指纹、已尝试次数与所需外部条件；不得恢复旧的 Chat Completions 探测路径。
  - 2026-08-25 的 Responses SSE 无事件记录保留为历史证据；它不代表 Anthropic Messages 已失败，也不构成新模型的可用性结论。

### 2.2 P1：验证、触发与调优

- [x] 2.2.1 [spike/test] `packages/ai-vue/**` - 验证 Shiki 流式代码块高亮边界
  - 当前禁止直接接入 `@shikijs/stream`。
  - 先验证 `markstream-vue` 自带 `codeRenderer="shiki"`，再决定是否需要独立 Shiki stream。
  - 必须覆盖表格、未闭合 fenced code、长回复、XSS、`final` 收敛、reduced-motion。
  - 失败时保留安全默认渲染，不允许为“功能完整”强行引入第二渲染路径。
  - 2026-08-24 完成证据：实际挂载 `markstream-vue@1.0.8` 的 `codeRenderer="shiki"`，并模拟可见 viewport；即使临时补齐 `shiki@3.23.0` 与 `stream-markdown@0.0.16` peer，代码块仍为 `code-pre-fallback`，没有高亮容器。依赖已回退，新增回归固定安全 fallback；`ai-vue` 4 文件 / 20 用例、typecheck、build 均通过。

- [x] 2.2.2 [code/infra/test] 同步入口 - `rag:sync`、可选 `rag:watch` 与生产触发
  - 依赖 2.1.2。
  - CLI、watch、POST 与 Cron 必须复用同一同步服务和同一切分/哈希/删除语义。
  - POST 校验 `NITRO_KNOWLEDGE_SYNC_TOKEN`；Cron GET 接受 `Authorization: Bearer $CRON_SECRET`。
  - 同步频率属于部署配置，不写死业务代码。
  - 完成证据：本地一次同步、监听变更、POST、Cron 鉴权与同步记录。
  - 2026-08-24 完成证据：`rag:sync` 与 `rag:watch` 从本地 `NITRO_*` 环境构建与 Nitro plugin 同一 `RagRuntimeContext`，不调用 HTTP/token；watch 去抖/关闭回归通过。本地 dry-run 扫描 290 文件 / 6034 chunks / 0 失败；随后真实 CLI run 记录为 partial、扫描 290、写入 71 chunks，Development 数据库为 20 documents / 231 chunks。POST/Cron 继续复用既有 `handleSyncRequest` 鉴权回归；API 21 文件 / 81 用例、typecheck、Vercel bundle 与 strict validation 通过。

- [ ] 2.2.3 [eval/docs] 固定题集真实评估与参数调优
  - 依赖 2.1.1–2.1.3。
  - lexical/vector/hybrid 对同一固定题集运行；记录命中率、关键词覆盖率、排名与检索 ID。
  - 比较 300/30/5、500/50/10、800/100/15 等参数集；HNSW 与精确向量检索对比；记录 Cloudflare BGE-M3 1024 维模型标识。
  - 评估结果必须落成可复核文档，不得只保留终端口头结论。

- [ ] 2.2.4 [build/deploy/e2e] 完整 docs build 与 Git 集成部署回归
  - Windows 构建使用约 8 GiB Node heap 且串行；不得因两分钟级短时无输出并行重启。
  - 部署回归需用户授权且 2.1 已真实装配。
  - 完成证据：fresh build 退出码 0、部署 URL、生产 search/chat、来源跳转和真实浏览器证据。

### 2.3 P2：作品展示

- [ ] 2.3.1 [docs] `README.md` - 完善 AI 知识库作品说明
  - 必须包含：动态 `docs/docx` 同步、结构化 Chunk、Hybrid Search、流式问答、来源溯源、架构、技术栈、验证方式、已知门禁和演示截图。
  - 简历描述基线已进入 `design.md` §3.18；不再依赖被删除的旧 design 路径。
  - 进入条件：真实本地/生产链路至少达到可演示状态。

- [ ] 2.3.2 [media] 演示材料 - 录制并在获得授权后上传 30–60 秒视频
  - 展示同步/检索/流式回答/来源跳转/停止生成中的核心亮点。
  - 外部上传必须有用户授权。
  - 完成证据：可访问的视频地址与最终 README 引用。

## 3. 历史学习任务

> 这两项来自 2026-07-29 的学习计划。历史快照完整保存在 `history/`，但仓库没有足够证据证明这些 Chroma demo 真正完成，因此保持未勾选。正式产品实现不依赖完成 Chroma 练习。

- [ ] 3.1 [learning] Chroma 本地环境 + OpenAI embedding 封装 + 最小 demo
  - 历史目标：理解 vector DB add/query/delete 与 embedding 生命周期。
  - 禁止因为正式 Neon 路线已推进就反向勾选本学习实验。

- [ ] 3.2 [learning] 全量 `docs/docx` → Chunk → embedding → Chroma 检索 → 回答 demo 与截图
  - 历史交付物：`docs/screenshots/rag-demo-01.png`；当前无足够仓库证据。
  - 真实产品闭环应由 2.1 证明，而不是重新把 Chroma 设为正式主线。

## 4. 里程碑

- [ ] M1 最小 RAG 闭环
  - 标准：能从文档检索相关内容并回答，具有可复核 demo/运行证据。
  - 当前：结构化 Chunk 已完成；历史 Chroma demo 无证据；真实闭环待 2.1。

- [ ] M2 Hybrid Search
  - 标准：lexical + vector + hybrid 可真实比较，输出评估结果。
  - 当前：离线合同/RRF/评估器已完成；真实索引评估待 2.2.3。

- [ ] M3 完整问答系统
  - 标准：知识源同步 → 检索 → 流式回答 → 来源展示形成真实链路。
  - 当前：API/UI/部署基础已存在；真实 provider/模型/生产回归待 2.1。

- [ ] M4 简历作品集
  - 标准：完整 README + 可访问的作品演示材料（技术博客可选）。
  - 当前：待 2.3。

## 5. 旧计划映射

| 旧计划区域                 | 当前任务                                                                   |
| -------------------------- | -------------------------------------------------------------------------- |
| 1.1 Chroma 环境            | 3.1                                                                        |
| 1.2 Markdown Chunk         | 1.1                                                                        |
| 1.3 RAG demo               | 3.2 / 2.1                                                                  |
| 2.1 Neon/pgvector/FTS      | 1.5 + 2.1.1                                                                |
| 2.2 Hybrid Search/RRF      | 1.1/1.2 + 2.1.3                                                            |
| 2.3 评估集                 | 1.2 + 2.2.3                                                                |
| 3.1 Nitro API              | 1.2/1.6 + 2.1/2.2.2                                                        |
| 3.2 Chat UI/Markdown       | 1.3 + 2.2.1                                                                |
| 3.3 来源溯源               | 1.4 + 2.1.4                                                                |
| 4.1 参数调优               | 2.2.3                                                                      |
| 4.2 README/视频            | 2.3                                                                        |
| 旧 Task 5 runtime assembly | 1.6                                                                        |
| 旧 §5 高频状态台账         | `history/*.superpowers.md`（审计）+ `agent-progress.md`（当前 checkpoint） |

完整逐类吸收与纠偏见 `history/2026-08-16-superpowers-migration.md`。
