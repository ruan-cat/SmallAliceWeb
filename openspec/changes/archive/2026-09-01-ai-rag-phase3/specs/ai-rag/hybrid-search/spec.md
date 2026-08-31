## MODIFIED Requirements

### Requirement: 1. 词法全文检索

系统 MUST 提供基于 PostgreSQL 全文检索的词法检索，并 SHALL 提供基于 Neon PostgreSQL `pg_trgm` 的中文子串/相似文本候选检索；两者均 MUST 返回相关度排序的 Top-K 结果。PostgreSQL 全文检索 MUST 使用参数化 `websearch_to_tsquery('simple')` 与 `ts_rank_cd`；系统 SHALL 将这些能力标注为 PostgreSQL 词法全文检索或 pg_trgm 检索，MUST NOT 在未经真实中文语料评估验证前将其标注为 BM25。

#### Scenario: 词法检索返回相关度排序结果

- **WHEN** 对知识库执行一次词法检索查询并指定 Top-K
- **THEN** 系统 MUST 使用 PostgreSQL 全文检索执行查询
- **AND** 查询 MUST 使用参数化 `websearch_to_tsquery('simple')` 绑定，不得拼接进 SQL
- **AND** 结果 SHALL 按 `ts_rank_cd` 相关度降序返回 Top-K 条

#### Scenario: 能力标注不得冒充 BM25

- **WHEN** 系统对外描述或输出该检索能力
- **THEN** 其 SHALL 标注为 PostgreSQL 词法全文检索
- **AND** 在未经真实中文语料评估验证前 MUST NOT 标注为 BM25

#### Scenario: PostgreSQL FTS 返回相关度排序结果

- **WHEN** 调用方选择 PostgreSQL FTS 并指定候选 Top-K
- **THEN** 系统 MUST 使用参数化 `websearch_to_tsquery('simple')` 查询
- **AND** 结果 SHALL 按 `ts_rank_cd` 相关度降序返回
- **AND** 查询参数 MUST NOT 通过 SQL 字符串拼接注入

#### Scenario: pg_trgm 返回中文候选

- **WHEN** 调用方选择 pg_trgm 并指定候选 Top-K
- **THEN** 系统 MUST 使用 Neon 支持的 pg_trgm 索引/运算完成候选检索
- **AND** 结果 SHALL 携带可观测的 lexical 分数与来源元数据
- **AND** 该能力 MUST NOT 被标注为 BM25

#### Scenario: 词法能力标注保持真实

- **WHEN** 系统对外输出检索策略名称或评估报告
- **THEN** PostgreSQL FTS SHALL 标注为 PostgreSQL 词法全文检索
- **AND** pg_trgm SHALL 标注为 pg_trgm 检索
- **AND** 未经真实中文语料验证 MUST NOT 标注为 BM25

#### Scenario: 标题型问题返回目标章节

- **WHEN** 查询以知识库中的文档标题或章节标题为主要实体（例如“某角色是谁”）
- **THEN** lexical/vector 检索输入 MUST 包含可检索的标题路径上下文
- **AND** 评测结果的 Top-K 中 SHALL 能追溯到 gold-set 指定的 `sourcePath` 与 `headingPath`
- **AND** 仅命中其他文档中偶然出现同名词的 chunk SHALL 不得被视为通过

### Requirement: 2. 向量检索

系统 MUST 提供基于 pgvector 余弦距离（`<=>`）的向量检索，并按相似度返回 Top-K 结果；查询向量维度 MUST 校验为 1024，与当前 Cloudflare Workers AI `@cf/baai/bge-m3` embedding 模型维度一致；embedding 模型或维度变更 MUST 作为一次迁移与全量重嵌入处理，MUST NOT 混写同一 `embedding` 列。

#### Scenario: 向量检索按余弦相似度返回 Top-K

- **WHEN** 以查询向量执行向量检索
- **THEN** 系统 MUST 使用 pgvector 余弦距离 `<=>` 计算相似度
- **AND** 结果 SHALL 按相似度降序返回 Top-K 条

#### Scenario: 维度校验失败报错

- **WHEN** 传入向量的维度不等于 1024
- **THEN** 系统 MUST 拒绝该查询并报错，不得静默接受

#### Scenario: 维度变更不混写同一列

- **WHEN** embedding 模型或向量维度发生变更
- **THEN** 系统 MUST 以一次迁移与全量重嵌入的方式处理
- **AND** 新旧维度的向量 SHALL NOT 混写在同一 `embedding` 列

### Requirement: 3. 候选池与 RRF 融合

系统 MUST 将 lexical/vector 候选池大小与最终返回数量分离；每一路 provider SHALL 先按 `candidateLimit` 召回，再以 Reciprocal Rank Fusion（RRF，默认 k=60）融合排名，去除重复 chunk 后截取 `finalLimit`。非法 limit 或 k 值 MUST 报错。

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

### Requirement: 4. 检索模式可切换

系统 MUST 支持仅词法（lexical）、仅向量（vector）与 hybrid 三种检索模式，并 SHALL 允许调用方按模式切换执行，以供对比评估。

#### Scenario: 三种模式均可独立调用

- **WHEN** 分别以 lexical、vector 与 hybrid 模式执行同一查询
- **THEN** 三种模式 SHALL 均可独立执行并返回结果
- **AND** hybrid 模式 SHALL 返回词法与向量融合后的结果

#### Scenario: 模式用于对比评估

- **WHEN** 评估场景需要对比不同检索策略
- **THEN** 系统 SHALL 允许按模式分别获取同一查询的候选与最终结果

### Requirement: 5. 固定题集评估兼容

系统 MUST 保留固定题集对 lexical、vector 与 hybrid 三种策略的对比能力；题集 SHALL 至少包含 10 个固定问题，评估输出 MUST 以 JSON 保存每题的候选 ID、最终 ID、策略、关键词命中信息与配置版本。关键词覆盖率 SHALL 作为兼容诊断字段，不得被宣称为严格 Recall@K。

#### Scenario: 三策略评估并输出兼容 JSON

- **WHEN** 对固定题集运行评估
- **THEN** 每个问题 SHALL 分别以 lexical、vector 与 hybrid 三种策略执行检索
- **AND** 题集 SHALL 至少包含 10 个固定问题
- **AND** 输出 SHALL 保存候选/最终检索 ID、关键词覆盖率、chunk profile、embedding model 与评估版本

#### Scenario: 关键词覆盖率保持正确标注

- **WHEN** 评估报告展示关键词覆盖率
- **THEN** 报告 MUST 将其标注为关键词诊断指标
- **AND** MUST NOT 将其改名为 Recall@K 或作为唯一质量结论

## ADDED Requirements

### Requirement: 6. 线上知识库候选预检

严格评测或线上回归 MUST 在运行前确认目标 `sourcePath` 存在于当前知识库，并记录文档 chunk 数、`profileVersion`、embedding model 与最近同步状态；目标文档缺失、chunk 数为 0、embedding 缺失或版本不符合评测配置时 MUST 标记为数据状态失败，不得归因于检索排序。

#### Scenario: 目标文档存在且版本匹配

- **WHEN** 运行标题型 gold-set 题集
- **THEN** 预检 MUST 找到每题期望的 `sourcePath`
- **AND** 对应 chunk SHALL 具有非空 embedding 与匹配的 profile/model 版本
- **AND** 预检结果 MUST 被写入评测 JSON

#### Scenario: 目标文档缺失时阻止质量结论

- **WHEN** gold-set 期望的 `sourcePath` 不存在或所有 chunk 无有效 embedding
- **THEN** 评测 MUST 标记 corpus 状态失败或 blocked
- **AND** MUST NOT 输出“Recall 下降是模型/切块导致”的质量结论
