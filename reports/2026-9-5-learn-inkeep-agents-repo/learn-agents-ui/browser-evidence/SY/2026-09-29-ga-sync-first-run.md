# 2026-09-29 GA 知识库同步首跑实机验证（SY-2 + SY-3 部分）

> 本文档由 WorkBuddy（GLM-5.3-Flash）沉淀。对应 plan 18.4/18.5（SY-2 Secrets + SY-3 首跑）。

## 1. 一句话结论

> **SY-2 Secrets 9 项全配置 + SY-3 首跑实机 SUCCESS**：workflow_dispatch 与 main push 双触发路径均实机通过（dispatch 3m6s / push 1m50s），rag:sync 连真实 Neon 跑通并产出同步记录（id e9a7f151-...），445 行日志 Secret 泄漏扫描零命中。

## 2. SY-2 Secrets 配置证据

| 步骤                | 结果                                                                                                                                                                                                                              |
| :------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| .env.local 键名盘点 | 9 个必需键全部在盘（含 NITRO_SYNC_DATABASE_URL）                                                                                                                                                                                  |
| non-pooled 校验     | SYNC 与 DATABASE 值不同 + SYNC 无 pooler 标记（布尔判定，值未回显）                                                                                                                                                               |
| gh secret set ×9    | NITRO_DATABASE_URL / NITRO_SYNC_DATABASE_URL / NITRO_EMBEDDING_MODEL / NITRO_CLOUDFLARE_ACCOUNT_ID / NITRO_CLOUDFLARE_API_TOKEN / NITRO_KNOWLEDGE_SYNC_TOKEN / NITRO_CRON_SECRET / NITRO_ANTHROPIC_API_KEY / NITRO_OPENAI_API_KEY |
| gh secret list 实证 | 9 条 2026-09-29T12:04 全新时间戳                                                                                                                                                                                                  |

## 3. 首跑与双触发证据

```log
=== workflow_dispatch 首跑（run 36569710912）===
✓ sync in 1m32s
✓ pnpm install --frozen-lockfile
✓ pnpm --filter @ruan-cat-drill-doc/ai-rag-core build
✓ pnpm --filter @ruan-cat-drill-doc/ai-rag-api run rag:sync
  → 输出同步记录 {"id":"e9a7f151-286e-49ad-8c97-fa65d8abfb36","status":...

=== main push 自动触发（run 36569673693，docs/** 路径命中）===
completed success · 1m50s

=== 泄漏复核（445 行日志）===
postgres:// 明文: 0 / sk- key 明文: 0 / Bearer 明文: 0
```

- push 触发路径随本次 dev→main 直推（fast-forward，`git merge-base --is-ancestor` 先行验证）顺带实机验证。
- concurrency 组排队语义在两个 run 交叠期间生效（cancel-in-progress: false）。

## 4. SY-3 剩余待办

1. ~~**单文件增量断言**~~：**2026-09-29 22:10 用户决策正式取消**——前提不成立（docs/docx gitignored、origin/main 无知识源），不再作为验收项；plan 18.5/18.7/19.6 已同步标注。
2. **次日 schedule 核对**（4.3）：UTC 18:30 自动运行，物理需等一天，Actions 页面核对。

## 5. 口径修正（2026-09-29 晚间补录）

第 1/3 节「首跑 SUCCESS」需降级为两层口径：

- **workflow 管线层 SUCCESS**：checkout/install/构建/脚本执行链路全部跑通，CLI exit 0。
- **同步层 PARTIAL（假绿）**：真实统计 `status:"partial", scannedFileCount:0, failedFiles:["docs/docx"]`——`docs/docx` 整目录 gitignored（.gitignore:55），`origin/main` 不含知识源，CI checkout 内无任何 md 可扫。

**影响面**：push main `paths: docs/**` 触发的设计前提在当前仓库形态下不成立（知识源不进 git）；schedule 兜底轮同样扫 0 文件。research-notes/E「checkout 内天然有 docs/docx」为错误断言。知识源分发机制（进 git / CI 生成 / 维持本地 CLI 为主）待用户拍板后另行修订 spec 与 workflow。

## 6. 终局决策（2026-09-30 00:36）

用户拍板**知识源分发选方案 C：本地 CLI 为主、手动低频更新**——GA 调度路线正式搁置（CI 内无知识源，push/schedule 均空转）。workflow 文件保留空转留档；SY-3 4.3 schedule 核对失去实际意义，由 automation（f0b99da9）代执行记录后关闭。本文件第 1/3 节的「SUCCESS」按第 5 节两层口径理解；本地 `rag:sync` 为唯一同步事实源。

### 6.1 schedule 空转轮实证补记（2026-10-31）

第 6 节原计划由一次性 automation（f0b99da9，2026-09-30 02:40 GMT+8 触发）代执行 schedule 核对并把结论追加到本节，但该 automation 历史已不可回收（2026-10-31 当前工作区自动化列表为空），核对结论从未落盘，形成证据链缺口。2026-10-31 改由主数据直查完成核对，闭环如下。

**run list 取样结论**（`gh run list --workflow=rag-sync-schedule.yaml --limit 12`，取样口径为最近 12 次）：2026-10-19 ~ 2026-10-30 连续 12 次 schedule 触发，全部 workflow 层 success（每日一次；GitHub 调度存在 0~4 小时延迟，实际触发时刻 21:03~22:53 UTC）。

**最新 schedule run 41138923320（2026-10-30 22:33 UTC，job sync 1m10s）的同步层真实统计**（Actions 日志原文提取）：

```log
{"id":"2427c5f2-3dcb-486d-b373-7169fe4f3513","status":"partial","scannedFileCount":0,"unchangedFileCount":0,"createdFileCount":0,"updatedFileCount":0,"deletedFileCount":0,"writtenChunkCount":0,"failedFiles":["docs/docx"],"startedAt":"2026-10-30T22:34:45.139Z","finishedAt":"2026-10-30T22:34:46.957Z"}
```

**结论**：与方案 C 预期完全一致——空转轮（workflow 层 success、sync 层 partial、扫 0 文件、failedFiles=[docs/docx]）；knowledge_sync_runs 审计记录持续产出。
