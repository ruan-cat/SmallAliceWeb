# 2026-11-10 learn-inkeep-agents-repo 进度复盘

本报告由 Cursor 代理完成，模型为 Grok 4.7。只读检索与文件抽查，没有重跑测试，也没有重新打开浏览器。

## 1. 一句话结论

`learn-agents-ui/plan.md` 第 19.6 节执行进度总表里，从 P0-1 到 SY-3 的每一行都已标成 ✅。抽查到的关键源码文件现在仍在仓库里。完成效果要分开看：聊天组件、页面上下文、模型切换、评估落库是按当时的单测和部分浏览器证据落地的；GitHub Actions 同步那一行的 ✅ 表示路线已关闭，CI 并没有真正扫到知识源。

## 2. 这次怎么核对

### 2.1 事实源

本目录自己规定：2026-09-30 之后，learn-agents-ui 的进度只看 `learn-agents-ui/plan.md` 与 `learn-agents-ui/spec.md`。openspec 变更包已归档到 `learn-agents-ui/openspec-archive/`，不再当进度账本。

动态进度在 plan 第 19.6 节。第六章任务定义表和 spec 里大量 `- [ ]` 没有回勾。那些未勾选的方框不能解读成「任务还没做」。

### 2.2 Memorix 检索

会话 `sess-mwapk5dz-6r0trk` 已绑定本仓库。检索使用本机 `MEMORIX_EMBEDDING_MODEL=qwen3-embedding:4b`（Ollama，2560 维）。

连续三次项目范围检索都没有命中本目录的进度记录，只返回两条无关观察：

```log
query: inkeep agents learn-agents-ui 进度 P0 P4
query: learn-agents-ui plan 19.6 SY-3 方案 C 本地 rag sync
query: evaluation_runs 迁移 smoke AiChat 模型切换
hits: obs:5872 agent 临时设施必须即时清理
hits: obs:5502 全局技能不得承载未授权事故修复
match: narrative / fuzzy
```

续接卡里的上一条会话目标是发版与生产验收，也不是这份 9 月调研。本目录的历史进度在报告和 plan 里，不在 memorix。

### 2.3 代码抽查

下列路径在 2026-11-10 仍存在：

|     能力     |                                      路径                                       |
| :----------: | :-----------------------------------------------------------------------------: |
|   品牌主题   |               `packages/ai-vue/src/composables/useBrandTheme.ts`                |
| Teek 主题色  |               `packages/ai-vue/src/composables/useThemeColor.ts`                |
|  Shadow DOM  |        `packages/ai-vue/src/components/ai-shadow-root/AiShadowRoot.vue`         |
|     事件     |               `packages/ai-vue/src/composables/useChatEvents.ts`                |
|  搜索结果卡  |       `packages/ai-vue/src/components/ai-chat/cards/SearchResultCard.vue`       |
|  来源列表卡  |        `packages/ai-vue/src/components/ai-chat/cards/SourceListCard.vue`        |
|     侧栏     |       `packages/ai-vue/src/components/ai-sidebar-chat/AiSidebarChat.vue`        |
|     弹窗     |         `packages/ai-vue/src/components/ai-modal-chat/AiModalChat.vue`          |
|  函数式挂载  |  `packages/ai-vue/src/mount.ts`；`packages/ai-vue/package.json` 含 `"./mount"`  |
|     vepx     |       `packages/ai-vue/package.json` 中 `vue-element-plus-x` 为 `^2.0.3`        |
|  页面上下文  |                   `packages/ai-rag-core/src/page-context.ts`                    |
| prompt 模板  |             `packages/ai-rag-api/server/context/prompt-template.ts`             |
|   模型列表   |              `packages/ai-rag-api/server/routes/v1/models.get.ts`               |
|   评估迁移   |           `packages/ai-rag-api/drizzle/0005_add_evaluation_runs.sql`            |
|   评估仓储   |           `packages/ai-rag-api/server/evaluation/runs-repository.ts`            |
| 评估只读接口 | `packages/ai-rag-api/server/routes/v1/evaluation/runs.get.ts`、`runs-id.get.ts` |
| GA workflow  |       `.github/workflows/rag-sync-schedule.yaml`（文件头已写明空转留档）        |

## 3. 分组进度

19.6 总表按组归并后的状态如下。证据强度按文档原文，不是今天重新跑出来的。

|    组     |      19.6 状态       |                                           当时写下的完成效果                                           |                                    仍然敞开的口子                                    |
| :-------: | :------------------: | :----------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------: |
|    P0     |       ✅ 3 项        |                        vepx 升到 2.x，Sender 换成 XSender，ConfigProvider 接入                         |                      无独立遗留。后续生产发送按钮问题不在本表内                      |
| P1 / P1.5 |          ✅          |            主题令牌、色阶、Teek 桥接。2026-10-31 CDP 记录三色一致，切到 `#22c55e` 后可还原             |                 第十二章视觉表模板仍是空的 ✅/❌ 占位，没有当成总表                  |
|    P2     |          ✅          |                    Shadow Root 挂载，文档站默认 `container-with-shadow`，面板能打开                    |                       宿主 CSS 污染的对照实验没有单独证据文件                        |
|    P3     |          ✅          |                        反馈、示例问题、消息操作、6 类事件；单测计入当时的 99/99                        |                      浏览器只证明面板渲染，真实提问交互留待联调                      |
|   P3.5    | ✅（与限制说明冲突） |                  搜索结果卡、来源列表卡、自定义渲染器；`data-component.test.ts` 10 例                  |      默认 demo 不注入 `itemType`，浏览器里没看过卡片。限制说明写明「不标注 ✅」      |
|    P4     | ✅（与限制说明冲突） |                 侧栏、弹窗、`mountAiChat`、`./mount` 子入口；`p4-mount.test.ts` 11 例                  |            文档站默认只挂浮动按钮，侧栏、弹窗、纯 HTML 挂载没有浏览器证据            |
|    FC     |       ✅ 5 项        |                        页面上下文、TTFT 事件、反馈带 `conversationId`；跨包单测                        |               FC-1/3/4/5 的浏览器结论都是「渲染层过，端到端问答未做」                |
|    CC     |       ✅ 6 项        |                              PageContext、归一化、五段 prompt、chat 接线                               |                      规格修订已归档，不再留在 openspec 活动目录                      |
|    MS     |       ✅ 6 项        | `/v1/models`、请求级 provider、分段选择器。2026-09-29 Chrome 看到两个模型并可切换、可写入 localStorage |       当时 dev Nitro 装配 503，自动化按不了发送。真实换模型回答没有浏览器闭环        |
|    EV     |       ✅ 4 项        |            表、迁移、三脚本落库、只读接口、19 个测试。随后补做记录写了真实库往返和三行落库             | 19.6 的 EV-4 格子仍写「待环境联调」；端点文档第 5 节的三条待办也没改。以补做记录为准 |
|    SY     |       ✅ 4 项        |         workflow、Secrets、首跑 run `36569710912` 与 push run `36569673693` 在 workflow 层成功         |   同步层 `partial`，`scannedFileCount=0`。方案 C 之后本地 `rag:sync` 才是同步入口    |

## 4. 完成效果怎么理解

### 4.1 可以当成已经落地的部分

前端聊天能力按计划从「一个浮动面板」扩到了主题、Shadow DOM、反馈与事件、结构化卡片类型、侧栏、弹窗和 `mountAiChat`。后端补上了页面上下文注入、模型列表与请求级切换、`evaluation_runs` 落库和只读查询。这些判断来自 19.6 的提交号与测试计数，加上第 2.3 节的文件仍在。

路线边界也已经写死，不要再按 9 月 5 日初稿去做：不做多轮会话，不接 MCP，不做对话历史压缩。根目录 `README.md` 已标明自己是历史文献。

### 4.2 标了完成、但用户可见闭环不够的部分

plan 第 21 章写过：单测不能代替浏览器。对照浏览器证据，多数阶段只做到「docs dev 里面板打开、控制台无错」。下面这些没有用户可见闭环：

1. 真实文档页提问后，回答是否带上当前页 `pageContext`。
2. 切换模型后，下一条回答是否真的换了 provider。反馈是否回到某条问答记录。
3. `search-result` / `source-list` 卡片在页面上的样子。
4. `AiSidebarChat`、`AiModalChat`、非 Vue 页面的 `mountAiChat`。

`browser-evidence/_history/P3.5-P4-limitations.md`（2026-09-27）写的是这两阶段先不要标 ✅。19.6 后来仍标了 ✅，依据是单测和「浮动面板能打开」。两份文档没有互相改口。读进度时以 19.6 的「代码与单测完成」为准，以限制说明的「浏览器未做」为准绳，两边同时成立。

### 4.3 方案 C：SY 的完成不是同步成功

2026-09-29 首跑之后确认：`docs/docx` 被 gitignore，CI checkout 里没有知识源。workflow 退出码 0，同步统计是扫 0 个文件。2026-09-30 拍板方案 C：知识库同步只走本地 CLI `rag:sync`，GitHub Actions 文件留着空转。2026-10-31 又核对了 2026-10-19 至 10-30 的 12 次 schedule，workflow 成功、同步层仍是 partial。

所以 SY-3 的 ✅ 是「验收项已关闭并留档」，不是「云端每天在更新知识库」。

探索笔记 E 早先写的「checkout 里天然有 290 个 md」已被批注否掉。单文件增量断言在执行中发现前提不成立，已取消并回滚，见 `browser-evidence/EV/2026-09-29-remaining-items-plan.md` 第 2.3 节。

### 4.4 评估落库后来补上了

`2026-09-29-evaluation-runs-endpoints.md` 第 5 节仍列着三条待办。同日更晚的补做记录把其中实库部分做完了：迁移重放通过，并修了 jsonb 双重编码；三个评估脚本各写入一行（parameter / real / promptfoo）。端点文档的待办段没有同步改掉。19.6 里 EV-4 那一格也还写着「真实库往返与三脚本落库待环境联调」，和后面的补做记录冲突。读 EV 时以补做记录为准，不要只看总表那一格的后半句。

## 5. 不要拿来当未完成清单的旧文档

|                    文档                     |                        为什么不能当现行待办                         |
| :-----------------------------------------: | :-----------------------------------------------------------------: |
|             目录根 `README.md`              |        2026-09-05 云端调研。多轮、压缩、MCP 已被路线修订废止        |
| `2026-09-05-learn-docs-assistant-report.md` |          写于上下文注入完成之前，里面的「完全缺位」已过时           |
|     `openspec-archive/` 里未勾的 tasks      |                  归档快照，进度改由 plan 19.6 承载                  |
|        spec / plan 正文里的 `- [ ]`         |         定义和验收条文，执行时改的是 19.6，没有回勾这些方框         |
|           spec 4.6「独立 JS 包」            | plan 改为在 `ai-vue` 内导出 `./mount`，不新增子包。代码按 plan 落地 |

## 6. 若只想知道还剩什么

现行剩余是验收缺口和一条已关闭的同步路线，不是一整张未开工的任务表。

1. 给卡片、侧栏、弹窗、`mountAiChat` 补演示页，再做浏览器证据。限制说明第「后续补做指引」已经写了三个 demo 路径。
2. 在 RAG 装配完整的环境里补一次真实提问：页面上下文、换模型、反馈回链。
3. 不要重启 GA 同步，除非知识源分发方式改掉。现行入口是本地 `rag:sync`。
4. 若整理文档，优先改三处过期段落：P3.5/P4 限制说明与 19.6 的 ✅ 冲突，评估端点文档第 5 节未回填，以及 19.6 里 EV-4 仍写「待环境联调」。

本报告不把 2026-11 月生产环境发送按钮 disabled 算进本目录未完成项。那是本表关闭之后的另一条问题，memorix 续接卡里有相关标题，不在这次进度账内。
