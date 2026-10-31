## 1. Why

SmallAliceWeb 的 RAG 生产链路（bge-m3/1024 维 embedding → 词法全文检索 + pgvector 两路并行 → RRF k=60 → top 5 → 流式问答）骨架完整，但存在三大核心短板：

1. **阈值拒答防线完全缺失**——`threshold|scoreThreshold|minScore` 全服务端零匹配，低质量检索结果直通生成，RAG 幻觉无闸门；拒答仅靠 Prompt 末段文字约束（`prompt-template.ts:14`），检索层没有防线（02-gap-analysis Top 1）。
2. **reranker 停留在 noop 半成品**——接口与配置位齐全（`packages/ai-rag-api/server/runtime/rag-runtime.ts:58-80`），默认实现为 noop 原序放行（`packages/ai-rag-api/server/reranker/noop-reranker.ts:3-15`），真重排序「激活即用」却未激活（02-gap-analysis Top 4）。
3. **来源标注幻觉不可检测**——`packages/ai-rag-api/server/contracts/chat.ts:153` 拼 Prompt 时只传 content 数组，模型看不到 [来源 N] 对应的 sourcePath，前端渲染的引用跳转指向错误文档也无人发现（02-gap-analysis Top 6）。

同时，检索评估引擎已完整存在（`server/evaluation/` 五文件 + 版本化 gold-set + `rag:evaluate` CLI，01-current-state-audit §三），但基线未固化、指标未被消费，导致后续一切优化的收益都无法证明。

本变更对标 `docs/plan/2026-10-30-learn-rag/` 学习档案的 P0~P4 方法论，但对标对象是「已有生产链路的存量系统」：**不重建流水线，只补短板**——评估复用既有链路、检索复用既有 RRF 结构、重排序复用既有配置位、同步复用既有方案 C，按 U0~U4 五阶段渐进推进，每一步缺省行为与现状一致。

## 2. What Changes

- **U0 评估基线固化与复用核实**：复用既有评估链路（`server/evaluation/` 五文件 + `rag:evaluate` CLI 的 dry/local/external 三模式），禁止从零重建评估器；固化首份基线报告（含 git commit、datasetVersion、top_k/reranker 配置状态快照）；gold-set 黄金集增量补足至 20~50 条（含 ≥20% 负样本，人工审核不可省略）；新增查询向量本地缓存（#5720 额度纪律的技术兜底）。
- **U1 检索参数参数化 + 引用溯源**：top_k / scoreThreshold 接入 rag-runtime 配置体系（env 命名对齐 `RAG_CHAT_TOP_K` / `RAG_SCORE_THRESHOLD` 风格），缺省值=旧行为（top_k=5、threshold 关闭）；`/v1/chat` 与 `/v1/search` 支持请求级 body.topK / body.scoreThreshold 并服务端 clamp；全低于阈值时走显式拒答文案路径（流式下成立）；sourcePath 进入模型上下文（来源标注可检测）；前端引用编号锚点呈现补强。
- **U2 激活真重排序**：补成「扩召回（rerankerCandidateLimit）→ 真重排 → 重排后阈值过滤 → top_k」两阶段链路；env 开关默认 noop，noop-reranker 保留为灰度/回滚开关；reranker 供应商按摩擦从低到高选型（Cloudflare / Cohere / 自部署），全部授权与额度检查前置。
- **U3 查询改写按判据引入**：Multi-Query 变体与原始查询一并参与检索后 RRF 合并（防关键实体丢失）；仅当 U0/U2 评估显示「检索正常但答案答非所问」的失效模式（Answer Relevancy 低于判据）才启用；env 开关默认关。
- **U4 chunk 适性核实 + 重索引放最后**：对 `markdown-chunk.ts` 的切分单位、中文句读、表格策略与 500/50 在 bge-m3 下的适性做**只读核实**（逐项留证据）；仅当核实结论要求改切分时，才改切分并走既有 `rag:sync` 全量重同步（方案 C、non-pooled、串行）——重索引是全计划唯一大改动，置于一切之后。

## 3. Capabilities

### New Capabilities

（无——本变更不引入新能力，全部在既有能力上补短板。）

### Modified Capabilities

- `openspec/specs/ai-rag/rag-evaluation/spec.md`：U0 基线固化纪律（快照含 git commit/datasetVersion/配置状态）、黄金集增量补足（20~50 条含 ≥20% 负样本、人工审核）、查询向量本地缓存。
- `openspec/specs/ai-rag/chat-api/spec.md`：U1 请求级 topK/scoreThreshold + 服务端 clamp + 阈值拒答路径（流式下成立）；缺省值=旧行为。
- `openspec/specs/ai-rag/source-citation/spec.md`：U1 sourcePath 进入模型上下文（来源标注可检测）+ 前端引用锚点呈现补强。
- `openspec/specs/ai-rag/hybrid-search/spec.md`：U1 top_k/threshold 配置化接入；U3 查询改写（Multi-Query 变体与原始查询一并 RRF，按评估判据触发）。
- `openspec/specs/ai-rag/reranker/spec.md`：U2 真重排序激活（env 开关默认 noop、预算门禁、灰度回滚）。
- `openspec/specs/ai-rag/knowledge-sync/spec.md`：U4 chunk 适性只读核实流程 + 有条件全量重同步边界。

## 4. Impact

- **代码**：`packages/ai-rag-api`——`server/contracts/chat.ts`（top 5 硬编码与 Prompt 组装，`:145`、`:153`）、`server/runtime/rag-runtime.ts`（配置体系，reranker 配置位 `:58-80`）、`server/search/hybrid-search.ts`（候选扩量与多查询合并入口）、`server/reranker/`（旁立新适配器文件，不删 noop）、`server/routes/v1/`（chat/search 参数面）；`packages/ai-rag-core`——`src/markdown-chunk.ts`（唯一可能的重切点，U4 先只读核实）。前端 app 侧引用渲染组件核实后定位，缺什么补什么。
- **配置**：新增 env 遵循既有 `RAG_*` 命名风格（如 `RAG_CHAT_TOP_K`、`RAG_SCORE_THRESHOLD`、`RAG_RERANKER`），一切缺省值等于当前生产行为。
- **评估产物**：gold-set 版本化 JSONL 增量、首份基线评估报告（落库 evaluation_runs + JSONL 存档）、reranker/查询改写 on/off 对照记录、ExperimentLog 实验记录。
- **非目标**：多模态/视觉检索不在本期（推第三期，#5504，图片仅 URL 元数据）；AI SDK v4→v5 迁移不在本期（独立 change `ai-sdk-phase4`，见 5.1）；不建 CI 评估门禁；不引入 PGroonga/OpenSearch；不更换 embedding 模型（bge-m3/1024 维为现状基线，`cloudflare-embedding.ts:1-2`）。

## 5. Decision Record

### 5.1 本 change 定位解耦：ai-rag-phase4 与 ai-sdk-phase4 不得混合执行（2026-10-31）

**决策**：ai-rag-phase4 定位为 RAG 质量闭环升级，只动检索、评估、重排与参数面；phase3 决策记录 5.2 预留的 AI SDK v4→v5 迁移是另一个独立 change（ai-sdk-phase4），两者不得混合执行、不得同时验证。

**原因**：RAG 质量改动与 SDK 大版本迁移的验收维度完全不同——前者看检索指标与答案质量，后者动流式协议、消息结构与双 provider 传输。混合执行会把「检索变差」与「协议迁移引入」两类失效搅在一起，无法归因。

**触发条件**：仅当用户显式发起 ai-sdk-phase4 变更并单独批准时才进入 SDK 迁移；任何 ai-rag-phase4 任务不得携带 `ai` / `@ai-sdk/*` 依赖升级。

**被否决的替代方案**：在本期顺带升级 AI SDK；把 RAG 升级与 SDK 迁移合并为一个 change。

### 5.2 灰度策略：一切新参数缺省=旧行为（2026-10-31）

**决策**：所有新引入参数的缺省值严格等于当前生产行为——top_k=5（`contracts/chat.ts:145` 现状）、scoreThreshold 关闭、reranker noop（`noop-reranker.ts:3-15` 现状）、查询改写关闭。生产合并后行为零漂移；threshold 开启的前置条件是用黄金集（含负样本）按 F1 拐点标定，禁止拍脑袋。

**原因**：阈值、重排、改写都会改变线上答案形态；缺省=旧行为使每次合并都是纯增量，任何一项出问题只需还原 env 或忽略请求参数即可回滚，无需回退代码。

**触发条件**：threshold 从「关闭」切「开启」必须同时满足——黄金集含 ≥20% 负样本、F1 拐点标定完成并留档；reranker 从 noop 切换需 U0 基线 on/off 对照收益成立且用户完成额度授权。

**被否决的替代方案**：合并即默认开启新参数；直接采用经验参考值（如 BGE-M3 起点 0.7，02-gap-analysis Top 1）作为生产阈值。

### 5.3 评估复用决策：只复用既有评估链路，禁止从零重建（2026-10-31）

**决策**：U0 只复用既有评估链路——`server/evaluation/` 五文件（evaluator / retrieval-metrics / gold-set / runs-repository / corpus-preflight）+ `rag:evaluate` CLI（dry/local/external 三模式），禁止从零重建评估器；生成侧 LLM-as-Judge 类指标（Faithfulness / Answer Relevancy）列为后续独立输入，不进本期。

**原因**：既有评估链路经逐文件读码核实为完整实现而非 stub（三策略对比 + Recall/Precision/MRR/NDCG@K 纯 TS + 版本化 JSONL 黄金集 + evaluation_runs 落库，01-current-state-audit §三），从零重建是无谓的重复建设；生成侧指标需 LLM 调用，叠加 #5720 的 Cloudflare 额度教训，须独立立项控规模。

**触发条件**：仅当既有链路被证实无法产出 U1~U4 所需的可比指标口径（某类指标结构性缺失且无法增量补齐）时，才允许立项重建评估器，且需先出独立设计。

**被否决的替代方案**：重写一套新评估器；本期直接引入 Python RAGAS 桥或 LLM-as-Judge 生成侧指标。
