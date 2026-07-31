# 二期 AI 化任务设计文档

> **RAG 与检索质量阶段 — 简历能力拓展核心**

## 一、背景与目标

### 1.1 项目定位

本期是 AI 转型路线图的第二阶段，核心目标是**掌握 RAG（检索增强生成）技术栈，并产出可展示的简历作品**。

- **学习者定位**：AI 应用前端、AI Agent 全栈偏前端、TypeScript AI 应用工程师
- **当前阶段**：已完成（或具备）AI Chat 基础，正在向 RAG 知识库方向深入
- **目标作品**：基于 RAG 的动态知识库问答系统，支持知识库同步、向量检索、流式问答与引用溯源
- **二期语料**：`docs/docx/**/*.md` 是唯一知识源；开发与生产环境都可读取该目录，文件由上游 DOCX 转换流程持续更新。图片不做 OCR 或多模态检索，只保留 Markdown 中的图片 URL 作为来源元数据

### 1.2 核心能力目标

| 能力维度 | 具体要求                                              |
| -------- | ----------------------------------------------------- |
| RAG 基础 | 理解 chunk 切分、embedding 生成、向量库存储与检索     |
| 检索质量 | 掌握 BM25/全文检索 + 向量检索的 hybrid search         |
| 引用溯源 | 回答必须带来源片段，支持点击跳转                      |
| 前端交互 | 流式 Markdown 渲染、代码高亮、自动滚动、停止生成      |
| 工程能力 | 使用 drizzle + Neon/pgvector 做持久化，zod 做输入校验 |

### 1.3 简历能力关键词

```plain
AI 知识库问答系统 / RAG / Hybrid Search / 向量检索 / 引用溯源 /
流式渲染 / SSE / Chunk / Embedding / Neon / pgvector /
TypeScript / VitePress / 独立 Nitro / Element Plus X
```

---

## 二、技术栈选型

### 2.1 技术栈组合

| 层次              | 推荐技术                         | 选型理由                                        |
| ----------------- | -------------------------------- | ----------------------------------------------- |
| **前端 UI**       | Vue3 + Element Plus X            | 已有 Vue3 经验，Element Plus X 提供 AI 对话组件 |
| **流式传输**      | @ai-sdk/vue + 独立 Nitro API     | 统一的流式响应协议，Nitro 提供 `/v1/chat` 入口  |
| **Markdown 渲染** | x-markdown-vue + @shikijs/stream | 支持流式增量渲染，代码块动态高亮                |
| **数据库**        | Neon + drizzle + pgvector        | PostgreSQL 原生向量支持，与业务数据统一建模     |
| **输入校验**      | zod                              | TypeScript 原生 schema 校验                     |
| **RAG 框架**      | LangChain.js / Vercel AI SDK RAG | 官方支持，稳定可靠                              |

### 2.2 向量数据库选型建议

| 场景               | 推荐方案             | 适用情况                                 |
| ------------------ | -------------------- | ---------------------------------------- |
| **本地学习**       | Chroma               | 快速理解向量库生命周期，无需额外配置     |
| **正式项目**       | Neon + pgvector      | 与业务数据统一，drizzle 建模，无额外服务 |
| **检索质量为核心** | Qdrant               | 专业 hybrid search，性能和过滤能力更强   |
| **边缘部署**       | Cloudflare Vectorize | 配合 Workers AI，边缘推理                |

**本项目推荐**：采用「本地 Chroma 学习 → Neon/pgvector 落地」的渐进策略。

### 2.3 技术栈禁止清单

- ❌ 禁止引入 Python/FastAPI 后端
- ❌ 禁止引入 Spring/RabbitMQ 等 Java 体系
- ❌ 禁止引入多个向量数据库混用
- ❌ 禁止在第一阶段引入 MCP 工具网关

### 2.4 二期语料与多模态边界

二期的入库根目录固定为 `docs/docx`，仅扫描 Markdown 文件。该目录是可变的上游产物，不以首次导入的数据库内容作为事实来源；每次同步都重新扫描目录并以相对路径和内容哈希对账。图片 URL 由 Markdown 解析器提取并挂载到文档和 chunk 元数据，既不下载图片，也不将图片内容发送给 embedding 或聊天模型。OCR、视觉检索、图片理解和多模态回答属于第三期的独立变更，不能以“补充功能”的方式混入二期。

### 2.5 Neon 与 pgvector 部署契约

本仓库关联的 Vercel 项目已安装 `neon-smallalice-ai-rag`，二期直接复用这一云端资源，不得新建同用途的 Neon project 或 database。固定的非敏感资源标识为：Neon 组织 ID `org-super-fog-48541962`、Neon 项目 ID `patient-cloud-43432277`、Vercel 已关联的 Neon 数据库名称 `neon-smallalice-ai-rag`。实施连接的顺序固定为：先使用 `vercel env pull .env.local --environment=development` 拉取当前 Vercel 环境变量，再让 Nitro API 连接数据库；连接串绝不写入仓库、报告、测试快照或终端记录。应用运行使用 Vercel 集成提供的 pooled URL，Drizzle migration 使用非 pooled URL；环境变量的实际名称以拉取结果为准，缺少非 pooled URL 时不得迁移。

本项目统一使用官方 `neon` CLI。CLI 的安装与认证由用户完成，代理不得自行安装、认证或读取 CLI 凭据；认证完成后，才可通过 `neon projects list --output json`、`neon branches list` 与 `neon databases list` 核对既有资源的真实 ID，再对目标 development branch 执行 migration。`pgvector` 通过首个 migration 的 `CREATE EXTENSION IF NOT EXISTS vector;` 启用，并且必须在每个要写入向量的 database 中单独启用。`chunks.embedding` 固定为 `vector(1536)`，首期使用余弦距离 `<=>` 与 HNSW 的 `vector_cosine_ops`；HNSW 是近似检索，须以固定评估集对比精确检索后才作为默认。

---

## 三、核心功能设计

### 3.1 RAG 系统架构

```plain
┌─────────────────────────────────────────────────────────────────┐
│                        前端层 (Vue3 + Element Plus X)           │
├─────────────────────────────────────────────────────────────────┤
│ 知识库同步状态 → Markdown 渲染 → 流式问答 → 来源高亮 → 会话管理    │
├─────────────────────────────────────────────────────────────────┤
│                       API 层（独立 Nitro 服务）                  │
├─────────────────────────────────────────────────────────────────┤
│ /v1/chat (流式对话) │ /v1/knowledge/sync (同步) │ /v1/search │
│ /v1/knowledge/sync-runs (同步记录)                              │
├─────────────────────────────────────────────────────────────────┤
│                        RAG 引擎层                                │
├─────────────────────────────────────────────────────────────────┤
│  Chunk → Embedding → Vector Store → Hybrid Search → ReRank     │
├─────────────────────────────────────────────────────────────────┤
│                        数据层 (Neon + drizzle + pgvector)       │
├─────────────────────────────────────────────────────────────────┤
│  documents │ chunks │ conversations │ messages │ embeddings    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心模块设计

#### 3.2.1 文档管理模块

| 功能       | 描述                           | 技术要点                                   |
| ---------- | ------------------------------ | ------------------------------------------ |
| 知识源同步 | 扫描 `docs/docx/**/*.md`       | 增量处理新增、修改、删除；仅 Markdown 文本 |
| 文档解析   | 提取标题、段落、表格和图片 URL | 保留标题层级与源文件路径                   |
| Chunk 切分 | 标题优先、表格行组、token 兜底 | 超长语义块才使用 overlap                   |
| 元数据管理 | 来源、标题路径、图片 URL、版本 | 支持精确跳转和幂等重入库                   |

**Chunk 策略要点**：

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

默认配置为 `targetTokens: 500`、`overlapTokens: 50`、`tableRowsPerChunk: 12` 和 `profileVersion: "markdown-structure-v1"`。先按 H1/H2/H3 构造语义块；普通段落只在超过 token 上限时递归切分并保留 overlap。表格小于上限时保持原子性，超长表格按连续行组拆分，每个行组重复表头、当前标题路径和图片 URL。图片 URL 不进入 chunk 文本，不参与 embedding。

`headingIndex` 是 Markdown AST 内 H1/H2/H3 的零基出现序号；无标题根块为 `-1`。有标题时，`headingAnchor` 由 `sourcePath`、完整 `headingPath` 与 `headingIndex` 使用 `"\u0000"` 固定分隔符拼接后计算 SHA-256，并使用完整 base64url 摘要生成 `rag-heading-<digest>`。它与 Markdown 渲染器默认生成的标题 id 无关，既避免中文标题 slug 规则变化，也能区分同一父级下的同名标题。无标题根块使用 `rag-document-<sourcePath-digest>`，其来源链接不附加 hash，直接打开文档顶部。同一源文件内的 `chunkIndex` 从 `0` 递增且连续；它用于区分同一标题下的多个文本块，不替代标题锚点。

知识源同步按 `sourcePath` 与内容哈希幂等执行：源文件未变化且 `profileVersion`、embedding 模型版本未变化时跳过；文件新增或变化时先完成新 chunk 与 embedding 生成，再以单文档事务替换旧版本，重建失败时旧版本必须继续可检索。扫描完整成功后，才删除本轮未出现的 `sourcePath` 及其 chunk；扫描不完整或读取失败时绝不据此删除旧数据。每轮同步记录扫描文件数、未变化数、新增数、更新数、删除数、写入 chunk 数、失败文件列表和同步状态。

同步服务在开发环境提供一次性命令与可选文件监听，在生产环境不依赖常驻 watcher：上游 DOCX 转换完成后调用受 `NITRO_KNOWLEDGE_SYNC_TOKEN` 保护的同步入口，并使用 Vercel Cron 做定时对账兜底。Vercel Cron 的 `GET` 请求使用平台的 `CRON_SECRET`，鉴权实现需兼容这两种受控凭据。三种触发方式必须复用同一个同步服务，避免出现不同的切分、哈希或删除语义。生产 API 构建必须显式把 `docs/docx` 纳入函数可读的部署输入，不能假定 Vercel 运行目录保留完整 Git 工作区。

**来源跳转契约**：`docs/docx` 由 VitePress 构建为现有静态文档页，`sourcePath` 通过移除 `docs/` 前缀、将 `.md` 替换为 `.html` 并逐段 URL 编码，得到 `sourceUrl`。VitePress 的 Markdown 构建扩展使用同一 AST 与 `sourcePath` / `headingPath` 算法，为每个 H1/H2/H3 写入上述 `headingAnchor` 作为 DOM `id`；来源卡片链接为 `sourceUrl#headingAnchor`。不得依赖 VitePress 默认的标题 slug。页面加载后若找不到该元素，显式滚动到文档顶部；`sourceUrl` 是由 `sourcePath` 派生的展示字段，不作为数据库中的环境相关持久化数据。

#### 3.2.2 Embedding 与向量存储模块

| 功能           | 描述               | 技术要点                      |
| -------------- | ------------------ | ----------------------------- |
| Embedding 生成 | 调用 embedding API | 支持 OpenAI/Cohere/本地模型   |
| 向量存储       | 存储到 pgvector    | 使用 Neon 分支或本地 Postgres |
| 相似度检索     | Top-K 召回         | 余弦相似度 / L2 距离          |

**Embedding 配置**：

```typescript
interface EmbeddingConfig {
	provider: "openai" | "cohere" | "local";
	model: string; // 'text-embedding-3-small' / 'embed-multilingual-v3.0'
	dimension: number; // 1536 / 1024 / 768
	batch_size: number; // 默认 100
}
```

#### 3.2.3 Hybrid Search 模块

| 功能       | 描述            | 技术要点                    |
| ---------- | --------------- | --------------------------- |
| 关键词检索 | BM25 / 全文检索 | PostgreSQL full-text search |
| 向量检索   | 语义相似度      | pgvector `<->` 操作符       |
| 结果融合   | RRF 或加权融合  | Reciprocal Rank Fusion      |

**Hybrid Search 实现**：

```typescript
// RRF 融合公式
function rrf(scores: number[], k = 60): number {
	return scores.reduce((sum, score, i) => sum + (1 / (k + i + 1)) * score, 0);
}
```

#### 3.2.4 ReRank 模块（可选进阶）

| 功能     | 描述              | 技术要点                      |
| -------- | ----------------- | ----------------------------- |
| 语义重排 | 对 Top-K 结果重排 | 支持 Jina Reranker / 本地模型 |
| 质量提升 | 精排后返回 Top-N  | 通常 N=3~5                    |

#### 3.2.5 问答模块

| 功能       | 描述                            | 技术要点                                                             |
| ---------- | ------------------------------- | -------------------------------------------------------------------- |
| 上下文组装 | System Prompt + 检索片段 + 历史 | Prompt 模板化                                                        |
| 流式生成   | SSE / fetch stream              | @ai-sdk/vue 处理状态                                                 |
| 引用溯源   | 返回来源片段 + 精确标题段落     | `sourcePath`、`headingPath`、`headingIndex`、`chunkIndex` 与图片 URL |
| 停止生成   | 用户可中断生成                  | AbortController                                                      |

**问答 Prompt 模板**：

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

### 3.3 前端交互设计

#### 3.3.1 Chat UI 组件

| 组件     | 功能             | 技术要点                                                       |
| -------- | ---------------- | -------------------------------------------------------------- |
| 消息气泡 | 显示用户/AI 消息 | Markdown 渲染、代码高亮                                        |
| 流式文本 | 增量渲染 AI 回复 | x-markdown-vue / markstream-vue                                |
| 引用卡片 | 显示检索来源     | 折叠/展开，按稳定 `headingAnchor` 跳到 `sourcePath` 的标题段落 |
| 输入区域 | 发送消息         | 文本框、文件上传、停止按钮                                     |

#### 3.3.2 文档管理 UI

| 组件     | 功能             | 技术要点                                   |
| -------- | ---------------- | ------------------------------------------ |
| 同步记录 | 展示最近同步任务 | 状态、耗时、增改删数量、失败文件           |
| 文档列表 | 展示已同步文档   | 源路径、内容哈希、chunk 数量、最近同步时间 |
| 检索面板 | 展示检索结果     | 片段预览、相似度分值                       |

---

## 四、学习路径与里程碑

### 4.1 学习阶段划分

```plain
┌─────────────────────────────────────────────────────────────────────────────┐
│  第一周：RAG 基础与本地实验                                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  - 理解 Chunk 策略：固定大小 / 语义切分 / overlap                            │
│  - 跑通 Chroma 本地向量库：add / query / delete                            │
│  - 生成第一个 embedding：调用 OpenAI/Cohere API                            │
│  - 最小 RAG demo：文档 → Chunk → Embedding → 检索 → 回答                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  第二周：检索质量与 Hybrid Search                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  - BM25 / PostgreSQL full-text search 基础                                 │
│  - Hybrid Search 实现：关键词 + 向量并行检索 → RRF 融合                     │
│  - ReRank 概念与接入（可选）                                                │
│  - 评估集设计：准备 10-20 个固定问题，对比不同检索效果                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  第三周：工程落地与产品化                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│  - Neon + drizzle + pgvector 建模与迁移                                    │
│  - 独立 Nitro API 实现：知识源同步、向量生成、流式问答                     │
│  - 前端 UI：Element Plus X + 流式 Markdown + 来源高亮                     │
│  - 输入校验：zod schema                                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  第四周：优化与展示准备                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│  - 检索质量调优：chunk_size / top_k / score threshold                      │
│  - 性能优化：批量 embedding、缓存策略                                       │
│  - 简历作品文档完善                                                         │
│  - 演示视频 / README 编写                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 里程碑检查点

| 里程碑            | 完成标准                              | 交付物         |
| ----------------- | ------------------------------------- | -------------- |
| M1：最小 RAG 闭环 | 能从文档检索相关内容并回答            | 本地 demo 截图 |
| M2：Hybrid Search | 支持关键词+向量混合检索，可对比效果   | 评估结果表     |
| M3：完整问答系统  | 知识源同步→检索→流式回答→来源展示     | 可演示作品     |
| M4：简历作品集    | 完整的项目 README、技术博客或演示视频 | GitHub 仓库    |

---

## 五、参考项目与资料

### 5.1 推荐参考项目

| 项目                                                                             | 学习价值       | 重点模块                       |
| -------------------------------------------------------------------------------- | -------------- | ------------------------------ |
| [zhilv-yuntu](https://github.com/tutu-zzz/zhilv-yuntu)                           | RAG 产品化思路 | `retriever.py`, `vector_db.py` |
| [ai-sdk-rag-starter](https://github.com/vercel/ai-sdk-rag-starter)               | 技术栈对齐     | Drizzle + pgvector + RAG       |
| [agents-from-scratch-ts](https://github.com/langchain-ai/agents-from-scratch-ts) | Agent 原理     | TypeScript 从零理解 Agent      |

### 5.2 关键文档

| 文档                                                                                                       | 用途                       |
| ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| [AI SDK RAG Guide](https://ai-sdk.dev/cookbook/guides/rag-chatbot)                                         | Vercel AI SDK RAG 完整指南 |
| [LangChain.js PGVectorStore](https://docs.langchain.com/oss/javascript/integrations/vectorstores/pgvector) | pgvector 集成              |
| [Neon LangChain](https://neon.com/docs/ai/langchain)                                                       | Neon 向量存储接入          |
| [Chroma Getting Started](https://docs.trychroma.com/docs/overview/getting-started)                         | 本地向量库入门             |

### 5.3 禁止参考项目（干扰项）

- ❌ AgentX：Java/Spring 体系，不适合 TypeScript 主线
- ❌ Dify：平台复杂度高，不适合入门学习
- ❌ 自研 Agent 平台：过早引入大架构

---

## 六、风险清单与应对

| 风险             | 影响                 | 应对策略                                 |
| ---------------- | -------------------- | ---------------------------------------- |
| 检索质量不佳     | 回答无来源或来源错误 | 重点优化 chunk 策略和 top_k 参数         |
| embedding 成本高 | API 调用费用超预算   | 使用本地模型 / 小模型 / 批量处理         |
| 流式渲染性能     | 大量文本时卡顿       | 虚拟滚动 / 分批渲染 / Web Worker         |
| 向量库选型反复   | 浪费学习时间         | 明确「本地 Chroma 学习 + Neon 落地」策略 |
| 作品集缺亮点     | 简历无竞争力         | 突出 Hybrid Search + 引用溯源 + 流式体验 |

---

## 七、验收标准

### 7.1 技术验收

| 验收点        | 标准                                                    |
| ------------- | ------------------------------------------------------- |
| 知识源同步    | 识别 `docs/docx` 的新增、修改和删除；失败时不误删旧数据 |
| 向量检索      | 准确返回 Top-5 相关片段，带相似度分值                   |
| Hybrid Search | 可切换仅关键词/仅向量/hybrid 三种模式                   |
| 流式问答      | SSE 流式输出，支持停止生成                              |
| 来源展示      | 回答中标注来源，来源卡片可点击展开原文                  |
| 输入校验      | 无效输入返回明确错误提示                                |

### 7.2 简历展示验收

| 验收点           | 标准                                      |
| ---------------- | ----------------------------------------- |
| 项目 README      | 清晰的功能介绍、技术栈、演示截图          |
| 核心代码         | 可在 GitHub 直接查看，TypeScript 类型完整 |
| 技术博客（可选） | 详细的技术实现分享，提升个人品牌          |
| 演示视频（可选） | 30s-60s 功能演示，直观展示体验            |

### 7.3 学习理解验收

| 验收点               | 标准                       |
| -------------------- | -------------------------- |
| 能解释 Chunk 策略    | 说出不同策略的适用场景     |
| 能解释 Embedding     | 说出向量化的原理和维度选择 |
| 能解释 Hybrid Search | 说出 BM25 和向量的互补性   |
| 能解释 ReRank        | 说出两阶段检索的意义       |

---

## 八、附录

### 8.1 TypeScript AI Knowledge Agent 最终形态

```plain
前端：Vue3 + Element Plus X + @ai-sdk/vue
服务端：独立 Nitro + zod
数据层：Neon + drizzle + pgvector
RAG 引擎：LangChain.js / Vercel AI SDK
检索策略：Hybrid Search (BM25 + Vector) + ReRank
部署：Vercel
```

### 8.2 简历项目描述模板

> **AI 知识库问答系统**
>
> 基于 RAG 技术栈的企业知识库问答系统，支持 Markdown 入库、文本切分、向量检索与流式问答。前端使用 Vue3 + Element Plus X 实现 AI 对话 UI，后端使用独立 Nitro 提供流式 API。数据层采用 Neon + pgvector 存储文档与向量，检索策略支持词法全文检索 + 向量混合搜索（Hybrid Search）与 ReRank 重排。回答带来源溯源，可直达文档标题段落。
>
> **技术栈**：TypeScript / Vue3 / VitePress / 独立 Nitro / Neon / pgvector / drizzle / zod / Element Plus X / @ai-sdk/vue

### 8.3 版本历史

| 版本 | 日期       | 变更说明                                             |
| ---- | ---------- | ---------------------------------------------------- |
| 1.0  | 2026-07-29 | 初始版本，基于 LangGraph TypeScript 入门调研报告整合 |
