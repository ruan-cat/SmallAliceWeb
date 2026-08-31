# AI RAG Phase3 执行进度

## 1. 当前快照

- Change：`ai-rag-phase3`；Schema：`spec-driven`。
- 当前 checkpoint：6.9；任务进度：49/49（6.5 已完成失败/回退证据，线上继续 Noop/disabled）。
- 状态：进行中；当前分支：`dev`。
- 用户已有改动：`prompts/01.prompts.md`，本轮不触碰。

## 2. 最近验证

- `openspec status --change ai-rag-phase3 --json`：规划工件齐全，change 状态可实施。
- `openspec instructions apply --change ai-rag-phase3 --json`：49 项任务，46 项完成，任务源为 `tasks.md`。
- CodeGraph/测试：标题上下文、overlap、parentId、FAQ/code chunk 与同步写入已通过；剩余为 6.x 验收门禁。
- Post-gate correction：runtime profile 已切到 `markdown-structure-v2`，sync/runtime 23/23、API typecheck 与 Nitro build fresh 通过；同步服务新增 Cloudflare 400/413 自适应拆批。
- Neon/Vercel：`.vercel/project.json` 与 README 均指向 `smallalice-docs-ai-nitro-api`；`vercel env ls` 显示三个数据库变量均存在，non-pooled 连接成功。
- Neon migration/sync：0000-0004 已对齐；290 documents、6213 chunks、6213 embeddings，最新同步 `succeeded` 且 failedFiles 为空。
- 生产标题题：`/v1/search` HTTP 200，Top-10 全部来自目标 sourcePath；`/v1/chat` 已收到 source frame 与 `rag-heading` 锚点。

## 3. 阻塞点与边界

- Promptfoo 包已锁定在 `package.json`，但当前 node_modules 因 Windows native optional 包/EPERM 安装链不完整；runner 不依赖其 import。
- 正式 Neon 同步任务 6.6 已完成；使用 non-pooled `NITRO_SYNC_DATABASE_URL`，迁移与失败文件证据见 `evidence/2026-08-31-neon-sync.json`。
- Reranker 已接入 runtime，但默认 `disabled`/Noop；真实 LLM 未配置、未调用、未作为生产证据。
- Nitro API build 已在补齐匹配的 `@rolldown/binding-win32-x64-msvc@1.2.1` 后通过；修复过程与前后 exit code 记录在 `evidence/2026-08-31-local-verification.log`。
- 6.3 preflight 已 ready；目标文档 76 chunks/76 heading 命中，全部 v2/BGE-M3。
- 6.4 已完成真实 FTS/pg_trgm/vector/RRF/Noop 对照；FTS 对该问句无候选，pg_trgm 仅命中目标根块，vector/RRF 将目标章节带入 Top-10，hard negative 命中 0。
- 6.5 Pilot：Anthropic 3/3 在 30 秒超时，failureRate=1、fallback=3、P95=30018ms，未获得 token/账单数据；因此线上保持 Noop/disabled。
- 根级 `pnpm run typecheck` 的历史 Nuxt TS5101 问题不并入本 change。

## 4. 下一步

1. 复核 49/49 任务、所有 evidence JSON 与 `openspec validate --strict` 输出。
2. 保持线上 reranker disabled，等待后续明确 provider/成本授权再另立 Pilot。

## 5. 证据索引

1. `openspec/changes/ai-rag-phase3/tasks.md` — 唯一任务源与 49 项清单。
2. `openspec/changes/ai-rag-phase3/design.md` — chunk/profile、preflight 与评测边界。
3. `openspec/changes/ai-rag-phase3/evidence/2026-08-31-title-query-baseline.json` — 生产 Top-10/Top-50 与本地 75/26 smoke。
