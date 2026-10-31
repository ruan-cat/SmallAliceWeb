## MODIFIED Requirements

### Requirement: 1. Gold-set 题集

系统 MUST 支持版本化 gold-set 题集；每道题 SHALL 包含唯一 `id`、问题文本、分类、一个或多个相关 chunk ID，并可选包含相关等级、参考答案、必答事实与期望引用 chunk。题集 SHALL 区分开发题、回归题和最终验收题，且题集版本、语料快照、chunk profile、embedding model 与 reranker 配置 MUST 被记录。gold-set MUST 以既有版本化 JSONL 黄金集为基础做增量补足，MUST NOT 从零重建；补足后题集规模目标 SHALL 为 20~50 条，其中 unanswerable 负样本占比 SHALL 不低于 20%；每一条增量条目 MUST 经人工审核确认后方可进入题集，人工审核 MUST NOT 被省略。

#### Scenario: Gold-set 题目包含相关 chunk

- **WHEN** 新增一条评测题
- **THEN** 题目 MUST 包含唯一 ID、问题文本、分类和至少一个相关 chunk ID
- **AND** 缺少相关 chunk 标注的题目 SHALL 只能进入关键词 smoke，不得进入严格 Recall 汇总

#### Scenario: 题集版本可复现

- **WHEN** 运行同一版本的 gold-set
- **THEN** 评估输出 MUST 记录题集版本、语料快照、chunk profile、embedding model 与 reranker 状态
- **AND** 同一配置重复运行时 SHALL 能定位结果差异来源

#### Scenario: 黄金集增量补足不重建

- **WHEN** 既有黄金集覆盖度不足需要扩充
- **THEN** 系统 MUST 在既有版本化 JSONL 黄金集上追加条目
- **AND** MUST NOT 从零重建黄金集或丢弃既有条目

#### Scenario: 增量条目人工审核不可省略

- **WHEN** 新增一条增量评测条目
- **THEN** 该条目 MUST 经人工审核确认相关 chunk 标注与负样本标记正确后方可进入题集
- **AND** 未经人工审核的条目 MUST NOT 参与严格指标汇总

#### Scenario: 负样本占比达标

- **WHEN** 盘点补足后的题集规模达到 20~50 条
- **THEN** unanswerable 负样本占比 SHALL 不低于 20%
- **AND** 负样本 SHALL 沿用既有 unanswerable 设计，为阈值标定与拒答防线提供数据

## ADDED Requirements

### Requirement: 7. 评估基线快照

系统 MUST 支持固化评估基线快照：每一轮调优前 MUST 先对当前配置拍摄基线快照并存档；基线快照 MUST 包含时间戳、git commit、datasetVersion 以及 top_k 与 reranker 配置状态；基线快照 SHALL 随评估运行记录与本地评估报告一并落档，MUST NOT 以无版本记录的方式声明基线。

#### Scenario: 调优前基线快照

- **WHEN** 计划对 top_k、阈值、reranker 或切分配置执行任一轮调优
- **THEN** 系统 MUST 在调优执行前先固化当前配置的基线快照
- **AND** 快照 MUST 包含时间戳、git commit、datasetVersion、top_k 与 reranker 配置状态

#### Scenario: 基线可对照

- **WHEN** 调优后对同一问题集运行评估
- **THEN** 报告 MUST 能与基线快照按同一 datasetVersion 与配置状态对照
- **AND** 指标差异 SHALL 可归因到被调优的配置项

### Requirement: 8. 查询向量本地缓存

评估链路 MUST 为查询向量提供本地缓存：同一问题集重复评估时 MUST 命中本地缓存复用查询向量，MUST NOT 为相同查询文本重复调用 embedding provider 消耗额度；缓存命中 SHALL 以查询文本与 embedding 模型标识为键保持确定性。同问题集在配置不变时二次运行，检索指标 MUST 与首次运行一致（结果可复现）。

#### Scenario: 重复评估命中缓存

- **WHEN** 对同一问题集重复运行评估且 embedding 模型未变化
- **THEN** 相同查询文本的向量 SHALL 从本地缓存读取
- **AND** 系统 MUST NOT 为相同查询文本重复消耗 embedding 额度

#### Scenario: 缓存未命中回退正常调用

- **WHEN** 查询文本或 embedding 模型标识未命中缓存
- **THEN** 系统 SHALL 正常调用 embedding provider 并将结果写入本地缓存

#### Scenario: 二次运行结果可复现

- **WHEN** 对同一问题集在配置不变时二次运行评估
- **THEN** Recall@K、Precision@K、MRR@K 与 nDCG@K 指标 MUST 与首次运行一致
