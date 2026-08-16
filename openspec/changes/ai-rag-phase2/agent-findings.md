# 二期 AI RAG 发现与风险

## 1. 已确认决策

- 二期唯一知识源是 `docs/docx/**/*.md`；图片只保留 URL 元数据，OCR/多模态属于三期。
- `vue-element-plus-x` 的 Bubble/BubbleList/Sender 与 `markstream-vue` 是唯一 UI/Markdown 主线；`@ai-sdk/vue` 仅由业务使用方 `useKnowledgeChat` 调用。
- 未装配 `event.context.rag` 时 chat/search/sync/sync-runs 统一返回 `503 RAG_NOT_CONFIGURED`；运行时装配只接受显式注入 provider，不读裸 `process.env`、不在 import 时建连。
- 当前唯一可执行任务源是 `tasks.md`。旧 superpowers 设计/计划是冻结历史快照，其中任何复选框都不得被解释成当前任务状态。
- 全部技术决策见 `design.md` §3；行为契约见 `specs/ai-rag/*/spec.md`。

## 2. 已知风险与失败索引

| 风险/事故 | 状态 | 关键约束 |
| :-- | :--: | :-- |
| Windows `neonctl` CPU 自旋 | 已记录事故 | 禁止 `neonctl`（含 `--help`/`--version`）及包装器；只用官方 `neon`；先跑 `pnpm run neon:guard`。案例：`2026-07-31-windows-neonctl-cpu-spin.md` |
| Vercel 自定义 pnpm install 未启用 Corepack | 已修复 | 三环境维护 `ENABLE_EXPERIMENTAL_COREPACK=1`；验收必须看到实际 pnpm 版本；prebuilt 不算 Git 构建证据。案例：`2026-08-10-vercel-pnpm-corepack-meta-fetch-fail.md` |
| Vercel CLI 上传无 `.git` 导致 git-changelog exit 128 | 已修复 | 保留 `docs/.vitepress/config.mts` 的 `shouldDisableGitChangelog()`；生产优先 Git 集成。案例：`2026-08-09-vercel-git-changelog-config-failed.md` |
| `ai-vue-doc` Nuxt Content/H3 跨运行时世代 | 已修复 | 保留 `@ztl-uwu/nuxt-content@2.13.9`、`h3@1.15.11`、`@vueuse/nuxt@14.3.0` 已验证基线；升级必须整条依赖线复验。案例：`2026-08-01-nuxt-content-monorepo-compatibility.md` |
| Windows `docs:build` 内存与并发 | 本地通过 | 使用约 8 GiB Node 堆并串行；短时高 CPU/无输出不能直接判死锁 |
| `pnpm-lock.yaml` 被 `.gitignore` 忽略 | 已知 | 锁文件变化不是可审查 Git diff，不得用“无 diff”推断“未刷新” |
| sync provider 为离线 fake | 当前状态 | `plugins/rag.ts` 的 `createSync` 仍是假实现；真实同步、search/chat 生产链路必须按 `tasks.md` §2.1 装配后重验 |
| `@shikijs/stream` 与 `markstream-vue` 兼容性 | 未证实 | 锁版本 + 真实组件 spike 前禁止接入；保留安全默认渲染 |
| 生产浏览器回归 | 未验证 | 本地受控流验证不能替代生产后端驱动的端到端回归 |
| BubbleList 单消息 `getBoundingClientRect()` 上游缺陷 | 已规避 | `vue-element-plus-x@1.3.98` 下固定 `:auto-scroll="false"`；重新启用或升级前必须独立验证 |
| 本地构建成功 ≠ 云端可用 | 纪律 | Neon、Vercel、模型服务分别需要外部证据，不得互相替代 |

## 3. 旧台账到 OpenSpec 的纠偏映射

以下差异是**迁移后的显式取代关系**，不是漏项；旧文档若与本表冲突，以当前 `design.md` / specs / `tasks.md` 为准：

| 旧设计/计划表述 | 当前权威表述 | 原因/状态 |
| :-- | :-- | :-- |
| `@ai-sdk/vue + Nuxt/Nitro`、Nuxt API 倾向 | Node.js + **独立 Nitro v3 API**；不引入 Nuxt API/Bun | 运行时边界已在 #5503/#5505 固化 |
| `x-markdown-vue` | `markstream-vue@1.0.8` | 真实流式 Markdown 主线已验证并落地 |
| “BM25 + Vector” | PostgreSQL **词法全文检索** + pgvector + RRF；未验证前禁止称 BM25 | PostgreSQL FTS 的实际算法语义不是 BM25 |
| 旧 RRF 加权/score 草图 | 标准 RRF `1/(k+rank)`，默认 `k=60` | 已落地 `ai-rag-core/src/rrf.ts` |
| 数据层草图含 `conversations/messages/embeddings` | 二期已落地核心持久化以 `documents/chunks/knowledge_sync_runs` 为准；向量存 `chunks.embedding` | 旧图是概念草图，不得据此新增无任务的表 |
| 来源卡片“展开原文”/数据库阅读器倾向 | `sourceUrl#headingAnchor` 跳转现有 VitePress 静态文档；禁止新增数据库 Markdown 阅读器/Nitro 来源路由 | 避免双来源与环境相关持久化 URL |
| 前端“自动滚动”能力目标 | 当前显式固定 `auto-scroll=false` | `vue-element-plus-x@1.3.98` 单消息上游缺陷；这是受控放弃，不是迁移遗漏 |
| Chroma 本地 demo | 仅保留为 `tasks.md` §3 历史学习实验，未有仓库证据则保持未完成 | 正式项目主线已经是 Neon + pgvector |
| 旧计划里所有 `- [ ]` / `- [x]` | 仅为历史快照 | 当前进度只允许从 `tasks.md` 读取 |

## 4. 迁移备注与决策点

- `knowledge_sync_runs` 当前 schema 缺少“写入 chunk 数”字段；`knowledge-sync` spec 已要求，实现 `tasks.md` §2.1.2 时必须扩展 schema 或明确调整规格，不能静默忽略。
- Neon 命名必须区分：`neon-smallalice-ai-rag` 是 Neon project name（project ID `patient-cloud-43432277`），实际业务 database 为 `neondb`；组织为 `org-super-fog-48541962`。
- 2026-08-10 Corepack 事故文档记录过 fresh 验证 `ai-rag-api` 16 测试文件 / 51 用例，但当前 `dev` 文件树实查为根 `tests` 12 个测试文件 + `tests/routes` 3 个，共 15 个。该 16/51 是点时快照；未重新运行当前测试前，不得覆盖 OpenSpec 已记录的 15/49 基线。
- `.superpowers/sdd/` 被 `.gitignore` 忽略，不作为任务源；需要原始本地日志时只能把它当历史证据来源。
- 旧计划 Task 5 当时复选框“待用户确认”，但后续实现与复核证据存在，`tasks.md` 1.6 已按证据标 `[x]`；不得再从旧计划反向改写状态。
- 旧计划 5.4 的 cleanup dry-run（12 个目标进程、candidateCount 0）属于 housekeeping，不迁移为产品任务。
- 锁定版本：`vue-element-plus-x@1.3.98`、`markstream-vue@1.0.8`、`@ai-sdk/vue@1.2.12`、`@shikijs/stream@4.4.1`。

## 5. 禁止重复路径

- 禁止 `neonctl`、`npx` 临时替代、绕过 `neon:guard`；禁止创建第二个同用途 Neon project/database；migration 禁止使用 pooled URL。
- 禁止把连接串、密码、token 写入仓库、报告、测试快照或终端记录。
- 禁止自研 Markdown parser/打字机；禁止用 Element Plus X Typewriter 包裹助手 Markdown；禁止以空结果或 `accepted` 伪造成功。
- 禁止移除 `shouldDisableGitChangelog()`；禁止用关闭 Content 搜索/prerender 等方式掩盖 Nuxt Content 依赖问题。
- 禁止修改、暂存或回滚用户既有 dirty 文件（历史记录中特别包括 `prompts/index.md`）。
- 禁止安装 `nitropack` 或独立 `h3` 作为二期 Nitro API 入口；路由 API 从 `nitro/h3` 导入。
- 禁止继续维护或重新勾选旧 superpowers plan；发现新工作必须先写入 `tasks.md`。

## 6. 待办入口

- P0：`tasks.md` §2.1——真实 PostgreSQL/embedding/同步/生产装配。
- P1：`tasks.md` §2.2——Shiki、触发方式、真实评估调优、完整构建与外部部署回归。
- P2：`tasks.md` §2.3——README 与演示视频。
- 历史学习与里程碑：`tasks.md` §3-§4；未有新证据不得勾选。
