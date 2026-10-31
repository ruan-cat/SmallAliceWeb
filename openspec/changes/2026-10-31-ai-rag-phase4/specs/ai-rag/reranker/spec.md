## MODIFIED Requirements

### Requirement: 2. NoopReranker 默认基线

phase3 默认 MUST 使用明确标记的 NoopReranker 或 disabled 模式；该模式 SHALL 原样保留 hybrid 排名，不得宣称产生重排收益，但 MUST 允许评测系统将其作为无重排基线。reranker 实现 MUST 通过 env 开关选择且默认 noop；灰度与回滚 MUST 依赖该开关，切回 noop 即恢复基线行为；noop 适配器 MUST 保留，MUST NOT 被真实 reranker 实现删除或替代。

#### Scenario: 默认行为不改变现有排序

- **WHEN** 未显式启用真实 reranker
- **THEN** 最终排序 SHALL 与 RRF 去重后的输入顺序一致
- **AND** 结果状态 MUST 为 skipped 或 noop，而不是 applied

#### Scenario: Noop 基线可参与对照

- **WHEN** Promptfoo 或离线 gold-set 比较 reranker 配置
- **THEN** NoopReranker SHALL 作为独立基线配置输出
- **AND** 报告 MUST 能区分 Noop 与真实 provider

#### Scenario: env 开关默认 noop

- **WHEN** env 未显式配置 reranker 实现
- **THEN** 系统 MUST 使用 noop（或 disabled）默认实现
- **AND** 检索行为 MUST 与既有基线一致

#### Scenario: 灰度回滚切回 noop

- **WHEN** 真实 reranker 收益不成立、延迟超预算或出现额度问题
- **THEN** 系统 SHALL 通过将 env 开关切回 noop 立即恢复 RRF 原序基线
- **AND** 回滚 MUST NOT 需要 schema、索引或代码变更

### Requirement: 3. 通用 LLM 重排候选实现

系统 SHALL 预留通用 LLM reranker 实现；只有在显式配置 provider、模型、候选上限、输入 token 上限、超时和成本预算后才允许启用。通用 LLM reranker MUST 只处理候选池，不得对全量知识库逐 chunk 调用；超时、额度不足、模型错误或输出无法解析时 MUST 回退到 Noop/RRF 排名并标记失败。真实 reranker 启用时检索管线 MUST 走「扩召回 → 精排 → 过滤 → 取 top_k」路径：召回侧 SHALL 扩展到 `rerankerCandidateLimit`，重排后执行过滤再截取 top_k，重排输入 MUST 执行 `rerankerMaxInputTokens` 截断保护；预算门禁 MUST 在请求前检查候选数量、输入 token 与超时预算。凡消耗第三方或平台额度的 reranker 调用 MUST 以用户授权与额度检查为前置。

#### Scenario: 通用 LLM 重排受预算约束

- **WHEN** 启用通用 LLM reranker
- **THEN** 系统 MUST 在请求前检查候选数量与输入 token 预算
- **AND** 超出预算 SHALL 跳过重排并标记 skipped，不得静默扩大请求

#### Scenario: 通用 LLM 重排失败回退

- **WHEN** LLM reranker 超时、报错或返回无法解析的排序
- **THEN** 系统 MUST 使用 RRF/Noop 排名继续完成检索
- **AND** 结果状态 SHALL 为 failed 并包含可审计的失败原因

#### Scenario: 启用走两阶段管线

- **WHEN** 真实 reranker 已通过 env 显式启用
- **THEN** 检索管线 MUST 按「扩召回 → 精排 → 过滤 → 取 top_k」执行
- **AND** 召回侧 SHALL 扩展到 `rerankerCandidateLimit`，重排后执行过滤再截取 top_k
- **AND** 重排输入 MUST 执行 `rerankerMaxInputTokens` 截断保护

#### Scenario: 额度消耗授权前置

- **WHEN** 启用消耗第三方或平台额度的 reranker（如 Cloudflare Workers AI reranker 或 Cohere rerank）
- **THEN** 用户授权与额度检查 MUST 先于任何 rerank 调用完成
- **AND** 额度消耗记录 SHALL 留档
