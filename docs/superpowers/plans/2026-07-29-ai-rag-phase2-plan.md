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
  - 执行任何 Neon 云端命令前，先运行 `pnpm run neon:guard`。该守卫必须确认项目可执行入口中不存在 `neonctl`；失败时停止本任务，不得改用 `neonctl`、`npx` 临时替代命令或手工绕过检查。
  - Windows 严禁直接执行 `neonctl`，包括 `neonctl --help` 与 `neonctl --version`。这是已复现的严重故障路径：`neonctl@2.30.1` 的 `cmd -> node` 一次性帮助命令曾在无监听端口时持续占用单核 CPU。正确替代是用户确认官方 `neon` 已安装认证后，按本任务的 `neon projects get`、`neon branches list`、`neon databases list` 和 `neon psql` 命令执行。
  - 本任务的每次实际云端操作都记录执行时间、已确认认证状态、工作目录、脱敏后的官方 `neon` 命令模板、目标 project/branch/database、退出码和验证结果；连接串、密码和 token 不得进入记录。命令异常时额外记录 PID、父进程、CPU 二次采样和监听端口，再按受限进程清理门禁处理。
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

### 任务 3.2：集成现成 Chat UI 与流式 Markdown

**目标**：以 `vue-element-plus-x` 的 `Bubble`、`BubbleList`、`Sender` 实现唯一的对话 UI 主线，以 `markstream-vue` 实现唯一的流式 Markdown 主线；`ai-vue` 仅保留项目 DTO、来源链接与 mock 演示的薄适配。

**文件**：业务使用方的 Chat 页面与 `useKnowledgeChat.ts`；`packages/ai-vue` 仅包含薄适配和文档示例。

**步骤**：

- [ ] **Step 1: 锁定依赖与真实 API**
  - 将 `vue-element-plus-x`、`markstream-vue` 和 `@ai-sdk/vue` 锁定为经过核验的版本；不得根据示例或名称猜测 API。
  - 验证 `Bubble`、`BubbleList`、`Sender` 的消息、列表、发送与停止接口，以及 `markstream-vue` 的 `content`/流式结束状态接口。
  - `@ai-sdk/vue` 尚未安装和接入；其 transport、state、abort 合同测试是后续步骤的前置条件。

- [ ] **Step 2: 以第三方组件替换同职责本地实现**
  - 在业务 Chat 页面真实 import `Bubble`、`BubbleList`、`Sender` 与 `markstream-vue`；不得继续新增或导出与它们同职责的本地消息、输入或 Markdown 组件。
  - `ai-vue` 只负责将项目 message/source DTO 映射为第三方 props、生成稳定 `sourceHref`、维持 mock 文档示例；不得导入 `@ai-sdk/vue` 或耦合 Nitro 请求。
  - 将停止操作绑定到使用方传入的 abort；在尚未接入真实 transport 时，mock 示例必须明确保持本地边界。

- [ ] **Step 3: 实现单一的流式 Markdown 与打字机呈现路径**
  - 助手 Markdown 正文必须由 `markstream-vue` 的 `MarkdownRender` 直接渲染：SSE 内容持续追加到响应式 `content`，流式期间传入 `final=false`，收到结束信号后传入 `final=true`。不得以整段替换或外层纯文本动画模拟流式回答。
  - 默认使用 `mode="chat"`、`smoothStreaming="auto"` 与 `markstream-vue` 的 `typewriter`；当后端 chunk 粒度不均或较大时，验证其平滑追赶仍保持 Markdown、代码围栏、表格和公式的正确中间状态。
  - 检测到 `prefers-reduced-motion: reduce` 时关闭正文 `typewriter` 与淡入动画，但保留真实内容流和 `final` 收敛。为默认策略与减少动态效果策略分别编写 `describe`/`test` 合同测试。
  - 禁止使用 `vue-element-plus-x` 的 `Typewriter` 包裹助手 Markdown 正文，也禁止新增自研 Markdown 打字机。该组件仅可用于 Welcome 或其他非 Markdown 的简短文案，并须遵守同一动态效果偏好。

- [ ] **Step 4: 受控集成代码块高亮**
  - 仅在 `markstream-vue` 版本与实际组件 API 完成 spike 后，评估 `@shikijs/stream`；它只处理生成中代码块高亮，不替代 Markdown renderer。
  - 为表格、未闭合代码块、长回复、XSS 防护和流式结束状态编写 `describe`/`test` 合同测试；缺任一证据时不得宣称兼容或接入。

- [ ] **Step 5: 验收 UI 复用边界**
  - 断言实现产物真实 import `vue-element-plus-x` 和 `markstream-vue`，并在组件测试和构建中验证消息、发送、停止、来源 footer 与流式渲染。
  - AI Elements Vue 仅作为 Tailwind/shadcn 栈的备选，不得与 Element Plus X 混用。

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
  - 前置条件：先安装并锁定 `@ai-sdk/vue`，再根据该锁定版本的官方 API 编写 `useKnowledgeChat`；下方仅表达数据边界，不得据此假定当前版本的调用签名。
  - `useKnowledgeChat` 只存在于业务使用方，负责 transport、消息状态与 abort；它向 Element Plus X 和 `markstream-vue` 传入已规范化的消息、流式状态与来源 DTO。通用 `ai-vue` 不得导入 `@ai-sdk/vue`，也不得包含 Nitro 请求实现。
  - 为 transport、abort、来源数据帧、`503 RAG_NOT_CONFIGURED` 和 DTO 映射编写合同测试；未通过前不得将真实聊天状态标为可用。

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

## 5. 高频更新与待办

本章是本计划的持续状态台账。每次推进二期 AI RAG 时，优先更新本章；原任务与里程碑中的复选框仅在实现、验证完成且获得用户认可后才更新，避免将“代码已写入”误记为“目标已验收”。

### 5.1 更新规则

- 只记录可复核事实：修改范围、验证命令、外部依赖和下一步，不写推测性结论。
- 本地代码、外部凭据和云端验收必须分开记录；本地构建成功不能证明 Neon、Vercel 或模型服务可用。
- 外部步骤执行前先记录授权、目标资源、脱敏后的命令模板与预期证据；不得把连接串、密码、token 或模型密钥写入本文件。
- 本章按状态变化更新。没有新的证据时保留原记录，不重复改写日期或制造无意义变更。

### 5.2 当前已验证的本地成果

|             模块             |                                                                                                                                                                           当前证据                                                                                                                                                                           |                                                                                                                                           验证范围                                                                                                                                           |                                                                                   残余边界                                                                                    |
| :--------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|        结构化知识准备        |                                                                                                                                            Markdown 扫描、结构化 chunk、稳定标题锚点、来源 URL 与 RRF 合同已落地                                                                                                                                             |                                                                                                                               `ai-rag-core` 单元测试与类型检查                                                                                                                               |                                                                     未接入真实语料的 embedding 与向量写入                                                                     |
|         API 离线合同         |                                                                                 Nitro 路由、鉴权/错误映射、同步记录 schema、pgvector migration、Hybrid Search 注入合同已落地；凭据守卫显式扫描 `drizzle`、`server`、`src`、发布配置与 `.sql` migration，不扫描测试正则字面量                                                                                 |                                                                                           `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test`：`14` 文件、`41` 用例通过；类型检查与 `build:vercel`                                                                                           |                                                                  没有真实 PostgreSQL lexical/vector provider                                                                  |
|       只读知识准备 CLI       |                                                                                                                                `knowledge:prepare:dry-run` 强制要求 `--dry-run`，复用本地扫描与 chunk 合同，只输出 JSON 摘要                                                                                                                                 |                                                                                               实际本地运行：`271` 份 Markdown、`5534` 个 chunk、`failedFiles: []`；API 全包测试和类型检查通过                                                                                                |                                                          不生成 embedding，不写库，不构成同步事务或生产 RAG 完成证据                                                          |
| PostgreSQL provider 离线合同 |                                                                                                                                     注入式 executor 的词法/向量 SQL、结果行映射、参数与 `1536` 维校验已落地；不创建连接                                                                                                                                      |                                                                                                `postgres-search.test.ts` 覆盖参数化词法 SQL、余弦 `<=>`、维度、畸形行与分页错误；类型检查通过                                                                                                |                                                            未连接真实 PostgreSQL，未装配模型 embedding 或生产服务                                                             |
|         聊天安全边界         |                                                                                                                                 未装配真实检索或流服务时返回 `503 RAG_NOT_CONFIGURED`；模型配置只允许来自私有 runtime config                                                                                                                                 |                                                                                                                          路由测试覆盖 503、Response 原样透传与 EOF                                                                                                                           |                                                                       尚未装配生产 `event.context.rag`                                                                        |
|           离线评估           |                                                                                                                                                  固定 10 题题集和 lexical/vector/hybrid 三策略评估器已落地                                                                                                                                                   |                                                                                                                        评估器测试覆盖 JSON 结果、命中率和关键词覆盖率                                                                                                                        |                                                                       尚未以真实索引运行并写入评估结果                                                                        |
|         本地 Chat UI         |                                          `AiChat` 已直接接入 `Bubble`、`BubbleList`、`Sender` 与 `MarkdownRender`；助手消息采用 `mode="chat"`、`html-policy="escape"`，默认使用 `smoothStreaming="auto"` 与 `typewriter`、固定 `fade=false`，减少动态效果时关闭三项；外部流式响应期提供可见、可访问的“停止生成”入口                                          |                          `pnpm --filter @ruan-cat-drill-doc/ai-vue test`：`4` 文件、`15` 用例通过；其中真实 `markstream-vue` DOM 验收覆盖表格、未闭合 fence、20k/1k 行长文、HTML/`javascript:` XSS 与 `final` 更新；`typecheck`、`build` 通过；停止入口独立复核通过                          |                                                尚未完成生产后端驱动的浏览器回归、SSR hydration 深度验证和逐 token 代码高亮验收                                                |
|     本地 Chat transport      |                                                                                  `@ai-sdk/vue@1.2.12` 仅装配于 `ai-vitepress-plugins`；来源帧只传递 `id`、`label`、`sourceHref`，每轮请求清空 SDK `data` 并以新助手消息 ID 隔离来源；`503 RAG_NOT_CONFIGURED` 可展示和关闭                                                                                   |                             `ai-vitepress-plugins` 全包测试 `3` 文件、`8` 用例通过；新增真实 `useChat` + Node HTTP data-stream 测试，覆盖请求体、文本/来源帧、ready 状态、AbortSignal 和已接收内容保留；API 路由合同、三包 typecheck 与 `git diff --check` 通过                              |                                                                未验证生产 Nitro server、模型、数据库或生产装配                                                                |
|        VitePress 锚点        |                                                                                                                                                             构建期稳定锚点与来源 URL 映射已落地                                                                                                                                                              | 当前工作区再次执行 `$env:NODE_OPTIONS='--max-old-space-size=8192'; pnpm run docs:build`，退出码 `0`，输出 `9 successful, 9 total`，耗时 `1m25.237s`；完整日志：`.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/docs-build-2026-08-03-transport.log`；`docs/.vitepress/dist` 含 `6600` 个文件 |                                                                             外部部署回归仍未执行                                                                              |
|      Content API 兼容性      |                                                                                                              `ai-vue-doc` 显式约束 `@ztl-uwu/nuxt-content@2.13.9`、`h3@1.15.11` 与 `@vueuse/nuxt@14.3.0`，避免 Content 在宿主包解析传递依赖失败                                                                                                              |                                                                         `nuxi prepare` 先复现 `Could not load @vueuse/nuxt`，显式依赖后通过；`pnpm --filter @ruan-cat-drill-doc/ai-vue-doc build` 以退出码 `0` 完成                                                                          |                                             Windows 下 Nitro prerender 峰值约 `7 GiB`，完整构建必须串行并保留 `8 GiB` Node 堆上限                                             |
|    Vercel Nitro 独立部署     | `smallalice-docs-ai-nitro-api` 已创建并部署（Mode A 产物搬运）；云端 Build/Output/Install/Node 配置已补齐；Neon migration `0000_ai_rag.sql` 已执行（vector 0.8.0、documents/chunks/knowledge*sync_runs 三表、HNSW 余弦索引）；7 个 `NITRO*\*` 环境变量跨 production/preview/development 接线；`server/plugins/rag.ts` 装配插件已上线（六项门禁、模块级单例） |             生产域名 `https://smallalice-docs-ai-nitro-api.ruan-cat.com/` 可达；`GET /v1/knowledge/sync-runs` 返回 `200`；`POST /v1/knowledge/sync` 无 Bearer 返回 `401`、有 Bearer 返回 `200`（stub）；`GET /v1/knowledge/sync` 无 Bearer 返回 `401`、有 Cron Secret 返回 `200`             | `POST /v1/search` 和 `POST /v1/chat` 返回 `500`（空库/网关运行时问题，非部署问题）；git-push 远程构建 `ERR_PNPM_META_FETCH_FAIL` 持续失败，需排查 Vercel 构建环境 pnpm 兼容性 |

### 5.3 待办与外部验收门禁

| 优先级 |                                        待办                                        |                                       进入条件                                       |                                                        所需证据                                                        |                          当前状态                          |
| :----: | :--------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------: | :--------------------------------------------------------: |
|   P0   |     实现 PostgreSQL 词法检索与 pgvector 检索 provider，并装配到同步和聊天服务      |                 用户明确允许数据库操作，且 Vercel 环境变量已安全拉取                 |                               脱敏后的 migration、provider 集成测试、目标数据库查询结果                                |                        等待外部授权                        |
|   P0   |    生成真实 embedding，执行增量对账、单文档事务替换与 PostgreSQL advisory lock     |                      已有可用 OpenAI/embedding 凭据及目标数据库                      |                                    同步运行记录、失败文件记录、重复同步不重算的证据                                    |                        等待外部授权                        |
|   P0   | 装配生产 `event.context.rag`，把 Hybrid Search 和私有 OpenAI 流服务接入 `/v1/chat` |                       检索 provider、模型配置和部署环境均可用                        |                                      真实端到端流式响应、来源 DTO、503 非装配分支                                      |         部署基础设施已就绪；search/chat 500 待排查         |
|   P0   |    本地 Chat UI 库适配已完成：`vue-element-plus-x` 与 `markstream-vue` 真实接入    | `vue-element-plus-x@1.3.98` 与 `markstream-vue@1.0.8` 类型、运行产物和 README 已核验 | `Bubble`/`BubbleList`/`Sender`、来源 footer、Markdown 安全策略、默认与减少动态策略的 Vitest 覆盖；包级 typecheck/build |                本地完成；真实传输依赖下一项                |
|   P0   |             锁定并验证 `@ai-sdk/vue` 的真实 transport/state/abort 合同             |                        `@ai-sdk/vue` 已安装且版本 API 已核验                         |                        `useKnowledgeChat` transport、abort、来源帧、503 分支与 DTO 映射合同测试                        |              本地完成；生产端到端仍待外部授权              |
|   P1   |           验证 `@shikijs/stream` 与 `markstream-vue` 的代码块高亮兼容性            |                 前述 Markdown renderer 已接入，版本与组件 API 已锁定                 |                  真实 Markdown 表格、未闭合代码块、XSS、长回复和流结束测试；再单独证明 Shiki 适配边界                  |       Markdown 本地完成；Shiki 适配未证实，禁止接入        |
|   P1   |               提供 `rag:sync` 与可选 `rag:watch`，并配置生产同步触发               |                               同步服务可连接目标数据库                               |                                       本地一次同步、监听变更与受控鉴权触发的日志                                       |                      依赖 P0 同步服务                      |
|   P1   |                         用真实索引运行评估集并产出调优结果                         |                       词法、向量与 embedding provider 全部可用                       |                                         固定题集输出、参数集、命中率和选型理由                                         |                      依赖 P0 检索服务                      |
|   P1   |                        诊断并通过完整 `pnpm run docs:build`                        |                                可复现当前文档构建环境                                |                当前工作区状态下完整构建退出码 `0`、`9 successful, 9 total`、`6600` 个产物文件及完整日志                |                  本地完成；外部部署未验证                  |
|   P1   |                 部署到既有关联的 Vercel 项目并完成生产可访问性回归                 |         用户明确授权部署，且生产环境变量、检索 provider 与流服务均已完成装配         |                               脱敏后的部署记录、部署 URL、真实流式问答与来源跳转回归证据                               | Vercel 项目已部署（prebuilt）；git-push 远程构建失败待排查 |
|   P2   |                      完善 README，录制并上传 30-60 秒演示视频                      |                       本地端到端功能可演示，且用户授权外部上传                       |                                            文档链接、视频地址与可访问性验证                                            |                    视频上传等待用户授权                    |

### Task 5：建立 Nitro RAG 运行时装配工厂与配置失败合同（离线 fake provider）

> 本任务属于本地可完成的装配边界，不替代第 5.3 节中需要外部凭据、真实数据库、模型服务或部署授权的 P0 待办。

- [ ] **Step 1：新增可注入的 runtime assembly 工厂**
  - 输入已解析的私有 runtime config 与显式 provider factories。
  - 输出路由所需的 `event.context.rag` 能力：`retrieve`、`search`、`stream`、`sync`、`syncRuns` 及只读配置。
  - 工厂不得读取裸 `process.env`，不得在 import 时建立数据库连接；数据库、embedding 和模型连接必须由 factory 参数注入。
- [ ] **Step 2：定义缺失配置与 provider 错误合同**
  - 缺少 database、embedding 或 model 配置时，不生成半成品 context，并继续由路由返回 `503 RAG_NOT_CONFIGURED`。
  - provider factory 抛错时不得被路由转换成 HTTP 200 假成功。
- [ ] **Step 3：用真实 Nitro/H3 harness 验证装配路径**
  - 新增 `packages/ai-rag-api/tests/runtime-assembly.test.ts`，使用 Vitest `describe`/`test`。
  - 覆盖完整 fake assembly、缺失配置、provider 错误、裸环境变量隔离，以及 chat/search/sync 路由消费装配 context。
- [ ] **Step 4：运行本地验证并记录边界**
  - `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test`
  - `pnpm --filter @ruan-cat-drill-doc/ai-rag-api typecheck`
  - `git diff --check`
  - 验证结果只能证明依赖拓扑与配置合同成立，不得写成真实 PostgreSQL、embedding、模型或生产装配完成。

### 5.4 最近更新记录

- 2026-08-07：完成 Nitro API 独立 Vercel 部署。`smallalice-docs-ai-nitro-api` 项目已创建，云端 Build/Output/Install/Node 配置已补齐（REST API PATCH）。根 `vercel.json` 已删除（破坏性变更），配置迁移到 `small-alice-web-odse` 云端 Project Settings。`server/plugins/rag.ts` 装配插件上线（六项门禁、模块级单例、request 钩子挂载 `event.context.rag`）。Neon migration `0000_ai_rag.sql` 已执行（vector 0.8.0、documents/chunks/knowledge*sync_runs 三表、HNSW 余弦索引，由 Neon MCP `run_sql` 独立复核）。7 个 `NITRO*\*`环境变量跨 production/preview/development 三环境接线。生产域名`https://smallalice-docs-ai-nitro-api.ruan-cat.com/` 已上线；`GET /v1/knowledge/sync-runs` 返回 `200`，sync 端点鉴权 `401/200` 正确。`POST /v1/search` 和 `POST /v1/chat` 返回 `500`（空库/网关运行时问题，非部署问题）。git-push 远程构建两次均失败（`ERR_PNPM_META_FETCH_FAIL`），需排查 Vercel 构建环境 pnpm 兼容性；prebuilt 部署正常。6 个分类提交已 push 到 dev 分支。
- 2026-08-03：新增本地 Nitro RAG runtime assembly 工厂 `packages/ai-rag-api/server/runtime/rag-assembly.ts` 与 `runtime-assembly.test.ts`。工厂只消费显式 runtime config 和 provider factories，缺少 database、embedding 或 model 配置时在 provider 初始化前保持 `RAG_NOT_CONFIGURED`/503 合同；provider 初始化失败映射为 500，且 wrapper 保留依赖 `this` 的 provider 方法接收者。真实 `createApp`/`app.fetch` harness 覆盖 chat/search/sync、class fake、真实 `0:"answer"\n` data-stream headers 和裸环境变量隔离。API 全包为 `15` 文件、`49` 用例通过，typecheck 与 `git diff --check` 通过。该结果仅证明离线装配拓扑和失败合同，未验证真实 PostgreSQL、embedding、模型、Vercel 或生产部署；Task 5 复核已通过，但复选框待用户确认后再更新。
- 2026-08-03：按 `cleanup-agent-team-node-processes` 执行最终 dry-run，台账为 `.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/agent-team-process-ledger-task-5-final.dry-run.json`；采样到 `12` 个目标进程，`candidateCount: 0`、`auditOnlyCount: 12`，未停止任何进程。长驻服务、父进程仍存活或归属不明的进程均保留审计状态。
- 2026-08-01：修复本地 Chat 的两个真实运行时边界。`BubbleList` 固定为 `autoScroll=false`，绕开 `vue-element-plus-x@1.3.98` 在单消息列表访问未定义节点 `getBoundingClientRect()` 的上游分支；独立复核通过。上游 `Sender` 的 loading 按钮虽触发 `cancel`，但无可见文字或可访问名称，因而仅在 `external + isResponding` 时增加应用层“停止生成”按钮，复用既有 `@ai-sdk/vue` `stop()` 事件链；独立复核与 `ai-vue` `4` 文件、`15` 用例、typecheck、build 均通过。由于本地 `agent-browser` Chrome 无法启动，真实页面的流式可见性、点击中止和已接收内容保留仍是未通过门禁。
- 2026-08-01：根 `pnpm run docs:build` 首次在 `ai-vue-doc` 明确报出 `Could not load @vueuse/nuxt`。根因是 `@ztl-uwu/nuxt-content@2.13.9` 在宿主侧加载 `@vueuse/nuxt@14.3.0`，而 pnpm 不向应用包暴露未声明的传递入口；将锁文件已有的 `@vueuse/nuxt@14.3.0` 声明为 `ai-vue-doc` 的直接依赖后，`nuxi prepare` 与单包生产 build 成功。无并发且停止本会话 VitePress 开发服务器后，`pnpm exec vitepress build docs` 以退出码 `0` 在 `95.69s` 完成；根 Turbo 一次运行因文档转换和构建合计超过 `304s` 的执行器上限而没有可用退出码，不能将该次编排记录标为成功。
- 2026-08-01：完成本地包级测试边界的两轮独立复核。API 凭据守卫扫描范围明确为 `drizzle`、`server`、`src`、顶层发布配置和 `.sql` migration，并断言 `drizzle/0000_ai_rag.sql` 被覆盖，测试文件仍不参与扫描；API 全包为 `11` 文件、`32` 用例通过。VitePress 插件 Vitest 将 `vue-element-plus-x` 仅在测试服务器内联，由 Vite 处理其 CSS，生产 `vite.config.ts` 未变；插件全包为 `2` 文件、`6` 用例通过。两包 typecheck 和 `git diff --check` 均通过。
- 2026-08-01：追加验证 `pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins build`。生产 Vite 构建成功并生成客户端 JS、CSS 与声明文件，说明 Vitest 的 `test.server.deps.inline` 设置未阻断发布构建；构建只报告上游 `@vueuse/core` 纯注释、空根入口和默认/命名导出形式警告。
- 2026-08-01：新增只读 `knowledge:prepare:dry-run` CLI，要求显式 `--dry-run`，复用本地 Markdown 扫描与 chunk 准备，成功和错误均输出 JSON。真实本地运行得到 `271` 份文档、`5534` 个 chunk、`failedFiles: []`；该结果只证明离线准备，未生成 embedding、未写 PostgreSQL、未执行同步事务或外部服务调用。该实现正在等待独立范围复核后才可标为本地完成。
- 2026-08-01：新增 PostgreSQL 检索 provider 的离线合同。词法检索使用参数化 `websearch_to_tsquery('simple', $1)`，向量检索固定 `embedding <=> CAST($1 AS vector)`，并将距离映射为相似度；executor 由调用方注入，因而本轮不创建连接。测试覆盖 SQL 参数、`1536` 维有限数值、无效分页及畸形数据库行。该结果是待独立复核的本地契约证据，不替代目标数据库查询、HNSW 召回率或生产装配。
- 2026-08-01：本地 `@ai-sdk/vue@1.2.12` transport/state/abort 合同已完成并经独立复核。`AiChat` 的 `@send` payload 与 composable 统一为 `AiChatMessage`；每轮请求先清空 SDK `data`，再按本轮新助手消息 ID 保存来源，避免累计来源跨轮串扰。离线测试覆盖真实事件对象、多来源、两轮请求、abort、`503 RAG_NOT_CONFIGURED` 和只含 `id`、`label`、`sourceHref` 的来源 DTO。未调用真实 HTTP、模型、数据库、Neon 或 Vercel。
- 2026-08-01：真实 `markstream-vue@1.0.8` jsdom renderer 验收已完成。新测试未 mock renderer，覆盖表格、未闭合 fenced code、至少 `20,000` 字符/`1,000` 行长回答、原始 HTML 与 Markdown `javascript:` XSS、同一消息 `final=false -> true` 更新；`ai-vue` 全量 Vitest 为 `4` 文件、`14` 用例通过。`@shikijs/stream` 仍未接入：它只处理单代码 token 流，且没有已证实的 `markstream-vue` fenced-code 注入 API，不能据此宣称逐 token 高亮兼容。
- 2026-08-01：`ai-vue` 本地 Chat UI 完成初始库适配：`Bubble`、`BubbleList`、`Sender` 与 `MarkdownRender` 均为真实 import。助手 Markdown 保持 `mode="chat"`、`content`、`final` 与 `html-policy="escape"`；默认采用 `smoothStreaming="auto"` 与 `typewriter`、固定 `fade=false`，`prefers-reduced-motion: reduce` 时关闭三项但保留内容流。该阶段包级 Vitest `3` 文件、`8` 用例通过，后续真实 renderer 验收见本节较新记录。
- 2026-08-01：诊断 `ai-vue-doc` 的 Nuxt Content cache/search 预渲染 `500`。真实本地 API 探针证明，Content 的未声明 H3 runtime import 会解析到根级 `h3@2.0.1-rc.22`，产生 `ERR_INVALID_URL` 与 `sendError` 导出不兼容。已在 `ai-vue-doc` 显式约束 `@ztl-uwu/nuxt-content@2.13.9`、`h3@1.15.11`，fresh dev 请求两个 Content API 均为 `200`。不得通过 `nitro.prerender.ignore`、禁用搜索或清空预渲染路由掩盖该问题；早期单包构建尚无完成证据，后续结果见下一条。
- 2026-08-01：在无并发构建的条件下，以 `NODE_OPTIONS=--max-old-space-size=8192` 完成单包 `ai-vue-doc build`，随后两次串行 `pnpm run docs:build` 均输出 `9 successful, 9 total`，VitePress 分别在 `82.36s` 和 `81.10s` 完成。本轮 `docs/.vitepress/dist` 最后写入时间为 `2026-08-01T03:17:54+08:00`，含 `6600` 个文件；两轮 stderr 未匹配 `ENOTEMPTY`、`ERR_INVALID_URL`、`FATAL ERROR` 或 `heap out of memory`。Nuxt/Nitro prerender 峰值工作集约 `7 GiB`，其构建会在约两分钟后自然完成；不得因短时无输出并行重启或提前终止。
- 2026-08-03：在本轮真实 transport 合同改动后重新验证本地包边界。`pnpm --filter @ruan-cat-drill-doc/ai-rag-api test` 为 `14` 文件、`41` 用例通过，`ai-vitepress-plugins` 为 `3` 文件、`8` 用例通过，`ai-vue` 为 `4` 文件、`15` 用例通过；三个包的 `typecheck` 均退出码 `0`，`git diff --check` 无输出。此次验证不覆盖真实浏览器、生产 Nitro server、模型、数据库、生产装配、根 `pnpm run docs:build` 的当前工作区状态，也不改变 PostgreSQL、embedding、同步事务、Vercel 部署和演示视频的外部门禁。
- 2026-08-03：在无开发服务器、无并发构建的条件下，以 `NODE_OPTIONS=--max-old-space-size=8192` 对当前工作区状态重新执行根 `pnpm run docs:build`。命令退出码为 `0`，输出 `9 successful, 9 total`，`docs/.vitepress/dist` 检查到 `6600` 个文件；完整 stdout/stderr 已保存至 `.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/docs-build-2026-08-03-final.log`。该证据只覆盖本地当前构建，不代表 Neon、PostgreSQL、embedding、模型服务、真实浏览器、Vercel 部署或演示视频已完成。
- 2026-08-03：补充真实 `@ai-sdk/vue@1.2.12` 本地 transport 合同。`useKnowledgeChat` 新增可选 `api`/`fetch` 注入但默认行为不变；新增真实 `127.0.0.1` HTTP 服务测试，使用 SDK 原生 `useChat` 解析 `0:text` 与 `2:data` 帧，验证请求体、来源 DTO、`ready` 状态、`stop()` 触发 AbortSignal，以及中止后保留已接收助手内容。`ai-vitepress-plugins` 全量为 `3` 文件、`8` 用例通过，typecheck 通过。该证据不等同生产 Nitro server、模型、数据库、生产装配、浏览器可见性或 Vercel 部署。
- 2026-08-03：对包含真实 transport 合同改动的当前工作区重新执行根 `pnpm run docs:build`，使用 `NODE_OPTIONS=--max-old-space-size=8192`，退出码 `0`，输出 `9 successful, 9 total`，耗时 `1m25.237s`；完整日志：`.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/docs-build-2026-08-03-transport.log`。构建警告仅为上游注释、未解析 iconfont 和 LLMs SSR 跳过，不改变真实数据库、模型、浏览器、部署和视频门禁。
- 2026-08-03：新增 `packages/ai-rag-api/tests/routes/chat-http.test.ts`，不 mock `nitro/h3`，使用真实 `createApp`、真实 `chat.post` handler 与 `app.fetch(new Request(...))` 组成内存 HTTP harness；在未装配 `event.context.rag` 时验证 HTTP `503`、JSON `Content-Type` 和 `RAG_NOT_CONFIGURED` 响应，并通过 middleware 注入明确标注为 fake 的 provider，验证 `200`、AI SDK data-stream headers/EOF 与来源 `sourceHref`/system DTO。`pnpm --filter @ruan-cat-drill-doc/ai-rag-api test` 为 `14` 文件、`41` 用例通过，typecheck 通过。该 harness 不创建端口、子进程或外部连接，因此无需进程清理；它仍不等同于生产 Nitro server、真实 PostgreSQL、模型服务或 `event.context.rag` 装配。
- 2026-08-03：新增 `packages/ai-rag-api/tests/routes/rag-http.test.ts`，使用真实 `createApp`、真实同步与检索路由及 `app.fetch(new Request(...))`，验证未装配 `event.context.rag` 时 `POST /v1/search`、`POST /v1/knowledge/sync` 和 `GET /v1/knowledge/sync` 均返回 HTTP `503 RAG_NOT_CONFIGURED`，不再以空结果或 `accepted` 假阳性表示成功。该测试不连接数据库、embedding、模型或外部服务。
- 2026-08-03：通过系统 Chrome 的真实浏览器页面验证 VitePress 入口与浮层交互。`http://127.0.0.1:8080/` 返回 `200`，页面挂载 `AiChatVitePressShell`；通过浏览器内注入的受控 `fetch` 流（不代表生产后端）验证输入请求、首段内容可见、生成中“停止生成”按钮出现、AbortSignal 触发、停止后已接收的“第一段”保留且按钮消失。该证据覆盖本地浏览器交互和 UI 状态收敛，不等同真实模型、生产 Nitro、数据库或部署回归。
- 2026-08-03：同步与检索路由的未装配边界统一返回 `503 RAG_NOT_CONFIGURED`。`sync.post.ts`、`sync.get.ts`、`sync-runs.get.ts` 和 `search.post.ts` 不再以 `accepted` 或空数组伪造成功；共享响应抽取到 `ragNotConfiguredResponse`，并由真实 Nitro/H3 `rag-http.test.ts` 覆盖 4 个路由。API 全包为 `14` 文件、`41` 用例通过，typecheck 和 `git diff --check` 通过。
- 2026-07-31：聊天路由移除了空检索与默认模型回退；缺少检索或流服务装配时返回 `503 RAG_NOT_CONFIGURED`，避免以空上下文请求外部模型。
- 2026-07-31：新增私有 runtime config 的 OpenAI 流适配边界、路由 EOF 验证，以及离线固定评估题集和三策略评估器。
- 2026-07-31：确定 Chat UI 技术选型：`vue-element-plus-x` 的 `Bubble`、`BubbleList`、`Sender` 是唯一 UI 主线，`markstream-vue` 是唯一流式 Markdown 主线；该选型已在 2026-08-01 的本地 Chat UI 实施中落地。
- 2026-07-31：当时 `@ai-sdk/vue` 的真实 transport/state/abort 接入、`@shikijs/stream` 与 `markstream-vue` 的兼容性验证均未实施；AI Elements Vue 仅保留为 Tailwind/shadcn 技术栈备选，不与 Element Plus X 混用。后续本地进展见本节 2026-08-01 的较新记录。
- 2026-08-03：完成 `@shikijs/stream@4.4.1` 与 `markstream-vue@1.0.8` 的公开 API spike。前者的 Vue 入口提供 `ShikiStreamRenderer(stream: ReadableStream<ThemedToken | RecallToken>)` 与 `ShikiCachedRenderer(code, lang, theme, highlighter)`；后者的 `MarkdownRender` 接收累积 Markdown `content`，并通过自身 `codeRenderer: 'pre' | 'shiki' | 'monaco'`、`codeBlockStream` 与 `MarkdownCodeBlockNode` 管理代码块。当前没有已证实的 `markstream-vue` fenced-code 注入点可以直接接收 `@shikijs/stream` 的 renderer/stream，因此不安装、不接入、不宣称兼容；后续若需要生成中代码高亮，优先在锁定版本后验证 `markstream-vue` 自带的 `codeRenderer="shiki"` 路径，再决定是否保留独立 `@shikijs/stream`。
- 2026-07-31：未访问 Neon、Vercel、数据库或模型服务；所有真实云端步骤仍以本章的授权与证据门禁为准。

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
