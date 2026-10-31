## 0. 长任务执行约定（do-long-task 纪律，接手 agent 必读）

> 本 change 设计为「未来独立启动 agent 接手推进」。本节是执行本任务包的强制纪律总纲，源自全局技能 do-long-task（`~/.agents/skills/do-long-task/`，含 `AGENT_LONGTASK.md` 与 `references/`）。§0 只有约定、无可勾选任务；可执行任务从 §1 开始。

### 0.1 接手读取顺序

1. 全局 do-long-task 技能：`AGENT_LONGTASK.md` + 按场景选读 `references/execution-discipline.md`、`openspec-task-source.md`、`verification-and-failure.md`。
2. 项目级 OpenSpec 技能 `.agents/skills/openspec-*/SKILL.md`（项目规则优先于外部分发规则）。
3. 本 change 工件链：`proposal.md` → `design.md` → `specs/ai-rag/*/spec.md` → 本文件。
4. 扫描工作区错位的 `agent-progress.md` / `agent-findings.md`：规范位置仅限具体 active/archive change 根目录；发现错位先警告用户并迁移合并，无法唯一归属则暂停询问。
5. 本 change 根目录的 `agent-progress.md` / `agent-findings.md`（已随任务包预建初始版本，接手后按任务 1.1/1.2 核对并持续维护）。

### 0.2 唯一任务源与动态补全

- 本文件是唯一任务源。禁止另建第二套任务清单，禁止把聊天 checklist 或子代理报告当任务源。
- 每次只处理一个任务。执行中发现遗漏，先回写本文件再继续；改变用户可见行为先同步 `specs/`，改变技术路线先同步 `design.md`。
- 开始新任务前、上下文压缩恢复后、连续失败 2 次后、勾选 `[x]` 前，重读本文件与两个固定产物（fresh context 纪律）。

### 0.3 固定产物与证据落点

- `agent-progress.md`（≤40 行覆盖式快照，字段见 1.1）与 `agent-findings.md`（≤80 行 / 20 条去重，状态仅 active/superseded/resolved，格式见 1.2）固定在本 change 根目录，不移动、不改名、不日期化。
- 过程证据一律落 `evidence/` 子目录，命名 `YYYY-MM-DD-*.{json,log,md}`（各任务条目已指定文件名模板，`YYYY-MM-DD` 替换为执行当日日期）；change 根目录禁止散放其他 markdown。
- `proposal.md`、`design.md`、`tasks.md`、`specs/` 不移动、不改名、不日期化。

### 0.4 勾选、验证与授权纪律

- 勾选 `[x]` 的充要条件：实现完成 + 验收满足 + 验证命令通过（或替代验证已明确记录）+ 无未解决 CRITICAL。验证结果写入 `agent-progress.md`。验证命令不存在时记录「不可用」，禁止伪造通过。
- 每完成一个 checkpoint：覆盖更新 `agent-progress.md`，并对 `agent-findings.md` 去重清理；失败路径、连续失败、已排除方案必须写入 `agent-findings.md`。
- 连续 3 次同类失败、权限问题、破坏性风险、产品决策问题或需求冲突：停止并输出 BLOCKED 报告（当前任务 / 已尝试路径 / 失败证据 / 需要用户决策什么）。
- 标注【需授权】/【需授权+额度检查】的任务必须先获用户显式授权并核对 Cloudflare 额度余量，禁止擅自执行。
- 未经用户授权不执行 `git commit` / `vercel deploy`；Production 只由用户合并 remote main 触发 Git Integration（见 6.4 与 design §3.6 边界 4）。

### 0.5 停止条件

全部任务勾选且 §6 验收通过；或真正阻塞且已按 0.4 输出 BLOCKED 报告。

### 0.6 接手提示词（可直接粘贴给新 agent）

```markdown
/goal 执行 OpenSpec change：`openspec/changes/2026-10-31-ai-rag-phase4/tasks.md`（仓库根：SmallAliceWeb）。

目标：持续完成 tasks.md 中所有未完成任务，直到全部 `[x]`、关键验收有测试或明确验证记录，并在 agent-progress.md 写最终总结。

开始前先读取：

1. 全局 do-long-task 技能 AGENT_LONGTASK.md 与 references/execution-discipline.md、openspec-task-source.md、verification-and-failure.md
2. 项目级 OpenSpec 技能 .agents/skills/openspec-\*/SKILL.md（项目规则优先）
3. 本 change 的 proposal.md、design.md、specs/ai-rag/\*/spec.md、tasks.md §0 执行约定、agent-progress.md、agent-findings.md

执行规则：

- 只以 tasks.md 为唯一任务源，每次只处理一个 task；发现遗漏先回写 tasks.md；改用户可见行为先同步 specs/，改技术路线先同步 design.md。
- agent-progress.md / agent-findings.md 只能位于本 change 根目录；启动、恢复、完成前扫描错位文件，先警告并迁移合并，无法唯一归属则暂停询问。
- 固定产物不移动、不改名、不日期化；过程证据只落 evidence/YYYY-MM-DD-\*；change 根目录不散放 markdown。
- agent-progress.md ≤40 行覆盖式快照；agent-findings.md ≤80 行/20 条去重（active/superseded/resolved），只做摘要索引。
- 标注【需授权】/【需授权+额度检查】的任务先获用户显式授权并核对 Cloudflare 额度；未经用户授权不 git commit、不 vercel deploy。
- 修改后运行任务条目内的验收命令（vitest / typecheck / openspec validate --strict 等）；验证通过才勾选 [x]。
- 连续 3 次同类失败、权限/破坏性/产品决策/需求冲突时停止并输出 BLOCKED 报告。

停止条件：全部任务完成并验证通过；或无法继续且已记录阻塞原因、失败证据与下一步建议。
```

## 1. 试点批次：U0 评估基线固化与复用核实

- [ ] 1.1 [验证] openspec/changes/2026-10-31-ai-rag-phase4/agent-progress.md - 核对已随任务包预建的初始快照：七字段齐全（当前 checkpoint、当前 task、状态、最近验证、阻塞点、下一步、最多 3 个证据索引）、行数 ≤ 40；接手后从首个 task 起每完成一个 checkpoint 覆盖更新一次（do-long-task 纪律，禁止追加流水）。验收：文件存在、行数 ≤ 40、七字段齐全，且接手后首个 checkpoint 已覆盖更新。
- [ ] 1.2 [验证] openspec/changes/2026-10-31-ai-rag-phase4/agent-findings.md - 核对已随任务包预建的持久发现索引：含条目格式说明、首批 3 条 active 发现（阈值缺失 / reranker noop / sourcePath 缺失）与固定约束节；接手后去重维护（条目含编号、active/superseded/resolved 状态、影响阶段），禁止流水账。验收：文件存在且含格式说明与首批条目，接手后新发现按格式追加或更新。
- [ ] 1.3 [验证] packages/ai-rag-api/server/evaluation/evaluator.ts、retrieval-metrics.ts、gold-set.ts、runs-repository.ts、corpus-preflight.ts 与 packages/ai-rag-api/scripts/run-rag-evaluation.ts - 复用核实（只复用不重建）：逐文件盘点三策略对比引擎（lexical/vector/hybrid，词法路为 PostgreSQL FTS 词法全文检索）、IR 指标（recall/precision/MRR/NDCG@K）、黄金集 JSONL 解析、evaluation_runs 落库与 CLI 入口（dry/local/external）的调用方式，结论写入 agent-findings.md。验收：在 packages/ai-rag-api 执行 `pnpm run rag:evaluate`（dry 模式）跑通并输出指标骨架；findings 含复用核实条目；术语红线全程生效——PostgreSQL FTS 不得表述为 BM25（design §3.6 边界 6）。
- [ ] 1.4 [验证] packages/ai-rag-api/data/rag-gold-set.jsonl - 盘点既有版本化黄金集：条数、负样本（unanswerable / hard negatives）占比、version/split/corpusSnapshot 字段完整性，缺口结论写入 agent-findings.md。验收：findings 含盘点数字与是否需补足的判断。
- [ ] 1.5 [修改] packages/ai-rag-api/data/rag-gold-set.jsonl - 在既有格式上增量补足至 20~50 条、负样本 ≥20%（沿用既有 unanswerable 设计，为 U1 阈值标定与拒答防线备数据），增量条目逐条人工审核，禁止从零重建。验收：`pnpm vitest run tests/gold-set.test.ts`（cwd=packages/ai-rag-api）全绿。
- [ ] 1.6 [新增] packages/ai-rag-api/server/evaluation/query-vector-cache.ts - 查询向量本地持久缓存模块（key = embedding 模型名 + 查询文本 sha256），注入 evaluator / run-rag-evaluation 复用，避免重复 Cloudflare embedding 调用（#5720 额度纪律的技术兜底）。验收：同问题集二次运行时 embedding 调用数为 0（对比两次运行的额度消耗日志）。
- [ ] 1.7 [执行] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u0-baseline-snapshot.json - 【需授权+额度检查】获用户授权并核对 Cloudflare 额度余量后，在 packages/ai-rag-api 执行 `pnpm run rag:evaluate`（local 模式）对黄金集全量跑通，固化首份基线快照：时间戳、git commit、datasetVersion（sha256 前 12 位）、配置状态（top_k=5、reranker=noop/disabled、阈值关闭）与 recall/precision/MRR/NDCG@K 指标。验收：JSON 可解析且四要素齐全；evaluation_runs 落库成功（失败仅 warn 时在 agent-findings.md 记原因）。
- [ ] 1.8 [验证] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u0-cache-reproducibility.log - 【需授权+额度检查】同问题集二次运行 rag:evaluate：指标与首跑一致（1.6 缓存生效、结果可复现）、embedding 调用近零；同时记录负样本问题触发空检索路径的观察（为 U1 阈值/拒答备观察数据，同步 agent-findings.md）。验收：两次指标 diff 为空，日志含额度消耗记录。
- [ ] 1.9 [验证] openspec/changes/2026-10-31-ai-rag-phase4/agent-findings.md - 记录边界决策「不接入 CI 评估门禁」：知识源 docs/docx 被 gitignore、CI 不可见（gotcha #5955）；方案 C 本地 CLI rag:sync 直连 Neon 是唯一同步事实源、禁 CI/GA 侧同步（#5965/#6149）。验收：findings 有该条目，且本期无任何 CI workflow / 门禁代码改动。
- [ ] 1.10 [新增] packages/ai-rag-api/data/rag-experiment-log.jsonl - 建立 ExperimentLog 结构化实验日志（每次实验逐行记录：改动内容 / 前后指标 / 提升幅度 / 结论 保留|回退|继续；JSONL 随仓库管理），U1~U4 每轮调优实验（2.9 / 3.7 / 4.6 / 5.6）均写入本文件，每次调优前先拍基线快照（与 1.7 纪律衔接）。验收：文件存在且含字段说明与首条 U0 基线记录；后续实验记录可在本文件追溯。

## 2. 主体任务：U1 检索参数参数化 + 引用溯源

- [ ] 2.1 [验证] packages/ai-rag-api/server/contracts/chat.ts - 核实问答检索现有参数面（:144-162 的 top 5 硬编码、threshold 是否已存在）与 /v1/search 侧（packages/ai-rag-api/server/routes/v1/search.post.ts、packages/ai-rag-api/server/contracts/schemas.ts）是否已支持 topK 覆盖；同时核实响应 sources 字段结构与前端渲染链（packages/ai-vitepress-plugins/src/client/composables/useKnowledgeChat.ts → AiChatVitePressShell.vue、packages/ai-vue/src/components/ai-chat/AiChat.vue），结论写入 agent-findings.md。验收：findings 含 API 参数面与前端 sources 渲染现状两份清单。
- [ ] 2.2 [修改] packages/ai-rag-api/server/runtime/rag-runtime.ts - 接入 RAG_CHAT_TOP_K / RAG_SCORE_THRESHOLD env 配置（命名与现有风格对齐），缺省值 top_k=5、threshold 关闭——缺省=旧行为，保证合并后生产行为不变。验收：packages/ai-rag-api/tests/runtime-config.test.ts 增补缺省回归用例并通过。
- [ ] 2.3 [修改] packages/ai-rag-api/server/routes/v1/chat.post.ts、packages/ai-rag-api/server/routes/v1/search.post.ts（含 packages/ai-rag-api/server/contracts/chat.ts 与 packages/ai-rag-api/server/contracts/schemas.ts 的 zod schema）- 支持请求级覆盖 body.topK / body.scoreThreshold，服务端 clamp：topK ∈ [1,20]、threshold ∈ [0,1]，越界取边界值。验收：packages/ai-rag-api/tests/contracts.test.ts 覆盖 topK=10 生效、topK=100 与非法值被 clamp、threshold 越界用例并全绿。
- [ ] 2.4 [修改] packages/ai-rag-api/server/runtime/rag-assembly.ts、packages/ai-rag-api/server/context/prompt-template.ts - 阈值拒答文案路径：检索分数全部低于 threshold 时返回空并走显式拒答文案，流式响应下同样成立；默认关闭，正式启用待 U4 以黄金集（含 ≥20% 负样本）F1 拐点标定。验收：threshold 开启时负样本问题返回拒答文案的用例通过（流式与非流式各一）。
- [ ] 2.5 [修改] packages/ai-rag-api/server/context/prompt-template.ts - sourcePath 进入模型上下文：buildSystemPrompt 的 sources 从纯 content 数组改为 `[N] (sourcePath) content` 形态，packages/ai-rag-api/server/contracts/chat.ts 的传参同步调整，使模型引用编号可对准真实来源路径。验收：packages/ai-rag-api/tests/prompt-template.test.ts 增补来源标注用例并通过。
- [ ] 2.6 [修改] packages/ai-vue/src/components/ai-chat/AiChat.vue 与 packages/ai-vitepress-plugins/src/client/components/AiChatVitePressShell.vue（以 2.1 核实落点为准，至少覆盖实际承载 sources 渲染的组件）- 前端引用锚点渲染：答案内引用编号渲染为可点击锚点，展示来源标题与片段，点击经 sourceUrl/headingAnchor 跳转；缺什么补什么，不重写已有渲染。验收：人工点检锚点可达来源片段，证据存 openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u1-citation-anchor.log。
- [ ] 2.7 [修改] packages/ai-rag-api/tests/runtime-config.test.ts、packages/ai-rag-api/tests/contracts.test.ts、packages/ai-rag-api/tests/prompt-template.test.ts 与 packages/ai-vitepress-plugins/src/tests/use-knowledge-chat.test.ts - U1 回归测试汇总：env 缺省行为不变、clamp 边界、来源标注格式、前端 sources 消费不破坏。验收：相关包 `pnpm run test` 全绿。
- [ ] 2.8 [验证] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u1-default-regression.log - env 缺省下本地 dev 请求 /v1/chat（不带 body 参数），行为与改动前一致（回归）；再验证 body.topK=10 生效、topK=100 被 clamp。验收：日志含前后对照的请求/响应证据。
- [ ] 2.9 [执行] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u1-topk-comparison.json - 【需授权+额度检查】用 U0 基线问题集跑 top_k ∈ {5,8,10} 参数对照（走 1.6 缓存），输出各档 recall/MRR/NDCG 对照与推荐档位。验收：JSON 三档指标齐全，结论写入 agent-findings.md。

## 3. 主体任务：U2 激活真重排序

- [ ] 3.1 [验证] openspec/changes/2026-10-31-ai-rag-phase4/agent-findings.md - Reranker 选型核实（摩擦从低到高）：A. Cloudflare Workers AI reranker（与 bge-m3 同栈、零新依赖，先核实平台可用 reranker 模型与计费额度）；B. Cohere rerank-multilingual-v3.0（每月 1000 次免费额度，代价是新增 API key 管理）；C. 自部署 BGE-Reranker（Vercel serverless 不现实，仅 A/B 均不可行才评估）。【需授权+额度检查】验收：findings 含选型结论与额度核实记录。
- [ ] 3.2 [修改] packages/ai-rag-api/server/runtime/rag-runtime.ts - 注册 env 开关 RAG_RERANKER=noop|<选型 provider>（默认 noop，灰度与回滚都靠此开关），激活既有 reranker 配置位（candidateLimit 起步 10~20、rerankerMaxInputTokens、timeoutMs、maxCostUsd）。验收：packages/ai-rag-api/tests/runtime-config.test.ts 覆盖默认 noop 与配置解析用例。
- [ ] 3.3 [新增] packages/ai-rag-api/server/reranker/<provider>-reranker.ts - 文件名按 3.1 选型落定（如 cloudflare-reranker.ts / cohere-reranker.ts），与 noop-reranker.ts 同签名实现 Reranker 接口：调用失败返回 status=failed 并由管线回退 RRF 原序；预算门禁齐备（rerankerMaxInputTokens 截断、timeoutMs 超时、maxCostUsd 超限跳过）。验收：typecheck 通过，接口与 noop 完全兼容（不制造不存在的 chunk id）。
- [ ] 3.4 [修改] packages/ai-rag-api/server/runtime/rag-assembly.ts、packages/ai-rag-api/server/search/hybrid-search.ts - 两阶段管线接线：召回侧扩到 rerankerCandidateLimit → 真重排序 → 重排后阈值过滤 → 截取 top_k；hybrid-search 按需暴露候选分数/扩召回入口；双道阈值（召回侧初检 + 精排后过滤）落位，具体阈值值待 U4 标定、先不启用。验收：RAG_RERANKER=noop 时链路输出与 U0 基线一致。
- [ ] 3.5 [修改] packages/ai-rag-api/tests/reranker.test.ts、packages/ai-rag-api/tests/runtime-assembly.test.ts - 测试覆盖：默认 noop 回归、reranker 失败回退 RRF 原序、预算（token/超时/成本）跳过路径、失败原因与敏感信息不泄漏。验收：`pnpm vitest run tests/reranker.test.ts tests/runtime-assembly.test.ts`（cwd=packages/ai-rag-api）全绿。
- [ ] 3.6 [验证] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u2-noop-regression.json - RAG_RERANKER=noop 回归：U0 问题集全量评估，指标与 U0 基线一致。验收：两次指标 diff 为空，JSON 留档。
- [ ] 3.7 [执行] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u2-reranker-comparison.json - 【需授权+额度检查】reranker on/off 对照：U0 问题集 MRR/NDCG 前后对比 + ≥5 条 bad case 前后留档 + 流式问答首 token 延迟实测（重排 20→5 量级参考 2~3s，超预算则下调 rerankerCandidateLimit）。验收：JSON 含指标、bad case、延迟与额度消耗记录。
- [ ] 3.8 [验证] openspec/changes/2026-10-31-ai-rag-phase4/agent-findings.md - 收益判据任务：若对照显示收益不足（MRR/NDCG 无显著提升、延迟超预算或成本超限），RAG_RERANKER 保持默认 noop 并记录判据数据；达标则给出推荐配置。验收：findings 含「保留 | 回退 | 继续」结论与数据依据。

## 4. 主体任务：U3 查询改写

- [ ] 4.1 [验证] openspec/changes/2026-10-31-ai-rag-phase4/agent-findings.md - 前置判据核实：以 U0 基线与 U2 对照评估证明存在「基线召回不足 / 检索正常但答案相关性差」类失效才动工，禁止跳过归因直接堆策略；判据不成立则本节后续任务全部标记 blocked 并注明理由。验收：findings 含判据数据与 go/no-go 结论。
- [ ] 4.2 [新增] packages/ai-rag-api/server/query-rewrite/multi-query.ts - Multi-Query 变体实现（与 reranker 同层）：LLM 生成 3 个改写变体（temperature 稍高增多样性），变体生成失败回退原始查询；env 开关 RAG_QUERY_REWRITE=off|multi-query（默认 off——延迟 3~4 倍与额度 ×k 只在显式启用时付出）。验收：typecheck 通过，开关缺省时该模块不参与检索链路。
- [ ] 4.3 [修改] packages/ai-rag-api/server/search/hybrid-search.ts - 变体与原始查询一并参与检索后 RRF 合并（防改写丢失关键实体），复用既有 fuseRankings 融合逻辑。验收：单测验证原始查询始终进入融合、含编号/型号的问题变体不丢原始关键实体。
- [ ] 4.4 [修改] packages/ai-rag-api/server/runtime/rag-runtime.ts - 接入改写配置（开关、变体数、temperature），缺省全部关闭。验收：packages/ai-rag-api/tests/runtime-config.test.ts 增补缺省关闭用例并通过。
- [ ] 4.5 [新增] packages/ai-rag-api/tests/multi-query.test.ts - 覆盖默认关闭回归、变体生成失败回退原始查询、原始查询必进 RRF、关键实体保留。验收：`pnpm vitest run tests/multi-query.test.ts`（cwd=packages/ai-rag-api）全绿。
- [ ] 4.6 [执行] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u3-multi-query-comparison.json - 【需授权+额度检查】开关开启前后对照评估（U0 问题集 + 生成侧相关性指标如已就绪），记录延迟实测（检索侧 ×4 量级预期）；收益不足则开关保持默认 off。验收：JSON 含前后指标与 go/no-go 结论，结论写入 agent-findings.md。
- [ ] 4.7 [验证] openspec/changes/2026-10-31-ai-rag-phase4/agent-findings.md - HyDE / MMR 备选判据记录（与 4.1 共用同一 go/no-go 判据机制）：HyDE 仅当短查询占比高且 Multi-Query（4.6）收益不足时评估——先出设计再【需授权+额度检查】再动工；MMR 仅当 Top-K 同质化明显时评估（fetchK=3~5 倍、λ=0.5 起步）。判据不成立则在 findings 写明豁免结论，不阻塞本 change。验收：findings 含 HyDE/MMR 触发判据与「评估 | 豁免」明确结论。

## 5. 主体任务：U4 chunk 适性核实与重索引（置于一切之后）

- [ ] 5.1 [验证] packages/ai-rag-core/src/markdown-chunk.ts - 只读核实（不改切分代码）：表格策略（tableRowsPerChunk=12 是否拦腰切断大表）、中文分句边界（句读字符集是否覆盖中文段落、是否被英文句号/换行切碎）、500/50 在 bge-m3 语义下的适性；仅覆盖文本/表格，不涉图片内容处理（多模态属第三期）。产出核实报告 → openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u4-chunk-aptitude-report.json。验收：报告含逐项证据（文件:行号 + 抽样 chunk 实例）。
- [ ] 5.2 [验证] openspec/changes/2026-10-31-ai-rag-phase4/agent-findings.md - 判据任务：依据 5.1 报告判定是否触发全量重同步（中文段落被切碎或表格被切断的证据成立才触发）；不触发则 5.3/5.4 标记 skipped 并记录理由。验收：findings 含 go/no-go 判据与证据引用。
- [ ] 5.3 [修改] packages/ai-rag-core/src/markdown-chunk.ts、packages/ai-rag-core/tests/markdown-chunk.test.ts - 仅当 5.2 判据成立：调整切分策略（如表格整块不切/按表独立 chunk、补齐中文句读边界），保持 parentId/headingAnchor/imageUrls 既有合同不破坏；单变量推进。验收：markdown-chunk 测试全绿；【需授权+额度检查】U0 黄金集在本地临时语料上对照无回归（走 1.6 缓存）。
- [ ] 5.4 [执行] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u4-full-resync.json - 仅当 5.2 判据成立且四条件缺一不可：①串行执行 ②NITRO_SYNC_DATABASE_URL 使用 non-pooled 连接串（advisory lock 依赖独占连接）③用户显式授权【需授权】④执行前经 /v1/knowledge/sync-runs 确认无并发同步；走既有 rag:sync（packages/ai-rag-api/scripts/rag-sync.ts，方案 C 直连 Neon 唯一同步事实源，禁 CI/GA 侧同步）；Neon 资源固定 org-super-fog-48541962 / patient-cloud-43432277 / neon-smallalice-ai-rag，禁 neonctl（统一官方 neon CLI）、禁新建第二个同用途资源。验收：JSON 记录六计数器（scanned/unchanged/created/updated/deleted/written）与 failedFiles；中断后靠 sha256 四元组增量幂等修复。
- [ ] 5.5 [验证] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u4-production-verification.json - 生产验证：请求生产域名 smallalice-docs-ai-nitro-api.ruan-cat.com 的 /v1/search 与 /v1/chat 抽样问题；HTTP 200 不算通过，必须验证检索质量（目标来源进入结果、负样本不误召回）与来源指向（sourcePath/headingAnchor 指向正确页面章节）。验收：JSON 含逐题质量判定；不达标不得关闭本节。
- [ ] 5.6 [验证] openspec/changes/2026-10-31-ai-rag-phase4/evidence/YYYY-MM-DD-u4-convergence.json - 收敛固化：U1 阈值标定（threshold 0.50~0.95 网格、黄金集含 ≥20% 负样本、取 F1 拐点，数据驱动不拍脑袋）+ U0 全量评估回归（指标不低于基线 90%）+ 参数固化结论（提升 <2% 或达成业务目标或成本超预算即停止）。验收：JSON 含标定要点与最终参数；RAG_SCORE_THRESHOLD 是否启用、reranker/改写开关去留结论写入 agent-findings.md。

## 6. 验收与证据固化

- [ ] 6.1 [验证] openspec/changes/2026-10-31-ai-rag-phase4/evidence/ - 审计各阶段验证记录均已落 evidence/YYYY-MM-DD-\*.json|.log（U0 基线/复现、U1 回归/对照、U2 回归/对照、U3 对照、U4 核实/重同步/生产验证/收敛），并在 agent-progress.md 登记最新 ≤3 个证据索引。验收：任一已勾选任务都能在 evidence/ 或 agent-findings.md 找到对应产物。
- [ ] 6.2 [验证] openspec/changes/2026-10-31-ai-rag-phase4/tasks.md - 对照 openspec/changes/2026-10-31-ai-rag-phase4/specs/ 与 design.md 逐项审计勾选状态：无证据的任务不得勾选，发现遗漏先补任务再继续。验收：每个已勾选条目有可追溯证据，specs/design 的 Requirement 与决策点均有对应任务或明确豁免记录。
- [ ] 6.3 [验证] openspec/changes/2026-10-31-ai-rag-phase4 - 运行 `openspec validate 2026-10-31-ai-rag-phase4 --strict`，修复全部 ERROR 后才认定规划/实施工件一致。验收：命令 exit code 0、无 ERROR。
- [ ] 6.4 [验证] openspec/changes/2026-10-31-ai-rag-phase4/agent-findings.md - 生产上线说明：Production 唯一由用户合并 remote main 触发 Git Integration 完成，agent 不执行本地 vercel deploy、不重建 vercel.json；写入上线检查单（合并前 U0~U4 证据齐备、validate --strict 通过、生产 smoke 已留档）。验收：findings 含上线边界条目，且全任务周期无 vercel deploy 执行记录、无 vercel.json 改动。

## 7. 非本期设计输入（不属于本 change 执行范围）

以下内容仅作为后续独立 change 的设计输入，不创建本期可勾选任务，也不阻塞本期：

- **AI SDK v4→v5 迁移**：归 `ai-sdk-phase4` 独立 change，与本 change 完全解耦。原因：迁移面覆盖服务端 streamText、双 provider adapter、StreamData/来源帧合同与前端 useChat/transport 协议，与本期 U0~U4 检索质量升级正交；混入同一 change 会同时放大「检索回归」与「协议迁移回归」两个风险面（phase3 收尾已明确划转）。
- **多模态/视觉检索**：推第三期（memorix #5504），图片仅 URL 元数据（imageUrls 已全链路贯通）。原因：图片内容理解需独立的 embedding 选型与额度授权设计；本期 U4 chunk 复核明确只覆盖文本/表格。
- **生成侧 LLM-as-Judge 评估（Faithfulness / Answer Relevancy）**：作为独立设计输入，不在本期建设。原因：需独立的 LLM 额度授权与 judge 链路设计（消费 gold-set 预留的 referenceAnswer/requiredClaims/expectedCitationChunkIds 字段）；U3 判据若依赖它而其未就绪，按 4.1 判据 blocked 处理，本期不临时扩建。
- **CI 评估门禁**：本期明确不做。原因：知识源 docs/docx 被 gitignore、CI 不可见（gotcha #5955）；方案 C 规定本地 CLI rag:sync 直连 Neon 为唯一同步事实源、禁 CI/GA 侧同步（#5965/#6149）；CI 凭证下发亦属新风险面（03 计划 U0 任务 6）。
