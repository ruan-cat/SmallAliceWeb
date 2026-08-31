# 2026-08-31 Recall@10 与 Chunk 策略新手指南

本文把“召回了没有”从关键词直觉，落到可以复核的 Recall@10，并结合 SmallAliceWeb 当前 chunker/evaluator 说明：标题上下文、跨块 overlap、父子块、表格/FAQ/代码块以及 chunk A/B 测试应该怎样设计。本文只做评测与方法说明，不改变 OpenSpec、源码或生产参数。

## 1. 先把“相关”说清楚

检索评测必须先有每个问题的 gold relevant chunks（人工确认的相关块集合），再把系统返回的有序 ID 与 gold 集合比较。NIST 的 TREC 评测资料也把 `relevant` 定义为任务中所有已判定相关的文档、`rel ret` 定义为返回的相关文档数，并据此计算 Precision/Recall（[TREC common evaluation measures](https://trec.nist.gov/pubs/trec22/appendices/measures.pdf)）。

### 1.1 Recall@10 的一句话定义

对问题 (q)，设 gold 相关 chunk 集合为 (G*q)，检索结果前 10 个去重后的 chunk 集合为 (R*{q,10})：

\[
Recall@10(q)=\frac{|G*q\cap R*{q,10}|}{|G_q|}
\]

它回答“已知应该找回的相关块，有多少至少进入前 10 名”，不回答这些块是否排得最前，也不惩罚前 10 中的噪声。若一个问题有 4 个 gold chunks，前 10 找到 3 个，则 Recall@10 = 3/4 = 0.75。

### 1.2 数字例子：为什么要固定 K=10

问题“如何配置插件代理？”的 gold 为 `{c12,c18,c31,c44}`。某次返回前 10 个：`[c90,c12,c77,c18,c55,c31,c63,c2,c8,c10]`，命中 3 个，因此 Recall@10=0.75。若只看“关键词出现过”，因为三个关键词都出现在结果拼接文本中，可能会报 100%；这并不能证明第 4 个相关 chunk 被召回，更无法知道它是否在第 10 名之外。

`@10` 也意味着比较时必须让所有策略使用同一个 K（当前 OpenSpec 的基线建议 topK=10），不能 lexical 用 5、vector 用 10 后再横向比较。

## 2. Recall、Precision、MRR、nDCG 的关系

### 2.1 四个指标各看什么

|     指标     |                     计算（单题）                      |          更关心          |                                                      典型用途                                                      |
| :----------: | :---------------------------------------------------: | :----------------------: | :----------------------------------------------------------------------------------------------------------------: | -------------------- | --------------------------- | -------------- | ------------------------ |
|  Recall@10   |                           (                           |      G\cap R\_{10}       |                                                         /                                                          | G                    | )                           | 找全多少相关块 | 知识库问答的候选召回门槛 |
| Precision@10 |                           (                           |      G\cap R\_{10}       |                                                        /10)                                                        | 前 10 有多少是相关的 | 控制上下文噪声与 token 成本 |
|     MRR      | 首个相关结果排名 (r) 的 (1/r)，无命中记 0；多题取平均 |  第一个可用答案来得多早  |            FAQ/单答案问题；TREC QA 明确使用该定义（[NIST TREC QA](https://trec.nist.gov/data/qa.html)）            |
|   nDCG@10    |         按排名折扣的相关性增益 / 理想排序增益         | 相关性等级与顺序是否都好 | 多个相关块、graded relevance；原始论文为 Järvelin & Kekäläinen（[ACM DOI](https://doi.org/10.1145/582415.582418)） |

同一例子中命中 3 个：Precision@10=3/10=0.30，Recall@10=3/4=0.75。若首个 gold 在第 2 名，MRR 单题=1/2=0.5；若把相关性标成 2=直接答案、1=辅助上下文、0=无关，nDCG@10 还会奖励“直接答案排在前面”。因此 Recall 与 Precision 是集合覆盖/纯度，MRR 与 nDCG 是排序敏感指标，不能互相替代。

### 2.2 为什么当前关键词覆盖率不是严格 Recall@10

`packages/ai-rag-api/server/evaluation/evaluator.ts` 的 `EvalQuestion` 只有 `expected_keywords`，`createEvalResult` 将前 K 个 chunk 的文本拼接后做大小写不敏感的 `includes`，再计算：

\[
expectedKeywordCoverage=\frac{命中的关键词数}{关键词总数}
\]

同时 `hasExpectedKeyword` 只要命中一个关键词就为真；结果虽保存 `retrievedIds`，但没有 gold chunk ID、排名相关性、去重规则或首个命中排名。默认 `limit` 还是 5，只有调用方显式传 10 才是 Top-10。因而它是“关键词覆盖代理指标”，不是严格 Recall@10：

- 关键词可能出现在错误 chunk、标题、代码示例或导航文本中；
- 一个超长 chunk 命中多个词，不等于找回多个相关事实；
- gold 未定义时，分母不是“所有相关 chunks”；
- 拼接后丢失了每个 chunk 的 rank，无法计算 MRR/nDCG。

当前 OpenSpec `hybrid-search` 只要求固定题集（至少 10 题）输出命中率、关键词覆盖率等 JSON；`knowledge-sync` 规定 chunk 元数据、标题锚点、表格行范围和图片 URL 处理。下一阶段应保留现有字段作为诊断信号，同时新增严格标注字段，而不是把 coverage 改名为 recall。

## 3. 当前 chunker 的真实行为与影响

### 3.1 标题上下文与稳定身份

`packages/ai-rag-core/src/markdown-chunk.ts` 只把 H1/H2/H3 维护进 `headingPath`，并用 `headingIndex` 及 `sourcePath` 生成稳定 `headingAnchor`；每个 chunk 还带 `chunkIndex`、`chunkKind`、`imageUrls`。这让“配置 > 代理 > 超时”这样的路径随检索结果一起回传，适合作为 gold 标注的定位键（`sourcePath + headingAnchor + chunkIndex`），不要只记录易变的文本片段。

### 3.2 prose 的目标 token 与 overlap

默认 `targetTokens=500`、`overlapTokens=50`。普通短段落先按段落合并到目标大小；只有单个段落超过目标时，`splitByTokens` 才按近似 token 切分并保留 50 token overlap。也就是说：

- 两个正常段落被合并后超限，会先 flush，不会跨 chunk overlap；
- 50 token overlap 只发生在“单个超长段落”的相邻切片之间；
- 中文按单字近似 token，英文/数字按非空白词组近似，不能直接等同模型真实 token。

因此报告实验必须记录实际 `targetTokens/overlapTokens`，并将“跨段落 overlap”作为独立变体，不能从默认配置推断系统已覆盖所有边界。

### 3.3 表格、FAQ 与图片

GFM 表格单独成为 `chunkKind=table`，默认每组 12 行，超出 token 上限时递归二分但保持数据行原子性；每个组重复表头、标题路径和图片 URL 元数据。FAQ 若是“问题 | 解决方案”表格，应以行作为最小 gold 单位；若是多个 H3 问答段落，则以 H3 路径下的问答段落作为最小单位，避免把相邻问题合并后造成假命中。图片只保留 URL 到 `imageUrls`，不进入正文和 embedding，因此不能把图片 OCR 结果当作当前召回能力。

### 3.4 代码块是当前缺口

主循环只处理 heading、table、paragraph；`remark-parse` 产生的 fenced `code` 节点不会进入 `prose`，所以当前 chunker 不会把代码块写入 chunk。评测题若问“给出配置代码”，应在数据集中标为“当前不支持/预期失败”，不能把失败误算成向量模型问题。未来方案应明确选择：代码块原子保留（语言标签 + 完整代码）、按函数/配置段切分，或与解释段落组成父块；无论哪种，都需要独立 A/B 试验和回归样本。

## 4. 父子块与跨块 overlap 怎么评测

### 4.1 父子块的可解释设计

父块是完整章节/FAQ 条目，子块是用于 embedding 与召回的 200–500 token 片段。子块必须带 `parentId`（可由 `sourcePath + headingAnchor` 派生），检索命中子块后再按策略扩展父块或相邻兄弟块。gold 标注同时记录“最小可回答子块”和“允许扩展的父块”，这样 Recall@10 不会因为一个父块扩展成 8 个重复子块而虚高。

### 4.2 overlap 的收益与代价

可比较三档：A=0、B=50（当前默认对超长段落）、C=100 token；其余索引、embedding、topK、阈值、题集和随机种子固定。记录：Recall@10、Precision@10、MRR、nDCG@10、平均返回 token、重复率（同一 parent 命中子块数/返回数）和延迟。overlap 提高边界事实的召回时，通常 Recall 上升；但重复块会稀释 Precision、增加成本，必须同时看两者。

## 5. Gold 标注、题集分层与候选门槛

### 5.1 Gold chunk 标注格式

建议为每题保存一个版本化 JSON（示例）：

```json
{
	"id": "faq-proxy-timeout-01",
	"question": "代理超时如何配置？",
	"category": "faq",
	"gold": [
		{ "chunkId": "docs/docx/FAQ.md#rag-heading-...:chunk-3", "grade": 2, "reason": "直接给出 timeout 字段" },
		{ "chunkId": "docs/docx/FAQ.md#rag-heading-...:chunk-4", "grade": 1, "reason": "解释默认值" }
	],
	"must_include": ["timeout"],
	"unanswerable": false
}
```

`grade=2` 表示单独即可回答，`grade=1` 表示有帮助但不完整，`grade=0` 不纳入 gold。标注者至少两人独立判断；冲突记录 adjudication 原因。文档同步后若 `contentHash` 变化，旧标注标为 stale，重新定位而不是静默沿用。

### 5.2 题集分层

至少 10 题只是 OpenSpec 的下限，建议每层 5–10 题并保持固定版本：

|      层       |              例子              |      主要风险      |
| :-----------: | :----------------------------: | :----------------: |
|  FAQ/单事实   |      “超时默认值是多少？”      | MRR、首个答案位置  |
|   多跳/组合   | “先配置代理再验证连接的步骤？” | Recall、父子块扩展 |
|   表格/枚举   |    “哪个参数对应哪种环境？”    | 行原子性、表头重复 |
|   代码/配置   |   “给出 `timeout` 配置片段”    | 当前 code 节点缺失 |
| 标题同义改写  |       “连接卡住怎么办？”       |  词法 vs 向量互补  |
| 不可回答/越界 |    “文档没有说明的版本号？”    |  误召回、阈值校准  |

每层都要包含中文、英文术语、数字和同义表达，报告按层输出均值与置信区间，避免总体平均掩盖某一类完全失败。

### 5.3 候选门槛（只用于候选，不冒充 Recall）

先固定召回候选 `candidateK=50` 或 100，再在候选内评估最终 Top-10；若使用 score threshold，必须在开发集上预先锁定（例如 `score >= 0.5`），测试集不得按结果临时调阈值。阈值过滤会造成“未返回”与“返回但排名靠后”两类失败，日志中分别记录。Recall@10 的分母仍是 gold 总数，不因阈值变化而改变。

## 6. Chunk A/B 测试方案（数据驱动）

### 6.1 变量与控制面

只改变一个 chunk 变量，固定 embedding 模型（当前 OpenSpec 为 Cloudflare `@cf/baai/bge-m3`、1024 维）、索引、检索策略、题集版本和随机种子。建议首轮：

|     变体      |                             规则                             |
| :-----------: | :----------------------------------------------------------: |
|   A（基线）   |    target=500，overlap=50；当前表格 12 行；忽略 code 节点    |
| B（边界优先） |       target=400，overlap=80；段落边界保留 1 句上下文        |
| C（结构优先） | target=500，overlap=50；FAQ 一问一块、表格一行组、代码块原子 |

### 6.2 可执行验收步骤

1. 固定题集与 gold JSON，运行现有测试：

   ```log
   pnpm --filter @ruan-cat-drill-doc/ai-rag-core test -- markdown-chunk.test.ts
   pnpm --filter @ruan-cat-drill-doc/ai-rag-api test -- evaluator.test.ts
   ```

2. 对每个变体执行同一 lexical、vector、hybrid 查询，强制 `limit=10`，输出每题完整排序 ID、score、`sourcePath`、`headingAnchor`、`chunkIndex`。
3. 用 gold ID 计算每题 Recall@10、Precision@10、MRR、nDCG@10，并按题集层分组；同时输出平均 chunk token、重复率、P95 延迟。
4. 设定发布门槛示例：总体 Recall@10 不低于基线、FAQ 层 MRR 不下降超过 0.02、Precision@10 不下降超过 0.05、P95 延迟增幅不超过 20%。门槛必须在看结果前写入评测配置。
5. 运行 `git diff --check` 与报告/JSON schema 校验；任何失败先记录，不得只报“关键词覆盖率变好了”。

### 6.3 失败案例记录

每个 miss 至少保存：`questionId`、策略、配置变体、gold chunk ID/grade、返回前 10 ID/rank/score、候选门槛、标题路径、是否跨块边界、是否表格/FAQ/code、失败原因标签（`boundary-split`、`missing-code-node`、`wrong-heading`、`threshold-filter`、`lexical-miss`、`vector-miss`、`duplicate-overlap`）及人工下一步。保留原始 JSON 与可复现查询时间；不要用截图或手工摘要替代机器可读证据。

## 7. 面向新手的最小验收清单

### 7.1 先验收 chunk 合同

- [ ] 同一文件 `chunkIndex` 从 0 连续递增，标题块有稳定 `headingAnchor`。
- [ ] 表格块重复表头，`tableRowStart/End` 连续且不拆行。
- [ ] 图片 URL 仅在 `imageUrls`，不在 content/embedding 输入。
- [ ] 明确记录 code fence 是否被保留；当前实现应标为“不进入 chunk”。
- [ ] overlap 的实际发生范围与 token 近似规则写入实验配置。

### 7.2 再验收检索指标

- [ ] 每题有 gold chunk 集合及 grade，不以关键词列表替代。
- [ ] 所有策略统一 `K=10`、候选门槛和去重规则。
- [ ] 同时报 Recall@10 与 Precision@10；单答案题加 MRR，多相关性题加 nDCG@10。
- [ ] 结果能从 `retrievedIds` 追溯到 `sourcePath/headingAnchor/chunkIndex`。
- [ ] 每次 A/B 运行保留题集版本、chunk 配置、模型版本、索引版本和原始 JSON。

### 7.3 结论口径

当前系统可以诚实地说“已实现词法/向量/hybrid 对比与关键词覆盖率基线”；在完成 gold 标注和 Top-10 排名计算前，不能说“Recall@10 达到 X%”。这条边界既符合 TREC 的判定式评测，也避免把易解释但不严格的代理指标包装成检索真值。

## 8. 参考资料

- [NIST TREC common evaluation measures（Precision/Recall 定义与计算）](https://trec.nist.gov/pubs/trec22/appendices/measures.pdf)
- [NIST TREC Question Answering data（MRR：首个正确答案倒数排名）](https://trec.nist.gov/data/qa.html)
- [Järvelin & Kekäläinen, “Cumulated Gain-based Evaluation of IR Techniques”, ACM TOIS 2002（nDCG 原始论文）](https://doi.org/10.1145/582415.582418)
- [SmallAliceWeb hybrid-search OpenSpec](../../openspec/specs/ai-rag/hybrid-search/spec.md)
- [SmallAliceWeb knowledge-sync OpenSpec](../../openspec/specs/ai-rag/knowledge-sync/spec.md)
