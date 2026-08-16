# 二期 AI RAG 发现与风险

## 1. 当前权威性

- 二期唯一知识源是 `docs/docx/**/*.md`；图片只保留 URL 元数据，OCR/多模态属于三期。
- `vue-element-plus-x` 的 Bubble/BubbleList/Sender 与 `markstream-vue` 是唯一 UI/Markdown 主线；`@ai-sdk/vue` 仅由业务使用方 `useKnowledgeChat` 调用。
- 未装配 `event.context.rag` 时 chat/search/sync/sync-runs 统一返回 `503 RAG_NOT_CONFIGURED`；runtime assembly 只接受显式 provider 注入。
- 当前唯一可执行任务源是 `tasks.md`；行为契约见 `specs/ai-rag/*/spec.md`，设计决策见 `design.md`。
- 旧 superpowers design/plan 的原始内容只作为 `history/*.superpowers.md` 历史证据存在；原 `docs/superpowers/...` 路径在迁移完成后不得重新创建。历史复选框不具有执行权。

## 2. 旧资料纠偏映射

| 旧设计/计划表述 | 当前权威表述 |
| --- | --- |
| Nuxt/Nitro API 倾向 | 独立 Nitro v3 API；不引入 Nuxt API/Bun |
| `x-markdown-vue` | `markstream-vue@1.0.8` |
| “BM25 + Vector” | PostgreSQL 词法全文检索 + pgvector；未真实验证前禁止称 BM25 |
| 旧 RRF 加权/score 草图 | 标准 RRF `1/(k+rank)`，默认 `k=60` |
| `conversations/messages/embeddings` 数据草图 | 当前核心持久化 `documents/chunks/knowledge_sync_runs`，向量在 `chunks.embedding` |
| 数据库 Markdown 阅读器/展开原文 | VitePress 静态 `sourceUrl#headingAnchor` |
| 自动滚动能力 | `vue-element-plus-x@1.3.98` 下固定 `auto-scroll=false`，重新开启前独立复验 |
| Chroma 本地 demo | 仅历史学习任务，不是正式向量库主线 |
| 旧计划所有复选框 | 只作历史文本；当前状态只读 `tasks.md` |

完整迁移追踪：`history/2026-08-16-superpowers-migration.md`。

## 3. 已知风险与事故约束

| 风险/事故 | 当前约束 |
| --- | --- |
| Windows `neonctl` CPU 自旋 | 禁止 `neonctl`（含 help/version）和包装器；只用官方 `neon`；先跑 `pnpm run neon:guard` |
| Vercel pnpm/Corepack | 三环境保持 `ENABLE_EXPERIMENTAL_COREPACK=1`；以真实构建日志确认 pnpm 版本 |
| Vercel 无 `.git` + git-changelog | 保留 `shouldDisableGitChangelog()`；生产优先 Git 集成 |
| Nuxt Content/H3 跨运行时 | 保留已验证 `@ztl-uwu/nuxt-content@2.13.9`、`h3@1.15.11`、`@vueuse/nuxt@14.3.0` 兼容矩阵 |
| Windows docs build | 约 8 GiB Node heap、串行；短时高 CPU/无输出不能直接判死锁 |
| `pnpm-lock.yaml` 被忽略 | 无 Git diff 不能证明依赖解析未变化 |
| sync provider 离线 fake | 必须由 `tasks.md` 2.1.2 的真实同步实现替换，不能以 accepted/空数组宣称成功 |
| Shiki 兼容性未证实 | 先验证 markstream 自带 shiki 路径；无证据前禁止独立接入 `@shikijs/stream` |
| 生产浏览器回归未完成 | 本地受控 fetch 流不能代替生产后端驱动 E2E |
| 本地 build/test ≠ 云端可用 | PostgreSQL、embedding、模型、Vercel/浏览器均要独立外部证据 |

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
