# 二期 AI 化任务设计文档

> **RAG 与检索质量阶段 — 简历能力拓展核心**

## 一、背景与目标

### 1.1 项目定位

本期是 AI 转型路线图的第二阶段，核心目标是**掌握 RAG（检索增强生成）技术栈，并产出可展示的简历作品**。

- **学习者定位**：AI 应用前端、AI Agent 全栈偏前端、TypeScript AI 应用工程师
- **当前阶段**：已完成（或具备）AI Chat 基础，正在向 RAG 知识库方向深入
- **目标作品**：基于 RAG 的企业知识库问答系统，支持文档上传、向量检索、流式问答与引用溯源

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
TypeScript / Nuxt / Nitro / Element Plus X
```

---

## 二、技术栈选型

### 2.1 技术栈组合

| 层次              | 推荐技术                         | 选型理由                                        |
| ----------------- | -------------------------------- | ----------------------------------------------- |
| **前端 UI**       | Vue3 + Element Plus X            | 已有 Vue3 经验，Element Plus X 提供 AI 对话组件 |
| **流式传输**      | @ai-sdk/vue + Nuxt/Nitro         | 统一的流式响应协议，Nitro 提供 `/api/chat` 入口 |
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

---

## 三、核心功能设计

### 3.1 RAG 系统架构

```plain
┌─────────────────────────────────────────────────────────────────┐
│                        前端层 (Vue3 + Element Plus X)           │
├─────────────────────────────────────────────────────────────────┤
│  文档上传 → Markdown 渲染 → 流式问答 → 来源高亮 → 会话管理        │
├─────────────────────────────────────────────────────────────────┤
│                        API 层 (Nuxt/Nitro)                      │
├─────────────────────────────────────────────────────────────────┤
│  /api/chat (流式对话) │ /api/documents (文档管理) │ /api/search │
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

| 功能       | 描述                     | 技术要点                      |
| ---------- | ------------------------ | ----------------------------- |
| 文档上传   | 支持 PDF、Markdown、TXT  | 前端组件 + SSE 进度反馈       |
| 文档解析   | 提取文本内容             | 正则/解析库处理不同格式       |
| Chunk 切分 | 文本按策略切分           | overlap、chunk_size、语义切分 |
| 元数据管理 | 文档标签、来源、创建时间 | drizzle 建模                  |

**Chunk 策略要点**：

```typescript
interface ChunkConfig {
	chunk_size: number; // 默认 500 tokens
	overlap: number; // 默认 50 tokens
	separators: string[]; // ["\n\n", "\n", "。", "！", "？", ". "]
}
```

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

| 功能       | 描述                            | 技术要点                |
| ---------- | ------------------------------- | ----------------------- |
| 上下文组装 | System Prompt + 检索片段 + 历史 | Prompt 模板化           |
| 流式生成   | SSE / fetch stream              | @ai-sdk/vue 处理状态    |
| 引用溯源   | 返回来源片段 + 原文位置         | metadata 携带 source_id |
| 停止生成   | 用户可中断生成                  | AbortController         |

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

| 组件     | 功能             | 技术要点                        |
| -------- | ---------------- | ------------------------------- |
| 消息气泡 | 显示用户/AI 消息 | Markdown 渲染、代码高亮         |
| 流式文本 | 增量渲染 AI 回复 | x-markdown-vue / markstream-vue |
| 引用卡片 | 显示检索来源     | 折叠/展开、点击跳转             |
| 输入区域 | 发送消息         | 文本框、文件上传、停止按钮      |

#### 3.3.2 文档管理 UI

| 组件     | 功能           | 技术要点               |
| -------- | -------------- | ---------------------- |
| 文档列表 | 展示已上传文档 | 名称、状态、chunk 数量 |
| 上传区域 | 拖拽/点击上传  | 进度条、格式校验       |
| 检索面板 | 展示检索结果   | 片段预览、相似度分值   |

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
│  - Nuxt/Nitro API 实现：文档上传、向量生成、流式问答                       │
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
| M3：完整问答系统  | 文档上传→检索→流式回答→来源展示       | 可演示作品     |
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

| 验收点        | 标准                                    |
| ------------- | --------------------------------------- |
| 文档上传      | 支持 PDF/MD/TXT，chunk 数量和大小可配置 |
| 向量检索      | 准确返回 Top-5 相关片段，带相似度分值   |
| Hybrid Search | 可切换仅关键词/仅向量/hybrid 三种模式   |
| 流式问答      | SSE 流式输出，支持停止生成              |
| 来源展示      | 回答中标注来源，来源卡片可点击展开原文  |
| 输入校验      | 无效输入返回明确错误提示                |

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
服务端：Nuxt/Nitro + zod
数据层：Neon + drizzle + pgvector
RAG 引擎：LangChain.js / Vercel AI SDK
检索策略：Hybrid Search (BM25 + Vector) + ReRank
部署：Vercel / Cloudflare Worker
```

### 8.2 简历项目描述模板

> **AI 知识库问答系统**
>
> 基于 RAG 技术栈的企业知识库问答系统，支持文档上传、文本切分、向量检索与流式问答。前端使用 Vue3 + Element Plus X 实现 AI 对话 UI，后端使用 Nuxt/Nitro 提供流式 API。数据层采用 Neon + pgvector 存储文档与向量，检索策略支持 BM25 + 向量混合搜索 (Hybrid Search) 与 ReRank 重排。回答带来源溯源，可点击展开原文片段。
>
> **技术栈**：TypeScript / Vue3 / Nuxt / Nitro / Neon / pgvector / drizzle / zod / Element Plus X / @ai-sdk/vue

### 8.3 版本历史

| 版本 | 日期       | 变更说明                                             |
| ---- | ---------- | ---------------------------------------------------- |
| 1.0  | 2026-07-29 | 初始版本，基于 LangGraph TypeScript 入门调研报告整合 |
