# AI RAG Phase3 持久发现

## 1. 当前有效发现

- **resolved｜标题上下文已进入检索输入**
  - 结论：embedding 与 lexical 使用的 `search_text` 已由 `sourcePath + headingPath + content` 确定性生成，原始 content 仍独立保存。
  - 证据：`packages/ai-rag-core/src/embedding-text.ts`、`packages/ai-rag-api/server/services/knowledge-sync.ts`；`tests/sync-service.test.ts` 11/11。
  - 后续：6.3/6.4 用线上 preflight 与检索对照验证真实 corpus/排序效果。

- **active｜chunk profile 身份必须触发真实重建**
  - 结论：迁移新增 `search_text`/preprocessing 字段后，runtime 必须使用 `markdown-structure-v2` profile；继续注入 v1 会让旧文档被错误判定未变化并跳过重建。
  - 证据：`packages/ai-rag-api/server/runtime/rag-runtime.ts` 已改为 v2；`evidence/2026-08-31-local-verification.log` 的 post-gate correction；sync/runtime 23/23。
  - 后续：6.6 同步前 preflight 检查 document/chunk 的 profile/preprocessing/model，确认完整重建统计。

- **resolved｜标题型查询线上已出现目标来源**
  - 结论：完整同步后生产 `/v1/search` 查询“`小爱丽丝是谁啊？`”的 Top-10 全部来自目标 sourcePath；`/v1/chat` 已收到目标页面 source frame 与 `rag-heading` 锚点。
  - 证据：`evidence/2026-08-31-production-title-query.json`；生产请求 HTTP 200，chat 客户端上限内收到 source frame。

- **resolved｜线上 corpus/profile 已完成 preflight 与同步**
  - 结论：目标文档 76 chunks/76 heading 命中；Neon 总计 290 documents、6213 chunks、6213 embeddings，全部 v2/BGE-M3/search_text 非空。
  - 证据：`evidence/2026-08-31-title-corpus-preflight.json` status=ready、`evidence/2026-08-31-neon-sync.json`；迁移历史 0000-0004。

- **resolved｜6.4 真实检索对照已完成**
  - 结论：vector 与 RRF/Noop 将目标章节带入 Top-10，hard negative 命中 0；FTS 对该中文问句无候选，pg_trgm 命中目标文档根块但未命中目标子章节，均如实记录。
  - 证据：`evidence/2026-08-31-retrieval-comparison.json`；gold-set 已按 v2 chunkIndex/contentHash 重定位，评估器兼容数据库 hash id。

- **resolved｜6.5 LLM reranker Pilot 已完成门禁**
  - 结论：同一候选池对 Anthropic provider 运行 3 次；3/3 超时，failureRate=1、fallback=3、P95=30018ms，未产生可用 token/账单数据，线上保持 Noop/disabled。
  - 证据：`evidence/2026-08-31-llm-reranker-pilot.json`；reranker contract/runtime 测试通过。

- **resolved｜Cloudflare 大文档批次过大**
  - 结论：三个文件的 100 条合批触发 HTTP 400/provider 3030（超过 60000 token）；同步服务现在只对 400/413 递归拆批，重试后 failedFiles 为空。
  - 证据：同步诊断输出与 `evidence/2026-08-31-neon-sync.json`；`tests/sync-service.test.ts` 12/12。

- **resolved｜pg_trgm CJK word-similarity 方向**
  - 结论：`search_text % $1` 对长中文文档相似度阈值过严；改为 `word_similarity($1, search_text)` + `$1 <% search_text`，并保留真实策略标注。
  - 证据：`tests/postgres-search.test.ts` 5/5；Neon 真实 query 返回 2 个候选。

- **active｜Promptfoo 安装链需单独恢复**
  - 结论：`promptfoo@0.122.2` 已写入 API `devDependencies`，但 Windows workspace 安装曾因 native optional 包/EPERM 在链接阶段中断；当前 runner、adapter 和测试不 import Promptfoo。
  - 证据：本轮 `pnpm add`/离线重建输出；API 31/133 测试与 tsc 已通过，Promptfoo CLI 本体未作为本轮通过条件。
  - 后续：若执行真实 Promptfoo 评测，先在不运行 docs preview 的干净安装会话恢复 optional 依赖，再验证 CLI 版本；不能把 package.json 变更当作 CLI 可运行证据。

- **active｜Reranker 线上默认保持 Noop**
  - 结论：runtime 只有在 `rerankerMode=llm` 且 provider/model/version/candidate/token/time/cost 配置齐全并注入 factory 时才创建真实 reranker；其他状态均走 Noop。
  - 证据：`packages/ai-rag-api/server/runtime/rag-assembly.ts`；`tests/runtime-assembly.test.ts` 10 项通过；`tests/reranker.test.ts` 5 项通过。
  - 后续：6.5 只能做离线 Pilot；收益/成本/延迟未达门槛时保持 disabled，不把配置存在当作收益证据。

- **resolved｜Nitro build 缺失匹配 rolldown native binding**
  - 结论：`ctx.inner is not a function` 的直接根因是 `rolldown@1.2.1` 的 Windows binding junction 指向不存在目录；补齐 `@rolldown/binding-win32-x64-msvc@1.2.1` 后 plugin smoke 与 Nitro build 均通过。
  - 证据：`evidence/2026-08-31-local-verification.log`；最终 Nitro build exit 0，API 31/133 测试与 tsc 通过。
  - 后续：恢复/重建 workspace 依赖时必须同时检查 native optional 包版本和 junction 目标，不能用测试绿灯替代 build。

## 2. 固定约束

- `tasks.md` 是唯一任务源；没有命令与输出证据不得勾选。
- 本期不引入 PGroonga、OpenSearch、TypeScript CJK tokenizer 或 AI SDK 大版本升级。
- Neon 正式同步只允许在 preflight/迁移审查通过且用户明确授权后执行。
