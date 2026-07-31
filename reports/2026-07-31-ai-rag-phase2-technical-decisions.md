# 2026-07-31 二期 RAG 技术选型与落地链路答疑报告

> 范围：本报告只讨论 `SmallAliceWeb` 二期动态 RAG 知识库。知识源是开发和生产环境可读取的 `docs/docx/**/*.md`，服务端是独立 Nitro，最终数据层候选是 Neon + pgvector。

## 一、结论先行

1. Chroma 适合作为本地、一次性的概念验证工具，不应作为本项目动态知识库的正式数据层；正式项目选择 Neon PostgreSQL + pgvector。
2. TypeScript Agent/RAG 的 Vitest 已有成熟做法：纯函数单元测试、依赖注入的服务测试、Nitro 接口测试、真实 Postgres 集成测试分层执行。不能用真实 embedding/LLM 调用代替日常测试。
3. BM25 是词法检索排序算法，擅长 API 名、报错、插件名和精确术语；它不是 PostgreSQL `tsvector/ts_rank_cd` 的同义词。二期应先称“词法全文检索”，再用固定评估集决定是否引入真正的 BM25 引擎。
4. Vercel 已为本仓库安装 `neon-smallalice-ai-rag`，但 Neon 云数据库链路尚未验证完成：尚无 `packages/ai-rag-api`、安全拉取的环境变量、pgvector migration 或连接验证记录。后续统一使用 `neon` CLI，安装和认证由用户完成后再执行资源核对。

## 二、Chroma 选择与替代方案

### 2.1 Chroma 的实际定位

Chroma 是开源向量数据库，提供 collection、document、metadata、embedding 与 similarity query 等 RAG 基础概念。它有 TypeScript 客户端，适合把“Markdown 切分 -> embedding -> metadata -> 向量查询”这一最小链路单独跑通。

它不是本项目正式环境的首选，原因不是 Chroma 不成熟，而是它会额外引入一个独立存储服务。二期知识源会持续变化，动态同步还需要同步记录、删除保护、会话、权限和来源元数据；这些都天然适合与关系数据一起放进 PostgreSQL 的事务边界内。

### 2.2 各方案的取舍

|        方案         |                 适合的场景                 | 本项目是否采用为正式数据层 |           不作为当前首选的原因           |
| :-----------------: | :----------------------------------------: | :------------------------: | :--------------------------------------: |
|       Chroma        |  本地学习、脚本实验、验证切分和 metadata   |             否             |    额外服务，与同步记录和业务数据分离    |
|   Neon + pgvector   |  Vercel + 独立 Nitro + Drizzle 的动态 RAG  |             是             |             无；这是二期主线             |
|       Qdrant        | 高并发向量检索、复杂过滤、专业 hybrid 能力 |          暂不采用          |      现阶段会增加一套服务和运维边界      |
|      Weaviate       |       需要丰富搜索能力和独立检索平台       |          暂不采用          |         对当前规模和学习目标偏重         |
|      Pinecone       |        接受托管成本、只关注向量服务        |          暂不采用          | 数据与事务模型分离，供应商成本和绑定更高 |
| PostgreSQL 全文检索 |          关键词基线、精确术语召回          |     作为混合检索的一路     |  它不是 BM25，中文分词效果必须单独验证   |

### 2.3 Chroma 是否主流

Chroma 在教程、原型和开源 RAG 示例中很常见，属于主流入门选项；但“主流”不等于“每个生产项目都应选”。生产选型取决于已有数据系统、部署环境、事务要求、过滤能力、成本和团队维护边界。

对本项目，正确结论是：保留 Chroma 作为可选学习实验，不让它成为二期运行时依赖。正式同步、检索元数据和 embedding 使用 Neon + pgvector；这样动态 `docs/docx` 同步可以在单一数据系统内完成。

参考：<https://docs.trychroma.com/docs/overview/getting-started>、<https://github.com/chroma-core/chroma>、<https://neon.com/docs/ai/langchain>。

## 三、TypeScript Agent 项目的 Vitest 方案

### 3.1 推荐的测试分层

二期应在未来的 `packages/ai-rag-api/tests/` 内采用 `*.test.ts`，统一使用 `describe` 与 `test`。该目录与 Nitro v3 的 `server/` 并列，避免沿用已废弃的 `src/` 服务目录。测试对象按风险拆分，避免把网络、数据库和模型调用都塞进一个慢且不稳定的测试。

```typescript
import { describe, expect, test, vi } from "vitest";

describe("syncKnowledgeBase", () => {
	test("扫描不完整时不删除旧文档", async () => {
		const embedder = { embed: vi.fn() };
		const result = await syncKnowledgeBase({ source, repository, embedder });

		expect(result.deletedFileCount).toBe(0);
	});
});
```

|     测试层     |                   覆盖对象                   |                    是否访问外部服务                    |                         二期关键断言                         |
| :------------: | :------------------------------------------: | :----------------------------------------------------: | :----------------------------------------------------------: |
|    单元测试    | Markdown AST 切分、标题锚点、路径规范化、RRF |                           否                           | `sourcePath`、`headingPath`、`chunkIndex` 和重复标题定位正确 |
|    服务测试    |         动态同步、哈希比较、删除保护         |       否，使用 fake repository 与 fake embedder        |          未变文件不重复 embedding；失败时旧版本保留          |
|    接口测试    |     Nitro 的 chat、sync、sync-runs 路由      |                 否，mock service 边界                  |               zod 校验、鉴权、SSE 协议和错误码               |
| 数据库集成测试 |  Drizzle migration、pgvector SQL、词法检索   | 是，本地 Docker Postgres + pgvector 或隔离 Neon branch |            迁移可执行、向量维度匹配、事务替换正确            |
|   端到端验收   |             固定问题集的检索质量             |                受控，可用测试 embedding                |         Recall@5、MRR、来源定位；不默认调用付费模型          |

### 3.2 GitHub 参考是否合适

已在 2026-07-31 校验下列仓库主分支可访问：

|                                参考                                |                                                  已核验证据                                                  |                  可借鉴的内容                  |                不应照搬的部分                |
| :----------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------: | :--------------------------------------------: | :------------------------------------------: |
|           [Vitest](https://github.com/vitest-dev/vitest)           |                                         主分支提交 `ec367cf` 可访问                                          | `describe`、`test`、mock、coverage 的官方语义  |   不需要复制 Vitest 自身的 monorepo 工具链   |
|           [Vercel AI SDK](https://github.com/vercel/ai)            | 主分支提交 `586f8c9`；根 `package.json` 声明 Vitest `4.1.6`，源码含 `packages/ai/src/embed/embed.test.ts` 等 |   AI SDK 的 stream、embed、tool 相关测试拆分   |  不把其 React/Next 示例当成 Vue/Nitro 架构   |
|               [Nitro](https://github.com/unjs/nitro)               |         主分支提交 `77b77ff`；根开发依赖声明 Vitest `^4.1.10`，包含 `test/presets/nitro-dev.test.ts`         | 独立 Nitro 运行时和 preset 的接口/集成测试思路 |          不直接复制其框架级测试矩阵          |
| [AI SDK RAG Starter](https://github.com/vercel/ai-sdk-rag-starter) |                          主分支提交 `3db9aeb` 可访问；当前树未发现 Vitest/test 文件                          |    RAG 应用分层、Drizzle 与 Postgres 的组合    | 它不是 Vitest 测试教程，不能拿来决定测试结构 |

因此，现成方案不是一个“Agent 专用 Vitest 框架”，而是 Vitest + 明确依赖边界。`SourceScanner`、`Embedder`、`ChunkRepository`、`Retriever` 和 `ChatModel` 必须可替换；日常测试替换它们，只有集成测试才连数据库。

参考：<https://vitest.dev/guide/>、<https://github.com/vercel/ai>、<https://github.com/unjs/nitro>。

## 四、BM25 是什么，以及二期怎样使用

### 4.1 用直觉理解

BM25 是“按关键词找资料并排序”的算法。它认为一段文档与问题越相关，通常满足三件事：

1. 问题中的词确实出现在这段文档中。
2. 这个词在整套知识库中越少见，区分度越高。
3. 文档很长时，不能只因为它塞了更多词就获得不公平的高分；同一词重复很多次也会逐渐饱和。

常见公式如下，理解含义即可，不需要手算：

```text
score(D, Q) = sum(IDF(q) * f(q, D) * (k1 + 1) /
  (f(q, D) + k1 * (1 - b + b * |D| / avgdl)))
```

`IDF` 表示罕见词更重要，`f(q, D)` 表示词在当前文档出现次数，`|D| / avgdl` 用于文档长度归一化，`k1` 和 `b` 是可调参数。

### 4.2 它和向量检索的关系

|                  查询类型                   | BM25 / 词法检索 |     向量检索     |         推荐         |
| :-----------------------------------------: | :-------------: | :--------------: | :------------------: |
| `Drill_CoreOfInput`、错误码、插件名、API 名 |       强        | 可能漏精确字符串 | 词法优先，再融合向量 |
|         “怎样让回答能跳到原文标题”          |  词面不同会漏   |        强        | 向量优先，再融合词法 |
|       用户带术语又用自然语言描述问题        |    各有盲区     |     各有盲区     |     Hybrid + RRF     |

必须纠正一个术语：PostgreSQL 的 `tsvector`、`tsquery` 与 `ts_rank_cd` 是词法全文检索能力，不自动等于 BM25。中文 Markdown 的分词、停用词和插件命名需要拿二期固定评估集验证；若 PostgreSQL 基线不足，再评估专业 BM25 引擎或检索服务。二期的最小目标是“词法全文检索 + pgvector + RRF”，而不是先宣称已经实现 BM25。

参考：<https://en.wikipedia.org/wiki/Okapi_BM25>、<https://www.elastic.co/what-is/hybrid-search>、<https://qdrant.tech/documentation/concepts/hybrid-queries/>。

## 五、Neon 云数据库与本地 PostgreSQL 链路

### 5.1 先纠正名称

“Neon 本地 Postgres”不是一个准确说法。Neon 是云端、serverless PostgreSQL；本地开发应使用 Docker 运行 PostgreSQL + pgvector，或使用隔离的 Neon development branch。两者共享 Drizzle schema 和 migration，但不是同一个数据库实例。

### 5.2 当前准备状态

|       检查项        |                            当前证据                             |                        结论                         |
| :-----------------: | :-------------------------------------------------------------: | :-------------------------------------------------: |
|  Vercel-Neon 集成   | 用户已确认仓库关联的 Vercel 项目安装了 `neon-smallalice-ai-rag` |             已有云端资源；不得重复创建              |
|      Neon CLI       |             用户将安装并完成官方 `neon` CLI 的认证              |        用户确认认证完成后，才可执行资源核对         |
|   Neon 项目与认证   |          `neon-smallalice-ai-rag` 已由 Vercel 集成提供          | 使用 `neon projects list --output json` 核对真实 ID |
|     RAG API 包      |                  `packages/ai-rag-api` 不存在                   |                    尚未开始实现                     |
|  本地环境变量文件   |                      根目录未发现 `.env*`                       |            未配置可验证的 `DATABASE_URL`            |
| 云端迁移与 pgvector |           未发现 migration、数据库 URL 或扩展验证记录           |                     未准备完成                      |

结论：`neon-smallalice-ai-rag` 已作为 Vercel 集成资源存在，但本轮尚未拉取敏感环境变量、执行 migration 或验证 pgvector。因此不能声称“应用已连通数据库”或“pgvector 已启用”；下一步不是创建新库，而是先从 Vercel 安全拉取环境变量，再验证既有资源。

### 5.3 应执行的落地顺序

1. 不创建新 Neon project/database。先在 API 包目录执行 `vercel env pull .env.local --environment=development`，确认文件受 Git 忽略保护且不打印值。
2. 等待用户完成官方 `neon` CLI 的安装与认证。完成后执行 `neon projects list --output json`、`neon branches list --project-id <id>`、`neon databases list --project-id <id> --branch-id <id>`，将 `neon-smallalice-ai-rag` 关联到真实 project、branch、database、role ID。代理不执行安装、认证或凭据读取。
3. 识别 pooled 与 non-pooled URL。Nitro 运行时使用 pooled URL；Drizzle migration 使用非 pooled URL。若 Vercel 环境变量中没有 non-pooled URL，先修复集成配置，不能继续迁移。
4. 在首个 Drizzle migration 中先执行 `CREATE EXTENSION IF NOT EXISTS vector;`，再创建 `documents`、`chunks`、`knowledge_sync_runs`。`chunks.embedding` 使用与首期 embedding 模型一致的 `vector(1536)`。
5. 创建 `chunks_embedding_hnsw_cosine_idx`：`USING hnsw (embedding vector_cosine_ops)`，并用 `<=>` 做余弦距离查询。HNSW 为近似检索，固定评估集必须比较精确检索和索引检索的 Recall@5 与查询延迟。
6. 通过非 pooled URL 执行 migration；随后使用 `neon psql <branch> --database-name <database> -- -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"` 验证扩展，仅保留无敏感信息的结果。
7. 本地使用 Docker pgvector 跑同一 migration 和集成测试；上线前在隔离 Neon branch 完成一次同步、检索和回滚验证。通过后才让生产 Nitro 执行 `docs/docx` 增量同步，并记录首次 `knowledge_sync_runs` 成功结果。

参考：<https://neon.com/docs/get-started-with-neon/signing-up>、<https://neon.com/docs/extensions/pgvector>、<https://orm.drizzle.team/docs/connect-neon>。

## 六、对二期计划的直接影响

1. Chroma 从“第一个正式 RAG 闭环的必选依赖”降为“可选本地学习实验”；正式同步、向量和 metadata 只落 Neon + pgvector。
2. 先实现动态知识源同步及其 Vitest 测试，再接 Chat API。没有同步正确性，回答再流畅也会基于过期知识库。
3. 检索第一版名称保持“词法全文检索 + 向量检索 + RRF”；是否新增真正 BM25 由固定评估集的 Recall@5、MRR 和来源定位正确率决定。
4. Neon 既有资源的核对是实施前置检查点：从 Vercel 取得连接变量、用户确认 `neon` CLI 已认证，并获得 pgvector 扩展和 migration 成功证据后，才开始真实入库。
