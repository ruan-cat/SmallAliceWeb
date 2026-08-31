## 1. Why

当前 AI RAG 已具备 PostgreSQL 词法检索、pgvector 向量检索与 RRF 融合，但检索质量仍受四类问题限制：中文 lexical 召回不稳定、chunk 边界缺少上下文、embedding 身份与上下文信息不足、候选结果没有可替换的重排层。现有评估器主要依赖关键词覆盖率，不能严格回答 Recall@K、Precision、MRR 或 nDCG，也无法区分“召回失败、排序失败、答案生成失败”。

本变更以当前 Neon + PostgreSQL + pgvector + Cloudflare Workers AI 架构为约束，建立可量化、可回归的 RAG 检索质量闭环。中文 lexical 优先采用 Neon 已支持的 `pg_trgm`；PGroonga 与 OpenSearch 仅保留为调研和未来独立基础设施选项，不进入本期生产实现。

## 2. What Changes

- 增强 Markdown chunk 生成：保留标题层级上下文，实现跨 chunk overlap，引入父子 chunk 关系，并保持表格、FAQ、代码块等结构的可检索完整性。
- 扩展 lexical 检索：在现有 PostgreSQL FTS 基线之外增加 `pg_trgm` 候选召回与可观测分数，不将其未经评估标注为 BM25。
- 调整 hybrid 检索：将候选池大小与最终返回数量分离，扩大 lexical/vector 候选后再执行 RRF、去重与最终截取。
- 建立可插拔 `RerankerProvider` 契约：phase3 默认使用明确标记的 `NoopReranker`，不改变现有排序；预留通用 LLM 重排实现，必须受候选数、token、超时、缓存、回退和成本门禁约束，不强制购买外部 reranker 服务。
- 固化 embedding 身份：继续使用 Cloudflare Workers AI 的 `@cf/baai/bge-m3` 作为生产基线，记录模型与预处理版本；模型或维度变化触发全量重嵌入，不混写新旧向量。
- 建立 RAG 评测闭环：引入 Promptfoo 作为 dev-only 测试/评测工具，同时维护项目内 gold-set 与纯 TypeScript 确定性指标，覆盖 Recall@K、Precision@K、MRR、nDCG、答案忠实性、答案相关性与引用正确性。
- 将 Pilot、A/B、失败案例、延迟、成本和隐私边界写入可复核的评测产物；不把关键词覆盖率、HTTP 200 或单次 LLM 判断当作 RAG 质量结论。

## 3. Capabilities

### New Capabilities

- `ai-rag/rag-evaluation`：gold-set、检索指标、答案级指标、Promptfoo 适配与可重复评测流程。
- `ai-rag/reranker`：可插拔重排 provider、Noop 基线、通用 LLM 重排候选实现及成本/超时/回退契约。

### Modified Capabilities

- `openspec/specs/ai-rag/hybrid-search/spec.md`：修改 lexical 候选召回、`pg_trgm` 互补检索、候选池与最终 limit 分离、RRF 后去重/重排及严格评估指标要求。
- `openspec/specs/ai-rag/knowledge-sync/spec.md`：修改 chunk 结构、标题上下文、跨块 overlap、父子关系与 embedding/profile 版本参与幂等身份的要求。

## 4. Impact

- 代码：`packages/ai-rag-core` 的 Markdown chunk 契约与实现；`packages/ai-rag-api` 的 PostgreSQL 检索、hybrid pipeline、reranker provider、同步服务和评估脚本。
- 数据库：可能新增 chunk 父子关系、检索文本/三元组索引、评估 qrels 与 profile/model 版本字段；所有正式迁移必须可回滚，不能破坏现有 Neon 数据。
- 依赖与配置：新增 Promptfoo 作为开发评测依赖；通用 LLM reranker 仅通过显式 provider/config 启用，默认不改变线上行为，不暴露 API key。
- 验证：新增固定 gold-set、离线 JSON 评测、Promptfoo 实验结果、延迟/成本记录和 Noop/真实 reranker 对照；目标门槛为 Recall@10 ≥ 0.90、MRR@10 ≥ 0.70、各题型 Recall@10 ≥ 0.80、P95 检索延迟增幅 ≤ 30%，最终以 Pilot 数据校准。
- 非目标：本期不安装 PGroonga、不创建 OpenSearch 集群、不切换到阿里云百炼 embedding、不强制接入付费 reranker、不把答案级 LLM judge 作为唯一硬门禁。
- AI SDK 大版本升级不属于 phase3；升级 `ai`、`@ai-sdk/vue`、`@ai-sdk/openai` 与 `@ai-sdk/anthropic` 的任务统一留到 phase4 独立变更。

## 5. Decision Record

### 5.1 CJK 分词器决策（2026-08-31）

**决策**：phase3 不新增 TypeScript CJK 分词器；中文 lexical 先采用 Neon 已支持的 PostgreSQL `pg_trgm`，与现有 PostgreSQL FTS、向量检索和 RRF 并行评估。

**原因**：当前 lexical 索引在 PostgreSQL 内生成，若只在 TypeScript 查询侧分词，会造成文档入库与 query 预处理不一致；引入 Node 原生分词依赖还会增加 Vercel 构建、词典版本和全量重建成本。`pg_trgm` 不需要单独的 TypeScript tokenizer，能先覆盖中文子串、短词、版本号和轻微错别字场景。

**触发条件**：只有当真实、版本化的 gold-set 评估证明 `pg_trgm` 在目标题型上的 Recall@10 仍明显不足，且通过 query 规范化、候选池扩大、标题上下文和混合检索调优仍无法达到验收门槛时，才启动 TypeScript CJK tokenizer 的选型与实现评估。届时必须同时评估文档侧与 query 侧一致分词、词典维护、依赖兼容、索引重建和回滚方案。

**被否决的替代方案**：本期直接引入 `jieba`、`nodejieba` 或其他 TypeScript/Node CJK tokenizer；本期直接迁移 PGroonga/OpenSearch。它们保留为后续证据驱动的候选，不构成当前实现承诺。

### 5.2 AI SDK 大版本升级决策（2026-08-31）

**决策**：phase3 保持当前 AI SDK v4 流式基线，不与 RAG 召回、Neon 同步和评测改造混合升级；AI SDK 大版本升级正式列为 phase4 的独立设计与迁移任务。

**原因**：当前服务端依赖 `streamText().toDataStreamResponse({ data })`、`StreamData`、Anthropic/OpenAI 双 adapter，Vue 端依赖 v4 `useChat`、自定义 `fetch`、`experimental_prepareRequestBody` 与 `2:` 来源帧解析。v4→v5 会同时影响消息结构、transport、stream protocol、来源帧和测试 fixture，直接升级会把检索质量问题与协议迁移问题耦合。

**phase4 设计输入**：独立 change 必须先评估 v4→v5 的 `UIMessage/ModelMessage`、DefaultChatTransport、UI Message Stream、数据持久化迁移、OpenAI/Anthropic provider 兼容、来源帧重写、abort、Vercel 长流与回滚；不得直接执行 `pnpm update ai@latest`，必须按大版本迁移指南分阶段验证。
