# 二期 AI RAG 发现与风险

## 1. 当前有效发现

- **resolved**：正式 RAG 使用 Neon PostgreSQL + pgvector + PostgreSQL FTS + RRF；早期 Chroma 学习草案已从当前任务源移除，不得恢复为正式依赖。
- **resolved**：Cloudflare `bge-m3` 1024 维 embedding 已完成真实同步和三档参数评测；25 条串行批次与 400/413 自动二分策略在 6000+ chunks 上无 400/413。
- **resolved**：生产 `/v1/search`、`/v1/chat`、Anthropic Messages 流式、停止生成、来源 DTO 与稳定 `#rag-heading-*` 跳转均有真实证据。
- **resolved**：`2.2.3` HNSW/exact Top-5 一致率为 8/10、9/10、9/10；`2.2.4` Chrome/CDP 生产验收已通过。
- **active**：`dev` 当前为 `5418ff6`，任务清单 23/23；`origin/main` 为 `8bb2b9f`，尚未包含后续 README/设计/任务口径提交，因此生产页面仍展示旧状态文案。
- **active**：2026-08-31 根级 `pnpm run typecheck` 失败于未改动的 `packages/ai-vue-doc` Nuxt typecheck：TS5101 要求处理 `baseUrl` 弃用；RAG 专项 typecheck/test 仍通过。
- **active**：2026-08-31 live chat 观察在 41.9 秒后主动停止，Vercel runtime logs 记录 abort + AbortError；这是取消链路证据，不是自然完成的新鲜 chat 成功证据。
- **active**：AI 对话浮层视觉层级和信息密度被用户判定需要专业 UI 设计重构，另开 UI 任务，不混入本 change。

## 2. 固定约束

- `tasks.md` 是唯一任务源；未经验证不得勾选；本地测试/build 不能替代生产或浏览器证据。
- 禁止 `neonctl` 与任何包装器；数据库操作先 `pnpm run neon:guard`；禁止输出连接串、密码或 token。
- 正式数据资源固定为 Neon `patient-cloud-43432277` / `neondb`，不得创建第二套同用途资源。
- 文档站 Production 只由 `main` Git Integration 触发；推送后用全局 `vercel ls/inspect --wait/--logs` 按 SHA 监听至 READY，再进行 Chrome/CDP。
- 保留用户的 `prompts/01.prompts.md` 改动；`reports/2026-8-28-use-Chroma/` 为独立调研产物。
