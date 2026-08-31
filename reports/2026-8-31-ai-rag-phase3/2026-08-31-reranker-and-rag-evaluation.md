# 2026-08-31 Reranker 与 RAG 评测调研报告

## 1. 执行摘要

本项目当前已经具备“候选召回 + RRF 融合”的检索基线，但还没有 reranker provider，也没有标准的 qrels（问题—相关 chunk 标注）和答案级评测。建议把评测拆成两条独立链路：

1. 先评估 lexical、vector、hybrid 是否把正确 chunk 召回，并用 Recall@K、Precision@K、MRR@K、nDCG@K 比较排名质量。
2. 在固定候选集上可选地加入 reranker，再评估它是否把真正相关的 chunk 推到最终 Top-5；最后才评估回答的 faithfulness、answer relevance 和 citation correctness。

这样可以回答“问题在召回、排序，还是生成”，也能防止用一个看似漂亮的答案分数掩盖检索漏召回。

## 2. 当前项目基线与边界

### 2.1 代码事实

- [`hybrid-search.ts`](../../packages/ai-rag-api/server/search/hybrid-search.ts) 并行调用词法和向量 provider：词法结果取 PostgreSQL 全文检索，向量结果由 embedding 后的 pgvector 查询产生，随后使用 `fuseRankings` 做 RRF，默认 `k=60`，最后截取 `limit`。
- [`postgres-search.ts`](../../packages/ai-rag-api/server/search/postgres-search.ts) 使用 `websearch_to_tsquery('simple')` 与 `ts_rank_cd`，以及 pgvector 的余弦距离运算符 `<=>`；当前 embedding 合同是 1024 维有限数值。OpenSpec 明确要求对外称“PostgreSQL 词法全文检索”，未经真实中文语料验证不能称为 BM25。
- [`evaluator.ts`](../../packages/ai-rag-api/server/evaluation/evaluator.ts) 固定比较 `lexical`、`vector`、`hybrid` 三种策略。它记录检索 ID，并把返回内容拼接后用大小写不敏感的字符串包含关系计算 `matchedKeywords`、`missingKeywords` 和关键词覆盖率；它没有 qrels、相关等级、排名折扣、答案文本或引用语义校验。
- 当前 [`eval-questions.json`](../../packages/ai-rag-api/data/eval-questions.json) 有 10 道题，满足 OpenSpec 的“至少 10 题”门槛，但 `expected_keywords` 是答案线索，不等价于相关 chunk 标注。某个 chunk 含关键词，也不能证明它是唯一或最相关的证据。

### 2.2 OpenSpec 对评测的约束

主规格 [`hybrid-search/spec.md`](../../openspec/specs/ai-rag/hybrid-search/spec.md) 要求三种策略可切换，并输出命中率、关键词覆盖率等 JSON 结果；[`chat-api/spec.md`](../../openspec/specs/ai-rag/chat-api/spec.md) 要求回答使用 Top-5 上下文、每个观点带 `[来源N]`，并携带稳定的来源元数据；[`source-citation/spec.md`](../../openspec/specs/ai-rag/source-citation/spec.md) 规定 `sourceUrl#headingAnchor` 的来源跳转合同。

因此，本报告是评测设计与生态调研，不改动 OpenSpec、源码或现有评分器。未来接入 reranker 或标准指标时，应新增独立变更，不能把现有关键词覆盖率改名为 Recall@K。

## 3. Reranker 是什么

### 3.1 两阶段检索

对新手来说，可以把 RAG 检索想成图书馆的两道筛选：

1. **候选召回（retrieval）**：用便宜、可扩展的检索器快速从整个语料库找出候选，例如 lexical、vector 或当前的 hybrid。它追求“正确答案不要漏掉”，通常取较大的候选池（例如 30～100 条）。
2. **重排（reranking）**：对每个候选同时看 query 和 chunk，用更精细的 query-document 模型计算相关性，再按新分数排序，最后交给上下文窗口的 Top-5。

典型 reranker 是 cross-encoder：把 query 与一个候选 chunk 拼在一起，让模型直接判断这一对的相关性。它比只比较两个独立 embedding 的 bi-encoder 更能捕捉词序、否定、条件和术语组合，但每个候选都要做一次联合编码，因此更慢、更贵，适合只处理候选池而不是全库。

原始 [Sentence-BERT 论文](https://arxiv.org/abs/1908.10084) 说明了独立编码句向量的效率优势；[Passage Re-ranking with BERT](https://arxiv.org/abs/1901.04085) 展示了把 query 与 passage 联合输入 BERT 做重排的路线。实际 provider（例如 [Cohere Rerank 官方文档](https://docs.cohere.com/v2/docs/rerank)）也明确把 rerank 定位为“对已有搜索结果重新排序”，而不是替代全库召回。

### 3.2 为什么可能提升准确度

向量相似度擅长找“意思相近”的内容，词法检索擅长找精确术语；两者都可能把泛相关、重复或只命中一个词的 chunk 排在前面。reranker 重新对照完整 query 与 chunk，可以把包含完整答案、满足条件、语义更直接的候选前移，降低 Top-5 上下文中的噪声，从而给生成模型更好的证据顺序。

但它不是魔法：如果相关 chunk 根本不在候选池里，reranker 无法找回它；如果候选池过小，reranker 甚至可能让最终结果的召回变差。因此必须同时报告“候选池 Recall@K”和“重排后最终 Top-K 指标”，不能只看 reranker 的最终分数。重排模型不应被当作事实裁判，它只提供排序信号，回答仍需做证据支持和引用校验。

## 4. 评测指标：检索与生成必须分开

### 4.1 检索指标

以下公式把每个问题的 qrels（相关 chunk 集合或带等级的标注）作为真值。定义必须固定在 chunk ID 层面，并在同一来源重复 chunk 的情况下另行去重分析。

|    指标     |             直观含义             |                     公式或判定                     |                适合回答的问题                |
| :---------: | :------------------------------: | :------------------------------------------------: | :------------------------------------------: |
| Precision@K |      Top-K 中有多少是相关的      |                  `相关结果数 / K`                  |          给模型的上下文有多少噪声？          |
|  Recall@K   | 所有相关结果有多少被 Top-K 找到  |          `Top-K 相关数 / qrels 相关总数`           |            正确证据有没有漏召回？            |
|    MRR@K    |    第一个相关结果出现得有多早    | `1 / 首个相关结果排名`，没有则为 0，再对问题取平均 | 用户只需要一条关键证据时，第一条够不够靠前？ |
|   nDCG@K    | 相关等级和位置共同决定的排序质量 | `DCG@K / IDCG@K`；`DCG = Σ(2^rel-1)/log2(rank+1)`  |  多个相关等级不同的 chunk 是否按价值排序？   |

[NIST/TREC 的 Common Evaluation Measures](https://trec.nist.gov/pubs/trec22/appendices/measures.pdf) 给出了 Precision 与 Recall 的标准定义；nDCG 的经典来源是 [Järvelin 与 Kekäläinen 的 Cumulated gain-based evaluation](https://dl.acm.org/doi/10.1145/582415.582418)。如果只标“相关/不相关”，MRR 和 Recall@K 足以作为第一版；如果能区分“直接回答、部分相关、背景信息、无关”，再引入 graded qrels 与 nDCG。

### 4.2 生成答案指标

这些指标输入的是 `question + retrieved context + answer`，不是单独的检索 ID，因此不能用来替代检索指标。

|                指标                |                   判定对象                   |                                                                                                                            解释与陷阱                                                                                                                            |
| :--------------------------------: | :------------------------------------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|       Faithfulness（忠实性）       |        answer 相对 retrieved context         | 回答中的可验证陈述是否能由检索上下文支持；支持比例高不代表回答完整或真实。直接复制一段上下文可能忠实但没有回答问题。可参考 [Ragas faithfulness 定义](https://github.com/vibrantlabsai/ragas/blob/main/docs/concepts/metrics/available_metrics/faithfulness.md)。 |
|   Answer relevance（答案相关性）   |             answer 相对 question             |                                                                          是否直接回应用户问题、没有跑题；一个答案可以“答非所问地正确引用”，或语气相关但事实错误，因此不能单独当正确率。                                                                          |
| Citation correctness（引用正确性） | answer 中的 claim、`[来源N]` 与 source chunk |                                                   同时检查引用编号是否存在、是否映射到返回的 chunk、链接是否符合 `sourceUrl#headingAnchor`，以及该 chunk 是否支持对应陈述；应把格式完整性与语义蕴含分开计分。                                                    |
|  Answer correctness / factuality   |      answer 相对人工参考答案或专家事实       |                                                                                    判断答案事实是否正确、是否覆盖关键点；需要 reference answer 或专家标注，不能仅凭模型自评。                                                                                    |

Faithfulness 关注“有没有编造或超出给定上下文”，answer relevance 关注“有没有回答这个问题”，citation correctness 关注“引用能否定位并支撑具体陈述”。三者必须与 Recall@K 一起看：检索漏掉证据时，模型即使忠实于错误/不完整上下文，也可能得到较高 faithfulness。

### 4.3 诊断矩阵

|                 现象                  |                     主要嫌疑                      |                               下一步检查                               |
| :-----------------------------------: | :-----------------------------------------------: | :--------------------------------------------------------------------: |
|           Recall@候选 K 低            |      chunk、embedding、词法查询或候选池太小       | 看 lexical/vector/hybrid 的 qrels 命中，扩大候选 K，检查分块与问题类型 |
|  候选 Recall 高、最终 Precision@5 低  |     RRF 或 reranker 排序不佳，或重复/噪声过多     |             比较重排前后 MRR/nDCG，审查相关等级和去重策略              |
|      检索指标高、faithfulness 低      | 生成模型没有正确使用上下文，或提示词/引用约束失效 |                固定上下文做答案回放，检查 claim 支持链                 |
| faithfulness 高、answer relevance 低  |             模型忠实地复述了无关内容              |                看 context relevance、答案长度和问题覆盖                |
| 答案看起来好、citation correctness 低 |     引用编号、chunk 元数据或来源锚点绑定错误      |               做确定性 ID/URL 校验，再抽样做语义支持判定               |

## 5. TypeScript/Node 生态调研

### 5.1 适合当前项目的候选

|                                                                                       包或项目                                                                                        |                                                    Node/TS 适配性                                                     |                                                             能力                                                              |                                                               当前项目判断                                                                |
| :-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------: |
|                                                           [Promptfoo](https://www.promptfoo.dev/docs/guides/evaluate-rag/)                                                            | Node 包和 CLI，支持 JS/TS provider；官方 Node 包文档目前要求 Node `22.22.0+`，需先核对本机版本（本仓库只声明 `22.x`） |   RAG context recall、context relevance、context faithfulness、answer relevance；支持 `contextTransform`，可导出 JSON/HTML    | 适合作为独立评测 harness，尤其是把 `/v1/chat` 或本地函数包装成 provider；不要让它替换现有确定性检索指标。注意版本门槛和 LLM judge 成本。  |
|                                                         [@mastra/evals / scorers](https://mastra.ai/en/docs/scorers/overview)                                                         |                                 TypeScript 原生，提供 code-based 与 LLM-based scorers                                 | 内置 answer relevancy、faithfulness、context precision/relevancy、contextual recall、keyword coverage，以及 Native JavaScript |  适合从现有 evaluator 提取 scorer；但引入 Mastra 作为评测依赖偏重，先验证当前发布版导出路径、Node 22 和模型适配，再决定是否纳入 API 包。  |
| [Braintrust JavaScript SDK](https://github.com/braintrustdata/braintrust-sdk-javascript) + [autoevals RAG scorers](https://github.com/braintrustdata/autoevals/blob/main/js/ragas.ts) |               TypeScript SDK；`autoevals` 提供 `Faithfulness`、`ContextRelevancy` 等 RAGAS 风格 scorer                |                  Dataset、Eval、scorer、JSON 结果和实验记录；官方文档也说明可在无 API key 的本地迭代模式运行                  | 适合团队已有 Braintrust 或需要实验管理；仅为 10～几十题本地回归时平台依赖和凭据管理可能过重。应把 RAGAS scorer 当可选适配器而非核心合同。 |
|              [Langfuse JS/TS SDK](https://github.com/langfuse/langfuse-js) 与 [Code Evaluators](https://langfuse.com/docs/evaluation/evaluation-methods/code-evaluators)              |                                     JS/TS SDK；支持自托管，当前 SDK v5 有迁移要求                                     |            代码评估器、LLM-as-a-judge、数据集、实验、线上/批量评估；确定性检查建议在自己的 CI 中完成后再上报 score            |    更像观测与评估平台，不是轻量指标库。若要把生产 trace、人工标注和离线实验统一管理可考虑自托管；本阶段不应为离线基线新增 SaaS 依赖。     |
|                                            [Ragas](https://arxiv.org/abs/2309.15217) / [官方仓库](https://github.com/vibrantlabsai/ragas)                                             |                                      成熟的 Python 生态，不是 TypeScript 原生包                                       |                         Context precision/recall、faithfulness、answer relevancy 等参考实现和论文定义                         |    可作为指标语义参考或隔离 Python job；当前 Node/Nitro 项目不建议为 10 题评测引入 Python 子流程，除非需要与既有 Ragas 基准直接对齐。     |

结论：第一阶段优先用项目内纯 TypeScript 计算检索指标，必要时以 Promptfoo 或 Mastra 做答案级实验；Braintrust/Langfuse 适合后续实验与生产观测，不是当前最小闭环的前置依赖。Ragas 的概念和论文有价值，但“有 Python 参考实现”不等于 Node 适配完成。

### 5.2 Reranker provider 的建议合同

当前 `HybridSearchProviders` 只有 `createEmbedding`、`lexicalSearch`、`vectorSearch`。未来若实施，可在独立变更中增加类似以下语义（这里只是设计建议，不修改源码）：

```ts
type RerankerProvider = {
	rerank: (query: string, candidates: readonly HybridSearchItem[]) => Promise<HybridSearchItem[]>;
};
```

合同应明确：输入候选 ID 必须原样保留；输出只能是候选的排序/分数变化，不能凭空制造 chunk；超时、空结果、provider 错误必须可观测；最终 Top-5 的来源元数据仍来自原 chunk。离线评估要保存 `candidateIds`、`rerankedIds`、provider/model 标识、延迟和错误，而不是只保存最终答案。

## 6. 不依赖昂贵 SaaS 的评测方法

### 6.1 Gold-set 设计

建议把现有 10 道题升级为版本化 JSONL，每条包含：`id`、`question`、`category`、`relevantChunkIds`、可选的 `relevance` 等级、`referenceAnswer`、`requiredClaims`、`expectedCitationChunkIds`。先由项目维护者为每题标注 1～3 个直接证据 chunk，再加入少量“无答案/资料不足”题；训练/调参题与最终报告题分离，防止在同一题集上过拟合。

gold-set 不需要大：第一版可用现有 10 题做 smoke，随后按概念、对比、操作、版本、条款、边界等类别扩展到 30～50 题。每次变更记录题集版本、语料快照、chunking 参数、embedding 模型和 reranker 模型，确保结果可复现。

### 6.2 分层实验顺序

1. **召回层**：对 lexical、vector、hybrid 分别请求候选 K（建议同时测 5、10、30、50），计算 Recall@K、Precision@K、MRR@K；保存排名 ID，不调用 LLM。
2. **重排层**：在同一候选池上比较“无 reranker / 本地 reranker / 外部 provider”，固定最终 Top-5，报告候选 Recall、最终 Recall、MRR、nDCG、延迟和失败率。候选池变动与 reranker 变动不能同时发生。
3. **上下文层**：检查最终 Top-5 的重复来源、长度、关键 claim 覆盖和 context precision；可用字符串/规则做第一轮，不把关键词命中误称为语义相关性。
4. **生成层**：只对少量代表性问题运行真实 `/v1/chat`，保存问题、检索 ID、答案、来源帧和模型标识；人工双人抽样打 faithfulness、answer relevance、answer correctness、citation correctness。LLM-as-judge 只作为低成本扩展或排序辅助，不能取代人工校准。
5. **回归门禁**：把检索指标作为 CI 的确定性门禁，例如候选 Recall@30 不得低于基线、最终 Recall@5 不得下降超过阈值；答案级分数采用报告和抽样审查，避免随机模型调用阻塞每次代码测试。

### 6.3 TypeScript 可执行脚本建议

建议新增独立的 `packages/ai-rag-api/scripts/run-rag-evaluation.ts`（未来实施时再走 OpenSpec），而不是把标准指标硬塞进现有 `evaluator.ts`。脚本职责可以是：读取 JSONL gold-set；调用注入的 lexical/vector/hybrid/reranker provider；对结果按 chunk ID 计算 `precisionAtK`、`recallAtK`、`mrrAtK`、`ndcgAtK`；输出包含配置、每题明细和汇总的 JSON。

其中 `retrievedIds` 必须保留顺序，`relevantChunkIds` 必须来自 gold-set；`nDCG` 使用明确的 relevance 等级；没有 qrels 的题只能进入关键词 smoke，不能进入标准汇总。答案级脚本另设 adapter，输入已经完成的 `question/context/answer/citations`，并把确定性引用检查与人工/LLM 评分分开写入。

## 7. 成本、隐私与外部 provider 风险

### 7.1 成本与延迟

- reranker 的调用量约等于“问题数 × 候选 K”；候选从 5 扩大到 50 可能把推理成本和延迟放大一个数量级。先在本地 gold-set 测 K，再决定是否请求外部服务。
- LLM-as-judge 还会为每个答案、每个 claim 产生额外调用；应限制到抽样题、缓存输入输出、固定 judge 模型和温度，并报告调用失败、重试、token 和延迟。
- 把 reranker 当作可超时的增强层：失败时回退 hybrid 排名，同时把 `rerankerStatus` 记录为 skipped/failed，不能静默伪装成已重排。

### 7.2 隐私与数据边界

- query、chunk 内容、答案和引用可能包含私有文档；发送到 Cohere、托管 judge、Braintrust 或 Langfuse 前必须取得明确授权，确认保留、训练使用、区域和自托管选项。
- 报告只保存 chunk ID、脱敏摘要和模型/版本，不写 API key、数据库连接串或完整敏感语料。现有 OpenSpec 也明确禁止把 provider key 写入报告、日志或快照。
- 若采用自托管 Langfuse，仍需保护其数据库、对象存储和 trace 访问权限；“自托管”降低第三方传输，不等于天然合规。

### 7.3 结果可信度

- 外部 reranker 分数跨模型不可比较；只比较同一 gold-set 下的排序指标，并记录 provider/model/version。
- LLM judge 会受提示词、模型、语言和位置偏差影响；先拿人工标注校准阈值，报告 judge 与人工的一致性和争议样本。
- 不要把一次 HTTP 200、返回了来源帧或 keyword coverage 提升写成“准确度提升”；只有可复核的 qrels 指标和答案抽样才能支撑相应结论。

## 8. 针对本项目的落地建议

### 8.1 推荐的最小路线

1. 保留现有 evaluator 作为兼容的关键词 smoke，并在报告中明确它不是标准 IR 评估。
2. 从现有 10 题为每题补齐 `relevantChunkIds`，先实现纯 TypeScript 的 Recall@5/10/30、Precision@5、MRR@5 和 nDCG@5。
3. 对 lexical/vector/hybrid 固定候选 K，分别建立基线；结合已有 300/30/5、500/50/10、800/100/15 参数证据，重新用 qrels 判断参数，而不是用关键词覆盖率单独拍板。
4. 再对同一候选池接一个可替换 reranker adapter，至少比较无重排与一种本地/授权 provider；报告召回、排名、延迟、失败回退和隐私边界。
5. 最后选择 10～20 道代表题做人工答案审查，再用 Promptfoo、Mastra 或 `autoevals` 作为可选 LLM judge。只有 judge 与人工校准后，才把它用于回归趋势，不设为唯一硬门禁。

### 8.2 当前不能宣称的结论

截至本次代码和规格核对，可以宣称“项目有 lexical/vector/hybrid 三策略和 RRF 评估基线”；不能宣称“已证明 reranker 提升准确度”“已有 Recall@K/MRR/nDCG 结果”或“faithfulness/citation correctness 已通过”。这些都需要 qrels、固定实验和答案级证据补齐后才能成立。

## 9. 参考资料

- [Cohere Rerank 官方文档](https://docs.cohere.com/v2/docs/rerank)；[Rerank best practices](https://docs.cohere.com/docs/reranking-best-practices)
- [Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks](https://arxiv.org/abs/1908.10084)
- [Passage Re-ranking with BERT](https://arxiv.org/abs/1901.04085)
- [Reciprocal Rank Fusion outperforms Condorcet and Individual Rank Learning Methods](https://dl.acm.org/doi/10.1145/1571941.1572114)
- [NIST/TREC Common Evaluation Measures](https://trec.nist.gov/pubs/trec22/appendices/measures.pdf)
- [Cumulated gain-based evaluation of IR techniques](https://dl.acm.org/doi/10.1145/582415.582418)
- [RAGAS: Automated Evaluation of Retrieval Augmented Generation](https://arxiv.org/abs/2309.15217)
- [Promptfoo: Evaluating RAG pipelines](https://www.promptfoo.dev/docs/guides/evaluate-rag/)
- [Mastra Scorers overview](https://mastra.ai/en/docs/scorers/overview)
- [Braintrust JavaScript/TypeScript SDK](https://github.com/braintrustdata/braintrust-sdk-javascript)
- [Braintrust autoevals RAGAS scorers](https://github.com/braintrustdata/autoevals/blob/main/js/ragas.ts)
- [Langfuse evaluation concepts](https://langfuse.com/docs/evaluation/core-concepts)
