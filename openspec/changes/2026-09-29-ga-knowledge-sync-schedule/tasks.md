# 任务清单：knowledge-sync GA 调度触发路径（SY-0 变更包）

> 实施顺序遵循 plan 18.7：本变更包 spec 修订先行合入（openspec validate 通过）→ SY-2（Secrets，可与 spec 并行准备）→ SY-1（workflow 文件）→ SY-3（首跑与增量验证）。spec 纪律：spec 修订合入后才允许合入 workflow 文件。`packages/*` 零代码改动——管线全复用现有 `rag:sync` 脚本。

## 1. 规格门禁（SY-0，本变更包自身）

- [x] 1.1 [验证] `openspec/changes/2026-09-29-ga-knowledge-sync-schedule/` - proposal.md 与 delta spec（`specs/ai-rag/knowledge-sync/spec.md`）已就位：Requirement 5 的 MODIFIED 版本（触发方式四路枚举 + Vercel Cron 表述校准）与 Requirement 8 的 ADDED 版本（GA 双触发 + 手动、Secrets 前提、并发纪律、部署边界）。
- [x] 1.2 [验证] `openspec validate 2026-09-29-ga-knowledge-sync-schedule --strict` - 输出 `Change '2026-09-29-ga-knowledge-sync-schedule' is valid`（exit 0），workflow 合入门禁已开。

## 2. SY-1 workflow 文件（plan 18.3，spec 门禁开后执行）

- [ ] 2.1 [新增] `.github/workflows/rag-sync-schedule.yaml` - 双触发 + 手动 workflow：push main `paths: ["docs/**"]` + schedule（UTC 18:30，北京 02:30 低峰）+ `workflow_dispatch`；concurrency group `rag-sync` 且 `cancel-in-progress: false`；job 步骤为 checkout → pnpm 安装 → 构建 `@ruan-cat-drill-doc/ai-rag-core` → 执行 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api run rag:sync`，并注入 8 类 `NITRO_` Secrets 环境变量。
  - 验收：yaml 语法合法；变量清单与探索笔记 E 第 84-93 行核查表一致（8 类必填 + `NITRO_REPOSITORY_ROOT`/`NITRO_KNOWLEDGE_SOURCE_ROOT` 可省略）；无任何 Secret 明文。

## 3. SY-2 Secrets 配置（plan 18.4，可与本变更包 spec 并行准备）

- [ ] 3.1 [配置] GitHub 仓库 Settings → Secrets and variables → Actions 逐项配置 8 类：`NITRO_DATABASE_URL`（pooled 即可）、`NITRO_SYNC_DATABASE_URL`（**必须 non-pooled 直连串**，从 Neon 控制台获取）、`NITRO_EMBEDDING_MODEL`、`NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_CLOUDFLARE_API_TOKEN`、`NITRO_KNOWLEDGE_SYNC_TOKEN`（门禁变量，非空即可）、`NITRO_CRON_SECRET`（门禁变量，非空即可）、按激活 provider 配置 `NITRO_ANTHROPIC_API_KEY`（切 OpenAI 时换 `NITRO_OPENAI_API_KEY`）。
  - 凭据纪律：全部走 GitHub 加密 Secrets；禁止出现在 workflow 日志、代码、文档与本仓库任何文件（AGENTS.md 既有红线）。
  - 验收：`gh secret list` 可见 8 个条目。

## 4. SY-3 首跑与增量验证（plan 18.5）

- [ ] 4.1 [验证] `workflow_dispatch` 手动首跑：未变更轮快速通过（读 290 文件 + 哈希对比，预期分钟级），Actions 页面运行记录 success。
- [x] ~~4.2 [验证] 人为修改一个 `docs/**` 下 md → push main → 触发增量~~（2026-09-29 22:10 用户决策取消：docs/docx 整目录 gitignored、origin/main 不含知识源，push 路径前提不成立；详见 browser-evidence/EV/2026-09-29-remaining-items-plan.md 第 2.3 节）。知识源分发机制为独立开放决策。
- [ ] 4.3 [验证] 次日核对 schedule 自动运行成功（Actions 运行历史）。
- [ ] 4.4 [验证] 检查 workflow 日志无任何 Secret 值泄漏（GitHub 自动 `::add-mask::` 之外人工复核）。
