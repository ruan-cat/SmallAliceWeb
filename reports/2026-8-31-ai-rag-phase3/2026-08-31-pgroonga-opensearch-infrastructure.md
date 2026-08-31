# 2026-08-31 PGroonga 与 OpenSearch 基础设施调研与选型

## 1. 给新手的结论

PGroonga 和 OpenSearch 都能做“按词找文档”，但不是同一层的产品：PGroonga 是 PostgreSQL 扩展，把 Groonga 索引嵌入现有数据库；OpenSearch 是独立的分布式搜索集群（节点、索引、分片、副本）。两者都可以与现有向量检索并行，再交给 RRF 融合，但都会增加词法索引、同步和运维边界。

对 SmallAliceWeb 的当前阶段，推荐先保留 PostgreSQL 词法检索与 pgvector，做一个只读 PGroonga Pilot；暂不引入 OpenSearch。理由是知识源、chunk、embedding、同步事务和 advisory lock 都以 PostgreSQL 为事实源，拆出第二个搜索系统会引入双写、一致性、故障恢复和额外成本。只有 Pilot 证明中文召回率或延迟达到明确门槛，且 Neon 能提供可审计的 PGroonga 运行方式时，才进入迁移决策。

**Neon 官方目录核验（2026-08-31）**：当前 [Neon PostgreSQL 扩展目录](https://neon.com/docs/extensions/pg-extensions)可检索到 `pg_trgm` 与 `vector`，未列出 `pgroonga`；[Neon 兼容性文档](https://neon.com/docs/reference/compatibility)明确说明 Neon 角色不能安装 Neon 未支持的扩展。因此，PGroonga 不能按自建 PostgreSQL 的方式直接在当前 Neon 项目执行 `CREATE EXTENSION pgroonga`；除非 Neon 后续加入支持，否则 Pilot 必须放在独立 PostgreSQL/托管实例中。最终仍可用项目数据库的 `pg_available_extensions` 做一次实例级复核。

## 2. 当前实现与规格基线

`openspec/specs/ai-rag/hybrid-search/spec.md` 要求词法模式使用 PostgreSQL 全文检索、参数化 `websearch_to_tsquery('simple')`、`ts_rank_cd` 排序，并明确禁止未经真实中文语料评估就称为 BM25；向量模式使用 pgvector 余弦距离 `<=>`，维度固定 1024，hybrid 使用 RRF（默认 k=60）。

当前 `packages/ai-rag-api/server/search/postgres-search.ts` 的 lexical SQL 每次对 `content` 调用 `to_tsvector('simple', content)`，以 `websearch_to_tsquery('simple', $1)` 过滤和 `ts_rank_cd` 排序，参数通过 `$1/$2` 绑定；代码未显示 PGroonga、BM25 或独立搜索服务。`knowledge-sync` 规格则把 `docs/docx/**/*.md` 扫描、chunk 元数据、embedding 生成、单文档事务替换和删除语义都放在 PostgreSQL 同步链路内。

证据摘录（源码与规格，非部署结论）：

```log
lexical: to_tsvector('simple', content) @@ websearch_to_tsquery('simple', $1)
rank:    ts_rank_cd(to_tsvector('simple', content), websearch_to_tsquery('simple', $1))
vector:  1 - (embedding <=> CAST($1 AS vector))
```

## 3. 概念：三种词法路线如何分工

### 3.1 PostgreSQL FTS（当前路线）

PostgreSQL text search 将文本转成 `tsvector`、将查询转成 `tsquery`；`websearch_to_tsquery` 提供接近网页搜索的宽容语法，`ts_rank_cd` 按匹配词频和覆盖密度（词项接近程度）计算相关度。[官方文档](https://www.postgresql.org/docs/current/textsearch-controls.html)

`simple` 配置不做中文词典分词，也不等于 BM25。中文连续文本没有空格时，词元化和召回依赖输入形态，必须用真实中文题集测量。生产上通常把 `tsvector` 做成生成列或物化字段并建 GIN 索引，避免查询时重复计算；这属于后续性能优化，不是本报告的实施内容。

### 3.2 pg_trgm（模糊/相似字符串路线）

`pg_trgm` 把字符串切成连续三字符（trigram），提供 `similarity`、`%` 等运算符和 GiST/GIN 索引，适合拼写错误、前缀/子串和名称相似度，不是词法语义排序的替代品。[官方文档](https://www.postgresql.org/docs/current/pgtrgm.html)

它与 FTS 可以互补：FTS 负责词项相关性，pg_trgm 兜底短词、错别字和未分词文本；阈值越低召回可能上升，但噪声和重排成本也会上升。不要把 `similarity` 分数直接当作 FTS 的 rank；应分别取 Top-K 后再做 RRF 或经过校准的融合。

### 3.3 PGroonga

PGroonga 是 PostgreSQL 扩展，使用 Groonga 作为索引，目标是“在 PostgreSQL 内对所有语言进行全文检索、无需 ETL”。其默认 `TokenBigram` 对 CJK 采用双字切分，也可配置 `TokenNgram`、normalizer 和 token filter。[项目主页](https://pgroonga.github.io/)；[索引与 tokenizer 参考](https://pgroonga.github.io/reference/create-index-using-pgroonga.html)

PGroonga 官方对比文档指出：相较 textsearch 和 pg_trgm，PGroonga 默认支持多语言、更新与搜索可并行，但索引更大；其历史基准（英文 Wikipedia、旧版本 PostgreSQL/PGroonga）不能直接代表本项目中文语料性能。[官方对比与基准](https://pgroonga.github.io/reference/pgroonga-versus-textsearch-and-pg-trgm.html)

## 4. OpenSearch 是什么，以及它改变了什么

OpenSearch 是独立的分布式搜索引擎：文档写入索引，索引拆成 primary/replica shards，节点负责分片、查询和复制；请求由一个节点协调后汇总各分片结果。[官方介绍](https://docs.opensearch.org/latest/getting-started/intro/)

其全文查询默认使用 BM25（OpenSearch 官方说明为默认相似度算法），并支持可配置 analyzer。[BM25/Similarity 官方文档](https://docs.opensearch.org/latest/im-plugin/similarity/) 中文可用内置 `cjk` analyzer（重叠二字 bigram），也可安装 `analysis-icu` 使用 ICU 分词；官方明确建议在自己的 CJK 数据上实验比较。[CJK analyzer](https://docs.opensearch.org/latest/analyzers/language-analyzers/cjk/)、[ICU analyzer](https://docs.opensearch.org/latest/analyzers/language-analyzers/icu/)

引入 OpenSearch 后，SmallAliceWeb 需要把每个 chunk（含 sourcePath、headingPath、contentHash 等）复制到索引，处理删除、重试、版本和“数据库已提交但索引未提交”等双写状态；查询 API 还要处理 OpenSearch 不可用时的降级。它不能直接复用 PostgreSQL advisory lock 或事务原子替换。

## 5. 适配性与决策对比

|    维度    |        PostgreSQL FTS + pgvector        |                PGroonga（同库试点）                |                  OpenSearch（独立集群）                  |
| :--------: | :-------------------------------------: | :------------------------------------------------: | :------------------------------------------------------: |
|  中文分词  |   `simple` 不提供中文词典；需题集验证   |       TokenBigram/TokenNgram，中文覆盖潜力高       |            cjk/ICU analyzer，可扩展词典与插件            |
| 数据一致性 |   chunk、embedding、词法同一事务边界    |       仍可沿用 PostgreSQL 事务和 sourcePath        |              需 CDC/队列/幂等双写与删除补偿              |
| 召回率影响 |         作为基线；中文可能漏词          | 可能提升未分词中文和短语召回，但索引设置会影响噪声 | analyzer/BM25 可调，效果取决于 mapping、分词和同步新鲜度 |
|   运维面   |   Neon 托管 PostgreSQL；已有连接池/锁   |       依赖 Neon 是否允许该扩展及版本升级路径       |     节点、分片、副本、快照、权限、容量和升级全新边界     |
|  成本结构  |           现有数据库计算/存储           |              更大的数据库索引与写放大              |           独立节点/存储/副本 + 网络与值班成本            |
| 延迟与规模 | 适合当前中小语料；需索引与 EXPLAIN 验证 |         单库读写路径短，索引大时需监控膨胀         |    横向扩展和高并发强，但小语料可能被固定集群成本拖累    |
|  RRF 接入  |  现有 lexical/vector provider 直接接入  |  将 PGroonga Top-K 映射为同一 `HybridSearchItem`   |        需新增 client、超时、熔断、可观测性和降级         |

成本表只表达成本类型，不虚构供应商报价：具体 Neon、托管 OpenSearch 或自建 VM 价格必须在用户选定区域、容量和 SLA 后单独核价。

## 6. 推荐、非目标与风险

### 6.1 明确推荐

推荐顺序为：

1. 保持 PostgreSQL FTS + pgvector + RRF 作为线上基线，先补持久化 tsvector/GIN（若 EXPLAIN 证明需要）。
2. 若仍要研究 PGroonga，只能在独立 PostgreSQL/托管实例做只读 Pilot；比较同一题集的中文召回、延迟、索引大小和写入影响，不接入当前 Neon 生产链路。
3. 仅当 Neon 官方加入 PGroonga 支持，且备份恢复和升级责任得到书面确认，才讨论同库迁移。
4. OpenSearch 作为规模/多租户/复杂 analyzer 的后续选项；在没有双写与运维 owner 前不进入生产。

### 6.2 非目标

- 本报告不安装扩展、不改 schema、不改变 lexical SQL、不创建 OpenSearch 集群。
- 不把 PGroonga 或 OpenSearch 的历史 benchmark 当作 SmallAliceWeb 的实测结果。
- 不把“HTTP 200、索引创建成功或本地查询可返回”当作中文召回率、生产可用性或成本通过。
- 不在未评估的情况下把 PostgreSQL lexical 标记为 BM25。

### 6.3 迁移风险

- **扩展可用性**：Neon 的允许扩展清单、版本、权限和备份恢复需先验证；若不可用，PGroonga 只能放到外部 PostgreSQL，反而引入同步链路。
- **索引与磁盘**：PGroonga 官方指出索引可能显著大于 pg_trgm；需要按真实 chunk 估算存储、vacuum/重建窗口。
- **中文 tokenizer 漂移**：TokenBigram、TokenNgram、CJK、ICU 会产生不同 token 集；更换 analyzer 等同于重建词法索引并重新评估题集。
- **双写一致性**：OpenSearch 的异步索引可能短暂落后 PostgreSQL；删除与重试失败会造成幽灵结果，必须有 contentHash/version 和补偿任务。
- **相关度不可比**：`ts_rank_cd`、PGroonga score、BM25、向量 cosine 的数值尺度不同，只能按排名做 RRF，不能直接混加原始分数。
- **安全与合规**：独立集群需要网络白名单、TLS、凭据轮换、快照恢复演练和日志脱敏。

## 7. 最小可行 Pilot（只读、可回滚）

### 7.1 数据与配置

复制当前 `chunks` 的 `id/source_path/content/heading_path/content_hash` 到影子表或临时数据库；不触碰线上表，不发送图片，不重新生成 embedding。为 PGroonga 建一个明确 tokenizer（先 TokenBigram，再可选 TokenNgram），保留 tokenizer、版本和建索引时间在实验记录中。

### 7.2 对照实验

对固定题集（规格要求至少 10 题，建议覆盖中文整句、短词、英文术语、数字、错别字、标题路径）分别运行：当前 PostgreSQL lexical、PGroonga lexical、现有 vector、RRF hybrid。每个策略取同一 Top-K（建议 K=20），由人工标注相关性或使用已有金标准计算 Recall@5/10、MRR、nDCG@10、关键词覆盖率。

### 7.3 验收门槛（候选，需用户确认）

|        指标        |                     建议门槛                     |                  证据                   |
| :----------------: | :----------------------------------------------: | :-------------------------------------: |
| 中文题集 Recall@10 | 相对当前 lexical 提升 ≥10%，且不低于 vector 基线 |           固定 JSON 评估结果            |
|   MRR 或 nDCG@10   |      提升 ≥5%，或在相同效果下 P95 降低 ≥30%      |           重复 5 次的 P50/P95           |
|      写入影响      |      同步批处理 P95 增幅 ≤20%，无锁等待异常      | `EXPLAIN (ANALYZE, BUFFERS)` 与同步日志 |
|      索引存储      |       记录每 chunk 字节数；超出预算即停止        |         数据库大小/索引大小快照         |
|       一致性       |  contentHash 抽样 100% 一致；删除测试无幽灵结果  |              对账脚本 JSON              |
|        恢复        | 影子索引损坏或扩展不可用时，线上 lexical 仍可用  |              故障注入记录               |

这些门槛是决策起点，不是已经通过的结果；需要在用户确认题集、K 值和预算后冻结。

## 8. 用户需要拍板的问题

1. Neon 当前项目是否允许安装 PGroonga？若不允许，是否接受单独 PostgreSQL/托管搜索资源及其数据驻留要求？
2. 中文检索的首要目标是更高召回、低延迟，还是最小运维/成本？三者冲突时优先级如何排序？
3. 题集金标准由谁维护，相关性标注采用二值（相关/不相关）还是分级标注？
4. 可接受的索引存储预算、月度基础设施预算和 P95 延迟目标是多少？
5. 是否愿意承担 OpenSearch 的双写、快照、升级和 on-call owner？若没有明确 owner，OpenSearch 仅保留为非生产备选。

## 9. 最终决策口径

当前证据支持“先基线、优先 pg_trgm；PGroonga 仅作为独立 PostgreSQL 的可选研究、暂缓 OpenSearch”。这是一项调研建议，不是已实施的基础设施变更。只有独立 Pilot 的真实中文指标、Neon 扩展核验、容量成本和故障恢复证据全部齐备，才能把候选方案升级为实施计划。
