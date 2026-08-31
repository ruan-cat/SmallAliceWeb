# 2026-08-27 真实索引固定题集评估记录

## 1. 评估范围

本次评估使用 Development Neon 数据库的真实 PostgreSQL 检索与 Cloudflare Workers AI embedding，不使用 mock。固定题集为 `packages/ai-rag-api/data/eval-questions.json` 的 10 题，embedding 模型为 `@cf/baai/bge-m3`，维度为 1024。

本次数据库快照为 248 个 documents、4034 个 chunks、248 个 source。当前索引对应运行时默认分块基线 500 / 50；300 / 30 与 800 / 100 尚未重新分块和重嵌入，因此不把它们伪装成已完成的 A/B 结果。

## 2. lexical / vector / hybrid 结果

评估脚本：`pnpm exec tsx packages/ai-rag-api/scripts/run-real-evaluation.ts`。

| topK |  策略   | 命中率 | 平均关键词覆盖率 |
| :--: | :-----: | :----: | :--------------: |
|  5   | lexical |  0/10  |      0.000       |
|  5   | vector  |  8/10  |      0.633       |
|  5   | hybrid  |  8/10  |      0.633       |
|  10  | lexical |  0/10  |      0.000       |
|  10  | vector  |  8/10  |      0.633       |
|  10  | hybrid  |  8/10  |      0.633       |
|  15  | lexical |  0/10  |      0.000       |
|  15  | vector  |  8/10  |      0.700       |
|  15  | hybrid  |  8/10  |      0.700       |

lexical 在当前 `simple` FTS 配置下对中文题集全部未命中；这只能说明中文词法检索存在分词缺口，不能将该实现标注为 BM25。hybrid 与 vector 在本题集上没有额外命中增益。

## 3. HNSW 与精确向量检索

对 10 个问题分别取 Top-5，使用 `enable_seqscan = off` 运行 HNSW 路径，使用 `enable_indexscan = off` 与 `enable_bitmapscan = off` 运行精确扫描。完整问题级检索 ID 保存在同目录的 `2026-08-27-real-evaluation.json`。

|           指标            | 结果 |
| :-----------------------: | :--: |
|     完全相同的问题数      | 8/10 |
| HNSW / 精确不一致的问题数 |  2   |
|        对比 Top-K         |  5   |

不一致问题为 `q1` 和 `q5`。这说明当前 HNSW 索引存在可观测的近似召回差异，不能仅凭单次排序一致就宣称索引与精确扫描完全等价。

## 4. 可复核产物与下一步

- JSON 原始结果：`2026-08-27-real-evaluation.json`
- 可重复脚本：`packages/ai-rag-api/scripts/run-real-evaluation.ts`
- 评估题集：`packages/ai-rag-api/data/eval-questions.json`

`2.2.3` 当前仍保持未完成，原因是 300 / 30 / 5、500 / 50 / 10、800 / 100 / 15 三组尚未分别重建 chunk、embedding 和真实索引。下一步应在隔离评估表或受控 Development 数据库中完成三组独立重嵌入，再比较完整指标后选择生产默认参数。

验证命令输出摘要：

```log
documents=248, chunks=4034, sources=248
embeddingModel=@cf/baai/bge-m3
topK=5: lexical hit=0 coverage=0; vector hit=0.8 coverage=0.633333333333333; hybrid hit=0.8 coverage=0.633333333333333
topK=10: lexical hit=0 coverage=0; vector hit=0.8 coverage=0.633333333333333; hybrid hit=0.8 coverage=0.633333333333333
topK=15: lexical hit=0 coverage=0; vector hit=0.8 coverage=0.7; hybrid hit=0.8 coverage=0.7
HNSW_vs_exact_identical=8/10
```
