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
- Vercel `smallalice-docs-ai-nitro-api` 的 Production Branch 已从 `dev` 改为 `main` 并由登录 Chrome 页面回读；下一条同步到 main 的提交将触发目标 Production build。
- 首次 main Production deployment 已完成 Git checkout/build，但 `/v1/search` 在函数加载阶段触发 Rolldown 跨 chunk CommonJS helper 循环。`rolldownConfig.output.inlineDynamicImports=true` 已使本地函数产物收敛为单个可直接 import 的 entry；待下一条 main Git deployment 验证。
- 文档站 Project `small-alice-web-odse` 已确认追踪 `main`，并已写入 Production/Preview 的 `VITE_RAG_API_BASE`；客户端 transport 与 Nitro `/v1/**` CORS 变更待下一条 main commit 的双项目 Git deployment 验证。
- 2026-08-24 的 Production 预检发现：`routeRules.cors=true` 会附加 CORS 响应头，但未匹配的 `OPTIONS /v1/chat` 仍是 404，浏览器 JSON POST 会被阻断。已新增 `server/middleware/rag-cors.ts`，使 `/v1/**` 预检返回 204；新增回归测试、API typecheck 和 Vercel bundle build 均通过，待提交并由 main Git deployment 复验。
- 生产部署与浏览器验证尚未完成；下一步以修复后的 main Git Integration deployment 完成 §2.1.4 的生产后端驱动浏览器回归。
