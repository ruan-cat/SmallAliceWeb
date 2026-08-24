# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-24
- Change：`ai-rag-phase2`；唯一任务源仍是 `tasks.md`。
- 已完成：§2.1.0a 的 `vector(1024)`/HNSW 迁移、§2.1.0b 真实 Cloudflare embedding、§2.1.1 PostgreSQL provider、§2.1.2 真实同步与 advisory lock，以及 §2.1.3 Development search/chat 装配。
- 当前任务：§2.1.4 文档站与生产 Nitro 的浏览器端到端回归。

## 2. 最近验证

- `pnpm run neon:guard` 通过。
- `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test`：18 个文件 / 70 个用例通过；typecheck 通过。
- 真实 Cloudflare provider：单条 1 个 1024 维有限向量；单次批量 5 个 1024 维有限向量。
- Development Neon：真实同步后 15 documents / 160 chunks；HNSW 与精确检索各返回 5 条且排序一致。
- Development Nitro：`/v1/search` 返回 3 条来源 DTO；`/v1/chat` 返回 AI SDK data-stream、来源帧和内容帧。
- 本地 Development env 仅保存于被忽略的 `.env.ai-rag-phase2.smoke`；未输出连接串或 token。

## 3. 下一步与边界

- `NITRO_SYNC_DATABASE_URL` 已三环境接线；以 scanner gate 固定临界区后，真实 Development service 的第二轮同步返回 `KNOWLEDGE_SYNC_CONFLICT` / 409，回归测试已覆盖。
- 生产部署与浏览器验证尚未开始；下一步完成 §2.1.4 的生产后端驱动浏览器回归。
