# 二期 AI RAG 发现与风险

## 1. 当前权威性

- 二期唯一知识源是 `docs/docx/**/*.md`；图片只保留 URL 元数据，OCR/多模态属于三期。
- `vue-element-plus-x` 的 Bubble/BubbleList/Sender 与 `markstream-vue` 是唯一 UI/Markdown 主线；`@ai-sdk/vue` 仅由业务使用方 `useKnowledgeChat` 调用。
- 未装配 `event.context.rag` 时 chat/search/sync/sync-runs 统一返回 `503 RAG_NOT_CONFIGURED`；runtime assembly 只接受显式 provider 注入。
- 当前唯一可执行任务源是 `tasks.md`；行为契约见 `specs/ai-rag/*/spec.md`，设计决策见 `design.md`。
- 旧 superpowers design/plan 的原始内容只作为 `history/*.superpowers.md` 历史证据存在；原 `docs/superpowers/...` 路径在迁移完成后不得重新创建。历史复选框不具有执行权。

## 2. 旧资料纠偏映射

- 历史 superpowers 内容仅作 `history/*.superpowers.md` 证据；当前行为以 `design.md`、`specs/*`、`tasks.md` 为准。关键纠偏包括独立 Nitro v3、PostgreSQL FTS + pgvector、标准 RRF、Neon/pgvector 主线和 `markstream-vue`。

## 3. 已知风险与事故约束

| 风险/事故                        | 当前约束                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| Windows `neonctl` CPU 自旋       | 禁止 `neonctl`（含 help/version）和包装器；只用官方 `neon`；先跑 `pnpm run neon:guard`  |
| Vercel pnpm/Corepack             | 三环境保持 `ENABLE_EXPERIMENTAL_COREPACK=1`；以真实构建日志确认 pnpm 版本               |
| Vercel 无 `.git` + git-changelog | 保留 `shouldDisableGitChangelog()`；生产优先 Git 集成                                   |
| Nuxt Content/H3 跨运行时         | 保留已验证 `@ztl-uwu/nuxt-content@2.13.9`、`h3@1.15.11`、`@vueuse/nuxt@14.3.0` 兼容矩阵 |
| Windows docs build               | 约 8 GiB Node heap、串行；短时高 CPU/无输出不能直接判死锁                               |
| `pnpm-lock.yaml` 被忽略          | 无 Git diff 不能证明依赖解析未变化                                                      |
| sync provider 离线 fake          | 必须由 `tasks.md` 2.1.2 的真实同步实现替换，不能以 accepted/空数组宣称成功              |
| Shiki 兼容性未证实               | 先验证 markstream 自带 shiki 路径；无证据前禁止独立接入 `@shikijs/stream`               |
| 生产浏览器回归未完成             | 本地受控 fetch 流不能代替生产后端驱动 E2E                                               |
| 本地 build/test ≠ 云端可用       | PostgreSQL、embedding、模型、Vercel/浏览器均要独立外部证据                              |

## 4. 迁移与当前实现决策点

- `knowledge_sync_runs` 当前实现已知缺“写入 chunk 数”字段，而 knowledge-sync spec 要求该字段；真实同步时必须补 schema 或显式修正规格，不能静默忽略。
- Neon 命名：`neon-smallalice-ai-rag` 是 project name，project ID `patient-cloud-43432277`；业务 database 是 `neondb`；organization `org-super-fog-48541962`。
- 2026-08-10 事故记录中的 `16 测试文件 / 51 用例` 是点时快照；未 fresh rerun 前不覆盖 OpenSpec 的 `15 文件 / 49 用例` 当前基线。
- `.superpowers/sdd/` 的本地日志不属于任务源；历史过程若需审计只作证据读取。
- 旧 plan Task 5 的“待确认”状态已被后续实现证据取代，当前 `tasks.md` 1.6 为已完成 runtime assembly 离线合同。
- 两个迁入 `history/*.superpowers.md` 的历史文件刻意保持原 blob，不清洗其过时文字；当前权威性由本文件、`design.md`、specs、`tasks.md` 决定。

## 5. 禁止重复路径

- 禁止重新创建 `docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md` 或 `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md`。
- 禁止维护第二套 superpowers 二期任务清单；新工作先进入 `tasks.md`。
- 禁止 `neonctl`、`npx` 替代、绕过 `neon:guard`、新建第二个同用途 Neon project/database、migration 使用 pooled URL。
- 禁止把连接串、密码、token 写入仓库、报告、测试快照或终端记录。
- 禁止自研 Markdown parser/打字机；禁止 Element Plus X Typewriter 包裹助手 Markdown。
- 禁止空结果/accepted 伪成功；未装配必须保持 `503 RAG_NOT_CONFIGURED`。
- 禁止移除 `shouldDisableGitChangelog()` 或用关闭 Content 搜索/prerender 掩盖依赖问题。
- 禁止修改、暂存或回滚与本 change 无关的用户既有文件。

## 6. 待办入口

- P0：`tasks.md` §2.1——真实 PostgreSQL、embedding、同步、模型和生产浏览器闭环。
- P1：`tasks.md` §2.2——Shiki、同步触发、真实评估调优、build/deploy 回归。
- P2：`tasks.md` §2.3——README 与演示视频。
- 历史学习 / 里程碑：`tasks.md` §3–§4；无新证据不得勾选。

## 7. 2026-08-19 授权推进发现

- **resolved**：A0 `pnpm run neon:guard` 通过；A1 通过 Vercel CLI 重新拉取 development env，确认 `POSTGRES_URL_NON_POOLING`、Neon project ID 与 Nitro 配置存在，且目标为 `patient-cloud-43432277` / `neondb`。
- **resolved**：本地 Drizzle 资产误生成的重复 `0000_nosy_punisher.sql` 与 snapshot 已移除；保留已跟踪 `0000_ai_rag.sql`，journal 唯一登记 `0000_ai_rag`。16 个测试文件/55 个用例、typecheck、diff check 均通过。
- **active**：不能因 journal baseline 或离线 PostgreSQL provider 合同而宣称 2.1.1 完成；真实 development DB 可能已执行初始 SQL，恢复时先只读核对 `__drizzle_migrations`、extension、tables、HNSW index，再决定 baseline/增量策略。
- **active**：A4 preview 依据更具体的授权布尔值保持 `SKIPPED_NOT_AUTHORIZED`；A5 production 不得在 development 真实闭环、Git SHA/READY 与 docs/API 两项目证据齐全前执行。
- **resolved**：A2 `db:migrate` 已成功应用 0000 baseline 与 0001 `written_chunk_count`；只读核对确认 vector extension、3 张核心表、embedding 列、HNSW index 和 `drizzle.__drizzle_migrations` 均存在。实际 FTS/vector SQL smoke 成功执行，结果为空库 0 行。
- **active**：A3 真实同步扫描 271 个文件/5534 个 chunk；硬上限 100 生效，但当前渠道模型列表只有 GPT/图像模型，`text-embedding-3-small` 不受支持。真实同步返回 partial、`writtenChunkCount=0`，数据库 `documents=0`、`chunks=0`，无半成品。替换为支持 embedding 的授权渠道后再继续。
- **resolved**：development `NITRO_CHAT_MODEL` 已通过 Vercel CLI 切换为 `gpt-5.4-mini`；单条 `generateText` smoke 成功返回 `RAG smoke ok`。该文本模型不能替代 embedding provider。
- **active**：Drizzle `meta` 当前只有 journal、没有 snapshots；虽然 migration 已成功，但未来 `drizzle-kit generate` 的增量历史仍需单独治理，不能宣称 migration 工件完整。

## 8. 2026-08-19 Embedding 供应商调研

- **resolved**：当前 chat 渠道仍是 `api.code-tab.com`；其模型列表包含 GPT 文本模型但没有 embedding 模型。`gpt-5.4-mini` 已通过单条文本生成 smoke；Vercel CLI 只负责读取环境变量，不是模型能力目录。
- **resolved**：原 1536 维 embedding 契约已按用户决策废弃；不再评估 GPT 文本模型替代 embedding，也不再把 Gemini 1536 维作为当前主线。
- **active**：当前正式 embedding 契约为 Cloudflare Workers AI `@cf/baai/bge-m3` 固定 1024 维；Nitro 通过 `POST /client/v4/accounts/{account_id}/ai/v1/embeddings` 的 OpenAI-compatible 接口调用，body 使用 `model` + `input`，不得发送 `dimensions`/`output_dimensionality`。
- **resolved**：development Neon 只读核对确认 `chunks=0`、`documents=0`、原列为 `vector(1536)` 且 HNSW cosine index 存在；随后执行 0002 并复核为 `vector(1024)` 与同名 HNSW cosine index，未发生数据重嵌入或混写。
- **resolved**：`NITRO_CLOUDFLARE_ACCOUNT_ID`、`NITRO_EMBEDDING_MODEL=@cf/baai/bge-m3` 与 `NITRO_CLOUDFLARE_API_TOKEN` 已进入 Vercel 项目 `smallalice-docs-ai-nitro-api`；前两项覆盖 Production、Preview、Development，token 覆盖 Production、Preview 的 Sensitive 与 Development 的 Non-sensitive。
- **resolved**：2026-08-24 已通过现有 provider 完成真实 Cloudflare embedding smoke：单条 1 个 1024 维有限向量，批量 5 个均为 1024 维有限向量；`tasks.md` §2.1.0b 已勾选。
- **resolved**：首次 smoke 的 HTTP 401 根因是一次性 PowerShell harness 把 Vercel env 文件的外层双引号传入 token，不是 provider 或 Cloudflare 权限缺陷。读取 `.env*` 时必须解析并去除外层引号，且不得打印值。
- **next**：§2.1.1 先只读核对既有 development 数据库；随后 2.1.2 才能执行最多 100 条真实同步、重复同步、回滚与并发验证。
- **active**：2026-08-24 的 development 只读数据库证据已确认 `vector(1024)`、HNSW 和真实 lexical/vector 查询路径；当前空库仅返回 0 条。HNSW 与精确检索的召回比较需要 §2.1.2 受控同步提供样本，2.1.1 因此保持未勾选。
- **resolved**：pnpm isolated 布局下，临时 `tsx -` 必须从 `packages/ai-rag-api` 启动才能解析该包的直接依赖 `postgres`；从仓库根执行会出现 `ERR_MODULE_NOT_FOUND`，不代表 Neon 连接失败。
- **resolved**：2.1.1 已在真实 160 chunk 数据集上完成 HNSW 与精确 pgvector 对比，Top 5 排序 ID 一致；不得再以空库 0 行结果代替该证据。
- **resolved**：`NITRO_DATABASE_URL` 经 pooled endpoint 时多个 reserve client 可复用同一 PostgreSQL backend，session advisory lock 可重入，因此同步使用 `NITRO_SYNC_DATABASE_URL` 和每轮独立 non-pooled client。并发验证必须用 scanner gate 固定首轮已持锁的临界区；此前未固定时序造成假阴性。固定 gate 后第二轮真实 service 返回 `KNOWLEDGE_SYNC_CONFLICT` / 409，回归已覆盖。
- **active**：agent-browser 无法启动 Chrome（exit 3，未生成 DevToolsActivePort）；本轮没有浏览器验收结论，不能将 API/Nitro 证据扩大为 UI 或生产浏览器通过。
- **resolved**：真实 pgvector 查询行中的 `heading_path`、`image_urls` 在当前 driver 下是 JSON 字符串而非数组，导致 Hybrid Search 映射 500。`postgres-search` 现仅对合法 JSON 字符串数组解析，非法值仍抛 `PostgresSearchError`；Development `/v1/search` 与 `/v1/chat` 已验证通过。
- **active**：首次 `main@c0ab120` Production build Ready 后，`/v1/search` 在加载 `_libs/extend.mjs` 时因 `__commonJSMin is not a function` 失败。根因是 Rolldown 将 CommonJS helper 放在 `_chunks/errors.mjs`，而该 chunk 又经 unified/extend 形成初始化循环；`rolldownConfig.output.inlineDynamicImports=true` 已通过本地 Vercel 函数 entry import 验证，仍需下一条 main Git deployment 验证线上 runtime。
