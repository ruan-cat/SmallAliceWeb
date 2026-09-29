# 2026-09-29 EV/SY 遗留事项补做计划与执行记录

> 本文档由 WorkBuddy（GLM-5.3-Flash）于 2026-09-29 20:52 沉淀，用户已授权五项遗留事务补做。先落计划与验证设计，逐项执行后在本文件回填证据。

## 1. 事务清单与验证设计

| #   | 事务                       | 验证手段                                                                                                                                                                                                                                   | 通过标准                                                                                                |
| :-- | :------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| 1   | 真实 DB 迁移可重放 smoke   | 临时 tsx 脚本直连 Neon（pooled NITRO_DATABASE_URL）：①确认 evaluation_runs 不存在 → ②执行 drizzle/0005 迁移 → ③重放第二次（幂等） → ④INSERT→SELECT 往返断言 → ⑤DELETE 清理                                                                 | 迁移两次执行均成功；往返字段一致；清理后无残留                                                          |
| 2   | 三 CLI 脚本真实运行 + 查表 | 顺序：run-rag-evaluation(dry，零 provider 调用) → run-real-evaluation（检索评估）→ run-parameter-evaluation（临时知识库全量 embedding ×3 profile，成本最大放最后）；脚本自 parse .env.local 注入环境变量；每个脚本后连库 SELECT 断言新增行 | evaluation_runs 表按 kind 各新增一行（retrieval/promptfoo、real、parameter），metrics 非空              |
| 3   | 与 SY-3 首跑联调同批补做   | 即事务 1+2 的执行批次                                                                                                                                                                                                                      | 同上                                                                                                    |
| 4   | 单文件增量断言             | docs/docx 某 md 追加 HTML 注释行（渲染不可见、contentHash 必变）→ commit → push dev → fast-forward push dev:main → GA run 完成后连库断言                                                                                                   | knowledge_sync_runs 最新行 updated_file_count=1、unchanged≈290；documents.last_synced_at 仅目标文件刷新 |
| 5   | 次日 schedule 核对         | 一次性 automation（2026-09-30 02:40 GMT+8）核对 UTC 18:30 schedule run（Actions API），结论回填本文档第 3.5 节                                                                                                                             | schedule 触发的 run success                                                                             |

## 2. 执行记录（回填区）

### 2.1 事务 1：迁移可重放 smoke —— ✅ ALL PASS（并抓修 jsonb 双重编码缺陷）

```log
PASS 前置状态记录 | 表已存在（重放场景）
PASS 迁移第 1 次执行
PASS 迁移第 2 次重放（IF NOT EXISTS 幂等）
PASS 迁移后表存在
PASS INSERT smoke 行（原生对象参数姿势）
PASS SELECT 往返字段断言 | id=true datasetVersion=true kind=true paramsType=object(smoke=true) metricsType=object(roundTrip=true) corpusIsolationNull=true createdAtDate=true
PASS DELETE 清理并确认无残留
SMOKE RESULT: ALL PASS
```

- evaluation_runs 表已在真实 Neon 库落地（0005 迁移执行两次幂等通过）。
- **意外收获——jsonb 双重编码真实缺陷**：首跑往返断言失败暴露 postgres-js 对 jsonb 列传 `JSON.stringify` 字符串参数会把「JSON 字符串」整体存为 jsonb 的字符串值（双重编码），读回仍是 string。三种姿势实验实证（stringify=string / 原生对象=object / stringify+cast=string）。已修复 `runs-repository.ts` 为原生对象传参（与 knowledge-sync 既有 stringify 模式**不同**，后者为既有生产行为，另行立项披露）。
- smoke 行（id 前缀 smoke-）验证后已删除，无残留。

### 2.2 事务 2：三 CLI 脚本真实运行 + 查表 —— ✅ 三行全落

```log
total rows: 3
kind=parameter | datasetVersion=2e5954c684d8 | params 2 键 | metrics 4 键 | corpusIsolation="PostgreSQL TEMP TABLE; ..."
kind=real      | datasetVersion=2e5954c684d8 | params 1 键 | metrics 4 键
kind=promptfoo | datasetVersion=8bc1bd7279c7 | params 3 键 | metrics 8 键
```

| 脚本                     | 运行       | 波折与修复                                                                                                                                                                                                                           |
| :----------------------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| run-rag-evaluation (dry) | ✅ 秒级    | 无（dry 不调 provider，落库经 recordEvaluationRunFromEnv）                                                                                                                                                                           |
| run-real-evaluation      | ✅ ~1 分钟 | 无（真实 Cloudflare embedding + 检索 + hnsw/exact 对比）                                                                                                                                                                             |
| run-parameter-evaluation | ✅ 18m30s  | ①cwd 须为仓库根（脚本 resolve(process.cwd())）→ SOURCE_ROOT_NOT_FOUND；②TEMP TABLE 缺 search_text 列（0004 迁移加列后脚本未跟上）→ 补列并用 buildEmbeddingText 同源填充；③Cloudflare embedding HTTP 502 瞬时故障 → 等待 90s 重试通过 |

- parameter 评估三 profile（300/30/5、500/50/10、800/100/15）全量 embedding 完成（6737/5949 chunks 量级），lexical 通道经 search_text 同源填充真实可用。
- 三行 jsonb 均为原生对象姿势（`jsonb_object_keys` 正常展开多键，实机确认修复生效）。
- 临时脚本（tmp-migration-smoke.ts / tmp-eval-table-check.ts / tmp-jsonb-lab.ts）已全部删除。

### 2.3 事务 4：单文件增量断言 —— ⛔ 前提不成立，已中止并回滚

**执行中发现设计前提错误，立即中止**：

1. `docs/docx` 整目录在 `.gitignore:55` 被忽略（注释：文件为移动生成的产物），`origin/main` 经 `git ls-tree` 确认不含任何 docs/docx 文件。
2. 因此「修改 docs/** md → push main」在该仓库形态下**永远无法传递知识源变更\*\*——push 路径不成立。
3. 已向目标文件追加的验证注释行已回滚（node 校验 tail-ok=true, no-marker=true，文件还原完整）。

**连带发现（更重要）**：首跑 GA run（36569710912）的同步层真实统计为
`status: "partial", scannedFileCount: 0, failedFiles: ["docs/docx"]` ——
workflow 层 exit 0 造成「SUCCESS」假象，实际 CI checkout 内**没有任何知识源**。
research-notes/E-sync-pipeline.md「checkout 内天然有 docs/docx（290 个 md）」为错误断言。

**待用户拍板的方案空间**：知识源进 git（解除 ignore / 独立仓库）/ CI 内跑 DOCX 转换管线（drill-docx 目录同样被 ignore，需两级产物）/ 维持本地 CLI 同步为事实源、GA workflow 改造或暂停。

### 2.4 事务 5：schedule 核对

已创建一次性 automation（id f0b99da9-679f-4bd7-bdd7-5952e62e87dd，2026-09-30 02:40 GMT+8 触发）：核对 schedule run 状态并把结论追加到 SY 证据文档第 6 节。注意已知背景——CI 内无知识源，同步层预期 partial（不视为核对失败项）。

## 3. 纪律说明

- 全程直连使用 pooled `NITRO_DATABASE_URL`（迁移与评估写入无 advisory lock 需求）；`NITRO_SYNC_DATABASE_URL`（non-pooled）不用于本批 smoke。
- 敏感值（连接串/key）零回显，只输出布尔判定与统计。
- smoke 测试行用固定 id 前缀（`smoke-`）并在验证后删除，不污染真实评估数据。
- 临时脚本执行完即删，不入库。
