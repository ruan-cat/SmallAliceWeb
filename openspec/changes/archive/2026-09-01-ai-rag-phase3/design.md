## 1. Context

本设计承接 `proposal.md` 与四份 phase3 delta spec。当前运行时使用 Neon PostgreSQL、pgvector 1024 维 cosine、PostgreSQL FTS 和 RRF；embedding 通过 Cloudflare Workers AI OpenAI-compatible endpoint 生成，生产基线为 `@cf/baai/bge-m3`。当前 chunker 维护标题元数据但未将标题上下文写入 embedding 输入，普通段落跨 chunk 没有稳定 overlap，评估器只有关键词覆盖率。

本期不依赖 PGroonga、OpenSearch 或新的托管搜索基础设施。Neon 只使用已支持的 `pg_trgm` 与 `vector` 扩展；Promptfoo 仅作为开发评测工具，不进入 Nitro 线上运行时。

## 2. Goals / Non-Goals

**Goals:**

- 建立可版本化的 chunk profile，使标题上下文、跨块 overlap、父子 chunk 和结构化内容处理可复现。
- 在 PostgreSQL FTS 基线旁增加 `pg_trgm` lexical 候选召回，保留真实能力标注，不冒充 BM25。
- 将 lexical/vector 候选池与最终 Top-K 分离，使用 RRF、去重和可选 reranker 形成稳定检索链路。
- 以 `NoopReranker` 作为线上默认基线，提供受预算、超时、缓存和回退约束的通用 LLM reranker Pilot。
- 用 gold-set、Recall@K、Precision@K、MRR、nDCG 和引用/答案级评测建立 Promptfoo 可复现回归闭环。
- 让每次实验都能追溯到题集版本、语料快照、chunk profile、embedding model、reranker 状态、延迟和成本。

**Non-Goals:**

- 本期不实现 TypeScript CJK tokenizer；只有 `pg_trgm` 在真实 gold-set 上仍明显不足且其他调优无效时才重新立项。
- 本期不安装 PGroonga、不创建 OpenSearch 集群、不迁移离开 Neon。
- 本期不切换到阿里云百炼 embedding；不在同一向量列混用模型或维度。
- 本期不强制购买外部 reranker；外部服务仅作为显式授权后的可选适配器。
- 不把 Promptfoo、LLM-as-a-judge 或关键词覆盖率作为唯一质量裁决。
- AI SDK 大版本升级属于 phase4 独立 change；phase3 不升级 `ai`、`@ai-sdk/vue` 或 provider adapter。

## 3. Decisions

### 3.1 Chunk profile 与 embedding 输入

在 `packages/ai-rag-core` 中将 chunk 逻辑拆为“结构解析、profile 参数、上下文渲染”三层。默认 profile 先以 `targetTokens=500`、`overlapTokens=50`、表格行组 12 行作为基线，同时对 `400/80`、`500/50`、`800/100` 做离线 A/B。普通 prose chunk 必须在句子边界保留跨块 overlap；单个超长段落仍沿用 token 切分，但不再是唯一产生 overlap 的路径。

每个可召回子 chunk 具有稳定 `parentId`；父块代表完整章节或 FAQ 条目，子块用于向量/词法召回。返回给 LLM 时，系统可按 parentId 扩展父块或相邻兄弟块，但 gold-set 同时记录最小可回答子块和允许扩展的父块，避免重复子块虚高 Recall。

`content` 保持原始可展示正文；新增确定性的 embedding 输入渲染规则：

```text
文档：<sourcePath>
章节：<headingPath 用 " > " 连接>
正文：<content>
```

图片 URL 不进入渲染结果。表格保留表头和连续行组；FAQ 问题与答案保持同一最小结构单元；fenced code 节点先按“语言标签 + 完整代码块”作为原子结构纳入 profile，若后续需要按函数切分再另行 A/B。

### 3.2 Chunk 身份、版本与同步

`profileVersion` 由 chunk 参数、结构策略和 embedding 预处理规则共同决定，例如 `markdown-structure-v2`。数据库 chunk 身份继续由 `sourcePath + chunkIndex` 定位，同时增加 `parentId`、profile version、embedding model 和 preprocessing version 的可追溯字段。任一字段变化都视为该文档需要重建；新版本 chunk 与 embedding 全部生成成功后，才在单文档事务内替换旧版本。

旧版本失败时保留可检索；完整扫描成功后才执行源文件删除。模型或维度变化使用迁移与全量重嵌入，不得混写同一 `embedding` 列。

### 3.3 Lexical 与 vector 候选生成

保留 PostgreSQL FTS 的 `websearch_to_tsquery('simple')` + `ts_rank_cd` 作为词法基线，同时为 chunk 的可搜索文本建立 pg_trgm 索引。pg_trgm 搜索文本至少包含标题路径与正文，以覆盖中文子串、短词、版本号和轻微错别字；两路分数不直接相加，只按排名进入 RRF。

检索 API 使用两个明确参数：`candidateLimit`（默认 20，可评估 50）和 `finalLimit`（聊天默认 5，搜索可显式扩大）。lexical、vector provider 各自先返回 candidateLimit，RRF（默认 `k=60`）融合后按 chunk ID 去重，再交给 reranker 或截取 finalLimit。候选 ID、最终 ID 和各阶段分数都写入评估结果。

### 3.4 Reranker provider

定义注入式 `RerankerProvider`，输入 query 与候选 chunk，输出候选 ID 的新排序、分数和状态。输出不得制造新 chunk，必须保留原来源元数据。默认 `NoopReranker`/disabled 原样返回 RRF 排名并标记 `skipped` 或 `noop`。

通用 LLM reranker 作为 Pilot 实现：只处理 candidateLimit 范围内的候选；每个候选先做长度截断，统一拼接 query、标题上下文和正文；要求模型返回严格 JSON 的候选 ID 排名。请求前检查候选数、估算 token 和成本预算，设置超时、缓存键（query + candidate IDs + model/version）和最大重试次数。超时、额度不足、输出解析失败或 provider 错误时回退到 RRF/Noop，并记录 `failed`、原因和延迟。线上默认关闭，Promptfoo 离线对照时显式开启。

### 3.5 Gold-set 与评测执行

在 `packages/ai-rag-api/data/rag-gold-set.jsonl` 维护版本化题集。每行包含 `id`、`question`、`category`、`gold`（chunk ID、grade、reason）、可选 `referenceAnswer`、`requiredClaims`、`expectedCitationChunkIds` 和 `unanswerable`。题集分为开发、回归和最终验收三组；文档 `contentHash` 变化使受影响标注进入 stale 状态。

在 `packages/ai-rag-api/scripts/run-rag-evaluation.ts` 中实现纯 TypeScript 确定性指标：Recall@5/10/30、Precision@5/10、MRR@5/10、可用 grade 时的 nDCG@5/10；同时记录候选池指标和最终 Top-K 指标。关键词覆盖率保留为兼容诊断字段，不参与严格 Recall 汇总。

Promptfoo 配置放在 `packages/ai-rag-api/promptfoo.yaml`，以 dev-only provider 调用检索与聊天适配器，比较 chunk profile、lexical/vector/hybrid、NoopReranker 和 LLM reranker。Promptfoo 结果输出 JSON/HTML，但线上构建不依赖它。答案级人工或 LLM 评估单独记录 faithfulness、answer relevance、answer correctness 和 citation correctness，确定性引用 ID/URL 校验优先于 LLM judge。

### 3.6 验收门槛与实验控制

所有 A/B 实验固定题集版本、语料快照、embedding model、索引版本、candidateLimit、finalLimit、RRF k 和随机种子；每次只改变一个主要变量。初始候选门槛为总体 Recall@10 不低于基线、MRR@10 ≥ 0.70、各题型 Recall@10 ≥ 0.80、Precision@10 不下降超过 0.05、P95 检索延迟增幅 ≤ 30%。这些是启动门槛，最终阈值在 Pilot 数据冻结前不得临时调整。

### 3.7 标题型查询回归与线上 corpus 预检

将“`小爱丽丝是谁啊？`”作为 phase3 首个标题型回归样本。gold-set 指定目标 `sourcePath` 为 `docs/docx/插件详细手册/99.小爱丽丝设定/小爱丽丝设定介绍.md`，目标 `headingPath` 至少包含 `小爱丽丝`，并标注章节直接介绍与特征设定相关 chunk。验收不仅检查关键词命中，还检查 Top-10 是否出现目标来源和章节；其他文档中偶然出现“小爱丽丝”的 chunk 只作为 hard negative。

评测 runner 在执行检索前通过数据库 provider 做 corpus preflight：确认目标 document 存在、chunk 数大于 0、heading path 可定位、embedding 非空、profile/preprocessing/model 版本与本次配置一致，并记录最近同步信息。预检输出写入独立 JSON 字段；若失败，则结果标记为 `corpus-missing`、`corpus-stale` 或 `embedding-missing`，不进入 lexical/vector/reranker 指标汇总。

本地 chunker smoke 负责证明标题切块合同，线上 preflight 负责证明 Neon 数据已同步，检索评测负责证明排序质量。三层证据不得互相替代：本地能生成 chunk 不证明线上已入库，线上文档存在不证明标题参与检索，HTTP 200 不证明目标来源进入 Top-K。

### 3.8 Phase4 AI SDK 迁移边界

phase3 固定当前 v4 data-stream 合同，保持 `StreamData`、`toDataStreamResponse`、来源帧 `2:` 解析和 v4 `useChat` 状态行为不变。phase4 另建独立 change，先完成 v4→v5 迁移设计，再评估是否继续到更高大版本；迁移必须覆盖服务端双 provider、Vue transport、UIMessage/ModelMessage 数据结构、来源数据帧、abort、错误状态、测试 fixture、Vercel 长流和回滚。

phase4 不能与 phase3 的 chunk、embedding、pg_trgm、gold-set 或 reranker 变更同时验证。迁移期间保留可回退的 v4 生产路径；只有新旧协议在同一组流式、来源、停止和错误验收中均通过，才能切换默认协议。

## 4. Risks / Trade-offs

- **[Risk] pg_trgm 召回提升但噪声增加** → lexical/vector 分路保留独立分数，RRF 后执行去重与 reranker；同时报告 Precision@10 和重复率。
- **[Risk] overlap 与父子块造成重复结果和成本上升** → gold 按最小可回答子块标注，评估重复率、上下文 token 和 P95 延迟；超门槛时降低 overlap 或只扩展父块一次。
- **[Risk] 通用 LLM reranker token 成本和延迟不可控** → 默认 Noop，candidateLimit 先取 20，设置预算、截断、缓存、超时和 RRF 回退；先离线 Pilot，未达收益门槛不启用线上。
- **[Risk] Promptfoo/LLM judge 评分漂移** → 纯 TypeScript IR 指标作为硬门禁，固定 judge 模型/版本并用人工抽样校准，不能让单次 judge 覆盖检索结果。
- **[Risk] chunk 或模型版本变化导致 gold 失效** → gold 记录 chunk ID 与 contentHash，变更后标记 stale，要求重新定位并记录 adjudication。
- **[Risk] 当前 code fence 处理改变用户可见结果** → 先以独立 profile 和回归题验证，未通过前不改变默认生产 profile。
- **[Risk] 线上 Neon corpus 缺失或版本过旧被误诊为模型召回差** → 每次严格评测先运行 source/profile/embedding preflight；失败题隔离为 corpus 状态问题，不进入检索指标。

## 5. Migration Plan

1. 在隔离/临时表完成 chunk profile、embedding 输入和 pg_trgm 查询 Pilot，不触碰正式 Neon 表。
2. 建立 gold-set 初版（现有 10 题扩展到 40～60 题），先加入“`小爱丽丝是谁啊？`”标题型回归样本，完成双人标注、qrels 校验、线上 corpus preflight 和严格指标基线。
3. 运行 lexical/vector/hybrid 的 candidateLimit 20/50 对照；确认 pg_trgm、候选池扩大和标题上下文的收益后，再评估父子块与 overlap 变体。
4. 以 NoopReranker 作为默认结果建立基线；在同一候选池上离线启用 LLM reranker，记录 token、成本、延迟、失败与回退，不满足门槛则保持 disabled。
5. 通过本地测试、Promptfoo JSON 结果、gold-set 指标和数据库迁移审查后，再执行正式 schema/profile 迁移与按文档重建；同步失败保留旧版本。
6. 回滚时关闭 reranker、恢复上一 profile/model 配置，并使用旧 chunk/embedding 版本继续检索；任何索引或新字段删除都必须另行确认，不在本期自动破坏性清理。

## 6. Open Questions

- Pilot 后在 candidateLimit 20 与 50 中选择默认值；该选择只影响性能参数，不改变能力边界。
- Promptfoo 的具体版本与 Node 22 小版本兼容性在依赖安装任务中锁定；缺少 Promptfoo 不得影响线上 runtime。
- phase4 的 AI SDK 目标大版本、迁移窗口和是否采用 UI Message Stream 在独立 change 中决策；不影响 phase3 的实施任务。
- 通用 LLM reranker 的中转站模型、单价和可用性在离线成本实验中确认；未确认前只保留 provider contract 与 Noop 基线。
