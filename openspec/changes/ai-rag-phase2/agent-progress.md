# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-19
- Change：`ai-rag-phase2`
- 当前状态：`tasks.md` 仍为唯一任务源；OpenSpec CLI 显示 23 项中 7 项完成，当前推进 §2.1.1/§2.1.2 外部证据收口。
- 本 checkpoint：A0/A1/A2 已完成；真实 development Neon 已连接，0000/0001 migration、vector/核心表/HNSW 与 FTS/vector SQL smoke 已验证；真实 embedding 尚未成功。
- 阻塞点：`api.code-tab.com` 的 `/v1/models` 没有 embedding 模型，配置的 `text-embedding-3-small` 返回“不受该账户支持”；已执行的真实同步为 partial，0 个 chunk 写入，数据库无半成品。文本模型已切换并验证为 `gpt-5.4-mini`。
- 本 checkpoint 调研结论：当前 `vector(1536)` 设计仍需要真正的 embedding provider；推荐优先验证 Gemini `gemini-embedding-001` 的 1536 维输出，Cloudflare Workers AI / Hugging Face 作为备选；尚未取得这些渠道的凭据或真实调用证据。
- Preview 明确 `SKIPPED_NOT_AUTHORIZED`；不创建 preview 部署或 preview 回归。
- 证据：`.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/runs/2026-08-19-ai-rag-phase2/`。

## 2. 继续执行规则

- 后续只从 `tasks.md` 读取下一项，不得恢复 `docs/superpowers` 两条旧路径。
- 历史原文只从 `history/*.superpowers.md` 审计，不得重新勾选其中任务。
- 新发现工作先进入 `tasks.md`；失败与禁止重复路径进入 `agent-findings.md`。
- 任何外部能力只有拿到自身真实证据后才允许勾选完成。
- 恢复入口：提供支持 1536 维 embedding 的已授权渠道/模型后，重新拉取 development env，执行最多 100 条真实 embedding；随后验证重复同步、失败保留、并发 409 与真实向量检索。当前 journal baseline 不替代完整 migration snapshot 治理。
