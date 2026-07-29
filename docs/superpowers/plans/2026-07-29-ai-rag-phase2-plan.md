# 二期 AI 化任务实施计划

> **RAG 与检索质量阶段 — 实施任务清单**

---

## 任务概述

本计划基于「二期 RAG 与检索质量设计文档」，将 RAG 学习与项目开发拆解为可执行的原子任务。

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

### 任务 1.2：实现 Chunk 切分策略

**目标**：理解并实现多种 Chunk 切分策略

**文件**：`src/lib/chunk.ts`

**步骤**：

- [ ] **Step 1: 编写固定大小 Chunk 函数**

  ```typescript
  // src/lib/chunk.ts
  interface ChunkOptions {
  	chunkSize: number;
  	overlap: number;
  	separators?: string[];
  }

  /**
   * 固定大小文本切分
   * @param text - 待切分文本
   * @param options - 切分配置
   * @returns 文本块数组
   */
  export function chunkBySize(text: string, options: ChunkOptions): string[] {
  	const { chunkSize, overlap, separators = ["\n\n", "\n", "。", "！", "？", ". "] } = options;
  	const chunks: string[] = [];
  	let start = 0;

  	while (start < text.length) {
  		let end = Math.min(start + chunkSize, text.length);

  		// 寻找最近的分割符
  		for (const sep of separators) {
  			const lastSep = text.lastIndexOf(sep, end);
  			if (lastSep > start) {
  				end = lastSep + sep.length;
  				break;
  			}
  		}

  		chunks.push(text.slice(start, end).trim());
  		start = end - overlap;
  	}

  	return chunks.filter((c) => c.length > 0);
  }
  ```

- [ ] **Step 2: 编写测试用例**

  ```typescript
  // src/lib/chunk.test.ts
  import { describe, it, expect } from "vitest";
  import { chunkBySize } from "./chunk";

  describe("chunkBySize", () => {
  	it("应按指定大小切分文本", () => {
  		const text = "这是第一段。这是第二段。这是第三段。";
  		const chunks = chunkBySize(text, { chunkSize: 10, overlap: 0 });
  		expect(chunks.length).toBeGreaterThan(0);
  	});

  	it("应正确处理 overlap", () => {
  		const text = "ABCDEFGHIJ";
  		const chunks = chunkBySize(text, { chunkSize: 5, overlap: 2 });
  		expect(chunks[1]).toContain("CDE");
  	});
  });
  ```

- [ ] **Step 3: 运行测试验证**
  ```bash
  pnpm vitest run src/lib/chunk.test.ts
  ```

---

### 任务 1.3：生成第一个 RAG 检索 demo

**目标**：完整跑通文档→Chunk→Embedding→检索→回答链路

**文件**：`src/scripts/rag-demo.ts`

**步骤**：

- [ ] **Step 1: 准备测试文档**
  - 创建 `data/test-docs.md` 包含 AI 相关知识问答

- [ ] **Step 2: 实现完整 RAG 链路**

  ```typescript
  // src/scripts/rag-demo.ts
  import { createEmbedding } from "../lib/openai";
  import { getCollection, addDocuments, queryDocuments } from "../lib/chroma";
  import { chunkBySize } from "../lib/chunk";

  async function ragDemo() {
  	// 1. 读取文档
  	const docText = await Bun.file("data/test-docs.md").text();

  	// 2. Chunk 切分
  	const chunks = chunkBySize(docText, {
  		chunkSize: 200,
  		overlap: 50,
  	});
  	console.log(`生成 ${chunks.length} 个文本块`);

  	// 3. 生成 Embedding 并存储
  	const collection = await getCollection("knowledge-base");
  	const embeddings = await Promise.all(chunks.map((c) => createEmbedding(c)));

  	await addDocuments(
  		collection,
  		chunks,
  		chunks.map((_, i) => `chunk-${i}`),
  		chunks.map((c, i) => ({ index: i, length: c.length })),
  	);

  	// 4. 检索
  	const query = "什么是 TypeScript";
  	const results = await queryDocuments(collection, query, 3);

  	// 5. 组装回答
  	const context = results.documents[0].join("\n---\n");
  	console.log("检索到的上下文:\n", context);
  }
  ```

- [ ] **Step 6: 截图记录**
  - 运行成功后将终端截图保存为 `docs/screenshots/rag-demo-01.png`

---

## 第二周：检索质量与 Hybrid Search

### 任务 2.1：实现 PostgreSQL Full-Text Search

**目标**：搭建 Neon 本地 Postgres，测试全文检索

**文件**：`src/lib/search.ts`

**步骤**：

- [ ] **Step 1: 初始化 drizzle + postgres**

  ```bash
  pnpm add drizzle-orm postgres
  pnpm add -D drizzle-kit
  ```

- [ ] **Step 2: 定义 documents 表**

  ```typescript
  // src/db/schema.ts
  import { pgTable, text, timestamp, vector } from "drizzle-orm/pg-core";

  export const documents = pgTable("documents", {
  	id: text("id").primaryKey(),
  	title: text("title").notNull(),
  	content: text("content").notNull(),
  	createdAt: timestamp("created_at").defaultNow(),
  });

  export const chunks = pgTable("chunks", {
  	id: text("id").primaryKey(),
  	documentId: text("document_id").references(() => documents.id),
  	content: text("content").notNull(),
  	metadata: text("metadata"), // JSON
  });
  ```

- [ ] **Step 3: 实现 BM25 检索函数**

  ```typescript
  // src/lib/search.ts
  import { db } from "../db";
  import { chunks } from "../db/schema";
  import { sql } from "drizzle-orm";

  /**
   * BM25 关键词检索
   * 使用 Postgres ts_rank 函数
   */
  export async function bm25Search(query: string, limit = 10) {
  	const results = await db.execute(sql`
      SELECT 
        id,
        content,
        ts_rank(to_tsvector('chinese', content), plainto_tsquery('chinese', ${query})) as rank
      FROM chunks
      WHERE to_tsvector('chinese', content) @@ plainto_tsquery('chinese', ${query})
      ORDER BY rank DESC
      LIMIT ${limit}
    `);
  	return results.rows;
  }
  ```

- [ ] **Step 4: 验证全文检索**
  ```bash
  # 插入测试数据
  # 运行检索查询
  pnpm tsx src/scripts/test-bm25.ts
  ```

---

### 任务 2.2：实现 Hybrid Search（融合检索）

**目标**：实现 BM25 + 向量检索的混合搜索

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
  	bm25Score: number;
  	vectorScore: number;
  	rrfScore: number;
  }

  /**
   * Hybrid Search：并行执行 BM25 和向量检索，RRF 融合
   */
  export async function hybridSearch(query: string, embedding: number[], options: { limit?: number; k?: number } = {}) {
  	const { limit = 10, k = 60 } = options;

  	// 1. BM25 检索
  	const bm25Results = await bm25Search(query, limit);
  	const bm25Map = new Map(bm25Results.map((r, i) => [r.id, i]));

  	// 2. 向量检索 (pgvector)
  	const vectorResults = await vectorSearch(embedding, limit);
  	const vectorMap = new Map(vectorResults.map((r, i) => [r.id, i]));

  	// 3. RRF 融合
  	const allIds = new Set([...bm25Map.keys(), ...vectorMap.keys()]);
  	const fusedResults: SearchResult[] = [];

  	for (const id of allIds) {
  		const bm25Rank = bm25Map.get(id) ?? limit;
  		const vectorRank = vectorMap.get(id) ?? limit;

  		fusedResults.push({
  			id,
  			content: vectorResults.find((r) => r.id === id)?.content || "",
  			bm25Score: 1 / (bm25Rank + 1),
  			vectorScore: 1 / (vectorRank + 1),
  			rrfScore: rrf([1 / (bm25Rank + 1), 1 / (vectorRank + 1)], k),
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
  	it("应正确融合 BM25 和向量检索结果", async () => {
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
  	strategy: "bm25" | "vector" | "hybrid";
  	retrievedIds: string[];
  	hasExpectedKeyword: boolean;
  }

  async function runEval() {
  	const questions = JSON.parse(await readFile("data/eval-questions.json"));
  	const results: EvalResult[] = [];

  	for (const q of questions) {
  		// BM25 only
  		const bm25Results = await bm25Search(q.question, 5);
  		// Vector only
  		const embedding = await createEmbedding(q.question);
  		const vectorResults = await vectorSearch(embedding, 5);
  		// Hybrid
  		const hybridResults = await hybridSearch(q.question, embedding, { limit: 5 });

  		results.push({
  			questionId: q.id,
  			strategy: "bm25",
  			retrievedIds: bm25Results.map((r) => r.id),
  			hasExpectedKeyword: checkKeywords(bm25Results, q.expected_keywords),
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

### 任务 3.1：搭建 Nuxt/Nitro API 项目

**目标**：创建 Nuxt 项目，配置 Nitro API 路由

**文件结构**：

```plain
ai-knowledge-base/
├── nuxt.config.ts
├── server/
│   ├── api/
│   │   ├── chat.post.ts
│   │   ├── documents/
│   │   │   ├── index.get.ts
│   │   │   ├── index.post.ts
│   │   │   └── [id].delete.ts
│   │   └── search.post.ts
│   └── utils/
│       ├── db.ts
│       └── rag.ts
├── src/
│   └── components/
│       ├── ChatMessage.vue
│       ├── ChatInput.vue
│       └── DocumentList.vue
```

**步骤**：

- [ ] **Step 1: 初始化 Nuxt 项目**

  ```bash
  npx nuxi@latest init ai-knowledge-base
  cd ai-knowledge-base
  pnpm add @ai-sdk/vue @ai-sdk/openai drizzle-orm postgres zod
  ```

- [ ] **Step 2: 配置 Nuxt**

  ```typescript
  // nuxt.config.ts
  export default defineNuxtConfig({
  	modules: [],
  	runtimeConfig: {
  		openaiApiKey: process.env.OPENAI_API_KEY,
  		neonConnectionString: process.env.DATABASE_URL,
  	},
  	nitro: {
  		experimental: {
  			asyncContext: true,
  		},
  	},
  });
  ```

- [ ] **Step 3: 实现文档上传 API**

  ```typescript
  // server/api/documents/index.post.ts
  import { z } from "zod";

  const uploadSchema = z.object({
  	title: z.string().min(1),
  	content: z.string().min(1),
  });

  export default defineEventHandler(async (event) => {
  	const body = await readBody(event);
  	const { title, content } = uploadSchema.parse(body);

  	// 1. 存储文档
  	const docId = await storeDocument(title, content);

  	// 2. Chunk 切分
  	const chunks = chunkBySize(content, { chunkSize: 500, overlap: 50 });

  	// 3. 生成 Embedding 并存储
  	await Promise.all(chunks.map((chunk, i) => storeChunk(docId, chunk, i)));

  	return { id: docId, chunkCount: chunks.length };
  });
  ```

- [ ] **Step 4: 实现流式问答 API**

  ```typescript
  // server/api/chat.post.ts
  import { z } from "zod";
  import { streamText } from "ai";
  import { openai } from "@ai-sdk/openai";

  const chatSchema = z.object({
  	message: z.string().min(1),
  	conversationId: z.string().optional(),
  });

  export default defineEventHandler(async (event) => {
  	const { message, conversationId } = chatSchema.parse(await readBody(event));

  	// 1. 检索相关上下文
  	const context = await hybridSearch(message, { limit: 5 });

  	// 2. 流式生成回答
  	const result = streamText({
  		model: openai("gpt-4o"),
  		system: `你是知识库问答助手。根据以下参考资料回答问题。
  如果资料不足，说明「根据现有资料无法回答」。
  
  参考资料：
  ${context.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n")}`,
  		prompt: message,
  	});

  	return result.toDataStreamResponse();
  });
  ```

---

### 任务 3.2：实现前端 Chat UI

**目标**：使用 Element Plus X 构建 AI 对话组件

**文件**：`src/components/ChatMessage.vue`, `src/components/ChatInput.vue`

**步骤**：

- [ ] **Step 1: 安装 Element Plus X**

  ```bash
  pnpm add element-plus-x @element-plus/icons-vue
  ```

- [ ] **Step 2: 创建消息气泡组件**

  ```vue
  <!-- src/components/ChatMessage.vue -->
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
  }

  defineProps<{
  	role: "user" | "assistant";
  	content: string;
  	sources?: Source[];
  	streaming?: boolean;
  }>();
  </script>
  ```

- [ ] **Step 3: 创建输入区域组件**

  ```vue
  <!-- src/components/ChatInput.vue -->
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

- [ ] **Step 4: 实现流式 Markdown 渲染**

  ```vue
  <!-- src/components/MarkdownRenderer.vue -->
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

**目标**：实现回答中的来源标注和来源卡片展示

**文件**：`src/composables/useChat.ts`

**步骤**：

- [ ] **Step 1: 修改 Chat API 返回来源**

  ```typescript
  // server/api/chat.post.ts

  // 修改返回结构，携带来源信息
  return result.toDataStreamResponse({
  	data: {
  		sources: context.map((c) => ({
  			id: c.id,
  			content: c.content.slice(0, 200), // 截取前200字符
  			score: c.score,
  		})),
  	},
  });
  ```

- [ ] **Step 2: 前端解析来源数据**

  ```typescript
  // src/composables/useChat.ts
  import { useChat } from "@ai-sdk/vue";

  interface Source {
  	id: string;
  	content: string;
  	score: number;
  }

  export function useKnowledgeChat() {
  	const { messages, sendMessage, stop, isLoading } = useChat({
  		api: "/api/chat",
  	});

  	const sources = ref<Map<number, Source[]>>(new Map());

  	// 解析流式响应中的来源
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
  		sendMessage,
  		stop,
  		isLoading,
  	};
  }
  ```

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

  基于 RAG 技术栈的企业知识库问答系统。

  ## 核心功能

  - 📄 文档上传与管理
  - 🔍 Hybrid Search 混合检索
  - 💬 流式问答与来源溯源
  - ⚡ 实时响应与交互

  ## 技术栈

  - Frontend: Vue3 + Element Plus X
  - Backend: Nuxt/Nitro
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
  - [ ] BM25 检索实现
  - [ ] 向量检索实现
  - [ ] RRF 融合
  - [ ] 评估集运行

- [ ] **M3：完整问答系统** (第 3 周)
  - [ ] Nuxt API 开发
  - [ ] 前端 Chat UI
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
