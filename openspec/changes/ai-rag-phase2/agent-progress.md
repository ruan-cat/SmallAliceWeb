# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-19
- Change：`ai-rag-phase2`
- 当前状态：`tasks.md` 仍为唯一任务源；OpenSpec CLI 显示原有基线任务中 7 项完成，当前先推进新增 §2.1.0 1024 维契约迁移试点，再进入 §2.1.1/§2.1.2 外部证据收口。
- 本 checkpoint：A0/A1/A2 已完成；真实 development Neon 已连接，0000/0001/0002 migration、vector/核心表/HNSW 与 FTS/vector SQL smoke 已验证；真实 embedding 尚未成功。
- 阻塞点：`api.code-tab.com` 的 `/v1/models` 没有 embedding 模型，配置的 `text-embedding-3-small` 返回“不受该账户支持”；已执行的真实同步为 partial，0 个 chunk 写入，数据库无半成品。文本模型已切换并验证为 `gpt-5.4-mini`。
- 本 checkpoint 决策：放弃 `vector(1536)` 设计，正式采用 Cloudflare Workers AI `@cf/baai/bge-m3` 固定 1024 维；Nitro 通过 Cloudflare OpenAI-compatible `/v1/embeddings` 接口接入，chat 继续与 embedding 分离；0002 已在 development 数据库执行并核对 `vector(1024)` 与 HNSW 索引，真实 Cloudflare smoke 与 Vercel 环境变量接线仍未完成。
- Preview 明确 `SKIPPED_NOT_AUTHORIZED`；不创建 preview 部署或 preview 回归。
- 证据：`.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/runs/2026-08-19-ai-rag-phase2/`。

## 2. 继续执行规则

- 后续只从 `tasks.md` 读取下一项，不得恢复 `docs/superpowers` 两条旧路径。
- 历史原文只从 `history/*.superpowers.md` 审计，不得重新勾选其中任务。
- 新发现工作先进入 `tasks.md`；失败与禁止重复路径进入 `agent-findings.md`。
- 任何外部能力只有拿到自身真实证据后才允许勾选完成。
- 恢复入口：先完成 §2.1.0a 的 1024 维 schema/index migration 设计核对与 §2.1.0b provider 单测，再在取得 Cloudflare 凭据后执行 1 条维度 smoke、5–10 条批量 smoke、最多 100 条真实 embedding 同步；随后验证重复同步、失败保留、并发 409 与真实向量检索。当前 journal baseline 不替代完整 migration snapshot 治理。

## 3. 2026-08-20 实施收口

- `tasks.md` §2.1.0a 已完成并勾选：代码 schema、Drizzle 0002 migration、检索常量、同步校验与 development Neon 数据库均已切换为 1024 维；迁移前核对为空库 `vector(1536)`，迁移后核对为空库 `vector(1024)`，HNSW 余弦索引存在。
- `tasks.md` §2.1.0b 只完成本地代码与测试，不勾选：已新增 Cloudflare provider、Nitro runtime config 与插件装配，且本地 provider 单测、runtime 配置测试、类型检查和 Vercel build 通过；真实 Cloudflare 单条 smoke 仍未执行。
- 最新验证：`openspec validate ai-rag-phase2 --strict` 通过；`pnpm --filter @ruan-cat-drill-doc/ai-rag-api test` 18 个测试文件 / 70 个用例通过；`pnpm --filter @ruan-cat-drill-doc/ai-rag-api typecheck` 通过；`pnpm --filter @ruan-cat-drill-doc/ai-rag-api run build:vercel` 通过；`git diff --check` 通过。
- Vercel env 现状：`NITRO_CLOUDFLARE_ACCOUNT_ID` 与 `NITRO_EMBEDDING_MODEL=@cf/baai/bge-m3` 已写入 `smallalice-docs-ai-nitro-api` 的 Production、Preview、Development；`NITRO_CLOUDFLARE_API_TOKEN` 已写入 Production、Preview 的 Sensitive 变量，并写入 Development 的 Non-sensitive 变量，Development 临时拉取已确认有效值。README 已同步说明 Vercel 对 Development 不支持 sensitive 这一平台限制。
