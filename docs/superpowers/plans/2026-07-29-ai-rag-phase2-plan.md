# 二期 AI 化任务实施计划

> **RAG 与检索质量阶段 — 实施任务清单**

---

## 任务概述

本计划基于「二期 RAG 与检索质量设计文档」，将 RAG 学习与项目开发拆解为可执行的原子任务。

**已确认语料契约**：`docs/docx/**/*.md` 是二期唯一、可动态变化的知识源。开发和生产环境都可读取该目录；上游 DOCX 转换更新文件后，RAG 同步服务必须以目录的实时内容为准完成增量对账。图片不做 OCR、多模态 embedding 或图片理解；Markdown 图片链接仅写入 document 和 chunk 的 `imageUrls`。每个 chunk 必须持久化 `sourcePath`、`headingPath` 和连续的 `chunkIndex`，并持久化标题的 AST 出现序号 `headingIndex` 与确定性生成的 `headingAnchor`。来源卡片使用 `sourceUrl#headingAnchor` 跳转到对应标题段落；阅读器找不到该锚点时才退回源文档顶部，禁止猜测 Markdown 或中文标题 slug。

---

## 第一周：RAG 基础与本地实验

### 任务 1.1：搭建本地 RAG 开发环境

**目标**：搭建可运行的本地 RAG 实验环境

**文件结构**：

```plain
src/
├── lib/
│   ├── chroma.ts           # Chroma 客户端封装
│   └── openai.ts          # OpenAI 客户端封装
├── scripts/
│   └── local-rag-demo.ts   # 本地 RAG 演示脚本
```

**步骤**：

- [ ] **Step 1: 安装依赖**

  ```bash
  pnpm add chromadb @chroma-core/default-embed openai
  pnpm add -D typescript tsx @types/node
  ```

- [ ] **Step 2: 创建 Chroma 客户端封装**

  ```typescript
  // src/lib/chroma.ts
  import { ChromaClient } from "chromadb";

  const client = new ChromaClient({ path: "http://localhost:8000" });

  export async function getCollection(name: string) {
  	return await client.getOrCreateCollection({ name });
  }

  export async function addDocuments(collection: any, documents: string[], ids: string[], metadatas?: any[]) {
  	await collection.add({ documents, ids, metadatas });
  }

  export async function queryDocuments(collection: any, query: string, nResults: number = 5) {
  	return await collection.query({
  		queryTexts: [query],
  		nResults,
  	});
  }
  ```

- [ ] **Step 3: 创建 OpenAI Embedding 封装**

  ```typescript
  // src/lib/openai.ts
  import OpenAI from "openai";

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  export async function createEmbedding(text: string, model = "text-embedding-3-small") {
  	const response = await openai.embeddings.create({
  		model,
  		input: text,
  	});
  	return response.data[0].embedding;
  }
  ```

- [ ] **Step 4: 创建本地 RAG 演示脚本**

  ```typescript
  // src/scripts/local-rag-demo.ts
  import { getCollection, addDocuments, queryDocuments } from "../lib/chroma";
  import { createEmbedding } from "../lib/openai";

  async function main() {
  	const docs = [
  		"Vue3 是渐进式 JavaScript 框架",
  		"TypeScript 是 JavaScript 的超集",
  		"Nuxt 是 Vue 的全栈框架",
  		"RAG 是检索增强生成技术",
  	];

  	const collection = await getCollection("demo");
  	await addDocuments(
  		collection,
  		docs,
  		docs.map((_, i) => `doc-${i}`),
  	);

  	const results = await queryDocuments(collection, "什么是 Vue3");
  	console.log("检索结果:", results);
  }

  main();
  ```

- [ ] **Step 5: 验证**

  ```bash
  # 启动 Chroma
  docker run -p 8000:8000 chromadb/chroma

  # 运行 demo
  pnpm tsx src/scripts/local-rag-demo.ts
  ```

---

### 任务 1.2：实现 Markdown 结构化 Chunk 策略

**目标**：针对 `docs/docx/**/*.md` 的标题、FAQ 表格和图片 URL 构造可检索、可溯源的文本 chunk。

**文件**：`src/lib/markdown-chunk.ts`、`src/tests/markdown-chunk.test.ts`

**步骤**：

- [ ] **Step 1: 定义结构化 chunk 契约**

  ```typescript
  export interface MarkdownChunk {
  	content: string;
  	sourcePath: string;
  	headingPath: string[];
  	headingIndex: number;
  	headingAnchor: string;
  	chunkIndex: number;
  	imageUrls: string[];
  	chunkKind: "prose" | "table";
  	tableRowStart?: number;
  	tableRowEnd?: number;
  }

  export interface MarkdownChunkOptions {
  	targetTokens: number;
  	overlapTokens: number;
  	tableRowsPerChunk: number;
  }
  ```

- [ ] **Step 2: 按结构切分 Markdown**
  - 使用 Markdown AST 识别 H1/H2/H3、段落、GFM 表格和图片链接。
  - 标题进入 `headingPath`，并记录该标题在文档 H1/H2/H3 AST token 序列中的零基 `headingIndex`；普通段落优先与同一标题路径下的相邻段落合并。有标题时生成 `headingAnchor = "rag-heading-" + base64url(sha256([sourcePath, headingPath.join("\u0000"), String(headingIndex)].join("\u0000")))`；空标题路径使用 `rag-document-<sourcePath-digest>`，`headingIndex` 为 `-1`。
  - 小表格保持完整；超过 token 上限的表格按连续行组切分，每个子块重复表头与当前 `headingPath`。
  - 图片只写入 `imageUrls`，不拼入 `content`，不进入 embedding。
  - 单个段落或行组超过 `targetTokens: 500` 时才递归按 token 切分，并使用 `overlapTokens: 50`；默认每个表格行组为 `12` 行。按源文件输出时 `chunkIndex` 必须从 `0` 连续递增。

- [ ] **Step 3: 编写结构化切分测试**

  ```typescript
  import { describe, expect, test } from "vitest";
  import { chunkMarkdown } from "../lib/markdown-chunk";

  describe("chunkMarkdown", () => {
  	test("保留标题路径并从文本内容排除图片 URL", () => {
  		const chunks = chunkMarkdown("# 手册\n## 安装\n说明 ![](./images/a.png)", "docs/docx/手册.md");

  		expect(chunks[0]).toMatchObject({
  			sourcePath: "docs/docx/手册.md",
  			headingPath: ["手册", "安装"],
  			headingIndex: 1,
  			headingAnchor: expect.stringMatching(/^rag-heading-/),
  			imageUrls: ["./images/a.png"],
  		});
  		expect(chunks[0].content).not.toContain("a.png");
  	});

  	test("按行组拆分超长表格并重复表头", () => {
  		const chunks = chunkMarkdown(longTableMarkdown, "docs/docx/FAQ.md", { tableRowsPerChunk: 2 });

  		expect(chunks).toHaveLength(2);
  		expect(chunks.every((chunk) => chunk.content.includes("| 问题 | 解决方案 |"))).toBe(true);
  		expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(["table", "table"]);
  		expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1]);
  		expect(new Set(chunks.map((chunk) => chunk.headingAnchor))).toHaveSize(1);
  	});

  	test("为同一路径下的同名标题生成不同锚点", () => {
  		const chunks = chunkMarkdown("# 手册\n## 配置\n第一段\n## 配置\n第二段", "docs/docx/手册.md");

  		expect(chunks.map((chunk) => chunk.headingPath)).toEqual([
  			["手册", "配置"],
  			["手册", "配置"],
  		]);
  		expect(new Set(chunks.map((chunk) => chunk.headingAnchor))).toHaveSize(2);
  	});
  });
  ```

- [ ] **Step 4: 运行测试验证**
  ```bash
  pnpm test -- --run src/tests/markdown-chunk.test.ts
  ```

---

### 任务 1.3：生成第一个 RAG 检索 demo

**目标**：完整跑通全量 `docs/docx` Markdown → 结构化 chunk → embedding → 检索 → 带标题段落来源的回答链路，并为后续增量同步复用同一读取与解析服务。

**文件**：`src/scripts/rag-demo.ts`

**步骤**：

- [ ] **Step 1: 扫描真实语料**
  - 递归读取 `docs/docx/**/*.md`，不读取 `.png` 与 `.jpg` 二进制文件。
  - 统一将 Windows 与生产环境中的路径规范化为以 `/` 分隔、相对仓库根目录的 `sourcePath`。
  - 导入报告记录扫描文件数、跳过图片数、写入文档数、写入 chunk 数和失败文件路径。

- [ ] **Step 2: 实现完整 RAG 链路**

  ```typescript
  // src/scripts/rag-demo.ts
  import { createEmbedding } from "../lib/openai";
  import { getCollection, addDocuments, queryDocuments } from "../lib/chroma";
  import { chunkMarkdown } from "../lib/markdown-chunk";
  import { readFile } from "node:fs/promises";

  async function ragDemo() {
  	const files = await scanMarkdownFiles("docs/docx");
  	const chunks = (
  		await Promise.all(files.map(async (sourcePath) => chunkMarkdown(await readFile(sourcePath, "utf8"), sourcePath)))
  	).flat();
  	console.log(`从 ${files.length} 个 Markdown 文件生成 ${chunks.length} 个结构化文本块`);

  	// 3. 生成 Embedding 并存储
  	const collection = await getCollection("knowledge-base");
  	const embeddings = await Promise.all(chunks.map((chunk) => createEmbedding(chunk.content)));

  	await addDocuments(
  		collection,
  		chunks.map((chunk) => chunk.content),
  		chunks.map((_, i) => `chunk-${i}`),
  		chunks,
  	);

  	// 4. 检索
  	const query = "图片配置报错如何解决";
  	const results = await queryDocuments(collection, query, 3);

  	console.log("检索到的上下文:\n", results.documents[0]);
  }
  ```

- [ ] **Step 6: 截图记录**
  - 运行成功后将终端截图保存为 `docs/screenshots/rag-demo-01.png`

---

## 第二周：检索质量与 Hybrid Search

### 任务 2.1：初始化 Neon pgvector 与 PostgreSQL 词法全文检索

**目标**：在已关联的 Neon 数据库中完成 pgvector、Drizzle migration 与词法全文检索基线，不创建第二个 Neon 项目或数据库。

**文件**：`src/lib/search.ts`

**步骤**：

- [ ] **Step 0: 先从 Vercel 获取连接配置，再操作 Neon**
  - 本 Git 仓库关联的 Vercel 项目已安装 `neon-smallalice-ai-rag`。固定资源标识：Neon 组织 ID 为 `org-super-fog-48541962`，Neon 项目 ID 为 `patient-cloud-43432277`，Vercel 已关联的 Neon 数据库名称为 `neon-smallalice-ai-rag`。它们共同指向二期唯一的云端 Neon 资源；不得因文档中的示例名称再次执行 `neon projects create` 或 `neon databases create`。
  - 在 `packages/ai-rag-api` 存在后，先执行 `vercel env pull .env.local --environment=development`。只在本地受 `.gitignore` 保护的文件中读取变量，禁止在终端输出、日志、测试快照、报告或 Git 中写入连接串。
  - 先检查拉取到的变量名，再确定连接串来源：应用运行使用 pooled URL（通常为 `POSTGRES_URL`）；Drizzle migration 只使用非 pooled URL（通常为 `POSTGRES_URL_NON_POOLING`）。若 Vercel 集成没有提供非 pooled URL，停止迁移并在 Vercel/Neon 集成侧补齐，不能把 pooled URL 冒充 DDL 连接。

- [ ] **Step 0.1: 使用官方 Neon CLI 核对既有资源**

  ```bash
  neon projects list --output json
  neon branches list --project-id <neon-project-id> --output json
  neon databases list --project-id <neon-project-id> --branch-id <branch-id> --output json
  neon roles list --project-id <neon-project-id> --branch-id <branch-id> --output json
  ```

  - 本项目统一只使用官方 `neon` CLI。用户负责安装和完成该 CLI 的认证；执行本步骤前先以 `neon --help` 与用户提供的认证完成状态为前置条件，代理不得自行安装、认证或读取 CLI 凭据。
  - 这是 Vercel Managed Integration：Step 0 的 Vercel 环境变量只用于应用与 migration 的数据库连接。CLI 的认证由用户独立完成；代理不得在文档或命令中猜测、创建或输出认证密钥。
  - 使用固定 project ID 执行资源核对：`neon projects get patient-cloud-43432277 --output json`，再核对 `neon-smallalice-ai-rag` 关联的 branch、database 和 role；组织上下文必须属于 `org-super-fog-48541962`。只有用户明确要求新增独立 development branch 或 database 时，才使用 `neon branches create` 或 `neon databases create`。

- [ ] **Step 1: 初始化 drizzle + postgres**

  ```bash
  pnpm add drizzle-orm postgres
  pnpm add -D drizzle-kit
  ```

- [ ] **Step 2: 定义 documents 表**

  ```typescript
  // src/db/schema.ts
  import { integer, jsonb, pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

  export const documents = pgTable("documents", {
  	id: text("id").primaryKey(),
  	title: text("title").notNull(),
  	sourcePath: text("source_path").notNull().unique(),
  	contentHash: text("content_hash").notNull(),
  	profileVersion: text("profile_version").notNull(),
  	embeddingModel: text("embedding_model").notNull(),
  	imageUrls: jsonb("image_urls").$type<string[]>().notNull(),
  	lastSyncedAt: timestamp("last_synced_at").notNull(),
  	createdAt: timestamp("created_at").defaultNow(),
  });

  export const chunks = pgTable("chunks", {
  	id: text("id").primaryKey(),
  	documentId: text("document_id")
  		.notNull()
  		.references(() => documents.id),
  	content: text("content").notNull(),
  	sourcePath: text("source_path").notNull(),
  	headingPath: jsonb("heading_path").$type<string[]>().notNull(),
  	headingIndex: integer("heading_index").notNull(),
  	headingAnchor: text("heading_anchor").notNull(),
  	chunkIndex: integer("chunk_index").notNull(),
  	chunkKind: text("chunk_kind").notNull(),
  	tableRowStart: integer("table_row_start"),
  	tableRowEnd: integer("table_row_end"),
  	imageUrls: jsonb("image_urls").$type<string[]>().notNull(),
  	contentHash: text("content_hash").notNull(),
  	profileVersion: text("profile_version").notNull(),
  	embedding: vector("embedding", { dimensions: 1536 }).notNull(),
  });

  export const knowledgeSyncRuns = pgTable("knowledge_sync_runs", {
  	id: text("id").primaryKey(),
  	status: text("status").$type<"running" | "succeeded" | "partial" | "failed">().notNull(),
  	scannedFileCount: integer("scanned_file_count").notNull(),
  	unchangedFileCount: integer("unchanged_file_count").notNull(),
  	createdFileCount: integer("created_file_count").notNull(),
  	updatedFileCount: integer("updated_file_count").notNull(),
  	deletedFileCount: integer("deleted_file_count").notNull(),
  	failedFiles: jsonb("failed_files").$type<string[]>().notNull(),
  	startedAt: timestamp("started_at").notNull(),
  	finishedAt: timestamp("finished_at"),
  });
  ```

- [ ] **Step 2.1: 用首个 migration 启用 pgvector 并建立向量索引**

  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;

  CREATE INDEX chunks_embedding_hnsw_cosine_idx
    ON chunks USING hnsw (embedding vector_cosine_ops);
  ```

  - `CREATE EXTENSION` 必须位于创建 `vector(1536)` 列之前。扩展按 Neon 的**每个 database**启用，不是按 project 或 branch 自动共享；新建 database 后必须再次执行该 migration。
  - 1536 必须与首期 embedding 模型固定维度一致。模型或维度变更是一次迁移与全量重嵌入工作，禁止混写到同一 `embedding` 列。
  - HNSW 使用 `vector_cosine_ops`，与余弦距离检索的 `<=>` 保持一致。它提高查询性能但属于近似检索，可能影响召回率；在固定评估集上将其与无索引的精确检索进行对比后再作为生产默认。

- [ ] **Step 2.2: 执行并验证云端 migration，不泄露连接串**

  ```bash
  pnpm --filter @ruan-cat-drill-doc/ai-rag-api db:migrate
  neon psql <development-branch> --database-name <database-name> -- -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"
  neon psql <development-branch> --database-name <database-name> -- -c "SELECT indexname FROM pg_indexes WHERE tablename = 'chunks';"
  ```

  - `db:migrate` 从本地已拉取的非 pooled migration URL 读取配置；应用 API 只读取 pooled URL。两者不得写到 `nitro.config.ts`、Drizzle migration 或测试源文件。
  - 通过扩展查询与索引查询后，才允许执行第一次文档同步；验证输出只记录扩展名、版本、表和索引名，不记录 host、user、password 或完整 URL。

- [ ] **Step 3: 实现词法检索函数**

  ```typescript
  // src/lib/search.ts
  import { db } from "../db";
  import { chunks } from "../db/schema";
  import { sql } from "drizzle-orm";

  /** 使用 PostgreSQL tsvector 与 ts_rank_cd 执行词法全文检索。 */
  export async function lexicalSearch(query: string, limit = 10) {
  	const results = await db.execute(sql`
      SELECT 
        id,
        content,
        ts_rank_cd(to_tsvector('simple', content), websearch_to_tsquery('simple', ${query})) as rank
      FROM chunks
      WHERE to_tsvector('simple', content) @@ websearch_to_tsquery('simple', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
  	return results.rows;
  }
  ```

  > 此处是 PostgreSQL 词法全文检索，不是 BM25。必须用真实中文与技术术语评估分词和命中效果；若 `simple` 配置无法满足中文检索，再单独评估可用的中文分词或词法检索方案，不能在未验证前标注为 BM25。

- [ ] **Step 4: 验证全文检索**
  ```bash
  # 插入测试数据
  # 运行检索查询
  pnpm tsx src/scripts/test-lexical-search.ts
  ```

---

### 任务 2.2：实现 Hybrid Search（融合检索）

**目标**：实现词法全文检索 + 向量检索的混合搜索

**文件**：`src/lib/hybrid-search.ts`

**步骤**：

- [ ] **Step 1: 实现 RRF 融合函数**

  ```typescript
  // src/lib/hybrid-search.ts

  /**
   * Reciprocal Rank Fusion (RRF) 融合算法
   * @param rankings - 各检索结果排名数组
   * @param k - RRF 参数，默认 60
   */
  export function rrf(rankings: number[], k = 60): number {
  	return rankings.reduce((sum, rank, i) => {
  		return sum + 1 / (k + i + 1);
  	}, 0);
  }
  ```

- [ ] **Step 2: 实现 Hybrid Search**

  ```typescript
  // src/lib/hybrid-search.ts

  interface SearchResult {
  	id: string;
  	content: string;
  	lexicalScore: number;
  	vectorScore: number;
  	rrfScore: number;
  }

  /** Hybrid Search：并行执行词法和向量检索，再用 RRF 融合。 */
  export async function hybridSearch(query: string, embedding: number[], options: { limit?: number; k?: number } = {}) {
  	const { limit = 10, k = 60 } = options;

  	const lexicalResults = await lexicalSearch(query, limit);
  	const lexicalMap = new Map(lexicalResults.map((r, i) => [r.id, i]));

  	// 2. 向量检索 (pgvector)
  	const vectorResults = await vectorSearch(embedding, limit);
  	const vectorMap = new Map(vectorResults.map((r, i) => [r.id, i]));

  	// 3. RRF 融合
  	const allIds = new Set([...lexicalMap.keys(), ...vectorMap.keys()]);
  	const fusedResults: SearchResult[] = [];

  	for (const id of allIds) {
  		const lexicalRank = lexicalMap.get(id) ?? limit;
  		const vectorRank = vectorMap.get(id) ?? limit;

  		fusedResults.push({
  			id,
  			content: vectorResults.find((r) => r.id === id)?.content || "",
  			lexicalScore: 1 / (lexicalRank + 1),
  			vectorScore: 1 / (vectorRank + 1),
  			rrfScore: rrf([1 / (lexicalRank + 1), 1 / (vectorRank + 1)], k),
  		});
  	}

  	// 4. 按 RRF 排序
  	return fusedResults.sort((a, b) => b.rrfScore - a.rrfScore).slice(0, limit);
  }
  ```

- [ ] **Step 3: 编写测试用例**

  ```typescript
  // src/lib/hybrid-search.test.ts

  describe("hybridSearch", () => {
  	it("应正确融合词法和向量检索结果", async () => {
  		const results = await hybridSearch("TypeScript 优势", embedding, { limit: 5 });
  		expect(results.length).toBeLessThanOrEqual(5);
  		expect(results[0].rrfScore).toBeGreaterThan(0);
  	});
  });
  ```

---

### 任务 2.3：设计与运行评估集

**目标**：准备固定问题集，对比不同检索策略效果

**文件**：`data/eval-questions.json`

**步骤**：

- [ ] **Step 1: 准备评估问题集**

  ```json
  [
  	{
  		"id": "q1",
  		"question": "什么是 RAG？",
  		"expected_keywords": ["检索", "增强", "生成"],
  		"category": "概念理解"
  	},
  	{
  		"id": "q2",
  		"question": "Vue3 和 React 的区别是什么？",
  		"expected_keywords": ["Vue", "React", "组件"],
  		"category": "技术对比"
  	},
  	{
  		"id": "q3",
  		"question": "如何优化 TypeScript 编译速度？",
  		"expected_keywords": ["tsc", "编译", "优化"],
  		"category": "实践问题"
  	}
  ]
  ```

- [ ] **Step 2: 实现评估脚本**

  ```typescript
  // src/scripts/run-eval.ts

  interface EvalResult {
  	questionId: string;
  	strategy: "lexical" | "vector" | "hybrid";
  	retrievedIds: string[];
  	hasExpectedKeyword: boolean;
  }

  async function runEval() {
  	const questions = JSON.parse(await readFile("data/eval-questions.json"));
  	const results: EvalResult[] = [];

  	for (const q of questions) {
  		const lexicalResults = await lexicalSearch(q.question, 5);
  		// Vector only
  		const embedding = await createEmbedding(q.question);
  		const vectorResults = await vectorSearch(embedding, 5);
  		// Hybrid
  		const hybridResults = await hybridSearch(q.question, embedding, { limit: 5 });

  		results.push({
  			questionId: q.id,
  			strategy: "lexical",
  			retrievedIds: lexicalResults.map((r) => r.id),
  			hasExpectedKeyword: checkKeywords(lexicalResults, q.expected_keywords),
  		});
  		// ... 同样处理 vector 和 hybrid
  	}

  	// 输出评估报告
  	console.table(summarizeResults(results));
  }
  ```

- [ ] **Step 3: 运行评估并记录结果**
  ```bash
  pnpm tsx src/scripts/run-eval.ts > docs/eval-results.md
  ```

---

## 第三周：工程落地与产品化

### 任务 3.1：搭建独立 Nitro API 服务

**目标**：创建只提供 HTTP 与流式接口的独立 Nitro 服务，不引入 Nuxt 应用层。

**文件结构**：

```plain
packages/ai-rag-api/
├── package.json
├── nitro.config.ts
├── server/
    ├── routes/v1/
    │   ├── chat.post.ts
    │   ├── knowledge/sync.post.ts
    │   ├── knowledge/sync.get.ts
    │   ├── knowledge/sync-runs.get.ts
    │   └── search.post.ts
    ├── schemas/
    ├── services/
    └── repositories/
└── tests/
    └── routes/
```

**步骤**：

- [ ] **Step 1: 创建独立 Nitro 包**

  ```bash
  pnpm --filter @ruan-cat-drill-doc/ai-rag-api add nitro ai @ai-sdk/openai drizzle-orm postgres zod
  pnpm --filter @ruan-cat-drill-doc/ai-rag-api add -D drizzle-kit
  ```

  - 使用 `nitro` v3；不安装 `nitropack` 或独立的 `h3` 包。路由处理 API 统一从 `nitro/h3` 导入。
  - 在 `package.json` 配置 `dev: "nitro dev"`、`build: "nitro build"`、`build:vercel: "nitro build --preset vercel"`、`preview: "nitro preview"`，保持其为独立可运行的 Nitro 服务。Vercel 的构建命令必须显式使用 `build:vercel`，不能借用 VitePress 的构建输出。

- [ ] **Step 2: 配置 Nitro**

  ```typescript
  import { defineConfig } from "nitro";

  export default defineConfig({
  	serverDir: "./server",
  	compatibilityDate: "2024-09-19",
  	runtimeConfig: {
  		databaseUrl: process.env.NITRO_DATABASE_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL || "",
  		openaiApiKey: process.env.NITRO_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
  		knowledgeSourceRoot: process.env.NITRO_KNOWLEDGE_SOURCE_ROOT || "",
  		knowledgeSyncToken: process.env.NITRO_KNOWLEDGE_SYNC_TOKEN || "",
  	},
  });
  ```

- [ ] **Step 3: 实现知识源同步 API**

  ```typescript
  import { defineHandler, readBody, setResponseStatus } from "nitro/h3";
  import { useRuntimeConfig } from "nitro/runtime-config";
  import { z } from "zod";

  const syncRequestSchema = z.object({
  	dryRun: z.boolean().optional(),
  });

  export default defineHandler(async (event) => {
  	try {
  		assertKnowledgeSyncToken(event);
  		const { dryRun = false } = syncRequestSchema.parse(await readBody(event));

  		const { knowledgeSourceRoot } = useRuntimeConfig();
  		return syncKnowledgeBase({
  			sourceRoot: knowledgeSourceRoot,
  			dryRun,
  		});
  	} catch (error) {
  		const statusCode = error instanceof z.ZodError ? 400 : getStatusCode(error);
  		setResponseStatus(event, statusCode);
  		const message = error instanceof Error ? error.message : "知识库同步失败";
  		return { success: false, code: statusCode, message, data: null };
  	}
  });
  ```

  - `useRuntimeConfig` 从 `nitro/runtime-config` 导入且不传 `event`；`getStatusCode` 是共享错误转换函数，必须保留鉴权失败的 `401/403`、同步冲突的 `409` 和其他未预期错误的 `500`。不能只在 JSON 中写 `code` 而让 HTTP 响应仍为 `200`。
  - 同步入口只扫描 `NITRO_KNOWLEDGE_SOURCE_ROOT` 指向的 `docs/docx` 目录，不得接收客户端传入的 Markdown 内容或文件路径。Vercel 的 API 构建必须将该目录作为函数可读的部署输入；不得依赖生产环境的仓库根目录或 `process.cwd()` 恰好包含文档。
  - 使用 PostgreSQL advisory lock 拒绝并发同步，不能使用仅在单个 Serverless 实例有效的进程内锁；`POST` 供上游 DOCX 转换完成后调用，`GET` 供 Vercel Cron 调用，两者复用同一 `syncKnowledgeBase` 服务。

- [ ] **Step 4: 实现增量对账与同步记录**
  - 先完整生成本轮文件清单，逐个计算 `contentHash`；与 `documents` 的 `sourcePath`、内容哈希、`profileVersion`、embedding 模型版本比对。
  - 新增或变化文件：先切分、生成 embedding 并写入临时结果；全部成功后以单文档事务替换旧 chunk。单个文件失败时旧版本保持可检索，并在同步记录中标为失败。
  - 未变化文件不重复切分或调用 embedding。仅当文件清单完整生成且无扫描错误时，才删除数据库中本轮缺失的 `sourcePath`；部分扫描或读取失败时跳过删除阶段。
  - 写入 `knowledge_sync_runs`，记录状态、扫描数、未变化数、新增数、更新数、删除数、失败文件和起止时间；同步结果由 `GET /v1/knowledge/sync-runs` 提供给前端展示。

- [ ] **Step 5: 配置开发与生产触发方式**
  - 开发环境提供 `pnpm rag:sync` 一次性同步命令，并提供可选的 `pnpm rag:watch` 监听 `docs/docx` 后触发同一同步服务。
  - 生产环境在上游 DOCX 转换写入 Markdown 后调用携带 `NITRO_KNOWLEDGE_SYNC_TOKEN` 的 `POST /v1/knowledge/sync`；Vercel Cron 调用 `GET /v1/knowledge/sync` 时由平台注入 `Authorization: Bearer $CRON_SECRET`。鉴权函数必须接受两种受控凭据，不得假定 Cron 可以携带上游的自定义 token。
  - 同步频率属于部署配置，不写死在业务代码；变更频率、Vercel Cron 套餐限制与 embedding 成本共同决定最终周期。

- [ ] **Step 6: 实现流式问答 API**

  ```typescript
  /** 文件路径：server/routes/v1/chat.post.ts */
  import { defineHandler, readBody, setResponseStatus } from "nitro/h3";
  import { z } from "zod";
  import { streamText } from "ai";
  import { openai } from "@ai-sdk/openai";

  const chatSchema = z.object({
  	message: z.string().min(1),
  	conversationId: z.string().optional(),
  });

  export default defineHandler(async (event) => {
  	try {
  		const { message, conversationId } = chatSchema.parse(await readBody(event));

  		/** 检索与问题相关的上下文。 */
  		const context = await hybridSearch(message, { limit: 5 });

  		/** 基于检索到的上下文流式生成回答。 */
  		const result = streamText({
  			model: openai("gpt-4o"),
  			system: `你是知识库问答助手。根据以下参考资料回答问题。
  如果资料不足，说明「根据现有资料无法回答」。
  
  参考资料：
  ${context.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n")}`,
  			prompt: message,
  		});

  		return result.toDataStreamResponse();
  	} catch (error) {
  		const statusCode = error instanceof z.ZodError ? 400 : getStatusCode(error);
  		setResponseStatus(event, statusCode);
  		const message = error instanceof Error ? error.message : "对话请求失败";
  		return { success: false, code: statusCode, message, data: null };
  	}
  });
  ```

  - Nitro v3 handler 可以直接返回 AI SDK 生成的 Web 标准 `Response`；不要把 `result.toDataStreamResponse()` 再包装为 JSON，也不要在返回该 `Response` 后继续改写状态码或响应头。
  - 在 `tests/routes/` 中为 chat 与 sync handler 编写 `*.test.ts`：mock 检索、embedding 和模型边界；断言输入校验为 `400`、未授权为 `401/403`、并发同步为 `409`，并断言 chat 成功分支返回 `Response` 与预期的流式 `content-type`。

---

### 任务 3.2：演进复用 ai-vue Chat UI

**目标**：复用 `packages/ai-vue` 的 `AiChat`，将本地 mock 状态与展示层解耦，再补齐真实流式会话、停止生成和来源展示能力。

**文件**：`packages/ai-vue/src/components/ai-chat/`、`packages/ai-vue/src/composables/`

**步骤**：

- [ ] **Step 1: 保留并解耦现有 AiChat**
  - 保留 `useMockAiChat` 作为文档站和组件演示的默认数据源。
  - `AiChat` 只负责消息、输入、状态和事件展示；消息集合、发送行为、停止行为由使用方传入。
  - 保持现有 `send` 事件，并新增可选的 `stop`、来源数据和流式状态接口。

- [ ] **Step 2: 在 ai-vue 内补齐可复用展示组件**

  ```vue
  <!-- packages/ai-vue/src/components/ai-chat/AiChatMessage.vue -->
  <template>
  	<div :class="['message', `message-${role}`]">
  		<div class="message-avatar">
  			<el-icon v-if="role === 'assistant'"><ai-el-icon /></el-icon>
  		</div>
  		<div class="message-content">
  			<div class="message-text">
  				<MarkdownRenderer :content="content" :streaming="streaming" />
  			</div>
  			<div v-if="sources?.length" class="message-sources">
  				<div class="sources-header">参考资料</div>
  				<div v-for="(source, i) in sources" :key="i" class="source-item">
  					<span class="source-index">[{{ i + 1 }}]</span>
  					<span class="source-text">{{ source.content }}</span>
  				</div>
  			</div>
  		</div>
  	</div>
  </template>

  <script setup lang="ts">
  interface Source {
  	id: string;
  	content: string;
  	score: number;
  	sourcePath: string;
  	sourceUrl: string;
  	headingPath: string[];
  	headingIndex: number;
  	headingAnchor: string;
  	chunkIndex: number;
  	imageUrls: string[];
  }

  defineProps<{
  	role: "user" | "assistant";
  	content: string;
  	sources?: Source[];
  	streaming?: boolean;
  }>();
  </script>
  ```

- [ ] **Step 3: 在 ai-vue 内补齐输入与停止交互**

  ```vue
  <!-- packages/ai-vue/src/components/ai-chat/AiChatComposer.vue -->
  <template>
  	<div class="chat-input">
  		<el-input
  			v-model="inputValue"
  			type="textarea"
  			:rows="3"
  			placeholder="输入问题..."
  			@keydown.enter.meta="handleSubmit"
  			@keydown.enter.ctrl="handleSubmit"
  		/>
  		<div class="input-actions">
  			<el-button v-if="isStreaming" @click="handleStop" :icon="VideoPause"> 停止 </el-button>
  			<el-button type="primary" @click="handleSubmit" :loading="isLoading" :icon="Promotion"> 发送 </el-button>
  		</div>
  	</div>
  </template>

  <script setup lang="ts">
  const inputValue = ref("");
  const isStreaming = ref(false);
  const isLoading = ref(false);

  const emit = defineEmits<{
  	submit: [message: string];
  	stop: [];
  }>();

  function handleSubmit() {
  	if (!inputValue.value.trim()) return;
  	emit("submit", inputValue.value);
  	inputValue.value = "";
  }

  function handleStop() {
  	emit("stop");
  	isStreaming.value = false;
  }
  </script>
  ```

- [ ] **Step 4: 实现可选的流式 Markdown 渲染**

  ```vue
  <!-- packages/ai-vue/src/components/ai-chat/AiChatMarkdown.vue -->
  <template>
  	<div class="markdown-content" v-html="renderedContent"></div>
  </template>

  <script setup lang="ts">
  import MarkdownIt from "markdown-it";
  import { codeBlockPlugin } from "@shikijs/stream";

  const props = defineProps<{
  	content: string;
  	streaming?: boolean;
  }>();

  const md = new MarkdownIt({
  	html: false,
  	linkify: true,
  	typographer: true,
  });

  // 注册代码高亮插件
  md.use(codeBlockPlugin({ theme: "github-dark" }));

  const renderedContent = computed(() => {
  	return md.render(props.content);
  });
  </script>
  ```

---

### 任务 3.3：集成来源高亮与溯源

**目标**：实现回答中的来源标注、来源卡片、来源阅读器与精确标题段落跳转。

**文件**：使用方的 `useKnowledgeChat.ts`；`ai-vue` 仅接收消息、流式状态与来源数据，不耦合 Nitro 请求实现。

**步骤**：

- [ ] **Step 1: 修改 Chat API 返回来源**

  ```typescript
  /** 返回 VitePress 静态文档地址；地址由 sourcePath 派生，不入库。 */
  function createSourceUrl(sourcePath: string): string {
  	const relativePath = sourcePath.replace(/^docs\//, "").replace(/\.md$/, ".html");
  	return `/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
  }

  return result.toDataStreamResponse({
  	data: {
  		sources: context.map((c) => ({
  			id: c.id,
  			content: c.content.slice(0, 200), // 截取前200字符
  			score: c.score,
  			sourcePath: c.sourcePath,
  			sourceUrl: createSourceUrl(c.sourcePath),
  			headingPath: c.headingPath,
  			headingIndex: c.headingIndex,
  			chunkIndex: c.chunkIndex,
  			headingAnchor: c.headingAnchor,
  			imageUrls: c.imageUrls,
  		})),
  	},
  });
  ```

- [ ] **Step 2: 前端解析来源数据**

  ```typescript
  import { useChat } from "@ai-sdk/vue";

  interface Source {
  	id: string;
  	content: string;
  	score: number;
  	sourcePath: string;
  	sourceUrl: string;
  	headingPath: string[];
  	headingIndex: number;
  	headingAnchor: string;
  	chunkIndex: number;
  	imageUrls: string[];
  }

  /** 使用入库时确定的稳定锚点跳转，不依赖文档渲染器的标题 slug 规则。 */
  function resolveSourceHref(source: Source): string {
  	if (source.headingIndex === -1) return source.sourceUrl;

  	return `${source.sourceUrl}#${source.headingAnchor}`;
  }

  export function useKnowledgeChat() {
  	const { messages, sendMessage, stop, isLoading } = useChat({
  		api: "/v1/chat",
  	});

  	const sources = ref<Map<number, Source[]>>(new Map());

  	function handleStream(event: any) {
  		if (event.type === "source") {
  			const msgIndex = messages.value.length;
  			const currentSources = sources.value.get(msgIndex) || [];
  			currentSources.push(event.data);
  			sources.value.set(msgIndex, currentSources);
  		}
  	}

  	return {
  		messages,
  		sources,
  		resolveSourceHref,
  		sendMessage,
  		stop,
  		isLoading,
  	};
  }
  ```

- [ ] **Step 3: 在 VitePress 中实现稳定标题锚点**
  - 修改 `docs/.vitepress/config.mts` 的 Markdown 渲染配置。构建时根据 `env.relativePath` 得到 `sourcePath = "docs/" + env.relativePath`，以同一 Markdown AST 维护 H1/H2/H3 的 `headingPath` 和零基 `headingIndex`，并按 `[sourcePath, headingPath.join("\u0000"), String(headingIndex)].join("\u0000")` 的 SHA-256 base64url 摘要写入 `id="rag-heading-<digest>"`。
  - `sourcePath` 映射到 VitePress 静态页面 URL：移除 `docs/`，将 `.md` 替换为 `.html`，并对每个路径段使用 `encodeURIComponent`。Chat API 根据该规则返回 `sourceUrl`，来源卡片再拼接 `#headingAnchor`；不得使用 VitePress 默认标题 slug。
  - 页面加载后，锚点元素存在则浏览器跳转到它；不存在则保留在该文档顶部。不得新增从数据库读取 Markdown 的来源阅读器或 Nitro 来源路由。
  - 为同名标题、无标题根块、VitePress URL 映射、锚点存在和锚点缺失回退分别编写 `*.test.ts` 测试。

---

## 第四周：优化与展示准备

### 任务 4.1：检索参数调优

**目标**：优化 chunk_size、top_k、score_threshold 等参数

**文件**：`src/lib/config.ts`

**步骤**：

- [ ] **Step 1: 创建配置管理**

  ```typescript
  // src/lib/config.ts
  export const ragConfig = {
  	chunk: {
  		chunkSize: 500,
  		overlap: 50,
  		separators: ["\n\n", "\n", "。", "！", "？", ". "],
  	},
  	search: {
  		topK: 10,
  		rerankTopK: 5,
  		scoreThreshold: 0.5,
  	},
  	embedding: {
  		model: "text-embedding-3-small",
  		dimension: 1536,
  		batchSize: 100,
  	},
  };
  ```

- [ ] **Step 2: 编写 A/B 测试脚本**

  ```typescript
  // src/scripts/tune-params.ts

  const paramSets = [
  	{ chunkSize: 300, overlap: 30, topK: 5 },
  	{ chunkSize: 500, overlap: 50, topK: 10 },
  	{ chunkSize: 800, overlap: 100, topK: 15 },
  ];

  async function tuneParams() {
  	const results = [];

  	for (const params of paramSets) {
  		const evalResult = await runEval(params);
  		results.push({ params, ...evalResult });
  	}

  	// 找出最优参数组合
  	const best = results.reduce((a, b) => (a.hitRate > b.hitRate ? a : b));

  	console.log("最优参数:", best);
  }
  ```

---

### 任务 4.2：完善 README 与演示

**目标**：编写完整的项目文档和演示材料

**文件**：`README.md`

**步骤**：

- [ ] **Step 1: 编写功能介绍**

  ```markdown
  # AI 知识库问答系统

  基于 RAG 技术栈的动态知识库问答系统，知识源固定为 `docs/docx` 下持续更新的 Markdown 文档。

  ## 核心功能

  - 🔄 `docs/docx` 知识源增量同步与同步记录
  - 🔍 Hybrid Search 混合检索
  - 💬 流式问答与来源溯源
  - ⚡ 实时响应与交互

  ## 技术栈

  - Frontend: Vue3 + Element Plus X
  - Backend: 独立 Nitro API
  - Database: Neon + pgvector
  - AI: OpenAI + Vercel AI SDK
  ```

- [ ] **Step 2: 录制演示视频**
  - 准备 30-60s 功能演示视频
  - 上传至 YouTube/Bilibili

- [ ] **Step 3: 提交代码**
  ```bash
  cd ai-knowledge-base
  git init
  git add .
  git commit -m "feat: AI knowledge base RAG system"
  ```

---

## 实施检查清单

### 里程碑检查

- [ ] **M1：最小 RAG 闭环** (第 1 周)
  - [ ] Chroma 本地环境搭建
  - [ ] Chunk 切分实现
  - [ ] 第一个检索 demo

- [ ] **M2：Hybrid Search** (第 2 周)
  - [ ] 词法全文检索实现
  - [ ] 向量检索实现
  - [ ] RRF 融合
  - [ ] 评估集运行

- [ ] **M3：完整问答系统** (第 3 周)
  - [ ] 独立 Nitro API 开发
  - [ ] ai-vue Chat UI 演进复用
  - [ ] 来源展示

- [ ] **M4：简历作品集** (第 4 周)
  - [ ] 参数调优
  - [ ] README 完善
  - [ ] 演示材料

---

## 版本历史

| 版本 | 日期       | 变更说明 |
| ---- | ---------- | -------- |
| 1.0  | 2026-07-29 | 初始版本 |
