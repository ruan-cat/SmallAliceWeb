## Purpose

Hybrid Search 混合检索能力：基于 PostgreSQL 全文检索与 pgvector 余弦向量检索并行召回，通过 Reciprocal Rank Fusion 融合排序，提供仅词法、仅向量与 hybrid 三种可切换检索模式，并支持固定题集的三策略对比评估。

## ADDED Requirements

### Requirement: 1. 词法全文检索

系统 MUST 提供基于 PostgreSQL 全文检索的词法检索，使用参数化 `websearch_to_tsquery('simple')` 构建查询并按 `ts_rank_cd` 相关度排序；该检索 MUST 返回相关度排序的 Top-K 结果；系统 SHALL 将该能力标注为 PostgreSQL 词法全文检索，MUST NOT 在未经真实中文语料评估验证前将其标注为 BM25。

#### Scenario: 词法检索返回相关度排序结果

- **WHEN** 对知识库执行一次词法检索查询并指定 Top-K
- **THEN** 系统 MUST 使用 PostgreSQL 全文检索执行查询
- **AND** 查询 MUST 使用参数化 `websearch_to_tsquery('simple')` 绑定，不得拼接进 SQL
- **AND** 结果 SHALL 按 `ts_rank_cd` 相关度降序返回 Top-K 条

#### Scenario: 能力标注不得冒充 BM25

- **WHEN** 系统对外描述或输出该检索能力
- **THEN** 其 SHALL 标注为 PostgreSQL 词法全文检索
- **AND** 在未经真实中文语料评估验证前 MUST NOT 标注为 BM25

### Requirement: 2. 向量检索

系统 MUST 提供基于 pgvector 余弦距离（`<=>`）的向量检索，并按相似度返回 Top-K 结果；查询向量维度 MUST 校验为 1536，与首期 embedding 模型维度一致；embedding 模型或维度变更 MUST 作为一次迁移与全量重嵌入处理，MUST NOT 混写同一 `embedding` 列。

#### Scenario: 向量检索按余弦相似度返回 Top-K

- **WHEN** 以查询向量执行向量检索
- **THEN** 系统 MUST 使用 pgvector 余弦距离 `<=>` 计算相似度
- **AND** 结果 SHALL 按相似度降序返回 Top-K 条

#### Scenario: 维度校验失败报错

- **WHEN** 传入向量的维度不等于 1536
- **THEN** 系统 MUST 拒绝该查询并报错，不得静默接受

#### Scenario: 维度变更不混写同一列

- **WHEN** embedding 模型或向量维度发生变更
- **THEN** 系统 MUST 以一次迁移与全量重嵌入的方式处理
- **AND** 新旧维度的向量 SHALL NOT 混写在同一 `embedding` 列

### Requirement: 3. RRF 融合

系统 MUST 提供 Reciprocal Rank Fusion（RRF）融合函数，默认 k 值为 60，对词法检索与向量检索的排名进行融合并输出融合排序结果；非法 k 值 MUST 报错。

#### Scenario: 词法与向量排名融合

- **WHEN** 同时获得词法检索与向量检索的结果排名
- **THEN** 系统 MUST 以 RRF（k=60）融合两组排名
- **AND** 输出 SHALL 按融合分降序排列

#### Scenario: 非法 k 值报错

- **WHEN** 调用 RRF 融合时传入非法 k 值（如非正数）
- **THEN** 系统 MUST 报错，不得静默接受

### Requirement: 4. 检索模式可切换

系统 MUST 支持仅词法（lexical）、仅向量（vector）与 hybrid 三种检索模式，并 SHALL 允许调用方按模式切换执行，以供对比评估。

#### Scenario: 三种模式均可独立调用

- **WHEN** 分别以 lexical、vector 与 hybrid 模式执行同一查询
- **THEN** 三种模式 SHALL 均可独立执行并返回结果
- **AND** hybrid 模式 SHALL 返回词法与向量融合后的结果

#### Scenario: 模式用于对比评估

- **WHEN** 评估场景需要对比不同检索策略
- **THEN** 系统 SHALL 允许按模式分别获取同一查询的结果以做对比

### Requirement: 5. 固定题集评估

系统 MUST 提供固定题集评估能力，题集 SHALL 至少包含 10 个固定问题，并对每个问题分别运行词法、向量与 hybrid 三种策略；评估结果 MUST 以 JSON 输出，包含命中率与关键词覆盖率等指标。

#### Scenario: 三策略评估并输出 JSON 结果

- **WHEN** 对固定题集运行评估
- **THEN** 每个问题 SHALL 分别以 lexical、vector 与 hybrid 三种策略执行检索
- **AND** 题集 SHALL 至少包含 10 个固定问题
- **AND** 评估输出 SHALL 为 JSON，包含命中率与关键词覆盖率等指标
