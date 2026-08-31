# rag-evaluation Specification

## Purpose

为 AI RAG 建立可重复、可审计的检索与答案质量评估能力，使用版本化 gold-set、标准检索指标和 Promptfoo 实验区分召回、排序、引用与生成问题。

## Requirements

### Requirement: 1. Gold-set 题集

系统 MUST 支持版本化 gold-set 题集；每道题 SHALL 包含唯一 `id`、问题文本、分类、一个或多个相关 chunk ID，并可选包含相关等级、参考答案、必答事实与期望引用 chunk。题集 SHALL 区分开发题、回归题和最终验收题，且题集版本、语料快照、chunk profile、embedding model 与 reranker 配置 MUST 被记录。

#### Scenario: Gold-set 题目包含相关 chunk

- **WHEN** 新增一条评测题
- **THEN** 题目 MUST 包含唯一 ID、问题文本、分类和至少一个相关 chunk ID
- **AND** 缺少相关 chunk 标注的题目 SHALL 只能进入关键词 smoke，不得进入严格 Recall 汇总

#### Scenario: 题集版本可复现

- **WHEN** 运行同一版本的 gold-set
- **THEN** 评估输出 MUST 记录题集版本、语料快照、chunk profile、embedding model 与 reranker 状态
- **AND** 同一配置重复运行时 SHALL 能定位结果差异来源

### Requirement: 2. 检索指标

系统 MUST 对 lexical、vector、hybrid 以及可选 reranker 分别计算 Recall@K、Precision@K、MRR@K；当 gold-set 提供相关等级时 SHALL 计算 nDCG@K。评估 MUST 保留候选池与最终结果的有序 ID，不得仅依赖关键词覆盖率。

#### Scenario: 计算 Recall@10

- **WHEN** gold-set 为某题标注相关 chunk 集合，检索返回有序 Top-10 ID
- **THEN** 系统 MUST 按 `Top10 中相关 chunk 数 / gold 相关 chunk 总数` 计算 Recall@10
- **AND** 分母 MUST NOT 因阈值或返回数量变化而改变

#### Scenario: 区分候选召回与最终排序

- **WHEN** 同一候选池经过 reranker 重排
- **THEN** 报告 MUST 同时输出候选 Recall、重排后 Recall、MRR、Precision 与 nDCG
- **AND** 不得用最终答案分数替代候选召回指标

### Requirement: 3. 答案、引用与忠实性评估

系统 SHALL 支持对已固定的 `question + retrievedContext + answer` 进行答案级评估，并分别记录 faithfulness、answer relevance、answer correctness 与 citation correctness。确定性的引用编号、chunk ID、source URL 和 heading anchor 校验 MUST 与人工或 LLM 语义判断分开。

#### Scenario: 引用编号确定性校验

- **WHEN** 答案包含 `[来源N]`
- **THEN** 系统 MUST 校验编号存在、映射到本次返回的 chunk，且 source URL 与 heading anchor 可解析
- **AND** 编号或链接错误 SHALL 单独计为 citation format failure

#### Scenario: 语义忠实性不冒充检索正确

- **WHEN** 对答案执行 faithfulness 或 answer relevance 评估
- **THEN** 报告 MUST 标记评分来源、模型/版本或人工标注者
- **AND** 答案级评分不得覆盖或改写检索层指标

### Requirement: 4. Promptfoo 评测适配

系统 MUST 提供 Promptfoo 的 dev-only 适配入口，用于批量比较 chunk profile、lexical/vector/hybrid、NoopReranker 与真实 reranker 配置；Promptfoo 运行不得成为线上 `/v1/chat` 或 `/v1/search` 的运行时依赖。

#### Scenario: Promptfoo 比较多种配置

- **WHEN** 运行 phase3 RAG 评测配置
- **THEN** Promptfoo SHALL 能调用已注入的检索/聊天 provider 并保存每个配置的 JSON 结果
- **AND** 结果 MUST 包含指标、延迟、错误、配置和版本信息

#### Scenario: 评测依赖不进入生产运行时

- **WHEN** 构建或部署 Nitro API
- **THEN** Promptfoo 依赖 MUST NOT 被要求用于线上请求处理
- **AND** 缺少 Promptfoo 不得阻塞现有 RAG runtime 的正常装配

### Requirement: 5. 成本、隐私与失败记录

评估系统 MUST 记录 embedding/reranker/LLM judge 的请求数、token（若可得）、延迟、重试、超时与失败回退；发送私有 query、chunk、答案到外部 provider 前 MUST 通过显式配置授权，并 SHALL 支持脱敏或仅运行确定性本地指标。

#### Scenario: 外部评估调用可审计

- **WHEN** 评测调用外部 reranker 或 LLM judge
- **THEN** 输出 MUST 记录 provider、模型、请求数量、延迟、失败和成本估算字段
- **AND** API key、数据库连接串和未授权敏感内容 MUST NOT 写入报告

#### Scenario: 外部 provider 失败不伪造通过

- **WHEN** 外部评估 provider 超时或返回错误
- **THEN** 该题或该配置 SHALL 标记为 failed/skipped
- **AND** 系统 MUST NOT 用缺失结果填充为通过或 0 成本

### Requirement: 6. 题集与线上 corpus 对齐预检

严格 gold-set 评测 MUST 在计算 Recall@K 前确认题目期望的 `sourcePath`、`headingPath` 与相关 chunk 在当前语料快照中存在，并记录 chunk 数、content/profile/model 版本和同步状态；预检失败时 MUST 将问题归类为 corpus 状态失败，不得混入检索指标汇总。

#### Scenario: 标题实体题对齐目标章节

- **WHEN** 题目要求命中指定文档章节（例如角色设定章节）
- **THEN** gold-set MUST 记录目标 `sourcePath`、`headingPath` 与至少一个相关 chunk ID
- **AND** 运行前预检 MUST 验证目标章节仍存在且 chunk 可检索

#### Scenario: 线上 corpus 未同步时隔离失败

- **WHEN** 目标文档未同步、chunk 数为 0、embedding 缺失或 profile/model 版本不匹配
- **THEN** 该题 SHALL 标记为 `corpus-missing` 或 `corpus-stale`
- **AND** 该题 MUST NOT 用于判定 lexical、vector 或 reranker 的排序质量
