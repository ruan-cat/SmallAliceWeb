# RAG embedding 命令、模型消耗与频度纪律

本页面向需要接手 AI RAG 知识库维护的同事，说明知识库相关 CLI 命令的执行成本、Cloudflare embedding 模型的额度消耗规律，以及批量执行时的频度纪律。数据来自 2026-09-29 的三次真实运行实测与 Cloudflare 官方定价页，详细论证见仓库内报告 `reports/2026-9-5-learn-inkeep-agents-repo/2026-09-29-chunk-embedding-cost-and-cadence-report.md`。

## 1. 读者先看结论

1. **embedding 用 Cloudflare Workers AI 的 `@cf/baai/bge-m3`**（1024 维），免费额度 **10,000 Neurons/天 ≈ 930 万 input tokens/天**，本项目常规使用**完全够用、无需付费**。
2. **单次全量同步约 1,600 Neurons（日额度的 15%~20%）**；**参数评估一轮约 5,200 Neurons（约一半日额度）**，是唯一的大户。
3. **增量同步与每日兜底轮几乎零消耗**（内容哈希未变的文件自动跳过 embedding）。
4. **频度红线**：全量重建与参数评估不要同日叠加；单日 Neurons 总预算 ≤ 10,000。
5. **写库不是瓶颈**：Neon 写库秒级，embedding 网络调用占整条链路 95% 以上时间。

## 2. 命令清单与耗时实测

全部命令在**仓库根目录**执行（评估脚本内部按 `process.cwd()` 定位知识源）：

|                                                 命令                                                  |                  用途                  |      实测耗时      |  Neurons 消耗  |
| :---------------------------------------------------------------------------------------------------: | :------------------------------------: | :----------------: | :------------: |
|                      `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run rag:sync`                      |       一次性全量/增量同步到 Neon       | 5 分钟量级（全量） | ≈1,600（全量） |
|    `node_modules/.bin/tsx --env-file=.env.local packages/ai-rag-api/scripts/run-rag-evaluation.ts`    |       检索评估（默认 dry 模式）        |        秒级        |       0        |
|   `node_modules/.bin/tsx --env-file=.env.local packages/ai-rag-api/scripts/run-real-evaluation.ts`    | 真实检索评估 + HNSW/精确扫描一致性对比 |      ≈1 分钟       |      ≈11       |
| `node_modules/.bin/tsx --env-file=.env.local packages/ai-rag-api/scripts/run-parameter-evaluation.ts` |    三种 chunk profile 全量对比评估     |     **18m30s**     |     ≈5,200     |

注意两点：

1. **`run-parameter-evaluation` 耗时很长是预期行为**：它要对 290 个文档做三种 chunk profile 的全量 embedding（约 18,900 个 chunk、750 批次请求），18 分钟属于正常水平，不是卡死。控制台会持续输出 `profile=xxx embedded=当前/总数` 进度行。
2. **评估脚本的批次是 25 条/请求**，同步主链路是 100 条/请求——前者请求数多 4 倍，属低频操作无需优化。

## 3. embedding 模型与额度账本

|            项目             |                            数值                             |
| :-------------------------: | :---------------------------------------------------------: |
|            模型             |             `@cf/baai/bge-m3`（1024 维 dense）              |
|          计费单位           |   Neurons：**bge-m3 = 1,075 Neurons / 百万 input tokens**   |
|          免费额度           | **10,000 Neurons/天**（UTC 00:00 重置，免费与付费计划同享） |
|        免费额度换算         |                  ≈ 930 万 input tokens/天                   |
|     知识源规模（实测）      |        290 个 md、2,236,340 字符 ≈ 140~190 万 tokens        |
| 超额单价（需 Workers Paid） | $0.011 / 1,000 Neurons ≈ bge-m3 超额后 $0.012 / 百万 tokens |

各场景单次消耗速查：

|              场景               |      Neurons      | 占日额度 |
| :-----------------------------: | :---------------: | :------: |
|    全量同步（290 文件重建）     |      ≈1,600       |  15~20%  |
| 参数评估一轮（三 profile 全量） |      ≈5,200       |   ≈50%   |
|      真实检索评估（10 题）      |        ≈11        |  ≈0.1%   |
|            dry 评估             |         0         |    0     |
|     增量同步（仅变更文件）      |       ≈0~11       |   ≈0%    |
|     每日兜底轮（schedule）      | 0（哈希对比跳过） |    0     |

## 4. 频度纪律

> **✅ 2026-09-30 决策：知识源分发选方案 C——本地 CLI 为主、手动低频更新。** 知识库更新 = 维护者本地执行 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run rag:sync`（直连 Neon 写入）。GitHub Actions 调度路线已搁置（CI 内无知识源，docs/docx 被 gitignore），workflow 文件保留空转留档。

|                场景                |          建议频度          | 理由                             |
| :--------------------------------: | :------------------------: | :------------------------------- |
|         push 驱动增量同步          |   事件驱动（有变更才跑）   | 成本与变更量成正比，常态近零     |
|            每日兜底同步            |          1 次/天           | 空转零成本，防漏                 |
| 全量重建（profile/模型变更才需要） | 触发时单日 ≤1 次，低峰执行 | 单次 1,600 Neurons，避免叠加撞顶 |
|              参数评估              |      按需，单日 ≤1 轮      | 占日额度一半，是唯一大户         |

三条红线：

1. **单日 Neurons 总预算 ≤ 10,000**（免费额度，Neurons 是账户级共享池，同账户其他 Workers AI 调用会共同消耗）。
2. **全量重建与参数评估错峰，不同日执行**。
3. **避开 UTC 00:00 前后**跑全量（额度重置边界 + Cloudflare 偶发 502，实测等待 90 秒重试即可恢复，脚本无自动重试，人工重跑即可）。

## 5. 写库行为速览

- **同步主链路**真实写 Neon 三张表：`documents`（幂等索引）、`chunks`（向量 + 元数据）、`knowledge_sync_runs`（审计）。每文档一个事务：先完成该文件全部 embedding 与 1024 维校验，再原子替换旧版本——单文档重建失败时旧版本保持可检索。
- **评估脚本**不写真实业务表：写会话级 TEMP TABLE（连接关闭自动消失），仅评估完成后向 `evaluation_runs` 落一行审计。
- 并发防护：同步持 PostgreSQL advisory lock（`NITRO_SYNC_DATABASE_URL` 必须是 non-pooled 直连串），并发同步返回 409。

## 6. 环境变量前提

同步与评估脚本依赖以下环境变量（本地 `.env.local`，CI 走 GitHub Actions Secrets，清单与维护方式见 `openspec/changes/2026-09-29-ga-knowledge-sync-schedule/tasks.md`）：

`NITRO_DATABASE_URL`（pooled）、`NITRO_SYNC_DATABASE_URL`（**必须 non-pooled 直连**，advisory lock 正确性要求）、`NITRO_EMBEDDING_MODEL`、`NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN`、`NITRO_KNOWLEDGE_SYNC_TOKEN`、`NITRO_CRON_SECRET`、按激活 provider 的 `NITRO_ANTHROPIC_API_KEY` 或 `NITRO_OPENAI_API_KEY`。

凭据纪律：全部走加密 Secrets / 本地 env 文件，禁止出现在代码、日志与本仓库任何文档中。
