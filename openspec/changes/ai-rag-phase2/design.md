# 二期 AI RAG 技术设计

## 1. Context

二期 AI 化任务（RAG 知识库问答系统）的原始设计与实施计划创建于 2026-07-29，后续在 superpowers 台账中持续补充。该任务现已完全迁入 OpenSpec + do-long-task：当前技术决策以本文件为准，系统行为以 `specs/ai-rag/*/spec.md` 为准，执行状态只以 `tasks.md` 为准。

2026-08-16 完成永久迁移收尾：原 `docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md` 与 `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md` 路径被删除；二者原始 Git blob 以完全相同的 SHA 保存到本 change 的 `history/`。迁移追踪见 `history/2026-08-16-superpowers-migration.md`。历史快照只作证据，不能覆盖本设计、specs 或 `tasks.md`。

一期基础能力已经存在：`ai-vue`、`ai-vue-doc`、`ai-vitepress-plugins` 为二期提供 Vue 对话 UI、文档站与 VitePress 集成基础。二期当前已经具备结构化知识准备、API 离线合同、Chat UI/transport、稳定来源锚点、Vercel/Neon 基础设施与 runtime assembly 的本地/部署基础；真实 PostgreSQL 检索、真实 embedding、真实同步事务、生产模型装配及生产后端驱动回归仍必须按 `tasks.md` 的外部门禁推进。

## 2. Goals / Non-Goals

### Goals

- 掌握并展示 RAG、Hybrid Search、向量检索、引用溯源、流式问答、Neon/pgvector 等 AI 应用工程能力。
- 以 `docs/docx/**/*.md` 为唯一动态知识源，完成可重复、可回滚的结构化入库与增量同步。
- 统一使用 TypeScript 主线：Vue3 + Element Plus X + `@ai-sdk/vue` + `markstream-vue` + 独立 Nitro v3 + zod + drizzle + Neon/pgvector。
- 实现 PostgreSQL 词法全文检索 + pgvector 向量检索 + 标准 RRF 的 Hybrid Search，并以固定评估集驱动调优。
- 回答必须提供可追溯来源，来源链接直达现有 VitePress 文档的稳定标题锚点。
- 形成可展示的简历作品：功能 README、真实验证结果、可演示的端到端链路与 30–60 秒演示材料。
- 让长任务可跨 checkpoint 恢复：当前任务只从 `tasks.md` 读取，风险/失败从 `agent-findings.md` 读取，进度从 `agent-progress.md` 读取。

### Non-Goals

- 不引入 Python/FastAPI 或 Java/Spring/RabbitMQ 后端。
- 不在正式二期同时维护多个向量数据库；Chroma 仅作为历史学习实验，正式主线为 Neon + pgvector。
- 不在二期引入 OCR、图片理解、视觉检索或多模态回答；Markdown 图片只保存 URL 元数据。
- 不在第一阶段引入 MCP 工具网关。
- 不在通用 `ai-vue` 展示包内耦合 `@ai-sdk/vue` transport 或 Nitro 请求。
- 不与 Element Plus X 同时引入 AI Elements Vue 作为第二套聊天 UI 主线。
- 不新增数据库 Markdown 阅读器或 Nitro 来源路由来复制 VitePress 已存在的文档展示链路。

## 3. Canonical Decisions

### 3.1 技术栈与职责

| 层次      | 当前选型                              | 约束                                                         |
| --------- | ------------------------------------- | ------------------------------------------------------------ |
| 前端 UI   | Vue3 + `vue-element-plus-x@1.3.98`    | `Bubble`、`BubbleList`、`Sender` 是唯一聊天 UI 主线          |
| Transport | `@ai-sdk/vue@1.2.12`                  | 仅由业务使用方 `useKnowledgeChat` 管理 transport/state/abort |
| Markdown  | `markstream-vue@1.0.8`                | 助手 Markdown 唯一渲染主线                                   |
| 代码高亮  | `@shikijs/stream@4.4.1`（受控候选）   | 未完成真实兼容验证前不得接入或宣称兼容                       |
| API       | 独立 Nitro v3                         | 不引入 Nuxt API；路由从 `nitro/h3` 导入                      |
| 数据      | Neon + drizzle + pgvector             | 正式环境唯一向量持久化主线                                   |
| 校验      | zod                                   | 所有外部输入必须真实映射 HTTP 错误状态                       |
| RAG       | Vercel AI SDK / LangChain.js 能力边界 | 以当前实际实现和 specs 为准，不引入第二套平台                |

Nitro 使用 `nitro` v3，`compatibilityDate` 固定为 `2024-09-19`；不安装 `nitropack` 或独立 `h3` 作为二期 API 入口。

### 3.2 Chat UI 与流式 Markdown

- Element Plus X 负责消息壳层、列表、输入和停止交互；不得以本地同职责组件替代。
- `markstream-vue` 负责不断变化、可能未闭合的 Markdown；不得手写 Markdown parser 或 Markdown 打字机。
- `MarkdownRender` 固定使用 `mode="chat"`；流式期间 `final=false`，结束后 `final=true`。
- 默认 `smoothStreaming="auto"` + `typewriter`，同时固定 `fade=false`。
- `prefers-reduced-motion: reduce` 时关闭正文 typewriter/动画，但不得停止真实内容流、Markdown 解析或 `final` 收敛。
- Element Plus X 的 `Typewriter` 只允许用于 Welcome 等非 Markdown 短文案，禁止包裹助手 Markdown 正文。
- `@shikijs/stream` 只可作为代码块高亮的受控候选。当前已知 `markstream-vue` 有自身 `codeRenderer`/`codeBlockStream` 能力，但没有已证实的直接 fenced-code 注入点可接受独立 Shiki stream；优先验证 `markstream-vue` 自带 `codeRenderer="shiki"` 路径。
- 由于 `vue-element-plus-x@1.3.98` 单消息列表上游 `getBoundingClientRect()` 缺陷，当前明确固定 `auto-scroll=false`。这属于受控放弃，不是迁移漏项；重新启用或升级前必须独立验证。

### 3.3 知识源与多模态边界

- 唯一知识源：`docs/docx/**/*.md`。
- 每次同步必须重新扫描目录实时内容，数据库不是上游事实来源。
- 路径统一为相对仓库根、使用 `/` 分隔的 `sourcePath`。
- 图片只提取 URL 到 document/chunk 的 `imageUrls`；图片 URL 不进入 chunk 文本，不参与 embedding，不下载、不 OCR。
- OCR、视觉检索、图片理解、多模态问答必须另开三期 change。

### 3.4 Chunk 与稳定锚点

默认配置：

```ts
interface ChunkConfig {
	targetTokens: number; // 500
	overlapTokens: number; // 50
	tableRowsPerChunk: number; // 12
	profileVersion: string; // "markdown-structure-v1"
}
```

- 优先按 H1/H2/H3 结构形成语义块；普通段落仅超限时递归切分并保留 overlap。
- 小表格保持原子性；超长表格按连续行组拆分，每个子块重复表头与标题路径。
- `headingIndex` 是 H1/H2/H3 在 Markdown AST 中的零基出现序号；无标题根块为 `-1`。
- 有标题时：

```plain
input = [sourcePath, headingPath.join("\u0000"), String(headingIndex)].join("\u0000")
headingAnchor = "rag-heading-" + base64url(sha256(input))
```

- 无标题根块使用 `rag-document-<sourcePath-digest>`；来源链接直接打开文档顶部。
- 同一源文件 `chunkIndex` 从 `0` 连续递增。
- 必须持久化：`sourcePath`、`headingPath`、`headingIndex`、`headingAnchor`、`chunkIndex`、`imageUrls`、`chunkKind`、`contentHash`，表格块另含行范围。

### 3.5 来源 URL 与 VitePress

`sourceUrl` 只由 `sourcePath` 派生，不作为环境相关字段入库：

```ts
function createSourceUrl(sourcePath: string): string {
	const relativePath = sourcePath.replace(/^docs\//, "").replace(/\.md$/, ".html");
	return `/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}
```

VitePress 构建期必须使用与入库相同的 AST/标题路径/序号算法写入 `headingAnchor` DOM id。来源卡片使用 `sourceUrl#headingAnchor`；无标题根块或目标锚点缺失时回退文档顶部。禁止依赖 VitePress 默认中文 slug，也禁止新增数据库来源阅读器。

### 3.6 增量同步与一致性

- 同步身份：`sourcePath` + `contentHash` + `profileVersion` + embedding 模型版本。
- 未变化文件跳过切分和 embedding。
- 新增/变化文件先完成新 chunk 与 embedding，再用**单文档事务**替换旧版本；失败时旧版本继续可检索。
- 只有完整扫描成功后才删除本轮缺失的 `sourcePath`；扫描/读取不完整时禁止据此删除旧数据。
- 使用 PostgreSQL advisory lock 拒绝并发同步，不使用仅单实例有效的进程内锁。
- 检索与聊天继续使用 pooled URL；同步的 session-level PostgreSQL advisory lock 必须通过私有 `NITRO_SYNC_DATABASE_URL` 连接非 pooled endpoint，避免 transaction pooling 复用 backend 使锁可重入。
- `knowledge_sync_runs` 至少记录扫描、未变化、新增、更新、删除、写入 chunk、失败文件、状态与起止时间。当前已知实现 schema 仍缺“写入 chunk 数”字段，真实同步任务必须补齐或显式修正规格，禁止静默忽略。
- 同步入口只读取 `NITRO_KNOWLEDGE_SOURCE_ROOT` 指向的 `docs/docx`，不得接受客户端提交 Markdown 内容或任意文件路径。
- 开发侧提供 `rag:sync` 与可选 `rag:watch`；生产侧上游转换完成后调用带 `NITRO_KNOWLEDGE_SYNC_TOKEN` 的 POST，Vercel Cron 使用 `Authorization: Bearer $CRON_SECRET` 的 GET。三种触发必须复用同一同步服务。
- Vercel API 部署产物必须显式包含 `docs/docx`，不能假定 Serverless 运行目录保留完整 Git 工作区。

### 3.7 Embedding

当前二期固定：

```ts
{
  provider: "cloudflare-workers-ai",
  model: "@cf/baai/bge-m3",
  dimension: 1024,
  batchSize: 100
}
```

Cloudflare Workers AI 是当前正式候选，不再把 OpenAI `text-embedding-3-small` 作为二期首期实现。Nitro 通过 Cloudflare OpenAI-compatible endpoint 调用 embedding，chat provider 继续独立配置。模型/维度变化意味着 schema 迁移与全量重嵌入；禁止不同维度混写同一 `chunks.embedding`。

Cloudflare embedding provider 的接口边界固定为：

```plain
POST https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/embeddings
Authorization: Bearer ${NITRO_CLOUDFLARE_API_TOKEN}
Content-Type: application/json

{
  "model": "@cf/baai/bge-m3",
  "input": ["chunk-1", "chunk-2"]
}
```

provider MUST 将返回结果按 `data[].embedding` 映射为与输入同序的 `number[][]`，并在进入同步或检索前校验每个向量为 1024 个有限数值。请求 MUST NOT 依赖 `dimensions`/`output_dimensionality` 参数；BGE-M3 的 1024 维是固定模型输出。Vercel Nitro 只读取显式注入的 `NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN` 与 `NITRO_EMBEDDING_MODEL`，不得把凭据写入仓库。

### 3.8 Neon / pgvector 资源契约

固定非敏感资源：

- Neon organization：`org-super-fog-48541962`
- Neon project ID：`patient-cloud-43432277`
- Neon project name：`neon-smallalice-ai-rag`
- 实际业务 database：`neondb`

不得创建第二个同用途 project/database。连接顺序：先 `vercel env pull .env.local --environment=development`，再按实际变量名连接。应用检索/聊天用 pooled URL；Drizzle migration 与持有 PostgreSQL advisory lock 的同步分别使用 non-pooled URL。没有 non-pooled URL 时停止 migration 或同步。

首个 migration 必须先启用 vector：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX chunks_embedding_hnsw_cosine_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);
```

`chunks.embedding` 固定 `vector(1024)`；检索使用余弦距离 `<=>`。HNSW 是近似检索，必须用固定评估集与无索引精确检索对比后才能作为生产默认。

维度迁移顺序固定为：先只读核对 `chunks` 行数与现有向量维度；确认当前 development 库无可保留向量后，删除 HNSW 索引、将列改为 `vector(1024)`、重建余弦 HNSW 索引，再执行 1024 维全量重嵌入。若已经存在 1536 维数据，禁止直接 cast 覆盖，必须先在受控事务/影子列完成新向量生成与校验，再原子替换。

### 3.9 Neon CLI 与安全记录

- 只允许官方 `neon` CLI；禁止 `neonctl`、其包装器、`npx` 临时替代。
- Windows 已复现 `neonctl@2.30.1 --help` 无监听端口 CPU 自旋事故；即使“只读检查”也不得运行。
- 云端数据库步骤前先运行 `pnpm run neon:guard`；用户负责官方 CLI 安装/认证，代理不得自行读取或生成认证凭据。
- 允许的核对路径包括 `neon projects get patient-cloud-43432277 --output json`、branches/databases/roles list、`neon psql`。
- 每次真实云操作只记录脱敏命令模板、时间、目标资源、已确认认证状态、退出码和验证结果；不得记录连接串、密码或 token。
- 异常时记录 PID、父进程、CPU 复采样和端口，只终止可归属的异常子进程，不清理不明长驻进程。

### 3.10 数据模型

当前二期核心持久化事实是：

```plain
documents
chunks
knowledge_sync_runs
```

向量直接存储于 `chunks.embedding`。旧设计中 `conversations/messages/embeddings` 是早期概念草图，不构成新增表要求。

### 3.11 Hybrid Search

词法侧使用 PostgreSQL FTS：`to_tsvector('simple', content)` + `websearch_to_tsquery('simple', query)` + `ts_rank_cd`；这是**词法全文检索，不是 BM25**。真实中文/技术术语评估未完成前不得宣传 BM25。

向量侧使用 pgvector `<=>` 余弦距离。融合侧使用标准 RRF：

```plain
score(d) = Σ 1 / (k + rank_i(d)), k = 60
```

旧 design/plan 中按 score 加权或按数组位置累加的 RRF 代码均为被取代草图，禁止重新实现。

系统需要支持 lexical / vector / hybrid 三模式对比。ReRank 是可选进阶，候选包括 Jina Reranker 或本地模型，通常对召回 Top-K 再取 Top-N。

### 3.12 固定评估与参数调优

固定题集至少 10 个问题，分别运行 lexical/vector/hybrid，输出可复核指标（至少命中率、关键词覆盖率、检索 ID/排名）。

历史参数基线用于 A/B：

- 300 / 30 / topK 5
- 500 / 50 / topK 10
- 800 / 100 / topK 15

默认基线为 chunk 500、overlap 50、topK 10、rerankTopK 5、scoreThreshold 0.5、embedding 1024/batch 100。最终参数必须由真实索引评估结果选择，不能把历史示例当生产结论。

### 3.13 Nitro API

独立包负责：

```plain
POST /v1/chat
POST /v1/search
POST /v1/knowledge/sync
GET  /v1/knowledge/sync
GET  /v1/knowledge/sync-runs
```

- zod 输入校验失败返回真实 HTTP 400。
- 鉴权失败返回 401/403；并发同步 409；未知错误 500。
- 未装配 `event.context.rag` 时 chat/search/sync/sync-runs 统一返回 `503 RAG_NOT_CONFIGURED`，禁止空数组或 `{accepted:true}` 假成功。
- 流式回答直接返回 AI SDK Web `Response`；不得再包 JSON，不得返回后继续改状态码/头。
- Prompt 必须要求基于资料回答、用 `[来源N]` 标注观点、资料不足时明确说明“根据现有资料无法回答”。
- 来源 data frame 至少携带 `id`、截断片段、score、`sourcePath`、`sourceUrl`、`headingPath`、`headingIndex`、`chunkIndex`、`headingAnchor`、`imageUrls`。

### 3.14 Runtime Assembly

`createRagRuntimeContext(config, factories)` 只消费显式 runtime config/provider factory，输出 route 所需的 retrieve/search/stream/sync/syncRuns 能力。

- 不读裸 `process.env`。
- import 时不建数据库或模型连接。
- 缺 database/embedding/model 配置时不创建半成品 context，保持 `503 RAG_NOT_CONFIGURED`。
- provider factory 抛错必须保持 500，不得被转换为成功。
- `plugins/rag.ts` 当前使用六项配置门禁并以模块级单例 + request hook 挂载 `event.context.rag`。
- 当前 sync provider 仍有离线 fake 边界；真实持久化由 `tasks.md` P0 替换。

### 3.15 前端 Transport 与停止生成

`useKnowledgeChat` 位于业务使用方：负责 SDK transport、消息状态、AbortSignal、来源帧与 503 呈现；通用 `ai-vue` 仅消费规范化 DTO。

每轮请求必须清空上一轮累积 data，再按新助手消息 ID 隔离来源，避免串轮。停止生成必须调用 SDK `stop()`，并保留已接收内容。生成中必须有可见、可访问的停止入口。

### 3.16 学习路径与里程碑

| 阶段     | 内容                                                          |
| -------- | ------------------------------------------------------------- |
| RAG 基础 | Chunk、Chroma add/query/delete、首个 embedding、最小 RAG demo |
| 检索质量 | PostgreSQL FTS、向量检索、RRF、可选 ReRank、固定评估集        |
| 工程落地 | Neon/drizzle/pgvector、Nitro、同步、流式问答、来源、zod       |
| 展示优化 | 参数调优、成本/批量、README、技术说明、演示视频               |

里程碑：

- M1：能从真实/学习语料检索并回答，拥有可复核 demo 证据。
- M2：lexical + vector + hybrid 可比较，产出评估结果表。
- M3：知识同步 → 检索 → 流式回答 → 来源展示形成真实闭环。
- M4：README / 技术文章或演示视频形成可展示作品。

学习理解验收：能解释 Chunk 策略、Embedding 维度选择、词法/向量互补、ReRank 的两阶段意义。

### 3.17 参考资料与禁止干扰项

学习参考：Vercel AI SDK RAG Guide、LangChain.js PGVectorStore、Neon LangChain、Chroma Getting Started、`ai-sdk-rag-starter`、`agents-from-scratch-ts`、`zhilv-yuntu`。参考项目只用于理解，不自动成为依赖或架构要求。

禁止把 AgentX（Java/Spring）、Dify 平台复杂度、自研 Agent 平台等干扰项引入二期主线。

### 3.18 作品与简历验收

技术展示必须能够说明：知识源如何同步、Chunk 如何保持结构、embedding 如何落库、lexical/vector 如何融合、来源如何确定性跳转、流式 UI 如何停止与收敛、部署/数据库边界如何安全处理。

README 至少包含功能、技术栈、架构、运行/验证方式、演示截图与仍受外部门禁限制的事项。演示视频目标 30–60 秒。

可复用的简历项目描述基线：

> **AI 知识库问答系统**  
> 基于 RAG 技术栈的动态知识库问答系统，支持 Markdown 入库、结构化文本切分、向量检索、PostgreSQL 词法检索、Hybrid Search、流式问答与引用溯源。前端使用 Vue3 + Element Plus X 与流式 Markdown 渲染，后端使用独立 Nitro API；数据层采用 Neon + pgvector + drizzle。回答来源可直达 VitePress 文档的确定性标题锚点。
>
> **技术栈**：TypeScript / Vue3 / VitePress / Nitro / Neon / pgvector / drizzle / zod / Element Plus X / markstream-vue / @ai-sdk/vue

不得在真实端到端证据缺失时把 PostgreSQL、embedding、模型或生产 RAG 宣传为已完成。

## 4. Risks / Trade-offs

| 风险                   | 处理                                                     |
| ---------------------- | -------------------------------------------------------- |
| 检索质量不足           | 用固定评估集比较 chunk/topK/lexical/vector/hybrid/HNSW   |
| embedding 成本         | 小模型 + batch；未变化文档跳过重嵌入                     |
| 流式渲染性能           | 使用成熟 Markdown renderer，避免双动画；长内容专项测试   |
| 向量库反复选型         | Chroma 仅学习；正式统一 Neon/pgvector                    |
| 作品缺乏亮点           | 突出 Hybrid Search、稳定来源、流式停止、真实工程证据     |
| 云端状态与本地证据混淆 | 每个外部能力必须有自身真实证据，本地 build/test 不能替代 |

必须持续保留的事故约束：

- 禁止 Windows `neonctl` CPU 自旋路径，只用官方 `neon` + `neon:guard`。
- Vercel 三环境保持 `ENABLE_EXPERIMENTAL_COREPACK=1`，以真实构建日志确认 pnpm 版本。
- 无 `.git` 构建环境保留 `shouldDisableGitChangelog()` 防护。
- `ai-vue-doc` 的 Nuxt Content/H3/VueUse 已验证兼容矩阵不得随意拆散。
- Windows `docs:build` 使用约 8 GiB Node 堆并串行，不因短时无输出误判死锁。
- `pnpm-lock.yaml` 被忽略时，不能用“无 Git diff”推断依赖解析未变化。

## 5. Deployment / Current State

已知基础设施：

- Vercel 文档站：`small-alice-web-odse`
- Vercel Nitro API：`smallalice-docs-ai-nitro-api`
- Neon migration 已建立 vector 扩展、`documents` / `chunks` / `knowledge_sync_runs` 与 HNSW 余弦索引。
- 生产 API 域名已经建立，知识同步相关路由曾有鉴权/可达性验证。

这些历史部署事实不等于当前真实 RAG 闭环已经完成。当前仍须以 `tasks.md` 的 P0/P1 为准完成真实 provider、embedding、同步、chat/search、浏览器和部署回归。

## 6. Superpowers Migration Closure

本设计已经把旧 design 中所有**仍有效**的技术方向、边界、学习目标、风险、验收与作品描述规范化；被后续证据纠正的旧内容则以本设计当前规则显式取代。旧 plan 的当前任务与状态已经被 `tasks.md` 重建，旧高频更新记录保留在 OpenSpec `history/` 作为审计证据。

为了避免信息损失，同时又不保留第二任务源：

1. 两个原始 superpowers 文件的 blob 原样保存在 `history/*.superpowers.md`。
2. 原 `docs/superpowers/...` 路径永久删除。
3. `history/2026-08-16-superpowers-migration.md` 提供逐类映射和纠偏规则。
4. 历史快照中任何复选框都没有执行权；新工作只能进入 `tasks.md`。
5. 若未来发现历史快照中存在尚未规范化、且仍然有效的要求，必须先把它写回对应 spec/design/task，再执行；禁止恢复旧台账。

## 7. Open Questions

无迁移层面的开放问题。业务实现层面的未完成事项全部由 `tasks.md` 管理。
