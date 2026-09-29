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

1. **单文件增量断言**：人为修改一个 `docs/**` md → push main → 核对仅该文件重新 embedding（触发路径已实机验证，精确断言待下次自然文档更新时补做）。
2. **次日 schedule 核对**（4.3）：UTC 18:30 自动运行，物理需等一天，Actions 页面核对。
