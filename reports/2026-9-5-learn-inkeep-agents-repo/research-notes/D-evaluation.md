# 2026-09-25 探索笔记 D：评估体系现状

> 调研范围：`packages/ai-rag-api` 的可评估性（evaluation）现状。只读调研，证据均为 file:line 实引。

## 一、文件与职责清单

| 路径                                                         |         行数          | 职责                                                                                                                                                                                                                                                                                                                                                                                                   |
| :----------------------------------------------------------- | :-------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ai-rag-api/server/evaluation/corpus-preflight.ts`  |          208          | 语料对齐预检：`preflightCorpus()`（corpus-preflight.ts:55）依据语料快照判定 `ready / corpus-missing / corpus-stale / embedding-missing` 四态，产出 `eligibleForMetrics` 门槛，把数据状态失败隔离在检索指标之外                                                                                                                                                                                         |
| `packages/ai-rag-api/server/evaluation/evaluator.ts`         |          324          | 评测核心：`parseEvalQuestions()`（evaluator.ts:70）校验题集合同（去重、非空关键词）；`runRetrievalEvaluation()`（evaluator.ts:98）对每题并行跑 lexical/vector/hybrid 三策略，复用同一 provider 响应缓存（evaluator.ts:154-159），输出 `EvalReport`（schemaVersion 1）；关键词覆盖率 + gold 指标 + `isolationReason` 三层结果                                                                           |
| `packages/ai-rag-api/server/evaluation/gold-set.ts`          |          297          | 版本化 JSONL gold-set 解析：`parseGoldSetJsonl()`（gold-set.ts:40）强制校验 chunkId 与 `sourcePath#chunkIndex` 一致（gold-set.ts:226-227）、grade ∈ 1-3（gold-set.ts:193-194）、hard negative 不与 gold 重叠（gold-set.ts:139-145）、`corpusSnapshot.contentHash` 为 64 位 SHA-256 且可选比对当前语料防 stale（gold-set.ts:151-167）、unanswerable 题不得带 gold（gold-set.ts:131-136）                |
| `packages/ai-rag-api/server/evaluation/retrieval-metrics.ts` |          142          | 纯确定性 IR 指标：`calculateRetrievalMetrics()`（retrieval-metrics.ts:43）同时算候选池与最终榜单的 Recall@K / Precision@K / MRR@K / nDCG@K（默认 K = 5, 10, 30，retrieval-metrics.ts:26），nDCG 用 `2^grade - 1` 等级增益（retrieval-metrics.ts:139），明确注释「不依赖 LLM judge」（retrieval-metrics.ts:42）                                                                                         |
| `packages/ai-rag-api/data/rag-gold-set.jsonl`                | 1 条记录（3026 字节） | 唯一一题：`version "2026-09-01"`、`split "regression"`、corpusSnapshot 含 contentHash、gold 两个 grade-3 chunk、requiredClaims、expectedCitationChunkIds（文件尾部可证）                                                                                                                                                                                                                               |
| `packages/ai-rag-api/data/eval-questions.json`               |     62 行 / 10 题     | 早期关键词 smoke 题集（q1-q10），结构仅 `id/question/expected_keywords/category`，无 gold、无版本                                                                                                                                                                                                                                                                                                      |
| `packages/ai-rag-api/promptfoo.yaml`                         |          57           | 5 个 provider 对照实验：lexical/vector/hybrid（noop reranker，500/50）+ hybrid-llm-reranker（400/80、800/100）；tests 指向 gold-set.jsonl；maxConcurrency 1；outputPath 指向 `openspec/changes/ai-rag-phase3/evidence/2026-08-31-promptfoo-results.json`。yaml 内未定义任何 LLM 断言（assert）                                                                                                         |
| `packages/ai-rag-api/scripts/run-rag-evaluation.ts`          |          264          | 统一入口 `runRagEvaluation()`（run-rag-evaluation.ts:53）：dry（不调 provider）/ local（需显式注入 providers）/ external 三模式；`toEvalQuestions()`（:128）把 gold-set 的 requiredClaims 转成 expected_keywords；CLI main（:246）读 gold-set.jsonl → 结果 JSON 打到 stdout，`--output` 可写文件；`sanitizeError()`（:237）脱敏 DB URL/token/api key                                                   |
| `packages/ai-rag-api/scripts/run-parameter-evaluation.ts`    |          171          | 参数网格实验：3 个 chunk profile（300/30/5、500/50/10、800/100/15，:12-16），在 Neon 建临时表 `rag_parameter_evaluation_chunks` + HNSW（:41-100，isolation 声明「formal documents/chunks tables are not written」，:158），逐 profile 重嵌 docs/docx 语料，跑评测并对比 HNSW 与精确扫描一致性，写证据文件 `openspec/changes/ai-rag-phase2/evidence/2026-08-27-real-parameter-evaluation.json` + 控制台 |
| `packages/ai-rag-api/scripts/run-real-evaluation.ts`         |          72           | 对正式 `chunks` 表跑 limit 5/10/15 三档评测 + HNSW/精确对比，写证据 JSON `2026-08-27-real-evaluation.json`（:68）+ 控制台，只读                                                                                                                                                                                                                                                                        |
| `packages/ai-rag-api/scripts/promptfoo-provider.ts`          |          141          | Promptfoo `file://` provider 适配器 `runPromptfooAdapter()`（:37）：未注入 provider 时返回 `skipped`（:43-44），即 dev-only，默认无网络客户端                                                                                                                                                                                                                                                          |
| `packages/ai-rag-api/server/db/schema.ts`                    |          77           | 仅 3 张表：`documents`、`chunks`、`knowledge_sync_runs`，无任何 evaluation/dataset/gold-set 表                                                                                                                                                                                                                                                                                                         |
| `openspec/specs/ai-rag/rag-evaluation/spec.md`               |          103          | 6 条 MUST/SHALL Requirement 的规格化能力契约                                                                                                                                                                                                                                                                                                                                                           |

相关单测已存在：`tests/corpus-preflight.test.ts`、`tests/evaluator.test.ts`、`tests/gold-set.test.ts`、`tests/retrieval-metrics.test.ts`、`tests/run-rag-evaluation.test.ts`（tests/ 目录实测确认）。

## 二、四问逐答

### 问 1：目前的可评估性是怎么做的？

**机制（三层）**：

1. **确定性检索指标层**：`retrieval-metrics.ts:43-56` 对候选池（candidate）和最终榜单（final）各算一套 `Recall@K / Precision@K / MRR@K / nDCG@K`（K 默认 5/10/30），gold grade 1-3 加权进 nDCG。纯计算，无 LLM。
2. **语料对齐预检层**：`corpus-preflight.ts:55-178` 在算 gold 指标前先验证目标 sourcePath/chunk/headingPath 存在、contentHash 一致、profileVersion/embeddingModel 匹配、同步状态为 succeeded；任何一项不满足 → `eligibleForMetrics: false`，evaluator 把该题标记 `isolationReason` 并把 goldMetrics 置 null（evaluator.ts:229-244），避免脏语料污染指标。
3. **关键词 smoke 层**：evaluator.ts:220-225、295-302 统计 `questionHitRate` 与 `meanExpectedKeywordCoverage`，供无 gold 的题集（eval-questions.json）做粗粒度对比。

**运行方式**：

- `pnpm rag:evaluate` → `tsx scripts/run-rag-evaluation.ts`（package.json:18），dry/local/external 三模式（run-rag-evaluation.ts:15）。
- `pnpm rag:evaluate:promptfoo` → `promptfoo eval -c promptfoo.yaml`（package.json:19），5 种检索配置对照实验。
- 参数网格脚本直接 `tsx` 运行，在 Neon 临时表内自建语料副本（run-parameter-evaluation.ts:41-100）。

**产出物**：全部是**文件 + 控制台**，不入库——

- `runRagEvaluation` 结果 JSON → stdout，可选 `--output` 落盘（run-rag-evaluation.ts:228-234, 259）。
- promptfoo 结果 → `openspec/changes/ai-rag-phase3/evidence/2026-08-31-promptfoo-results.json`（promptfoo.yaml:57）。
- 参数实验 → `openspec/changes/ai-rag-phase2/evidence/2026-08-27-*.json`（run-parameter-evaluation.ts:160-166；run-real-evaluation.ts:68-71）。
- 报告自带 `configVersion`（默认 `"ai-rag-phase3"`，run-rag-evaluation.ts:49）与 `schemaVersion: 1`，可审计但**无持久化运行历史**。

### 问 2：是否引入了其他 RAG 评估框架？promptfoo 是什么角色？

- 引入的框架只有一个：**promptfoo**，作为 **devDependency**（`"promptfoo": "0.122.2"`，package.json:40），不在 dependencies。
- 它的角色是**批量对照实验 runner**，不是评估器本体：yaml 里 5 个 provider 全部指向同一个自研适配器 `file://scripts/promptfoo-provider.ts`（promptfoo.yaml:6-51），比较的是 chunk profile × 检索模式 × reranker 的组合；yaml 未定义任何 LLM 断言，指标计算仍靠自己的 `retrieval-metrics.ts`。
- `promptfoo-provider.ts:56` 注释明确「Promptfoo file provider 默认不创建网络客户端，生产运行需由命令行注入 provider」；spec 也固化了「Promptfoo 运行不得成为线上 /v1/chat 或 /v1/search 的运行时依赖」（spec.md:59, 67-71）。
- 评估核心（指标、预检、题集解析）全是**自研代码**，promptfoo 只负责编排与结果落盘。

### 问 3：适合增加 OpenTelemetry 吗？

- **现状：完全没有**。`grep -rni "opentelemetry|@opentelemetry|otel|trace"` 对 `packages/ai-rag-api/package.json` 与 `server/` 全目录返回 **0 条匹配**；依赖里也没有任何 otel 包（package.json:26-43）。
- 评估侧有天然的打点边界：每次评测运行已有结构化结果对象（`RagEvaluationRunResult`，run-rag-evaluation.ts:32-47），`sanitizeError` 已处理敏感信息（run-rag-evaluation.ts:237-244），对 OTel span 注入友好。
- 结论（供主代理判断）：现状是零追踪，若加 otel 属于从 0 引入；README 增强 7（README.md:366-374）评估的实施成本为「低」，且评估/检索/LLM 调用路径清晰（hybrid-search、cloudflare-embedding、chat provider），适合作为独立增量。但评估链路本身是离线脚本 + 已有 JSON 审计输出，OTel 的最大价值在**线上 chat/search 运行时**而非评估脚本。

### 问 4：评估测试集要不要入 Neon 库？现有表？接口怎么加？

**证据链**：

- `server/db/schema.ts` 仅 3 张表：`documents`（schema.ts:12）、`chunks`（:28）、`knowledge_sync_runs`（:62），**没有任何 evaluation/dataset/gold-set 表**；对 schema.ts 与 `drizzle/` 下 5 个迁移 SQL（0000-0004）grep `evaluation|gold|dataset` 均 0 命中。
- gold-set 目前是**纯文件**：`data/rag-gold-set.jsonl` 仅 **1 条记录**（3026 字节），运行时由 CLI 直接 `readFile`（run-rag-evaluation.ts:254-257），spec 要求的「题集版本、语料快照、chunk profile、embedding model 与 reranker 配置 MUST 被记录」（spec.md:11）目前靠 JSONL 内的 `version/corpusSnapshot` 字段 + 报告里的 configVersion 字符串实现，**没有运行历史表**。
- HTTP 面：`server/routes/v1/` 只有 `chat.post.ts`、`search.post.ts`、`knowledge/sync.get.ts`、`knowledge/sync.post.ts`、`knowledge/sync-runs.get.ts`，**无任何 evaluation 相关接口**。
- 入库的现成参照是 `knowledge_sync_runs` 表（schema.ts:62-76）：一次运行一条记录、状态机、计数与失败清单——评估运行完全可以复刻这个形态（如 `evaluation_runs` 表存 configVersion、题集版本 hash、指标汇总 JSONB、失败/隔离题清单；gold-set 题目可选另建 `gold_set_questions` 表）。
- 注意点：spec.md:59 要求评估是 dev-only、不进生产运行时（spec.md:67-71），所以「入库」更自然的形态是评估**结果运行记录**入库（类似 sync-runs 的可查询历史），而题集文件本身保留在 git 里做版本控制，二者可分开决策。

## 三、关键发现

1. **指标体系完整但答案级评估缺失**：检索层 Recall/Precision/MRR/nDCG 已实现且候选/终榜双份（retrieval-metrics.ts:48-55），但 spec Requirement 3 要求的 faithfulness、answer relevance、citation correctness（spec.md:43）在 evaluation/ 四文件中**没有任何对应实现**，是 spec 与代码之间最明显的缺口。
2. **gold-set 规模极小且只有 1 题**：`data/rag-gold-set.jsonl` 实测 3026 字节、仅 1 条记录；`eval-questions.json` 的 10 题是无 gold 的关键词 smoke 集。规格很厚（spec 6 条 Requirement），题集很薄——「可评估的能力」强于「已被评估的覆盖面」。
3. **评估结果零持久化**：所有产出是 JSON 证据文件散落在 `openspec/changes/*/evidence/`（promptfoo.yaml:57；run-real-evaluation.ts:68）+ stdout，数据库无评估表（grep 0 命中）、HTTP 无评估接口（routes/v1 仅 5 个文件）。评估是一次性实验产物，不是可查询的一等公民。
4. **语料预检 + 隔离机制是亮点**：corpus-preflight 四态门控（corpus-preflight.ts:1-5）+ evaluator 的 `isolationReason`（evaluator.ts:239-244）保证脏语料不污染指标，这在同类自研方案中少见，spec Requirement 6 已将其固化（spec.md:89-103）。
5. **promptfoo 被严格限制为 dev-only**：devDependency（package.json:40）、provider 未注入即 skipped（promptfoo-provider.ts:43-44）、spec 明文禁止进入生产运行时（spec.md:67-71）——它是「实验编排器」而非「评估框架依赖」。
6. **无任何 OpenTelemetry 痕迹**：package.json 与 server/ 目录 grep otel/trace 全部 0 命中，README 5.1 对比表中「可观测性：无（README.md:271）」的判断在源码层面属实。
7. **评估逻辑有完整单测**：corpus-preflight、evaluator、gold-set、retrieval-metrics、run-rag-evaluation 五个测试文件存在于 `packages/ai-rag-api/tests/`，核心解析与指标计算被覆盖。

## 四、与 inkeep 的差距速记

对照 `reports/2026-9-5-learn-inkeep-agents-repo/README.md`「4.5 可观测性与评估框架」（README.md:241-247）与「增强 7：OpenTelemetry 可观测性」（README.md:366-374）：

**我们缺什么（对方有）**：

- **Dataset → Run → EvaluationResult 的持久化闭环**：inkeep 有 `Dataset / DatasetRunConfig / DatasetRun / EvaluationResult` 四件套（README.md:245），我们的等价物只有文件级 EvalReport + evidence JSON，没有运行历史实体，也没有表。README 4.5 说「SmallAliceWeb 当前缺乏质量评估机制」（README.md:247）在写入时点是对的，但如今检索层评估骨架已经补上，README 此句需要修正为「缺持久化闭环与答案级评估」。
- **OpenTelemetry 全链路**：inkeep 对 LLM 调用/工具执行/代理委派全部建 Span 并配 Traces UI（README.md:243）；我们零 otel 依赖、零 span（grep 证据见问 3）。增强 7 给出的 `@opentelemetry/api` + `sdk-node` + OTLP exporter 方案仍完全适用（README.md:370）。
- **答案级 / LLM judge 评估**：spec 已立 Requirement 3 但无实现；inkeep 支持多种 Evaluator（准确率、相关性、安全性，README.md:245）。

**我们有什么是对方没有/未覆盖的**：

- **语料对齐预检 + 失败隔离**：corpus-preflight 四态门控把「语料没同步好」从「检索变差」中剥离，inkeep 的评估闭环描述中未见等价机制。
- **候选池 vs 最终榜单双份指标**：同一候选池喂给三策略并用缓存避免重复调用（evaluator.ts:154-159），天然支持 reranker 前后对照。
- **确定性优先**：明确「不依赖 LLM judge」（retrieval-metrics.ts:42），指标可复现、零成本；对外部 provider 调用有脱敏与失败不伪造通过的纪律（run-rag-evaluation.ts:237-244；spec.md:73-88）。
