## 1. 试点批次：长任务状态与标题型回归基线

- [ ] 1.1 [新增] `openspec/changes/ai-rag-phase3/agent-progress.md` - 建立不超过 40 行的覆盖式 checkpoint 快照，记录当前 task、最近验证、阻塞点、下一步和最多 3 个证据索引。
- [ ] 1.2 [新增] `openspec/changes/ai-rag-phase3/agent-findings.md` - 建立去重后的持久发现索引，初始记录标题已切块但未进入检索文本、线上目标来源 Top-50 缺失、corpus 新鲜度待验证三项 active 发现。
- [ ] 1.3 [新增] `packages/ai-rag-api/data/rag-gold-set.jsonl` - 建立版本化 gold-set 初版，先录入“`小爱丽丝是谁啊？`”，固定目标 `sourcePath`、包含“小爱丽丝”的 `headingPath`、相关 chunk/grade、hard negatives、reference answer 与 expected citations。
- [ ] 1.4 [新增] `packages/ai-rag-api/server/evaluation/gold-set.ts` - 解析并校验 gold-set JSONL，拒绝重复 ID、空 gold、非法 grade、缺少题集 split/version 或不可回答题与 gold 冲突。
- [ ] 1.5 [新增] `packages/ai-rag-api/tests/gold-set.test.ts` - 使用 Vitest `describe/test` 覆盖有效标题题、重复 ID、无 gold、stale contentHash、unanswerable 和 hard negative 契约。
- [ ] 1.6 [新增] `packages/ai-rag-api/server/evaluation/corpus-preflight.ts` - 在严格评测前读取目标 source/chunk/profile/model/embedding 状态，输出 ready、corpus-missing、corpus-stale、embedding-missing，失败题不得进入检索指标。
- [ ] 1.7 [新增] `packages/ai-rag-api/tests/corpus-preflight.test.ts` - 覆盖目标文档存在、缺失、chunk 为 0、embedding 缺失、profile/model 不匹配与同步状态不可读场景。
- [ ] 1.8 [生成] `openspec/changes/ai-rag-phase3/evidence/2026-08-31-title-query-baseline.json` - 保存当前线上“`小爱丽丝是谁啊？`”Top-10/Top-50、目标来源缺失和本地 75/26 chunk smoke 基线，明确这只是修复前证据。

## 2. 试点批次：确定性指标与 Promptfoo 评测入口

- [ ] 2.1 [新增] `packages/ai-rag-api/server/evaluation/retrieval-metrics.ts` - 实现 Recall@K、Precision@K、MRR@K、graded nDCG@K、候选/最终结果分离和去重规则，不依赖 LLM judge。
- [ ] 2.2 [新增] `packages/ai-rag-api/tests/retrieval-metrics.test.ts` - 覆盖完全命中、部分命中、无命中、重复 ID、K 大于结果数、graded relevance 和标题型 gold 示例。
- [ ] 2.3 [修改] `packages/ai-rag-api/server/evaluation/evaluator.ts` - 保留关键词覆盖 smoke，同时输出 candidate IDs、final IDs、gold 指标、corpus preflight、配置版本和被隔离题目原因。
- [ ] 2.4 [修改] `packages/ai-rag-api/tests/evaluator.test.ts` - 验证关键词覆盖率不会被冒充 Recall，corpus-missing/stale 不进入汇总，标题型题按 source/heading/chunk 判断相关。
- [ ] 2.5 [修改] `packages/ai-rag-api/package.json` - 锁定与 Node 22/Nitro 兼容的 Promptfoo dev-only 版本和评测脚本，不把 Promptfoo 加入线上 runtime dependencies。
- [ ] 2.6 [新增] `packages/ai-rag-api/promptfoo.yaml` - 配置 lexical/vector/hybrid、Noop/LLM reranker 与 chunk profile 对照，固定题集版本、candidateLimit、finalLimit、RRF k 和 JSON 输出路径。
- [ ] 2.7 [新增] `packages/ai-rag-api/scripts/run-rag-evaluation.ts` - 串联 gold-set、corpus preflight、确定性指标、可选答案评估和 Promptfoo adapter，输出可复现 JSON/HTML 元数据。
- [ ] 2.8 [新增] `packages/ai-rag-api/tests/run-rag-evaluation.test.ts` - 覆盖 dry/local provider、外部 provider skipped/failed、敏感字段脱敏、输出版本和 exit code。

## 3. 主体任务：标题上下文、overlap 与父子 chunk

- [ ] 3.1 [新增] `packages/ai-rag-core/src/embedding-text.ts` - 按 `sourcePath + headingPath + content` 生成确定性检索/embedding 文本，排除图片 URL，并保持原始 content 单独展示。
- [ ] 3.2 [新增] `packages/ai-rag-core/tests/embedding-text.test.ts` - 覆盖有/无标题、中文标题、多级标题、图片 URL、表格和“`小爱丽丝`”标题上下文。
- [ ] 3.3 [修改] `packages/ai-rag-core/src/markdown-chunk.ts` - 实现普通 prose 跨块句子边界 overlap、稳定 parentId、FAQ 问答单元、fenced code 原子块，并保留现有表格与锚点合同。
- [ ] 3.4 [修改] `packages/ai-rag-core/tests/markdown-chunk.test.ts` - 增加 target/overlap 变体、父子关系、FAQ、代码块、标题路径、chunkIndex 连续、图片 URL 排除和目标文档 75/26 基线迁移测试。
- [ ] 3.5 [修改] `packages/ai-rag-core/src/index.ts` - 导出新增 chunk/profile/embedding text 合同，保持现有公开导出可用。
- [ ] 3.6 [新增] `packages/ai-rag-api/drizzle/0003_ai_rag_phase3_chunk_profile.sql` - 增加 parent/profile/preprocessing/search text 所需字段与可回滚索引步骤，不删除旧 chunk/embedding 数据。
- [ ] 3.7 [修改] `packages/ai-rag-api/server/db/schema.ts` - 同步 phase3 chunk/document 字段、索引与 1024 维 vector 合同。
- [ ] 3.8 [修改] `packages/ai-rag-api/server/services/knowledge-sync.ts` - 使用标题上下文 embedding 文本，持久化 parent/profile/preprocessing 身份，变化时重建、失败时保留旧文档。
- [ ] 3.9 [修改] `packages/ai-rag-api/tests/sync-service.test.ts` - 覆盖标题进入 embedding、profile 变化触发重建、parentId 写入、旧版本回退和图片 URL 不进入模型输入。

## 4. 主体任务：pg_trgm、候选池与 RRF

- [ ] 4.1 [新增] `packages/ai-rag-api/drizzle/0004_add_pg_trgm_search.sql` - 启用 Neon 支持的 `pg_trgm`，为标题上下文与正文组成的搜索文本创建 GIN/GiST 方案及回滚说明，不引入 PGroonga/OpenSearch。
- [ ] 4.2 [修改] `packages/ai-rag-api/server/search/postgres-search.ts` - 保留 PostgreSQL FTS，新增 pg_trgm lexical provider，搜索标题路径与正文并返回真实策略名/分数，不标注 BM25。
- [ ] 4.3 [修改] `packages/ai-rag-api/tests/postgres-search.test.ts` - 覆盖参数绑定、中文子串、标题命中、同名 hard negative、非法 limit、vector 维度和策略标注。
- [ ] 4.4 [修改] `packages/ai-rag-api/server/search/hybrid-search.ts` - 将 candidateLimit 与 finalLimit 分离，lexical/vector 各取候选后 RRF、按 chunk/parent 去重，再交给 reranker。
- [ ] 4.5 [修改] `packages/ai-rag-api/tests/hybrid-search.test.ts` - 覆盖 candidateLimit=20/finalLimit=5、RRF k=60、重复 chunk、parent 重复、provider 失败和标题型查询候选。
- [ ] 4.6 [修改] `packages/ai-rag-api/server/contracts/schemas.ts` - 为 search 请求提供兼容的 candidate/final limit 契约与边界校验，旧 `limit` 调用维持稳定映射。
- [ ] 4.7 [修改] `packages/ai-rag-api/tests/contracts.test.ts` - 覆盖旧 limit 兼容、candidate/final limit 上限、非法组合和 search DTO 来源字段。

## 5. 主体任务：Noop 与通用 LLM Reranker

- [ ] 5.1 [新增] `packages/ai-rag-api/server/reranker/types.ts` - 定义 RerankerProvider、applied/skipped/failed 状态、候选 ID 子集约束、模型版本、延迟、token 与失败原因。
- [ ] 5.2 [新增] `packages/ai-rag-api/server/reranker/noop-reranker.ts` - 原样返回 RRF 排名并明确标记 noop/skipped，作为默认线上和 Promptfoo 基线。
- [ ] 5.3 [新增] `packages/ai-rag-api/server/reranker/llm-reranker.ts` - 通过注入式通用 LLM 客户端请求严格 JSON 排名，限制候选数/文本/token/超时/重试/缓存，非法输出回退 Noop。
- [ ] 5.4 [新增] `packages/ai-rag-api/tests/reranker.test.ts` - 覆盖不制造 chunk、Noop 顺序、LLM 成功、预算跳过、超时、解析失败、未知 ID、缓存和回退证据。
- [ ] 5.5 [修改] `packages/ai-rag-api/server/runtime/rag-assembly.ts` - 将 reranker 注入检索 pipeline，默认 disabled/noop，真实 LLM provider 仅在显式配置和预算齐全时启用。
- [ ] 5.6 [修改] `packages/ai-rag-api/src/runtime-config.ts` - 增加服务端 reranker mode、candidate/token/time/cost 预算配置，默认值不得改变现有生产排序。
- [ ] 5.7 [修改] `packages/ai-rag-api/tests/runtime-assembly.test.ts` - 验证默认 Noop、不完整配置不启用 LLM、失败回退 RRF、状态与敏感信息不泄漏。

## 6. 验收、Neon 同步与生产回归

- [ ] 6.1 [验证] `openspec/changes/ai-rag-phase3/evidence/2026-08-31-local-verification.log` - 运行 ai-rag-core/api 相关 Vitest、typecheck 与构建，记录命令、exit code 和失败数；未通过不得推进 Neon。
- [ ] 6.2 [生成] `openspec/changes/ai-rag-phase3/evidence/2026-08-31-chunk-ab-evaluation.json` - 在隔离/临时表比较 400/80、500/50、800/100，输出 Recall/Precision/MRR/nDCG、重复率、chunk/token 与 P95 延迟。
- [ ] 6.3 [生成] `openspec/changes/ai-rag-phase3/evidence/2026-08-31-title-corpus-preflight.json` - 只读核对 Neon 目标 sourcePath 的 document/chunk 数、headingPath、profile/preprocessing/model、embedding 与同步状态；缺失时标记 blocked，不归因排序。
- [ ] 6.4 [验证] `openspec/changes/ai-rag-phase3/evidence/2026-08-31-retrieval-comparison.json` - 固定同一 gold-set 比较 PostgreSQL FTS、pg_trgm、vector、RRF 和 Noop，确保目标章节进入 Top-10 且 hard negatives 不算通过。
- [ ] 6.5 [验证] `openspec/changes/ai-rag-phase3/evidence/2026-08-31-llm-reranker-pilot.json` - 离线比较 Noop 与通用 LLM reranker 的指标、token、成本、P95、失败率与回退；收益不足或超预算则保持 disabled。
- [ ] 6.6 [执行] `openspec/changes/ai-rag-phase3/evidence/2026-08-31-neon-sync.json` - 仅在用户明确授权且 preflight/迁移审查通过后，用 non-pooled `NITRO_SYNC_DATABASE_URL` 完成正式同步并记录完整文档/chunk 数、失败文件和 profile/model 版本。
- [ ] 6.7 [验证] `openspec/changes/ai-rag-phase3/evidence/2026-08-31-production-title-query.json` - 同步完成后请求生产 `/v1/search` 与 `/v1/chat`，验证“`小爱丽丝是谁啊？`”Top-10/来源帧指向目标页面和“小爱丽丝”章节；HTTP 200 本身不得作为通过。
- [ ] 6.8 [验证] `openspec/changes/ai-rag-phase3/tasks.md` - 对照 specs/design 逐项审计，不提前勾选无命令/输出证据的任务，发现遗漏先补任务再继续。
- [ ] 6.9 [验证] `openspec/changes/ai-rag-phase3` - 运行 `openspec validate ai-rag-phase3 --strict`，修复全部 ERROR 后才认定规划/实施工件一致。

## 7. Phase4 未来设计任务（不属于本 change 执行范围）

以下内容仅作为后续 `ai-sdk-phase4` 独立 change 的设计输入，不创建本期可勾选任务，也不阻塞 phase3：

- 评估 v4 → v5 → 更高版本的迁移路径，禁止直接升级到 latest。
- 迁移服务端 `streamText`、双 provider adapter、`StreamData`/来源帧和错误/abort 合同。
- 迁移 Vue 端 `useChat`、transport、`UIMessage/ModelMessage`、消息持久化与来源绑定。
- 对比 data-stream 与 UI Message Stream，建立新旧协议兼容/回滚方案。
- 使用同一组流式、来源帧、停止、错误、Vercel 长流和生产回归证据决定是否切换默认协议。
