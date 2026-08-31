## Purpose

为 RAG 候选结果提供可替换的重排能力：默认以明确标记的 NoopReranker 保持现有行为，后续可在成本、延迟和评测门槛满足时接入通用 LLM 或其他授权 reranker 实现。

## ADDED Requirements

### Requirement: 1. 可插拔重排契约

系统 MUST 提供 reranker provider 契约；输入 SHALL 包含用户 query 与有序候选 chunk，输出 SHALL 只能包含输入候选的子集或完整集合及新的排序/分数，不得凭空创建 chunk。provider 结果 MUST 标记 `applied`、`skipped` 或 `failed` 状态，并保留 provider/model/version 与耗时信息。

#### Scenario: 重排不制造新 chunk

- **WHEN** reranker 处理候选列表
- **THEN** 输出 ID 集合 MUST 是输入候选 ID 集合的子集或完整集合
- **AND** 输出 SHALL 保留原 chunk 的内容与来源元数据

#### Scenario: provider 状态可追踪

- **WHEN** reranker 被调用、跳过或失败
- **THEN** 结果 MUST 标记 applied/skipped/failed 状态
- **AND** MUST 记录 provider/model/version、延迟与失败原因（如有）

### Requirement: 2. NoopReranker 默认基线

phase3 默认 MUST 使用明确标记的 NoopReranker 或 disabled 模式；该模式 SHALL 原样保留 hybrid 排名，不得宣称产生重排收益，但 MUST 允许评测系统将其作为无重排基线。

#### Scenario: 默认行为不改变现有排序

- **WHEN** 未显式启用真实 reranker
- **THEN** 最终排序 SHALL 与 RRF 去重后的输入顺序一致
- **AND** 结果状态 MUST 为 skipped 或 noop，而不是 applied

#### Scenario: Noop 基线可参与对照

- **WHEN** Promptfoo 或离线 gold-set 比较 reranker 配置
- **THEN** NoopReranker SHALL 作为独立基线配置输出
- **AND** 报告 MUST 能区分 Noop 与真实 provider

### Requirement: 3. 通用 LLM 重排候选实现

系统 SHALL 预留通用 LLM reranker 实现；只有在显式配置 provider、模型、候选上限、输入 token 上限、超时和成本预算后才允许启用。通用 LLM reranker MUST 只处理候选池，不得对全量知识库逐 chunk 调用；超时、额度不足、模型错误或输出无法解析时 MUST 回退到 Noop/RRF 排名并标记失败。

#### Scenario: 通用 LLM 重排受预算约束

- **WHEN** 启用通用 LLM reranker
- **THEN** 系统 MUST 在请求前检查候选数量与输入 token 预算
- **AND** 超出预算 SHALL 跳过重排并标记 skipped，不得静默扩大请求

#### Scenario: 通用 LLM 重排失败回退

- **WHEN** LLM reranker 超时、报错或返回无法解析的排序
- **THEN** 系统 MUST 使用 RRF/Noop 排名继续完成检索
- **AND** 结果状态 SHALL 为 failed 并包含可审计的失败原因

### Requirement: 4. 重排效果对照

系统 MUST 支持在同一候选池、同一 gold-set 和同一最终 Top-K 下比较 Noop 与真实 reranker；报告 SHALL 同时记录 Recall、Precision、MRR、nDCG、延迟、token、失败率和回退次数。

#### Scenario: 固定候选池比较重排收益

- **WHEN** 比较 Noop 与真实 reranker
- **THEN** 两种配置 MUST 使用相同 query、候选 ID、最终 K 与评测题集
- **AND** 报告 SHALL 展示重排前后的指标差异

#### Scenario: 没有收益时不强制上线

- **WHEN** 真实 reranker 未提升目标指标或超过成本/延迟门槛
- **THEN** 系统 SHALL 保留 Noop/RRF 作为默认路径
- **AND** 评估输出 MUST 记录未启用真实 reranker 的原因
