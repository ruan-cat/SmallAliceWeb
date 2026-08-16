# 二期 AI RAG 执行进度

## 1. 当前 checkpoint

- 日期：2026-08-16
- Change：`ai-rag-phase2`
- 当前状态：OpenSpec + do-long-task 首轮迁移已完成；本轮 ChatGPT web 二次审计完成历史上下文、旧台账、memorix、事故记录与当前 `dev` 文件树的交叉核验，并补强任务源边界与迁移纠偏说明。
- 唯一任务源：`openspec/changes/ai-rag-phase2/tasks.md`。旧 `docs/superpowers/specs/2026-07-29-ai-rag-phase2-design.md` 与 `docs/superpowers/plans/2026-07-29-ai-rag-phase2-plan.md` 仅为冻结历史快照，正文中的复选框不得用于判断当前进度。
- 当前待办：仍从 `tasks.md` §2.1.1 起步；真实 PostgreSQL、embedding、模型、生产浏览器回归与部署回归的外部门禁没有因本轮文档审计而改变。

## 2. 本轮二次审计范围

- 已读根 `AGENTS.md`、`.agents/skills/fix-bug/record-bug-fix-memory/SKILL.md` 与四份相关事故正文：Windows `neonctl` CPU 自旋、Nuxt Content 跨运行时依赖、Vercel 无 `.git` git-changelog、Vercel pnpm/Corepack。
- 已读 Skill Router MCP 的 `do-long-task`、`openspec`、`git-commit`，以及项目级 `openspec-continue-change`、`openspec-verify-change`。
- 已逐段复核两份旧 superpowers 设计/计划与当前 `proposal.md`、`design.md`、6 份规格、`tasks.md`、`agent-findings.md`。
- 已读 `all-memorix/README.md`、`01-observations.md`、`02-session-highlights.md`；其余完整导出作为历史证据，不作为任务源。
- 已核对当前 `dev` 的 `packages/ai-rag-api/tests` 文件树：根目录 12 个测试文件 + `tests/routes` 3 个测试文件，共 15 个；因此 2026-08-10 事故记录中的 `16 文件 / 51 用例` 只视为当时 fresh 验证快照，未重新运行测试前不覆盖 OpenSpec 的 `15 文件 / 49 用例` 基线。

## 3. 二次审计结论

- 现有 6 能力规格与 `tasks.md` 已覆盖旧计划的知识准备、Hybrid Search、评估、独立 Nitro、Chat UI、来源溯源、调优、README/视频、历史 Chroma 学习与 M1-M4；未发现需要重新拆出第二套任务清单的漏项。
- 旧资料中的后续纠偏必须显式保留：Nuxt API → 独立 Nitro v3；`x-markdown-vue` → `markstream-vue`；“BM25” → PostgreSQL 词法全文检索；旧加权 RRF 草图 → 标准 `1/(k+rank)`；数据库来源阅读器/展开原文 → VitePress 静态来源跳转；自动滚动 → 因上游缺陷固定关闭。完整映射见 `agent-findings.md`。
- Neon 命名已复核：`neon-smallalice-ai-rag` 是项目名，实际业务 database 为 `neondb`；不得再把两者混称。
- `knowledge_sync_runs` 缺“写入 chunk 数”仍是待实现决策点；sync provider 仍是离线 fake；生产 search/chat 的真实装配与回归仍未验收。

## 4. 验证与下一步

- 首轮迁移已有 `openspec validate ai-rag-phase2 --strict` 通过记录；本轮只补强 Markdown 权威边界与审计说明，没有改动 `tasks.md` 或 6 份行为规格的结构。
- 本轮云环境无独立子代理调度接口，因此未虚构“子代理执行”；采用旧设计、旧计划、memorix、事故正文、当前文件树五条独立证据轨交叉核验。
- 后续继续按 `tasks.md` §2.1.1 推进；任何完成项只在获得新的可复核证据后更新。
