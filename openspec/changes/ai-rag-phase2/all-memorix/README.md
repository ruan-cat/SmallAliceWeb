# 二期 AI RAG：memorix 记忆导出目录导读

## 1. 本目录是什么

本目录是 **memorix 本地记忆的实体化导出**，供没有本地 memorix 记忆的云 ChatGPT（web 版）直接阅读。

memorix 是本地 IDE 侧的记忆系统，记录了过去一段时间内本项目（SmallAliceWeb，含「二期 AI RAG」长任务）的关键观测（决策、事故陷阱、变更、发现等）与每次编码会话的摘要。云 ChatGPT 无法访问本地 memorix 服务，因此由 memorix CLI 完成一次完整导出（`00-full-export.md`），并整理为下面的可直接阅读的 markdown 文档。

> 使用提示：先读本 README（了解全貌与索引），再按需深入 `01-observations.md`（观测全文）与 `02-session-highlights.md`（会话精选）。本目录只做「背景记忆」用途——二期任务的**当前唯一任务源**仍是 `openspec/changes/ai-rag-phase2/tasks.md`，本目录不替代任何任务清单。

## 2. 文件清单与阅读顺序

| 阅读顺序 |            文件            |                           说明                            |
| :------: | :------------------------: | :-------------------------------------------------------: |
| 第 0 步  |        `README.md`         |            本文件，目录导读与索引（推荐先读）             |
| 第 1 步  |    `00-full-export.md`     | memorix CLI 完整原始导出（812 行，21 条观测 + 68 个会话） |
| 第 2 步  |    `01-observations.md`    |      全部 21 条观测的整理版（按类型分组 + 总索引表）      |
| 第 3 步  | `02-session-highlights.md` |    会话摘要精选（3 个含完整摘要的会话 + 其余会话清单）    |

## 3. 二期 RAG 任务速览

以下核心事实整理自观测 #5569 与会话 sess-msv85exa-glcsyp（2026-08-16 导出时刻的最新状态）：

|        项目        |                                                                                       内容                                                                                       |
| :----------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|   当前唯一任务源   |                                                 `openspec/changes/ai-rag-phase2/tasks.md`（2026-08-16 从 superpowers 台账迁移）                                                  |
|      能力规格      |                            6 个能力规格（knowledge-sync / hybrid-search / chat-api / chat-ui / source-citation / deployment），共 **33 需求 88 场景**                            |
|      技术设计      |                                                     `design.md` 含 **17 项技术决策**（3.1-3.17），`proposal.md` 定义能力契约                                                     |
|    任务勾选分布    |                                                22 条任务 = **6 条已完成基线 [x]** + **10 条待办 [ ]** + 2 条历史学习 + 4 条里程碑                                                |
|   已完成基线证据   |                                         ai-rag-api 15 测试文件 49 用例、ai-rag-core 4/15、ai-vue 4/15、ai-vitepress-plugins 3/8 全部通过                                         |
|    外部授权门禁    |                                                     待办 **2.1.1-2.1.3 等待外部授权**（数据库操作 / embedding 凭据 / 部署）                                                      |
| sync provider 状态 |                                            仍是**离线 fake**（createSync 硬编码 `{accepted:true,dryRun}`），真实链路待外部授权后装配                                             |
|    生产接口状态    |                                                       生产 `POST /v1/search` 与 `/v1/chat` 返回 **500**，待真实装配后重验                                                        |
|   Corepack 事故    |                                             已修复：三环境 `ENABLE_EXPERIMENTAL_COREPACK=1`，git-push 构建链路恢复（pnpm v10.29.2）                                              |
|     运行时边界     |                                   固定 **Node.js + 独立 Nitro v3 API**，不引入 Bun、不用 Nuxt API；`packages/ai-vue` 演进复用，不重建 Chat UI                                    |
|   Neon 固定资源    |              组织 `org-super-fog-48541962` / 项目 `patient-cloud-43432277` / 项目名 `neon-smallalice-ai-rag`（**实际库名 `neondb`**，见 #5515）；禁止新建同用途资源              |
|   Neon CLI 禁令    |                                   **Windows 禁止 `neonctl`**（CPU 自旋事故，见 #5508），统一使用官方 `neon`，守卫 `scripts/guard-neon-cli.ts`                                    |
|   Vercel 双项目    | 文档站 `small-alice-web-odse` + Nitro API `smallalice-docs-ai-nitro-api`（生产域名 `https://smallalice-docs-ai-nitro-api.ruan-cat.com/`）；根 `vercel.json` 已删除（破坏性变更） |
|      检索语义      |                  二期检索表述为「词法全文检索 + pgvector + RRF 融合」；**PostgreSQL FTS 不叫 BM25**；RRF 权威公式 `1/(k+rank)` 已落地 `ai-rag-core/src/rrf.ts`                   |
|     待决决策点     |                                           `knowledge_sync_runs` 表 schema 缺「写入 chunk 数」字段（spec 已要求，实现 2.1.2 时需扩展）                                            |
|     旧台账状态     |                                   `docs/superpowers/{specs,plans}/2026-07-29-ai-rag-phase2-*.md` 停更于 08-07，已标注「已被取代」，正文未删改                                    |

## 4. 关键决策索引

### 4.1 二期相关观测（19 条，优先阅读）

| 观测编号 |              主题              |                                                     一句话结论                                                      |
| :------: | :----------------------------: | :-----------------------------------------------------------------------------------------------------------------: |
|  #5494   |   AI 转型二期任务设计上下文    |                  用户定位 AI 应用前端 / Agent 全栈偏前端 / TS AI 工程师，第二阶段 = RAG 与检索质量                  |
|  #5495   |    二期 RAG 设计文档已完成     |            设计 spec 定案：Vue3+Element Plus X + Nuxt/Nitro + Neon/pgvector + drizzle + zod，含禁止清单             |
|  #5496   |  二期 RAG 实施计划文档已完成   | 4 周 11 任务实施计划（1.1-1.3、2.1-2.3、3.1-3.3、4.1-4.2 + Task 5：本地实验 → Hybrid Search → 工程落地 → 展示准备） |
|  #5497   |     LangGraph 调研核心结论     |    主线 = Element Plus 壳 + AI SDK/LangChain.js + Neon/pgvector + LangGraph.js；代码类语料强烈建议 hybrid search    |
|  #5498   |       简历定位与作品方向       |                    定位 AI 应用工程化，作品选 RAG 知识库问答 + Agent 工作流平台（偏前端可视化）                     |
|  #5499   |       RAG 技术栈选型决策       |   前端 Element Plus X/AI SDK/x-markdown-vue；数据 Neon+drizzle+pgvector；「本地 Chroma 学习 → pgvector 落地」渐进   |
|  #5500   |      学习路径与里程碑规划      |                  4 周路径 + M1-M4 里程碑（最小 RAG 闭环 → Hybrid Search → 完整问答 → 简历作品集）                   |
|  #5501   |       学习参考项目与资料       |              参考 zhilv-yuntu/ai-sdk-rag-starter/agents-from-scratch-ts；禁止参考 AgentX/Dify/自研平台              |
|  #5502   | 全局技能不得承载未授权事故修复 |                   诊断建议 ≠ 获授权实现；全局实体修改必须先获授权、方案标授权状态、实施后独立验证                   |
|  #5503   | Node 与独立 Nitro v3 API 边界  |                     二期运行时固定 Node.js + 独立 Nitro v3 API，不用 Bun/Nuxt；ai-vue 演进复用                      |
|  #5504   |      知识源与动态同步边界      |            唯一知识源 `docs/docx/**/*.md`，增量对账（sourcePath/哈希/切分版本/模型版本），多模态推迟三期            |
|  #5505   | 运行时与 API 边界（同 #5503）  |                                     同 #5503 结论（不同实体重复记录，保留备查）                                     |
|  #5506   | Neon 资源与 pgvector 连接约束  |    固定资源可记录、连接串/密码/token 不可记录；`vercel env pull` 取环境变量；CLI 用 neon；vector(1536)+HNSW 余弦    |
|  #5507   |     术语与 Vercel 部署陷阱     |     FTS 不叫 BM25；Nitro 用 setResponseStatus 设真实 HTTP 状态；Vercel 用 advisory lock；部署必须包含 docs/docx     |
|  #5508   |    Windows neonctl CPU 自旋    |     Windows 禁 neonctl（含 --help），用官方 neon + `scripts/guard-neon-cli.ts` 守卫；Turbo `//#neon:guard` 依赖     |
|  #5513   | Nitro API 独立 Vercel 部署完成 |           部署上线：sync-runs GET 200、sync 鉴权正确，search/chat 500 待修；git-push 构建失败（后已修复）           |
|  #5514   |    Vercel git-push 构建失败    |         错误 `ERR_PNPM_META_FETCH_FAIL`，云端 Project Settings 正确、prebuilt 正常（后续经 Corepack 修复）          |
|  #5515   |       Neon 资源命名澄清        |           `neon-smallalice-ai-rag` 是**项目名**，项目内实际数据库名是 `neondb`（Vercel 注入指向 neondb）            |
|  #5569   |  二期任务体系迁移至 OpenSpec   |             tasks.md 成为唯一任务源（22 条），design.md 17 决策，6 规格 33 需求 88 场景；待办等外部授权             |

### 4.2 其他观测（2 条，工具性记录）

| 观测编号 |              主题               |                                     一句话结论                                     |
| :------: | :-----------------------------: | :--------------------------------------------------------------------------------: |
|  #5460   |     安装 grill-me 系列技能      | 2026-07-21 安装 Matt Pocom Skills 系列（grill-me 等 8 个技能）到 `.agents/skills/` |
|  #5461   | grill-me 技能已记录到 AGENTS.md |                  grill-me 作为核心审查技能登记进 AGENTS.md 技能表                  |

## 5. 与 openspec change 工件的关系

二期任务 2026-08-16 已迁移到 OpenSpec change `openspec/changes/ai-rag-phase2/`，本目录的记忆与其工件相互印证：

|         记忆来源（本目录）         |                                            openspec 工件                                            |                                       关系说明                                        |
| :--------------------------------: | :-------------------------------------------------------------------------------------------------: | :-----------------------------------------------------------------------------------: |
|    观测 #5499、#5497（技术栈）     |                                     `design.md` §3.1 技术栈组合                                     |               观测记录了选型决策的形成过程，design.md 是决策的权威落点                |
|  观测 #5503、#5505（运行时边界）   |                               `design.md` §3.1、§3.14 运行时装配工厂                                |             观测结论 = 决策条文；装配只接受显式注入 provider、不读裸 env              |
|     观测 #5504（知识源/同步）      |                       `design.md` §3.5 语料与多模态边界、§3.9 知识源同步设计                        |                   唯一知识源 docs/docx、增量对账、图片仅 URL 元数据                   |
|    观测 #5506（Neon/pgvector）     |                             `design.md` §3.6 Neon 与 pgvector 部署契约                              |                pooled/non-pooled URL 分工、vector(1536)+HNSW 余弦一致                 |
|     观测 #5508（neonctl 事故）     |        `design.md` §3.7 Neon CLI 强制执行；`agent-findings.md` §2 已知风险、§3 禁止重复路径         |               事故沉淀上升为强制守卫与禁令（禁 neonctl、禁建第二资源）                |
|    观测 #5507（术语/部署陷阱）     |                       `design.md` §3.12 Hybrid Search 与 RRF、§3.13 错误映射                        |                        FTS≠BM25、RRF 标准公式、真实 HTTP 状态                         |
|       观测 #5500（学习路径）       |                                 `design.md` §3.16 学习路径与里程碑                                  |                            M1-M4 里程碑在 design.md 中保留                            |
|     观测 #5513（Vercel 部署）      |                            `design.md` §5 Migration Plan「运行架构现状」                            |            已上线架构：双 Vercel 项目、7 个 NITRO\_\* 环境变量、Neon 三表             |
|     观测 #5514、#5508（事故）      |                              `agent-findings.md` §2 已知风险与失败索引                              |                  Vercel Corepack、Windows neonctl CPU 自旋等失败记录                  |
|       观测 #5515（命名澄清）       |                                      `design.md` §3.6 配套事实                                      |                     库名 `neondb` 为 MCP describe_branch 实测确认                     |
|       观测 #5569（迁移本身）       | change 根目录全部工件（tasks.md / design.md / proposal.md / agent-progress.md / agent-findings.md） |                        观测描述迁移动作与任务真实状态核实结果                         |
| 会话 sess-msv85exa-glcsyp（08-16） |                               `agent-findings.md` §4 迁移备注与决策点                               | 决策点（knowledge_sync_runs 缺 chunk 数、RRF 公式落地 rrf.ts）与会话 Discoveries 一致 |

阅读建议：

- **决策权威**：`design.md` §3（17 项决策）——实施时以它为准。
- **风险权威**：`agent-findings.md`（§2 已知风险、§3 禁止重复路径、§4 决策点、§5 待办入口）。
- **历史背景**：本目录观测与会话——解释「为什么这么决策」「哪些事故踩过坑」。
- 三处若有不一致，以 `design.md` 与 `tasks.md` 为准，并将差异记入 `agent-findings.md`。
