# 二期 AI RAG 技术设计

## 1. Context

二期 AI 化任务（RAG 知识库问答系统）此前由 superpowers 台账（`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md` 与 `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`）管理，台账停更于 2026-08-07，且无法支撑跨 checkpoint 的恢复续跑。本 change 将该长任务整体迁移到 OpenSpec 长任务体系，本设计文档承载全部技术决策，`tasks.md` 成为唯一任务源，进度与失败记录固定在 `agent-progress.md` / `agent-findings.md`。

**一期基础**：一期三包已完成（`ai-vue` / `ai-vue-doc` / `ai-vitepress-plugins`，`build-ai-chat-packages` change 全部勾选），AI 对话组件能力源、Nuxt 文档站与 VitePress 集成插件均已就绪。

**二期已落地进度**：

- `ai-rag-core` 与 `ai-rag-api` 的离线合同已落地：`ai-rag-api` 15 个测试文件 49 个用例通过、`ai-rag-core` 4 个文件 15 个用例通过。
- `event.context.rag` 装配插件已上线（六项配置门禁、模块级单例、request 钩子挂载），但 sync 服务仍是离线 fake：`createSync` 硬编码返回 `{accepted: true, dryRun}`、`syncRuns` 返回空数组，未连接真实 PostgreSQL 持久化。
- Vercel 双项目与 Neon 资源已上线（详见 5. Migration Plan），真实检索、embedding、模型服务与生产装配仍属外部门禁。

**本期定位**：本 change 是二期 AI RAG 长任务的唯一承载，迁移全部设计细节（技术栈选型、模块设计、职责边界、部署契约）与实施进度（已完成模块的验证证据 + 剩余 P0/P1/P2 外部门禁），不混入与二期无关的改动。

## 2. Goals / Non-Goals

**Goals:**

- 掌握 RAG 技术栈并产出可展示的简历作品（背景与定位见 `proposal.md`：AI 应用前端 / AI Agent 全栈偏前端 / TypeScript AI 应用工程师）。
- 落地二期系统全貌：`docs/docx` 知识源结构化 chunk 与增量对账；Neon + drizzle + pgvector 数据层；词法 + 向量 Hybrid Search 与 RRF 融合；独立 Nitro API（`/v1/chat`、`/v1/search`、`/v1/knowledge/sync`、`/v1/knowledge/sync-runs`）；前端以 `vue-element-plus-x` 与 `markstream-vue` 为唯一 UI/Markdown 主线，`@ai-sdk/vue` 负责 transport；VitePress 构建期稳定标题锚点支撑来源跳转。
- 保持 OpenSpec 长任务可恢复：后续执行只以 `tasks.md` 为唯一任务源，外部门禁按证据门禁推进。

**Non-Goals:**

- 禁止引入 Python/FastAPI 后端；禁止引入 Spring/RabbitMQ 等 Java 体系；禁止引入多个向量数据库混用；禁止在第一阶段引入 MCP 工具网关。
- OCR、视觉检索、图片理解和多模态回答属于第三期的独立变更，不能以"补充功能"的方式混入二期。
- 通用 `ai-vue` 展示包不得导入 `@ai-sdk/vue`，不得包含 Nitro 请求逻辑；`@ai-sdk/vue` 仅由业务使用方的 `useKnowledgeChat` 调用。
- AI Elements Vue 仅作未来 Tailwind/shadcn 技术栈的替代方案，本期不得与 Element Plus X 混用。

## 3. Decisions

### 3.1. 技术栈组合

|       层次        |             推荐技术             |                          选型理由                          |
| :---------------: | :------------------------------: | :--------------------------------------------------------: |
|    **前端 UI**    |   Vue3 + `vue-element-plus-x`    |    `Bubble`、`BubbleList`、`Sender` 是唯一聊天 UI 主线     |
|   **流式传输**    |  `@ai-sdk/vue` + 独立 Nitro API  | 使用方的 `useKnowledgeChat` 负责 transport、state 与 abort |
| **Markdown 渲染** |         `markstream-vue`         |   面向 Vue/VitePress 的流式、不完整 Markdown 成熟渲染器    |
|   **代码高亮**    |  `@shikijs/stream`（受控集成）   |       仅在锁定版本并完成兼容性验证后处理生成中代码块       |
|    **数据库**     |    Neon + drizzle + pgvector     |        PostgreSQL 原生向量支持，与业务数据统一建模         |
|   **输入校验**    |               zod                |                TypeScript 原生 schema 校验                 |
|   **RAG 框架**    | LangChain.js / Vercel AI SDK RAG |                     官方支持，稳定可靠                     |

**选型理由**：整条链路保持 TypeScript 主线，与既有 pnpm monorepo、VitePress 文档站和一期三包能力一脉相承；聊天 UI、流式传输、Markdown 渲染、数据库与校验各选一个成熟实现，避免重复造轮子。

**版本锁定**：`vue-element-plus-x@1.3.98`、`markstream-vue@1.0.8`、`@ai-sdk/vue@1.2.12`；`@shikijs/stream@4.4.1` 仅在 3.2 的 spike 通过后接入。Nitro 使用 `nitro` v3（`compatibilityDate 2024-09-19`）；不安装 `nitropack` 或独立 `h3` 包，路由处理统一从 `nitro/h3` 导入。

**替代方案**：自研聊天组件与 Markdown 渲染器（被 3.2 / 3.3 决策否决）；Python/FastAPI 或 Java/Spring 后端（被 Non-Goals 明确禁止）；直接使用 AI Elements Vue（仅保留为 Tailwind/shadcn 备选，见 3.2）。

### 3.2. 聊天 UI 与 Markdown 职责边界

`vue-element-plus-x` 是本期唯一的聊天 UI 主线：使用其 `Bubble`、`BubbleList` 与 `Sender` 负责消息气泡、消息列表、输入和停止交互。`markstream-vue` 是唯一的流式 Markdown 主线，必须直接导入并用于助手消息渲染，以正确处理增量到达和未闭合 Markdown。

- **禁止替代**：不得以本地 `AiChatMessage`、`AiChatComposer`、`AiChatMarkdown`、手写 Markdown parser 或其他同职责组件替代这些依赖。
- **`@shikijs/stream` 受控集成**：它不是 Markdown 渲染器替代品，只可作为 `markstream-vue` 代码块高亮的受控集成项。接入前必须锁定版本，并以真实组件 API spike 验证代码块、未闭合代码块、表格、长回复与 XSS 防护；验证失败时保留 `markstream-vue` 的安全默认渲染，不得假定两者兼容。
- **`ai-vue` 薄适配**：通用 `ai-vue` 展示包只保留薄适配——将项目消息/来源 DTO 映射为第三方组件 props、生成稳定 `sourceHref`、维护 mock 文档示例。`@ai-sdk/vue` 仅由业务使用方的 `useKnowledgeChat` 调用，负责 transport、会话状态和 abort，不进入通用 `ai-vue` 展示包。
- **AI Elements Vue**：仅是未来 Tailwind/shadcn 技术栈的替代方案，本期不得与 Element Plus X 混用。

**选型理由**：`markstream-vue` 是面向 Vue/VitePress 的流式、不完整 Markdown 成熟渲染器；`Bubble`/`BubbleList`/`Sender` 与 `Welcome`/`Prompts` 组成对话壳层，验收边界要求真实 import 而非本地复制实现，避免双实现与双样式维护成本。

**替代方案**：本地维护一套对话 + Markdown 组件（被否决，会造成实现分裂并在后续接入真实 AI 能力时难以收敛）；直接接入 `@shikijs/stream` 高亮（当前 `markstream-vue` 没有已证实的 fenced-code 注入点，未通过 spike 前不得接入，优先验证其自带 `codeRenderer="shiki"` 路径）。

### 3.3. markstream-vue 与 Typewriter 职责边界

`markstream-vue` 与 `vue-element-plus-x` 的 `Typewriter` 不是可互换的同类组件，二者职责边界如下：

| 对比维度 |                         `markstream-vue`                          |   `vue-element-plus-x` 的 `Typewriter`    |      二期选型      |
| :------: | :---------------------------------------------------------------: | :---------------------------------------: | :----------------: |
| 输入对象 |                响应式 Markdown 内容及其流结束状态                 |              已确定的纯文本               |  助手正文使用前者  |
| 流式语义 |     处理 SSE/WebSocket chunk、未闭合 Markdown 与 `final` 收敛     | 不承担传输、Markdown 解析或未闭合结构处理 |  流式状态交给前者  |
| 呈现节奏 | `smoothStreaming` 平滑追赶到达不均的 chunk；`typewriter` 增量逐字 |               单纯文本动画                | 正文只保留前者策略 |
| 适用区域 |              助手回答、代码块、表格、公式与引用内容               |  Welcome 标题、简短状态提示等非 Markdown  |    不得包裹正文    |

- 二期助手正文固定采用 `MarkdownRender` 的 `mode="chat"`，由业务层持续更新 `content`；流式期间传入 `final=false`，收到流结束信号后传入 `final=true`。
- 默认传入 `smoothStreaming="auto"` 并启用 `markstream-vue` 的 `typewriter`，同时固定 `fade=false`，避免高频平滑流与淡入叠加造成重复的透明度重启。服务端一次推送较大的 chunk 时，平滑流式能力仍可小批量呈现，不应改由外层纯文本动画拆分内容。
- 检测到 `prefers-reduced-motion: reduce` 时关闭正文 `typewriter` 与淡入动画，但**不得停止内容流、Markdown 解析或 `final` 收敛**。
- `vue-element-plus-x` 的 `Typewriter` 只允许用于非 Markdown 的短文案（如 Welcome 标题、简短状态提示），且同样必须尊重减少动态效果偏好。
- 禁止自研 Markdown 打字机，也禁止以 Element Plus X 的 `Typewriter` 再包裹 `MarkdownRender`，以免破坏代码围栏、公式、表格和流结束状态的一致性。

**选型理由**：二者服务不同对象——前者处理不断变化的 Markdown 内容，后者处理已确定的纯文本视觉展示；叠加使用会破坏代码围栏、公式、表格与 `final` 收敛的一致性，且属于重复造轮子。

**替代方案**：以纯文本打字机模拟流式回答（被否决，无法处理未闭合 Markdown 的中间状态）；自研打字机组件（被明确禁止）。

### 3.4. 向量数据库渐进策略

|        场景        |       推荐方案       |                 适用情况                 |
| :----------------: | :------------------: | :--------------------------------------: |
|    **本地学习**    |        Chroma        |   快速理解向量库生命周期，无需额外配置   |
|    **正式项目**    |   Neon + pgvector    | 与业务数据统一，drizzle 建模，无额外服务 |
| **检索质量为核心** |        Qdrant        |  专业 hybrid search，性能和过滤能力更强  |
|    **边缘部署**    | Cloudflare Vectorize |        配合 Workers AI，边缘推理         |

**本项目推荐**：采用「本地 Chroma 学习 → Neon/pgvector 落地」的渐进策略。学习阶段用 Chroma 快速理解 add / query / delete 生命周期；正式落地统一使用关联的 Neon 云端资源与 pgvector，不引入第二个向量库。

**选型理由**：学习与落地解耦，避免选型反复浪费学习时间；pgvector 与业务数据统一建模，无需额外服务，符合 Non-Goals 中"禁止多向量库混用"的约束。

**替代方案**：直接上 Qdrant（专业 hybrid search 能力更强，但引入额外服务，与既有 Neon 资源重叠）；Cloudflare Vectorize（边缘部署场景，本期不涉及边缘推理）。

### 3.5. 二期语料与多模态边界

- **唯一知识源**：二期的入库根目录固定为 `docs/docx`，仅扫描 Markdown 文件（不读取 `.png` 与 `.jpg` 等二进制文件）。
- **可变上游产物**：该目录是可变的上游产物，不以首次导入的数据库内容作为事实来源；每次同步都重新扫描目录，并以相对路径和内容哈希对账。
- **图片边界**：图片 URL 由 Markdown 解析器提取并挂载到文档和 chunk 元数据（`imageUrls`），既不下载图片，也不将图片内容发送给 embedding 或聊天模型，不进入 chunk 文本、不参与 embedding。
- **多模态边界**：OCR、视觉检索、图片理解和多模态回答属于第三期的独立变更，不能以"补充功能"的方式混入二期。

**选型理由**：`docs/docx` 由上游 DOCX 转换流程持续更新，开发与生产环境都可读取；以目录实时内容为准做增量对账，才能保证知识库与上游一致。

**替代方案**：以首次导入的数据库内容作为事实来源（被否决，无法感知上游更新）；对图片做 OCR/多模态（明确划入三期）。

### 3.6. Neon 与 pgvector 部署契约

- **固定资源标识**（非敏感信息）：Neon 组织 ID `org-super-fog-48541962`、Neon 项目 ID `patient-cloud-43432277`、Vercel 已关联的 Neon 项目名称 `neon-smallalice-ai-rag`。注意：`neon-smallalice-ai-rag` 是项目名称，项目内的实际数据库名称为 `neondb`（由 Neon MCP `describe_branch` 确认）。不得因示例名称再次执行 `neon projects create` 或 `neon databases create`。
- **连接顺序**：先执行 `vercel env pull .env.local --environment=development` 拉取当前 Vercel 环境变量，再让 Nitro API 连接数据库；连接串绝不写入仓库、报告、测试快照或终端记录。先检查拉取到的变量名，再确定连接串来源：应用运行使用 Vercel 集成提供的 pooled URL（通常为 `POSTGRES_URL`）；Drizzle migration 只使用非 pooled URL（通常为 `POSTGRES_URL_NON_POOLING`）。缺少非 pooled URL 时不得迁移，不能把 pooled URL 冒充 DDL 连接。
- **pgvector 启用**：`CREATE EXTENSION IF NOT EXISTS vector;` 必须位于创建 `vector(1536)` 列之前，且扩展按 Neon 的**每个 database** 启用，不是按 project 或 branch 自动共享；新建 database 后必须再次执行该 migration。

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX chunks_embedding_hnsw_cosine_idx
  ON chunks USING hnsw (embedding vector_cosine_ops);
```

- **向量列契约**：`chunks.embedding` 固定为 `vector(1536)`，与首期 embedding 模型固定维度一致；模型或维度变更是一次迁移与全量重嵌入工作，禁止混写到同一 `embedding` 列。
- **索引与检索一致性**：HNSW 使用 `vector_cosine_ops`，与余弦距离检索的 `<=>` 保持一致；HNSW 是近似检索，可能影响召回率，须以固定评估集将其与无索引的精确检索对比后才作为生产默认。

**选型理由**：直接复用仓库关联 Vercel 项目的既有 Neon 资源，避免创建同用途的第二个 project 或 database；pooled / 非 pooled URL 分离保证应用连接池与 DDL 迁移各自的正确语义。

**替代方案**：新建独立 Neon 项目（被否决，违反固定资源契约）；应用与 migration 共用同一 URL（被否决，pooled URL 不适合 DDL 连接）。

### 3.7. Neon CLI 强制执行与执行记录

- **禁止 `neonctl`**：项目执行入口只能调用官方 `neon` CLI，禁止 `neonctl`、其包装器或以 `npx` 临时安装的同名替代命令。Windows 已发生过 `neonctl@2.30.1` 的 `dist/cli.js --help` 在 `cmd -> node` 链路中无端口占用单核 CPU 自旋的事故：5 秒 CPU 增量为 5.66 秒，累计 CPU 达 7891.41 秒。因此 `neonctl --help`、`neonctl --version` 和所有资源查询都属于禁止路径，不得以"只读检查"为由绕过。
- **可执行守卫**：`scripts/guard-neon-cli.ts` 通过 std-env 先判断平台——仅 Windows 扫描整个仓库的可执行文件类型，并排除依赖目录、构建产物和守卫自身；Linux、macOS 与 Vercel 构建环境不扫描、直接成功退出。后续新增的数据库脚本必须把该守卫作为前置步骤，不能以文档声明替代可执行检查。
- **正确替代顺序**：运行 `pnpm run neon:guard` → 由用户确认官方 `neon` 已安装并完成认证（代理不得自行安装、认证或读取 CLI 凭据）→ 使用 `neon projects get patient-cloud-43432277 --output json`、`neon branches list`、`neon databases list` 或 `neon psql` 完成对应步骤。
- **执行记录**：每次实际云端操作都必须留下不含密钥的执行记录：执行时间、操作者已确认的认证状态、工作目录、脱敏后的 `neon` 命令模板、目标 project/branch/database、退出码和验证结果。若命令超时或异常，记录 PID、父进程、CPU 采样和监听端口；先停止可复核的异常子进程，再重新采样，禁止把长期运行的 MCP、开发服务或不明进程一并结束。

**选型理由**：`neonctl` 在 Windows 上已复现严重故障路径（无端口 CPU 自旋），官方 `neon` CLI 与既有 Neon MCP 工具链一致，且可被守卫脚本强制校验。

**替代方案**：以文档声明替代可执行检查（被否决，无法防止误用）；允许 `npx` 临时安装替代命令（被明确禁止）。

### 3.8. Chunk 策略与锚点算法

**Chunk 策略契约**：

```typescript
interface ChunkConfig {
	targetTokens: number;
	overlapTokens: number;
	tableRowsPerChunk: number;
	profileVersion: string;
}

interface ChunkMetadata {
	sourcePath: string;
	headingPath: string[];
	headingIndex: number;
	headingAnchor: string;
	chunkIndex: number;
	imageUrls: string[];
	chunkKind: "prose" | "table";
	tableRowStart?: number;
	tableRowEnd?: number;
	contentHash: string;
}
```

默认配置为 `targetTokens: 500`、`overlapTokens: 50`、`tableRowsPerChunk: 12` 和 `profileVersion: "markdown-structure-v1"`。

- **语义块优先**：先按 H1/H2/H3 构造语义块，标题进入 `headingPath`；普通段落只在超过 token 上限时递归切分并保留 overlap。
- **表格原子性**：表格小于上限时保持完整；超过 token 上限的表格按连续行组切分，每个行组重复表头、当前标题路径和图片 URL。
- **图片排除**：图片 URL 不进入 chunk 文本，不参与 embedding。
- **`headingIndex`**：Markdown AST 内 H1/H2/H3 的零基出现序号；无标题根块为 `-1`。
- **`headingAnchor` 算法**：有标题时，由 `sourcePath`、完整 `headingPath` 与 `headingIndex` 使用 `"\u0000"` 固定分隔符拼接后计算 SHA-256，并使用完整 base64url 摘要生成 `rag-heading-<digest>`。它与 Markdown 渲染器默认生成的标题 id 无关，既避免中文标题 slug 规则变化，也能区分同一父级下的同名标题。
- **无标题根块**：使用 `rag-document-<sourcePath-digest>`，其来源链接不附加 hash，直接打开文档顶部。
- **`chunkIndex`**：同一源文件内从 `0` 递增且连续；它用于区分同一标题下的多个文本块，不替代标题锚点。

```typescript
// headingAnchor 计算示意
const digest = base64url(sha256([sourcePath, headingPath.join("\u0000"), String(headingIndex)].join("\u0000")));
const headingAnchor = `rag-heading-${digest}`;
```

**选型理由**：标题优先 + 表格行组分块在可检索性与可溯源性之间取得平衡；确定性锚点算法与渲染器 slug 解耦，保证来源跳转在 chunk 入库与 VitePress 构建两侧一致。

**替代方案**：固定大小切分（失去语义边界）；依赖 VitePress 默认标题 slug（中文 slug 规则不稳定，且无法区分同名标题，被 3.10 否决）。

### 3.9. 知识源同步设计

- **幂等对账**：知识源同步按 `sourcePath` 与内容哈希幂等执行。源文件未变化且 `profileVersion`、embedding 模型版本未变化时跳过；文件新增或变化时先完成新 chunk 与 embedding 生成，再以单文档事务替换旧版本；重建失败时旧版本必须继续可检索。
- **删除安全**：扫描完整成功后，才删除本轮未出现的 `sourcePath` 及其 chunk；扫描不完整或读取失败时绝不据此删除旧数据。
- **同步记录**：每轮同步记录扫描文件数、未变化数、新增数、更新数、删除数、写入 chunk 数、失败文件列表和同步状态，写入 `knowledge_sync_runs` 表。
- **触发方式**：开发环境提供一次性命令（`rag:sync`）与可选文件监听（`rag:watch`）；生产环境不依赖常驻 watcher——上游 DOCX 转换完成后调用受 `NITRO_KNOWLEDGE_SYNC_TOKEN` 保护的同步入口，并使用 Vercel Cron 做定时对账兜底。Vercel Cron 的 `GET` 请求使用平台的 `CRON_SECRET`，鉴权实现需兼容这两种受控凭据（POST 用 `NITRO_KNOWLEDGE_SYNC_TOKEN`、Cron GET 用 `CRON_SECRET`）。
- **单一服务**：命令 / POST / Cron 三种触发方式必须复用同一个同步服务，避免出现不同的切分、哈希或删除语义。
- **并发拒绝**：使用 PostgreSQL advisory lock 拒绝并发同步，不能使用仅在单个 Serverless 实例有效的进程内锁。
- **部署输入**：生产 API 构建必须显式把 `docs/docx` 纳入函数可读的部署输入，不能假定 Vercel 运行目录保留完整 Git 工作区。
- **同步入口边界**：同步入口只扫描 `NITRO_KNOWLEDGE_SOURCE_ROOT` 指向的 `docs/docx` 目录，不得接收客户端传入的 Markdown 内容或文件路径。

**选型理由**：以目录实时内容为准 + 内容哈希对账，保证与可变上游一致；单文档事务与先建后换保证失败可回退；advisory lock 在 Serverless 多实例下依然有效。

**替代方案**：进程内锁（多实例下失效）；常驻 watcher 作为生产触发（Serverless 不适用）；客户端直传内容入库（安全边界被否决）。

### 3.10. 来源跳转契约

- **`sourceUrl` 派生规则**：`docs/docx` 由 VitePress 构建为现有静态文档页，`sourcePath` 通过移除 `docs/` 前缀、将 `.md` 替换为 `.html` 并逐段 URL 编码（`encodeURIComponent`），得到 `sourceUrl`。

```typescript
/** 返回 VitePress 静态文档地址；地址由 sourcePath 派生，不入库。 */
function createSourceUrl(sourcePath: string): string {
	const relativePath = sourcePath.replace(/^docs\//, "").replace(/\.md$/, ".html");
	return `/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}
```

- **锚点一致性**：VitePress 的 Markdown 构建扩展使用同一 AST 与 `sourcePath` / `headingPath` 算法，为每个 H1/H2/H3 写入 3.8 的 `headingAnchor` 作为 DOM `id`；来源卡片链接为 `sourceUrl#headingAnchor`。
- **禁止默认 slug**：不得依赖 VitePress 默认的标题 slug；页面加载后若找不到该锚点元素，显式回退到文档顶部。
- **展示字段**：`sourceUrl` 是由 `sourcePath` 派生的展示字段，不作为数据库中的环境相关持久化数据；不得新增从数据库读取 Markdown 的来源阅读器或 Nitro 来源路由。

**选型理由**：chunk 入库与 VitePress 构建共用同一 AST 与锚点算法，保证"检索到的 chunk → 页面标题段落"一一对应；`sourceUrl` 不入库避免环境相关数据污染。

**替代方案**：依赖 VitePress 默认标题 slug（中文标题 slug 规则不稳定、同名标题无法区分）；数据库直读 Markdown 的来源阅读器（多一条渲染链路，被否决）。

### 3.11. Embedding 配置

```typescript
interface EmbeddingConfig {
	provider: "openai" | "cohere" | "local";
	model: string; // 'text-embedding-3-small' / 'embed-multilingual-v3.0'
	dimension: number; // 1536 / 1024 / 768
	batch_size: number; // 默认 100
}
```

首期固定配置：`provider: "openai"`、`model: "text-embedding-3-small"`、`dimension: 1536`、`batch_size: 100`。维度与 3.6 的 `vector(1536)` 列一致；批量处理（batch 100）用于控制 embedding API 成本。

**选型理由**：`text-embedding-3-small` 是 OpenAI 官方小模型，1536 维与 pgvector 列契约匹配，成本低、质量满足中文技术文档检索。

**替代方案**：Cohere `embed-multilingual-v3.0`（多语言场景备选，首期不启用）；本地 embedding 模型（成本更低但质量与部署复杂度不确定，作为优化阶段的候选）。

### 3.12. Hybrid Search 与 RRF 融合

- **词法检索**：使用 PostgreSQL 全文检索——`ts_rank_cd(to_tsvector('simple', content), websearch_to_tsquery('simple', query))` 排序、`@@` 命中过滤。**注意：这是 PostgreSQL 词法全文检索，不是 BM25；未验证前不得标注为 BM25**。若 `simple` 配置无法满足中文检索，再单独评估可用的中文分词或词法检索方案。
- **向量检索**：pgvector 余弦距离 `<=>`（与 3.6 的 HNSW `vector_cosine_ops` 一致），将距离映射为相似度。
- **RRF 融合**：k=60，采用**标准 RRF 语义**（按排名融合 `1/(k+rank)`），与已落地实现 `packages/ai-rag-core/src/rrf.ts` 的 `fuseRankings` 一致（非法 k 抛 RangeError）。旧设计文档 §3.2.3 的加权求和公式 `(1/(k+i+1)) * score` 与旧计划 2.2 Step 1 的 `rrf` 草图（`1/(k+i+1)` 忽略 rank 的变体）都是早期草图、不具备权威性，不得按它们实现；规格与实现均以标准 RRF 为准。

- **三模式可切换**：仅关键词 / 仅向量 / hybrid 三种模式可切换，供固定评估集对比。
- **ReRank（可选进阶）**：对 Top-K 结果语义重排，支持 Jina Reranker / 本地模型，精排后返回 Top-N（通常 N=3~5）。
- **固定评估集**：准备 10~20 个固定问题，对比不同检索策略（lexical / vector / hybrid）效果；HNSW 近似检索须与精确检索对比后才作默认。

**选型理由**：PostgreSQL 内置全文检索与 pgvector 在同一数据库内完成双路检索，无额外服务；RRF 融合简单稳定，不依赖权重调参。

**替代方案**：真实 BM25（需要额外扩展或服务，未验证前不得宣称）；加权分数融合（权重敏感，不如 RRF 稳健）。

### 3.13. 流式问答 API 与错误映射

- **RAG Prompt 模板**：上下文组装使用固定模板，标注每个观点的来源 `[来源N]`，资料不足时说明「根据现有资料无法回答」。

```typescript
const RAG_PROMPT = `
你是一个知识库问答助手。请根据以下参考资料回答用户问题。
如果参考资料中没有相关信息，请如实说明。

参考资料：
{context}

问题：{question}

回答要求：
1. 基于参考资料如实回答
2. 标注每个观点的来源，格式：[来源N]
3. 如果资料不足，说明「根据现有资料无法回答」

回答：
`;
```

- **流式返回**：Nitro v3 handler 直接返回 AI SDK 生成的 Web 标准 `Response`（`result.toDataStreamResponse()`），**不得**把流式 Response 再包装为 JSON，也**不得**在返回该 `Response` 后继续改写状态码或响应头。
- **zod 校验**：`message: z.string().min(1)`、`conversationId: z.string().optional()`。
- **错误映射**：`zod` 校验失败 → `400`；鉴权失败 → `401/403`；并发同步 → `409`；其他未预期错误 → `500`。HTTP 状态码必须真实，不能只在 JSON 中写 `code` 而让 HTTP 响应仍为 `200`。
- **来源数据帧**：通过 `toDataStreamResponse({ data })` 返回来源 DTO（`id`、`content` 截断片段、`score`、`sourcePath`、`sourceUrl`、`headingPath`、`headingIndex`、`chunkIndex`、`headingAnchor`、`imageUrls`）。

**选型理由**：AI SDK 的 data-stream 协议原生支持文本帧与数据帧并存，来源与流式正文走同一通道；真实 HTTP 状态码保证前端与运维可依赖。

**替代方案**：JSON 包装流式响应（破坏 SSE 语义，被否决）；只返回业务 `code` 不设置 HTTP 状态码（违反错误映射契约）。

### 3.14. 运行时装配工厂与配置失败合同

- **装配工厂**：`createRagRuntimeContext(config, factories)` 注入 database / embedding / model / sync 四类 provider，输出路由所需的 `event.context.rag` 能力：`retrieve`、`search`、`stream`、`sync`、`syncRuns` 及只读配置。
- **边界**：工厂不得读取裸 `process.env`，不得在 import 时建立数据库连接；数据库、embedding 和模型连接必须由 factory 参数注入。
- **失败合同**：缺少 database、embedding 或 model 配置时，不生成半成品 context，抛出 `RagRuntimeNotConfiguredError`（`503 RAG_NOT_CONFIGURED`）；provider factory 抛错时映射为 `RagRuntimeProviderError`（`500`），绝不被路由转换成 HTTP 200 假成功。
- **配置门禁**：`plugins/rag.ts` 装配插件已上线，六项配置门禁为 `databaseUrl`、`openaiApiKey`、`chatModel`、`embeddingModel`、`knowledgeSyncToken`、`cronSecret`；采用模块级单例 + request 钩子挂载 `event.context.rag`。
- **当前现状**：sync provider 仍为离线 fake（`createSync` 硬编码返回 `{accepted: true, dryRun}`、`syncRuns` 返回空数组），未连接真实 PostgreSQL 持久化；该现状是本 change 后续 P0 待办要替换的目标。

**选型理由**：显式依赖注入使路由与真实 provider 解耦，离线合同测试（真实 `createApp`/`app.fetch` harness）与生产装配走同一路径；配置缺失与 provider 错误的区分保证 503/500 语义稳定。

**替代方案**：工厂内直接读 `process.env`（破坏可测试性与失败合同）；缺失配置时返回降级 context（会产出半成品，被否决）。

### 3.15. 前端交互与 transport 边界

- **`useKnowledgeChat` 位于业务使用方**：它以 `@ai-sdk/vue` 管理消息、请求 transport、流式状态和 abort，并把规范化后的消息与来源 DTO 传给 Element Plus X 和 `markstream-vue`。通用 `ai-vue` 不导入 `@ai-sdk/vue`，也不包含 Nitro 请求逻辑；来源 footer 与 mock 示例只能基于传入数据工作，不能绕过这层边界。
- **来源 DTO（前端）**：只传递 `id`、`label`、`sourceHref`（含 `snippet` 等展示字段），由 `resolveSourceHref(source)` 使用入库时确定的稳定锚点跳转（`headingIndex === -1` 时直接返回 `sourceUrl`，否则 `sourceUrl#headingAnchor`）。
- **来源隔离**：每轮请求先清空 SDK `data`，再按本轮新助手消息 ID 保存来源，避免累计来源跨轮串扰。
- **未装配契约**：`503 RAG_NOT_CONFIGURED` 在前端可展示、可关闭；mock 示例必须明确保持本地边界，不绕过 transport 层。
- **停止生成**：`Sender` 的发送和停止事件由使用方的 `useKnowledgeChat` 绑定，停止操作复用 `@ai-sdk/vue` 的 `stop()` 事件链（AbortController）；在真实 transport 未接入时，应用层提供可见、可访问的"停止生成"入口。

**选型理由**：transport / 会话状态 / abort 是 `@ai-sdk/vue` 的职责，UI 呈现是 Element Plus X 与 `markstream-vue` 的职责；薄适配层保证通用 `ai-vue` 包可独立演进。

**替代方案**：在通用 `ai-vue` 内直接调用 `@ai-sdk/vue` 或发起 Nitro 请求（违反 Non-Goals，被否决）。

**文档管理 UI 组件**（对应旧设计 §3.3.3，前端展示层）：

|   组件   |       功能       |                  技术要点                  |
| :------: | :--------------: | :----------------------------------------: |
| 同步记录 | 展示最近同步任务 |      状态、耗时、增改删数量、失败文件      |
| 文档列表 |  展示已同步文档  | 源路径、内容哈希、chunk 数量、最近同步时间 |
| 检索面板 |   展示检索结果   |            片段预览、相似度分值            |

### 3.16. 学习路径与里程碑

**学习阶段划分（四阶段）**：

|           阶段           |                                                              核心内容                                                               |
| :----------------------: | :---------------------------------------------------------------------------------------------------------------------------------: |
|    RAG 基础与本地实验    |             Chunk 策略（固定大小/语义切分/overlap）；Chroma 本地向量库 add/query/delete；首个 embedding；最小 RAG demo              |
| 检索质量与 Hybrid Search |               PostgreSQL full-text search 基础；关键词 + 向量并行检索 → RRF 融合；ReRank 概念（可选）；固定评估集对比               |
|     工程落地与产品化     | Neon + drizzle + pgvector 建模与迁移；独立 Nitro API（同步/向量生成/流式问答）；Element Plus X + 流式 Markdown + 来源高亮；zod 校验 |
|      优化与展示准备      |            检索质量调优（chunk_size/top_k/score threshold）；批量 embedding、缓存策略；简历作品文档完善；演示视频/README            |

**里程碑检查点**：

|      里程碑       |                完成标准                 |     交付物     |
| :---------------: | :-------------------------------------: | :------------: |
| M1：最小 RAG 闭环 |       能从文档检索相关内容并回答        | 本地 demo 截图 |
| M2：Hybrid Search |  支持关键词 + 向量混合检索，可对比效果  |   评估结果表   |
| M3：完整问答系统  | 知识源同步 → 检索 → 流式回答 → 来源展示 |   可演示作品   |
|  M4：简历作品集   |  完整的项目 README、技术博客或演示视频  |  GitHub 仓库   |

**选型理由**：学习顺序由浅入深——先本地实验理解原理，再以固定评估集驱动检索质量，再工程化落地，最后包装为简历作品；里程碑与简历能力关键词（RAG / Hybrid Search / 引用溯源 / 流式渲染 / Neon / pgvector）一一对应。

**替代方案**：直接进入工程落地（跳过原理与评估，检索质量问题无法归因）；无限期停留在学习阶段（无法产出作品）。

**学习理解验收**（对应旧设计 §7.3，学习层面验收标准）：能解释 Chunk 策略（不同策略的适用场景）、能解释 Embedding（向量化的原理和维度选择）、能解释 Hybrid Search（BM25/词法与向量的互补性）、能解释 ReRank（两阶段检索的意义）。

### 3.17. 系统架构总览与参考资料

**架构分层**（对应旧设计 §3.1；数据层以实际落地的三表为准，旧草图中的 conversations/messages/embeddings 表已被实际 schema 取代）：

```plain
┌─────────────────────────────────────────────────────────────┐
│                    前端层 (Vue3 + Element Plus X)            │
│  知识库同步状态 → Markdown 渲染 → 流式问答 → 来源高亮 → 会话管理 │
├─────────────────────────────────────────────────────────────┤
│                  API 层（独立 Nitro 服务）                    │
│  /v1/chat (流式对话) │ /v1/knowledge/sync (同步) │ /v1/search │
│  /v1/knowledge/sync-runs (同步记录)                          │
├─────────────────────────────────────────────────────────────┤
│                   RAG 引擎层                                 │
│  Chunk → Embedding → Vector Store → Hybrid Search → ReRank │
├─────────────────────────────────────────────────────────────┤
│             数据层 (Neon + drizzle + pgvector)               │
│  documents │ chunks │ knowledge_sync_runs                   │
└─────────────────────────────────────────────────────────────┘
```

**参考项目与资料**（对应旧设计 §5，学习路线参考）：

|                                                 项目/文档                                                  |                     用途                      |
| :--------------------------------------------------------------------------------------------------------: | :-------------------------------------------: |
|                           [zhilv-yuntu](https://github.com/tutu-zzz/zhilv-yuntu)                           | RAG 产品化思路（retriever.py / vector_db.py） |
|                     [ai-sdk-rag-starter](https://github.com/vercel/ai-sdk-rag-starter)                     |    技术栈对齐（Drizzle + pgvector + RAG）     |
|              [agents-from-scratch-ts](https://github.com/langchain-ai/agents-from-scratch-ts)              |       Agent 原理（TypeScript 从零理解）       |
|                     [AI SDK RAG Guide](https://ai-sdk.dev/cookbook/guides/rag-chatbot)                     |          Vercel AI SDK RAG 完整指南           |
| [LangChain.js PGVectorStore](https://docs.langchain.com/oss/javascript/integrations/vectorstores/pgvector) |                 pgvector 集成                 |
|                            [Neon LangChain](https://neon.com/docs/ai/langchain)                            |               Neon 向量存储接入               |
|             [Chroma Getting Started](https://docs.trychroma.com/docs/overview/getting-started)             |                本地向量库入门                 |

**禁止参考项目（干扰项）**：AgentX（Java/Spring 体系，不适合 TypeScript 主线）、Dify（平台复杂度高）、自研 Agent 平台（过早引入大架构）。

**最终形态**（对应旧设计 §8.1）：前端 Vue3 + Element Plus X + `@ai-sdk/vue`；服务端独立 Nitro + zod；数据层 Neon + drizzle + pgvector；RAG 引擎 LangChain.js / Vercel AI SDK；检索策略 Hybrid Search（词法 + 向量）+ ReRank；部署 Vercel。

## 4. Risks / Trade-offs

**风险表**：

|       风险       |         影响         |                      应对策略                      |
| :--------------: | :------------------: | :------------------------------------------------: |
|   检索质量不佳   | 回答无来源或来源错误 | 重点优化 chunk 策略和 top_k 参数，以固定评估集驱动 |
| embedding 成本高 |  API 调用费用超预算  |   使用本地模型 / 小模型 / 批量处理（batch 100）    |
|   流式渲染性能   |    大量文本时卡顿    |          虚拟滚动 / 分批渲染 / Web Worker          |
|  向量库选型反复  |     浪费学习时间     |    明确「本地 Chroma 学习 + Neon 落地」渐进策略    |
|   作品集缺亮点   |     简历无竞争力     |      突出 Hybrid Search + 引用溯源 + 流式体验      |

**已记录事故约束**（历史事故沉淀，后续执行必须遵守）：

- **Windows `neonctl` CPU 自旋**：`neonctl@2.30.1` 的 `--help` 在无监听端口时持续占用单核 CPU（5 秒增量 5.66 秒，累计 7891.41 秒）。禁止 `neonctl`，统一使用官方 `neon` CLI 并以 `scripts/guard-neon-cli.ts` 强制执行（见 3.7）。
- **Vercel Corepack**：git-push 远程构建 `ERR_PNPM_META_FETCH_FAIL` 持续失败，底层根因是 `ERR_INVALID_THIS`；Vercel 云端三环境（production/preview/development）须设置 `ENABLE_EXPERIMENTAL_COREPACK=1` 后再排查 pnpm 兼容性。
- **git-changelog 无 `.git` 目录**：在无 git 上下文的构建环境执行会 exit 128；保留 `shouldDisableGitChangelog` 检测避免构建失败。
- **`ai-vue-doc` Content 跨运行时**：`@ztl-uwu/nuxt-content@2.13.9` 在宿主侧加载 `@vueuse/nuxt@14.3.0`，pnpm 不暴露未声明的传递入口；`ai-vue-doc` 须显式约束 `@ztl-uwu/nuxt-content@2.13.9`、`h3@1.15.11` 与 `@vueuse/nuxt@14.3.0`。
- **Windows `docs:build` 内存**：完整文档构建须 `NODE_OPTIONS=--max-old-space-size=8192` 且串行构建（Nitro prerender 峰值约 7 GiB），不得因短时无输出并行重启或提前终止。
- **`pnpm-lock.yaml` 被 gitignore**：锁文件不入库，环境复现依赖安装时的真实解析结果，须以安装验证为准。

## 5. Migration Plan

**运行架构现状（已上线，本次不改变）**：

- **数据库**：Neon migration `0000_ai_rag.sql` 已在云端执行——vector 0.8.0、`documents` / `chunks` / `knowledge_sync_runs` 三表、HNSW 余弦索引（`chunks_embedding_hnsw_cosine_idx`），已由 Neon MCP `run_sql` 独立复核。
- **部署**：Vercel 双项目已上线——`small-alice-web-odse` 文档站 + `smallalice-docs-ai-nitro-api` Nitro API（Mode A 产物搬运，仓库根删除 `vercel.json`，配置迁移到云端 Project Settings），生产域名 `https://smallalice-docs-ai-nitro-api.ruan-cat.com/`；7 个 `NITRO_*` 环境变量跨 production/preview/development 三环境接线。

**本次迁移范围**：本次迁移为**任务体系迁移**（superpowers → OpenSpec），不改变运行架构、不重复执行 migration、不重复部署。`docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md` 与 `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md` 保留并在顶部标注已被本 change 取代，不再作为任务管理源。

**迁移步骤**：

1. 本 design.md 落地全部技术决策（对应上表 3.1 ~ 3.17），`proposal.md` 定义能力契约。
2. 后续以 `tasks.md` 为唯一任务源推进剩余 P0/P1/P2 外部门禁（真实 PostgreSQL 检索 provider、真实 embedding 与增量对账、生产 `event.context.rag` 装配、`@shikijs/stream` 兼容验证、评估集运行、部署回归、README 与演示视频）。
3. 进度与失败记录固定在 `agent-progress.md` / `agent-findings.md`，保证跨 checkpoint 恢复续跑。

**回滚策略**：本 change 是纯文档迁移，不触碰运行代码；若实施阶段出现不可控风险，可依据 `agent-findings.md` 的失败记录收缩任务或拆分新的 OpenSpec change，已上线的 Vercel/Neon 资源不受影响。

## 6. Open Questions

无；遗留决策均已在 3.x 解决。
