## MODIFIED Requirements

### Requirement: 3. 候选池与 RRF 融合

系统 MUST 将 lexical/vector 候选池大小与最终返回数量分离；每一路 provider SHALL 先按 `candidateLimit` 召回，再以 Reciprocal Rank Fusion（RRF，默认 k=60）融合排名，去除重复 chunk 后截取 `finalLimit`。最终返回数量（top_k）与分数阈值（threshold）MUST 从 rag-runtime 配置体系读取生效值，MUST NOT 在调用链路中硬编码；env 缺省值 MUST 保持旧行为（top_k=5、threshold 关闭）；阈值已开启时 SHALL 仅保留融合分数不低于阈值的结果，全部结果低于阈值时 SHALL 返回空结果集。非法 limit 或 k 值 MUST 报错。

#### Scenario: 两路检索使用独立候选池

- **WHEN** hybrid 查询指定 `candidateLimit=20` 与 `finalLimit=5`
- **THEN** lexical 与 vector provider SHALL 各自最多返回 20 条候选
- **AND** RRF 融合后系统 SHALL 只返回最多 5 条最终结果

#### Scenario: RRF 融合排名

- **WHEN** 同时获得词法与向量候选排名
- **THEN** 系统 MUST 以 RRF（k=60）融合两组排名
- **AND** 结果 SHALL 按融合分降序排列
- **AND** 同一 chunk 在多路结果中只能保留一条

#### Scenario: 非法检索参数被拒绝

- **WHEN** `candidateLimit`、`finalLimit` 或 `k` 不是正整数
- **THEN** 系统 MUST 返回可识别的参数错误

#### Scenario: 检索参数从配置体系读取

- **WHEN** 检索管线确定最终返回数量与分数阈值
- **THEN** top_k 与 threshold MUST 从 rag-runtime 配置体系读取
- **AND** 调用链路中 MUST NOT 存在硬编码的 top 5

#### Scenario: 阈值开启时过滤低分结果

- **WHEN** threshold 配置已开启
- **THEN** 融合排名后系统 SHALL 仅保留分数不低于阈值的结果
- **AND** 全部结果低于阈值时 SHALL 返回空结果集，MUST NOT 回退为返回未过滤结果

## ADDED Requirements

### Requirement: 7. 查询改写（Multi-Query）

系统 SHALL 支持查询改写（Multi-Query）：启用时 MUST 生成多个查询改写变体，且变体 MUST 与原始查询一并参与检索后的 RRF 融合，MUST NOT 以变体替代原始查询（防止改写丢失关键实体）；Multi-Query MUST 通过 env 开关控制且默认关闭。引入前置条件：MUST 存在评估判据证明基线召回不足或答案相关性不足（以同一问题集的前后指标对照为依据），MUST NOT 在无评估判据时启用高级查询改写模式，防止盲目堆高级模式。

#### Scenario: 默认关闭

- **WHEN** env 未显式开启查询改写
- **THEN** 检索 SHALL 仅使用原始查询执行
- **AND** 行为 MUST 与未引入查询改写的前序阶段一致

#### Scenario: 变体与原始查询一并 RRF 融合

- **WHEN** Multi-Query 已通过 env 显式开启
- **THEN** 系统 SHALL 生成多个改写变体，并将变体与原始查询一并执行检索
- **AND** 融合 MUST 以 RRF（k=60）合并各路排名
- **AND** 原始查询 MUST NOT 被变体替代或丢弃

#### Scenario: 无评估判据不引入

- **WHEN** 尚无评估判据证明基线召回不足
- **THEN** 系统 MUST NOT 启用查询改写
- **AND** 引入决策 MUST 以同一问题集的前后指标对照为依据
