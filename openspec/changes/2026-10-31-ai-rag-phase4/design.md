## 1. Context

现状链路（01-current-state-audit §一/§二）：Cloudflare `@cf/baai/bge-m3` embedding（1024 维、批上限 100，`packages/ai-rag-api/server/providers/cloudflare-embedding.ts:1-3`）→ 词法全文检索（PostgreSQL FTS `ts_rank_cd` + pg_trgm，**非 BM25**，`packages/ai-rag-api/server/search/postgres-search.ts:53-58`）与 pgvector 余弦两路并行发起（`packages/ai-rag-api/server/search/hybrid-search.ts:54-58`）→ RRF k=60（`packages/ai-rag-core/src/rrf.ts:21`）→ parent 去重 → noop reranker 原序放行（`packages/ai-rag-api/server/reranker/noop-reranker.ts:3-15`）→ 截取 top 5（`packages/ai-rag-api/server/contracts/chat.ts:145`）→ 拼 system prompt → 按请求 provider 流式问答。知识源 `docs/docx/**/*.md`（约 290 个 md，被 `.gitignore:55` 忽略）经本地 CLI `rag:sync` 按 sha256 四元组增量同步（`packages/ai-rag-api/server/services/knowledge-sync.ts:206-212`），pg advisory lock 防并发（`knowledge-sync.ts:86`）。

检索评估引擎完整存在（01-current-state-audit §三）：`server/evaluation/` 五文件——三策略对比引擎（`evaluator.ts:98-135`）、确定性 IR 指标 recall/precision/MRR/NDCG@K（`retrieval-metrics.ts:26`）、版本化 JSONL 黄金集（`gold-set.ts:20-33`）、evaluation_runs 落库（`db/schema.ts:62-70`，datasetVersion=sha256 前 12 位，`runs-repository.ts:42-44`）、语料预检隔离（`corpus-preflight.ts`）；执行入口在 CLI（`rag:evaluate` dry/local/external，`scripts/run-rag-evaluation.ts:13`、`:52-80`），线上 API 只读。

三大核心短板（02-gap-analysis）：

1. **阈值拒答防线完全缺失**——`threshold|scoreThreshold|minScore` 全服务端零匹配；检索固定返回 top5 直拼 Prompt，拒答仅靠 Prompt 末段文字约束（`prompt-template.ts:14`）（02-gap-analysis Top 1）。
2. **reranker noop 半成品**——配置位齐全（`rag-runtime.ts:58-80`：mode/candidateLimit=20/maxInputTokens=2000/timeoutMs=800/maxCostUsd=0），默认 noop 原序放行，`llm-reranker.ts` 已实现但未激活（02-gap-analysis Top 4）。
3. **来源标注幻觉不可检测**——`chat.ts:153` 拼 Prompt 只传 content 数组，模型看不到 sourcePath；响应 DTO 的 sourceUrl/sourceHref/headingAnchor 齐全但模型标注的 [来源 N] 可能错位（02-gap-analysis Top 6）。

本设计承接 proposal.md 五段与 `03-upgrade-plan.md` 的 U0~U4 六要素（目标/前置/任务/验证/回滚/相容性）。

## 2. Goals / Non-Goals

**Goals:**

- **U0**：固化首份评估基线快照（含 git commit/datasetVersion/top_k 与 reranker 配置状态），黄金集增量补足至 20~50 条（≥20% 负样本、人工审核），新增查询向量本地缓存；全程只复用既有评估链路。
- **U1**：top_k/scoreThreshold 配置化 + 请求级覆盖 + 服务端 clamp + 阈值拒答路径（流式下成立）；sourcePath 进入模型上下文；前端引用锚点呈现补强。
- **U2**：真重排序激活——「扩召回 → 精排 → 过滤 → top_k」两阶段链路，env 开关默认 noop，预算门禁与灰度回滚。
- **U3**：查询改写按评估判据引入——Multi-Query 变体与原始查询一并 RRF；不默认上。
- **U4**：chunk 适性只读核实（切分单位/中文句读/表格策略/500-50 适性）；仅当结论要求才全量重同步，重索引置于一切之后。

**Non-Goals:**（与 proposal 第 4 节保持一致）

- 多模态/视觉检索不在本期（推第三期 #5504，图片仅 URL 元数据）。
- AI SDK v4→v5 迁移不在本期（独立 change ai-sdk-phase4，见 proposal 5.1 解耦决策）。
- 不建 CI 评估门禁（知识源 gitignored、CI 扫 0 文件，gotcha #5955；方案 C 边界）。
- 不引入 PGroonga/OpenSearch。
- 不更换 embedding 模型（bge-m3/1024 维为现状基线，`cloudflare-embedding.ts:1-2`）。
- 生成侧 LLM-as-Judge 指标不进本期（列为后续独立输入）。

## 3. Decisions

### 3.1 U0：评估基线固化与复用核实

**决策**：

- 复用清单（不重写）：`evaluation/evaluator.ts`（三策略对比引擎）、`evaluation/retrieval-metrics.ts`（recall/precision/MRR/NDCG@K，defaultKs=[5,10,30]）、`evaluation/gold-set.ts`（版本化 JSONL）、`evaluation/runs-repository.ts`（落库）、`scripts/run-rag-evaluation.ts`（dry/local/external 三模式 CLI）。
- 基线快照必含：时间戳、git commit、datasetVersion（sha256 前 12 位，`runs-repository.ts:42-44`）、配置状态（top_k、reranker mode）——用当前生产配置（noop 重排、top 5）固化首版 baseline。
- 黄金集增量补足：先盘点既有覆盖度，再增量至 20~50 条、含 ≥20% 负样本（沿用既有 unanswerable 设计，`gold-set.ts:32`），为阈值标定与拒答防线备数据；增量条目人工审核不可省略。
- 查询向量本地缓存：同一问题集重复评估命中缓存，重复运行近零额度消耗（#5720 纪律的技术兜底）。
- 明确不做：不接 CI 评估门禁；生成侧 LLM-as-Judge 指标不进本期。

**原因**：评估链路已完整存在且经逐文件读码核实非 stub（01-current-state-audit §三），U0 的价值是「跑通并固化」而非重建；基线是一切后续对照实验（U1 参数对照、U2 收益证明、U3 引入判据、U4 停止条件）的度量前提。

**回滚边界**：纯新增文件 + 只读检索调用，不碰检索链路、数据库 schema 与同步链路；回滚 = 还原 gold-set 增量 + 删除缓存/快照文件，生产链路零接触。

### 3.2 U1：检索参数参数化 + 引用溯源

**决策**：

- 配置化：top_k / scoreThreshold 接入 `rag-runtime.ts` 配置体系，env 命名对齐既有风格（`RAG_CHAT_TOP_K`、`RAG_SCORE_THRESHOLD`）；缺省 top_k=5（现状 `chat.ts:145`）、threshold 关闭。
- 请求级覆盖：`/v1/chat` 与 `/v1/search` 支持 body.topK / body.scoreThreshold，服务端 clamp（topK ∈ [1,20]、threshold ∈ [0,1]）；现状 retrieve 仅 `{limit}` 参数（`chat.ts:56`）。
- 阈值拒答路径：RRF 已产分数（`rrf.ts:13-59`），score < τ 的候选被过滤，全部低于 τ 时返回空并触发显式拒答文案；拒答在流式响应下以同样语义成立。
- sourcePath 进入模型上下文：Prompt 参考资料由纯 content 数组（`chat.ts:153`）改为带来源标注的形态（如 `[N] (sourcePath) content`），使「来源错误标注」类幻觉可检测。
- 前端补强：核实 `/v1/chat` 响应 sources 字段结构（ChatSourceDto 已含 sourceUrl/sourceHref/headingAnchor，`chat.ts:30-45`、`:144-162`），把答案内引用编号渲染为可点击锚点并展示来源标题与片段；缺什么补什么，不重写已有渲染。

**原因**：把「拍脑袋的 top 5」变成可实验参数，是 U0 基线得以被消费的前提；sourcePath 进上下文是零额度的纯生成侧改动，直接补齐第三短板；缺省=旧行为保证合并后生产零漂移。

**回滚边界**：缺省值=旧行为——出问题还原 env 或忽略请求参数即可；前端改动独立 revert，不影响 API。

### 3.3 U2：激活真重排序

**决策**：

- 两阶段链路：召回侧扩到 `rerankerCandidateLimit`（配置位已在 `rag-runtime.ts:58-80`，起步 10~20）→ 真重排 → 重排后阈值过滤 → 取 top_k；执行 `rerankerMaxInputTokens` 截断保护。
- env 开关 `RAG_RERANKER=noop|cloudflare|cohere`（默认 noop，命名对齐既有风格）；`noop-reranker.ts` 不删——它就是回滚开关；新适配器与 noop 同签名旁立新文件。
- 供应商按摩擦从低到高选型：A. Cloudflare Workers AI reranker（与 bge-m3 同栈、零新依赖，先核实平台模型与额度）；B. Cohere rerank-multilingual-v3.0（月 1000 次免费额度，代价是新增 API key 管理）；C. 自部署 BGE-Reranker（Vercel serverless 不现实，仅 A/B 均不可行才评估）。
- 双道阈值：召回侧初检过滤（减轻重排计算压力）+ 重排后精排过滤；重排后分数分布更合理、阈值可下调，具体值由标定决定，先不启用。
- 预算门禁：候选数检查、token 截断、timeoutMs、maxCostUsd 配置位全部激活生效。

**原因**：标尺实验数据下 Rerank 是 Faithfulness 提升最显著手段（+20%，02-gap-analysis Top 4）；配置位与 llm-reranker 实现已存在，属「配置激活 + 评估验证收益」而非从零建设；默认 noop 使灰度与回滚都有单一开关。

**回滚边界**：env 一键切回 noop；无 schema/索引变更，回滚零成本。

### 3.4 U3：查询改写按判据引入

**决策**：

- 触发判据：U0/U2 评估显示「检索正常但答案答非所问」的失效模式（Answer Relevancy 低于判据，参考线 0.7，02-gap-analysis Top 7）才动工；禁止跳过归因直接堆高级模式。
- Multi-Query：LLM 生成 3 个改写变体（temperature 稍高增多样性），变体与**原始查询一并**参与检索后 RRF 合并——这是对「改写丢失关键实体」风险的直接对策。
- env 开关默认关（检索侧延迟 3~4 倍 + 额度 ×k）；HyDE 备选仅当短查询占比高且 Multi-Query 收益不足时评估；MMR 多样性仅当 Top-K 同质化明显时评估。
- 前置：生成侧评估（LLM-as-Judge）已就绪——它是本期的后续独立输入，动工前需单独授权与立项。

**原因**：生成评估未落地前无法证明查询改写是当前真瓶颈；判据引入是对「盲目上高级模式」反模式的直接防御，Multi-Query 的延迟与丢实体风险使其必须默认关闭。

**回滚边界**：env 关闭即回 U2 行为；无 schema/索引变更。

### 3.5 U4：chunk 适性核实 + 重索引放最后

**决策**：

- 只读核实先行（逐项留证据）：切分单位与分隔符集合（01-current-state-audit §二 实测分句边界字符已含中文句读「。！？!?；;」，`markdown-chunk.ts:371-373`——仍需实证中文段落是否被切碎）；表格处理策略（tableRowsPerChunk=12，`markdown-chunk.ts:44`，大表格是否被拦腰切断）；500/50（`markdown-chunk.ts:42-43`）在 bge-m3 语义下的适性复核（标尺结论来自特定实验环境，不可直接照搬）。
- 仅当核实结论要求改切分，才改 `markdown-chunk.ts` 并走既有 `rag:sync` 全量重同步（方案 C 本地 CLI、non-pooled 连接串、串行执行、确认无并发同步），随后用 U0 问题集前后对照定去留。
- 收敛与停止条件：提升 < 2%、业务目标达成或成本超预算，即固化参数、关闭实验开关。

**原因**：重索引是全计划唯一生产级大改动，先查后动、单变量推进把风险压到最低；sha256 四元组增量机制（`knowledge-sync.ts:206-212`）使同步中断后可幂等修复。

**回滚边界**：参数类回滚 = env 还原；chunk 类回滚 = 切分代码 revert + 再次全量重同步（成本高，故先核实后动、重索引放最后）。

### 3.6 硬边界相容性总表

| #   | 硬边界                                                                                                                                                | 本 change 相容方式                                                                                                 |
| :-- | :---------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| 1   | 方案 C：本地 CLI rag:sync 直连 Neon 是唯一同步事实源，禁止 CI/GitHub Actions 侧同步（docs/docx 被 .gitignore，CI 扫 0 文件是已踩坑教训）。            | 全计划零同步逻辑改动；U4 重同步走既有 rag:sync 本地 CLI；评估为只读检索 + 本地脚本，不引入 CI 评估门禁。           |
| 2   | 多模态/视觉检索推第三期；图片仅 URL 元数据。                                                                                                          | 不含任何图片内容处理；U4 chunk 复核仅覆盖文本/表格。                                                               |
| 3   | 禁用 neonctl（统一官方 neon CLI）；Neon 资源固定 org-super-fog-48541962 / patient-cloud-43432277 / neon-smallalice-ai-rag，禁止新建第二个同用途资源。 | 不新建任何 Neon 资源；评估与重同步复用现有连接配置。                                                               |
| 4   | 禁止重建 vercel.json；文档站 Production 唯一由 remote main Git Integration 触发。                                                                     | 不创建/修改 vercel.json；上线动作 = 合并 main，由用户执行。                                                        |
| 5   | NITRO_SYNC_DATABASE_URL 必须 non-pooled（advisory lock 依赖独占连接）；同步不可并发。                                                                 | U4 重同步串行执行、non-pooled 连接串、执行前确认无并发同步。                                                       |
| 6   | 术语红线：PostgreSQL FTS 不得表述为 BM25，统一「词法全文检索 / PostgreSQL FTS」。                                                                     | 全文统一表述；实现层保持 ts_rank_cd 真实能力标注，不冒充 BM25。                                                    |
| 7   | 凡涉 Cloudflare 额度消耗的步骤，必须以「用户授权 + 额度检查」为前置。                                                                                 | U0 评估运行、U1 对照实验、U2 reranker 调用、U3 改写调用均标注【需授权+额度检查】，见第 4 节风险与第 5 节迁移计划。 |

## 4. Risks / Trade-offs

- **[Risk] Cloudflare 额度消耗失控**——历史评测曾因 HTTP 400 + 额度耗尽暂停（gotcha #5720）→ 所有额度步骤「用户授权 + 额度检查」前置（硬边界 7）；查询向量本地缓存使重复评估近零消耗；每轮额度消耗留档。
- **[Risk] threshold 过早开启反噬召回**——τ 过高会把可回答问题误杀为拒答 → 默认关闭；开启前用黄金集（含 ≥20% 负样本）按 F1 拐点标定并留档；U0 先在负样本问题上观察空检索路径。
- **[Risk] reranker 延迟与按次成本**——重排 20→5 量级约 2~3s，且每请求 1 次 rerank 调用 → 默认 noop；上线前流式首 token 延迟实测；超预算则下调 rerankerCandidateLimit 或保持 noop；双道阈值减轻重排压力。
- **[Risk] 重索引生产风险**——改切分触发全量重写 chunks → 只读核实先行、重索引置于一切之后、单变量推进；走 non-pooled + 串行 + advisory lock；中断靠 sha256 四元组增量幂等修复。
- **[Risk] 并发同步破坏数据**——两个同步同时执行会绕过对账语义 → advisory lock（`knowledge-sync.ts:86`）+ CLI 单实例双保险；执行前确认无并发同步。
- **[Trade-off] 灰度零漂移 vs 收益前置**——缺省=旧行为意味着全部收益需显式开启才兑现，换取的是合并零风险与一键回滚；这是有意的取舍而非遗漏。

## 5. Migration Plan

阶段依赖：U0 → U1 → U2 → U3 严格顺序；U4 依赖 U0/U1，重索引任务置于一切之后（03-upgrade-plan §四）。

1. **U0**：复用核实既有评估链路 → 黄金集增量补足（人工审核）→ 查询向量缓存 → `rag:evaluate` 跑通并固化首份基线快照。回滚：还原 gold-set 增量 + 删除新增文件，生产零接触。
2. **U1**：top_k/threshold 配置化 + 请求级覆盖 + clamp + 阈值拒答路径 + sourcePath 进上下文 + 前端锚点。回滚：缺省值=旧行为，还原 env 或忽略请求参数；前端独立 revert。
3. **U2**：reranker 适配器 + env 开关（默认 noop）→ 两阶段链路 → 延迟实测与 on/off 对照（需授权+额度检查）。回滚：env 一键切回 noop。
4. **U3**：生成评估就绪后按判据引入 Multi-Query（默认关，需授权+额度检查）。回滚：env 关闭即回 U2 行为。
5. **U4**：chunk 适性只读核实 → （仅当结论要求）改切分 + 全量重同步（串行、non-pooled、无并发，需用户授权窗口）→ 前后对照定去留 → 参数固化收敛。回滚：参数类 env 还原；chunk 类 revert + 再次全量重同步。

上线方式：各阶段代码经用户确认后合并 remote main，由 Git Integration 触发生产部署；agent 不执行本地 vercel deploy，不触碰 vercel.json（硬边界 4）。

## 6. Open Questions

1. threshold F1 拐点标定的方法细节：网格范围与步长（03-upgrade-plan 建议 0.50~0.95、步长 0.02）、负样本在 F1 中的计权方式、拒答文案口径——留执行期以 U0 黄金集实测后定。
2. reranker 供应商选型：复用 phase3 遗留的 `llm-reranker.ts` 雏形，还是接入外部服务（Cloudflare Workers AI / Cohere）——取决于开工时平台 reranker 模型可用性与额度核实结果。
3. U4 触发全量重同步的判据阈值：表格切断/中文段落破碎的证据要达到什么程度，才值得付出一次全量重索引成本——待只读核实结论产出后决策。
4. 前端引用锚点呈现的现状核实：sources 字段结构与现有渲染的差距以核实结果为准，补强范围届时圈定。
5. U3 前置的生成侧评估（LLM-as-Judge）形态与预算：作为后续独立输入，其模型选型、条数规模与额度上限在 U0/U2 数据就绪后单独立项确认。
