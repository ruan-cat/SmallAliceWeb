# 2026-08-28 三档参数真实评测

## 1. 验证命令

```log
pnpm run neon:guard
node --env-file=.env.local node_modules/tsx/dist/cli.mjs packages/ai-rag-api/scripts/run-parameter-evaluation.ts
```

评测使用 PostgreSQL TEMP TABLE 与 Cloudflare `@cf/baai/bge-m3` 1024 维 embedding；批量请求采用 25 条串行批次，遇 HTTP 400/413 自动二分。正式 `documents`/`chunks` 表未写入。

## 2. 结果汇总

|    参数集    | 非空 chunks | Vector 命中率 | Vector 平均关键词覆盖率 | Hybrid 命中率 | Hybrid 平均关键词覆盖率 | HNSW/exact Top-5 一致 |
| :----------: | :---------: | :-----------: | :---------------------: | :-----------: | :---------------------: | :-------------------: |
|  `300/30/5`  |    6,289    |     0.70      |          0.60           |     0.70      |          0.60           |         8/10          |
| `500/50/10`  |    6,034    |     0.70      |         0.6667          |     0.70      |         0.6667          |         9/10          |
| `800/100/15` |    5,946    |     0.80      |          0.70           |     0.80      |          0.70           |         9/10          |

每题检索 ID 与完整原始结果见 `2026-08-27-real-parameter-evaluation.json`（文件名沿用脚本既有路径，实际运行于 2026-08-28）。

## 3. 结论与剩余门禁

- 三档全量 embedding 均完成，没有再次出现 400/413；自适应批量策略在大样本下有效。
- 当前样本中 `800/100/15` 的 vector/hybrid 指标最佳，但 lexical 三档均为 0/10，参数选择仍需结合产品目标；HNSW 与 exact 的 Top-5 一致率分别为 8/10、9/10、9/10。
- HNSW 对照在每个 profile 的 TEMP TABLE 上完成，查询期间通过同一 reserved connection 临时切换 planner 开关；正式表未写入。
