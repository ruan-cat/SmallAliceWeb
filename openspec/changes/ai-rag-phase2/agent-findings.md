# 二期 AI RAG 发现与风险

## 1. 已确认决策

- 二期唯一知识源是 `docs/docx/**/*.md`；图片只保留 URL 元数据，OCR/多模态属于三期。
- `vue-element-plus-x` 的 Bubble/BubbleList/Sender 与 `markstream-vue` 是唯一 UI/Markdown 主线；`@ai-sdk/vue` 仅由业务使用方 `useKnowledgeChat` 调用。
- 未装配 `event.context.rag` 时 chat/search/sync/sync-runs 统一返回 `503 RAG_NOT_CONFIGURED`。
- 运行时装配只接受显式注入的 provider，不读裸 `process.env`、不在 import 时建连。
- 全部技术决策细节见 `design.md` §3.1-3.16；行为契约见 `specs/ai-rag/*/spec.md`。

## 2. 已知风险与失败索引

|                                             风险/事故                                             |         状态         | 关键约束                                                                                                                                                                                                     |
| :-----------------------------------------------------------------------------------------------: | :------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|        Windows `neonctl` CPU 自旋（`neonctl@2.30.1 --help` 占单核，5 秒 CPU 增量 5.66 秒）        |      已记录事故      | 禁止 `neonctl` 及一切包装器；只使用官方 `neon`；先跑 `pnpm run neon:guard`。案例：`.agents/skills/fix-bug/record-bug-fix-memory/2026-07-31-windows-neonctl-cpu-spin.md`                                      |
| Vercel 自定义 pnpm install 未启用 Corepack（`ERR_PNPM_META_FETCH_FAIL`，底层 `ERR_INVALID_THIS`） | 已修复（2026-08-10） | 三环境维护 `ENABLE_EXPERIMENTAL_COREPACK=1`；验收必须看构建日志 `Detected ... using pnpm v10.29.2`；prebuilt 部署不算证据。案例：`2026-08-10-vercel-pnpm-corepack-meta-fetch-fail.md`                        |
|           Vercel CLI 上传部署无 `.git` 触发 git-changelog `git config --local` exit 128           | 已修复（2026-08-09） | 修改 `docs/.vitepress/config.mts` 时必须保留 `shouldDisableGitChangelog()` 检测；生产部署优先 Git 集成方式。案例：`2026-08-09-vercel-git-changelog-config-failed.md`                                         |
|                  `ai-vue-doc` Content 跨运行时（`Could not load @vueuse/nuxt`）                   | 已修复（2026-08-01） | `@ztl-uwu/nuxt-content@2.13.9`、`h3@1.15.11`、`@vueuse/nuxt@14.3.0` 显式约束不可移除；禁止用跳过 prerender 掩盖。案例：`2026-08-01-nuxt-content-monorepo-compatibility.md`                                   |
|                                  Windows `docs:build` 内存与并发                                  |       本地通过       | `NODE_OPTIONS=--max-old-space-size=8192` 且串行构建（prerender 峰值约 7 GiB）；不得短时无输出并行重启                                                                                                        |
|                               `pnpm-lock.yaml` 被 `.gitignore` 忽略                               |         已知         | 锁文件变更不是可审查 diff；不得把"无 Git diff"误判为"未刷新"                                                                                                                                                 |
|                                     sync provider 为离线 fake                                     |       当前状态       | `plugins/rag.ts` 的 `createSync` 硬编码 `{accepted:true,dryRun}`、`syncRuns` 返回 `[]`；`POST /v1/search` 与 `/v1/chat` 生产 500（空库/网关问题）。目标：由 `tasks.md` §2.1 替换为真实 PostgreSQL 持久化     |
|                         `@shikijs/stream` 与 `markstream-vue` 高亮兼容性                          |        未证实        | 无已证实的 fenced-code 注入点；接入前必须锁版本 + spike（表格/未闭合代码块/XSS/长回复/流结束）；未证实前禁止接入，保留 `html-policy="escape"` 安全默认                                                       |
|                                          生产浏览器回归                                           |        未验证        | 本地浏览器交互已验证（2026-08-03 系统 Chrome + 受控 fetch 流：首段可见、停止按钮出现、AbortSignal 触发、停止后内容保留）；**生产后端驱动**的端到端回归未验证；历史 `agent-browser` Chrome 无法启动为本地障碍 |
|             `vue-element-plus-x` BubbleList 单消息 `getBoundingClientRect()` 上游缺陷             |        已规避        | `AiChat.vue` 固定 `:auto-scroll="false"`（版本锁定 `vue-element-plus-x@1.3.98`，测试断言）；移除该规避或升级组件前必须先验证上游行为；旧设计"自动滚动"能力目标因此被显式放弃                                 |
|                                      本地构建成功 ≠ 云端可用                                      |         纪律         | Neon、Vercel、模型服务的验收必须用各自的外部证据，不得用本地测试代替                                                                                                                                         |

## 3. 禁止重复路径

- 禁止 `neonctl`（含 `--help`/`--version` 只读检查）、`npx` 临时安装替代、任何绕过 `neon:guard` 的数据库脚本。
- 禁止创建第二个同用途 Neon project 或 database（固定资源：`org-super-fog-48541962` / `patient-cloud-43432277` / `neon-smallalice-ai-rag`）。
- 禁止把 pooled URL 冒充 DDL 连接（migration 只使用非 pooled URL，缺失即停止迁移）。
- 禁止以 `vue-element-plus-x` 的 Typewriter 包裹助手 Markdown 正文、禁止新增自研 Markdown 打字机或 parser。
- 禁止以空结果 / `accepted` 伪造同步或检索成功（必须 `503 RAG_NOT_CONFIGURED`）。
- 禁止把连接串、密码、token 写入仓库、报告、测试快照或终端记录。
- 禁止移除 `docs/.vitepress/config.mts` 的 `shouldDisableGitChangelog()` 检测。
- 禁止修改、暂存或回滚用户 dirty 文件 `prompts/index.md`。
- 禁止安装 `nitropack` 或独立 `h3` 包；路由处理统一从 `nitro/h3` 导入（Nitro v3 自带，旧计划 3.1 Step 1 约束）。

## 4. 迁移备注与决策点

- `knowledge_sync_runs` 表 schema 目前只有 scanned/unchanged/created/updated/deleted 五计数 + failedFiles + 起止时间，**缺少"写入 chunk 数"字段**；`specs/ai-rag/knowledge-sync/spec.md` 需求 4 已要求该字段，实现 2.1.2 时需要同步扩展 schema 或调整验收口径（决策点）。
- 旧计划 RRF 公式是加权求和草图，权威语义为标准 RRF（`1/(k+rank)`），已落地于 `ai-rag-core/src/rrf.ts`；`design.md` §3.12 已注明。
- `.superpowers/sdd/` 被 `.gitignore` 忽略、不进 git；其中的历史日志（docs-build 等）只在本地可查，迁移后不依赖它们作任务源。
- 旧计划 Task 5 复选框当时"待用户确认"，但实现与复核证据存在（49 用例 + 2026-08-03 复核通过），`tasks.md` 1.6 已按证据标注 `[x]`；若用户对勾选口径有异议可回退为 `[ ]`。
- 一期 `build-ai-chat-packages` change 已全量勾选完成，建议后续单独走 `openspec-archive-change` 归档（不在本 change 范围内）。
- 旧台账 5.2/5.4 的完整验证流水已压缩进 `tasks.md` 各任务的证据行与 `agent-progress.md`；需要原始日志时查 `.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/`。
- 旧台账 5.4 的 cleanup-agent-team-node-processes dry-run 条目（12 个目标进程、candidateCount 0、未停止任何进程）属过程性 housekeeping 记录，无任务价值，不迁移。
- 锁定版本清单：`vue-element-plus-x@1.3.98`、`markstream-vue@1.0.8`、`@ai-sdk/vue@1.2.12`、`@shikijs/stream@4.4.1`（后三者已写入 design/tasks，1.3.98 此处补录）。

## 5. 待办入口

- 全部待办见 `tasks.md` §2.1（P0 真实数据链路与生产装配）、§2.2（P1 验证与回归）、§2.3（P2 展示与文档）、§3（历史学习实验）。
- 用户侧任务追踪（`prompts/index.md`）：002（本长任务，含本次格式改造）进行中；006 等待 openspec 改造后推进；010（github workflow nuxt 内存超限）未完成。
