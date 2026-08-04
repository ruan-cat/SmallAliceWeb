# 通用的杂项提示词

## 001 <!-- 已完成 提示词准备好了； Codex正在做 --> 开发简单的 AI 对话窗口组件

我要求你制作一个复杂的项目配置。在 packages 目录内新建两个子包项目。

1. 制作设计一个子包，实现特定组件库的对外暴露。这个组件库就只负责暴露一揽子的复杂业务 vue 组件。其本质就是将一个带有独立 AI 应用能力的 vue 组件暴露出来。叫做 `@ruan-cat-drill-doc/ai-vue`
2. 设计一个基于 nuxt 的组件库文档。叫做 `@ruan-cat-drill-doc/ai-vue-doc`
3. 设计一个局部级别的 vitepress 插件子包，并设计好在合适的小爱丽丝文档，即 vitepress 项目内导入 vitepress 插件，展现出这个 AI 对话用途的组件库。并提供必要的 vitepress 插件兼容配置。定位为一个 vitepress 插件。叫做 `@ruan-cat-drill-doc/ai-vitepress-plugins` 。

### 未来拓展级别的设计

我们一期任务先负责打基础，打基础。做好基础架构的，确保组件库、组件库文档、vitepress 文档这三个部分。都能够正常使用，在 vue 组件内能够正常使用。
未来我会要去拓展很多功能的，重点会在 Ai 方向发力，我会要求搭建 RAG、搭建后端。制作一个基于小爱丽丝一揽子的 markdown 文档的 RAG AI 对话项目。这是一个野心勃勃的项目。最终目的是为了体现出我的 AI 能力，方便我求职找工作。

### 整体架构设计

我们已经有一个非常成熟的组件库制作与组件库制作体系了，你直接参考 `D:\code\ruan-cat\eams-component-lib` 目录的做法。

1. 模仿 D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui\package.json 制作 vue 组件库。
2. 模仿 D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt\package.json 制作对应的 nuxt 组件库文档。

### 组件库文档的注意事项

我当初丛组件库文档时，遇到了很多坑，你必须先去看看 memorix 在 eams-component-lib 的历史经验教训。你最好是大幅度的照抄 `eams-component-lib\packages\vue-element-cui-nuxt\package.json` 的依赖配置，特别是以下配置文件：

- D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt\nuxt.config.ts
- D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt\app.config.ts
- D:\code\ruan-cat\eams-component-lib\packages\vue-element-cui-nuxt\tailwind.config.js

我不希望你在 nuxt.config.ts app.config.ts tailwind.config.js 这三个配置文件上出什么问题。这几个太容易出现误区了，我很担心你乱搞。

### `@ruan-cat-drill-doc/ai-vue` 组件库

这是具有 AI 对话能力的组件库，未来要内部直接整合必要的后端能力，完成 AI 对话效果。目前我允许这个组件库本质上成为一个二次封装的 AI 组件库，对现有的 AI 组件库做二次封装。

我能够接受以下的一系列 AI 对话的 vue 组件库和相关的工具：

- x‑markdown‑vue https://github.com/element-plus-x/x-markdown
  > 流式渲染
- vue-element-plus-x https://github.com/element-plus-x/Element-Plus-X
  > 成熟的 AI 对话框组件库
- @shikijs/stream
  > 流式 markdown 渲染时，代码块的高亮渲染
- Markstream https://github.com/Simon-He95/markstream-vue
  > 用于人工智能聊天的流式 Markdown 渲染器
- ai-elements-vue https://github.com/vuepont/ai-elements-vue
  > shadcn-vue 构建的组件库。
- @ai-sdk/vue

我希望你大胆的复用，使用这些库，完成现成的组件开发。快速实现基础的 AI 对话能力，做好 AI 对话需要的前端交互。

#### 允许实现模拟

目前我们还没有正式的实现最基础的 AI 对话能力，和 AI 大模型的 baseUrl 配置。这个内容我放到下一个阶段做，这不是我们这个阶段做的。
我允许你编写假的对话流程，模拟 AI 对话。因为本阶段只负责跑通基础架构，确保基础架构能够完成 monorepo 项目的多包调度和渲染。

### `@ruan-cat-drill-doc/ai-vue-doc` 组件库文档

组件库文档本质上是一个 nuxt 项目。对于这个子包，我唯一的要求就是，你认真的做好模仿，认真看我给你的参考项目的做法，不要乱来。这个小项目只需要完成最基础的组件展示和基础文档说明即可。截止目前，我不需要这个组件库文档质保，承担很复杂的职责。能直接给我显示，能让我对 `@ruan-cat-drill-doc/ai-vue` 组件库做在线的使用交互，就可以了。
高度相关的指导技能是全局技能 `init-shadcn-docs-nuxt` 。

### `@ruan-cat-drill-doc/ai-vitepress-plugins` vitepress 插件

我的最终使用场所是在根包的 `@ruan-cat/drill-doc` 这个 vitepress 项目内使用 AI 对话的组件库，但是我很清楚，在 vitepress 内使用 vue 组件，需要一些额外的处理，也要定义合适的 vitepress 插件格式。你应该要去调研清楚，如何编写 vitepress 插件，并确保这个插件能正常渲染我提供的 `@ruan-cat-drill-doc/ai-vue` AI 对话框组件。

你应该去看看 https://github.com/nolebase/integrations 仓库，看看别人是怎么弄含有 vue 组件的 vitepress 插件的，看看别人是怎么组织一个含有 vue 组件的 vitepress 插件的。

参考项目：

- https://github.com/nolebase/integrations
- https://github.com/okineadev/vitepress-plugin-llms

#### AI 对话组件的布局设计

AI 对话组件对于整个 vitepress 项目来说，其交互和唤起逻辑是这样的。

1. 在 UI 布局上，在 vitepress 文档内，是一个位于右下角的圆圈按钮。
2. 点击右下角圆圈按钮，即可打开一个 AI 对话框，可以开始和 AI 沟通。

### 自我验收标准

我们的任务确实很复杂，有不同的验收维度。

1. 对于 `@ruan-cat-drill-doc/ai-vue-doc` 组件库文档：
   - 能够在 dev 模式下，看到 nuxt 文档，且能够看到已经完成打包的组件库。并确保 SSR 场景下组件能够正常渲染。毕竟 nuxt 和 vitepress 都是 SSR 场景。
   - 在 preview 模式下，能够正常访问 nuxt 项目。
2. 对于 `@ruan-cat/drill-doc` 根包 vitepress 文档项目。
   - 能够正常的导入 vitepress 插件，并且能在本地 dev 模式下看到整个网站右下角的按钮。点击打开对话框，即可完成沟通。

### 浏览器自测验收技术选型

1. 优先用 agent-browser 来完成浏览器层面的自我验收。优先用这个实现低 token 的消耗使用。
2. 如果确实不行，你才考虑备选的谷歌浏览器 MCP。

### 首先，用 grill-me 技能和 superpower 技能来细化清楚具体的细节

- 细化细节。
- 生成 superpower 的 spec 和 plan markdown 文档。
- 排查探究潜在的技术冲突隐患。

### 最后，生成复杂的长期执行的 do-long-task 任务

用 openspec 的 new 技能来新建长任务，持续不断地生成完整长任务。我很清楚这个任务会拉的非常长，单一的 AI 对话无法一次性完成，所以我需要你生成基于 openspec 的长任务，确保未来可以持续不断的跟进长任务工件，来实现间断性的完成任务。

- 因为额度的问题，所以这一系列长任务的执行情况是间歇性的。
- 因为任务优先级问题，所以有时候会中断任务。

### goal 长任务触发提示词

```markdown
/goal 执行 OpenSpec change：`openspec/changes/build-ai-chat-packages`，完成 `@ruan-cat-drill-doc/ai-vue`、`@ruan-cat-drill-doc/ai-vue-doc`、`@ruan-cat-drill-doc/ai-vitepress-plugins` mock AI 对话能力及 VitePress 接入。

先检查 `AGENT_LONGTASK.md`（若存在）及其 references；读取 `AGENTS.md`、项目 OpenSpec skills、change 的 `proposal.md`、`design.md`、`specs/ai-chat-packages/spec.md`、`tasks.md`、`agent-progress.md`、`agent-findings.md`。刷新 git 状态，保护既有改动；未经授权不得暂存、提交、推送或回滚。

唯一任务源是 `openspec/changes/build-ai-chat-packages/tasks.md`，禁止创建第二套清单。每次只处理一个 task 或 checkpoint：先确认验收标准、文件和验证命令，做最小改动并运行验证；将进度和结果摘要写入 `agent-progress.md`，将失败路径与风险写入 `agent-findings.md`，证据齐全后才标记 `[x]`。

必须先完成试点 `1.1-1.9`。仅在 `pnpm --filter @ruan-cat-drill-doc/ai-vue test` 与 `pnpm --filter @ruan-cat-drill-doc/ai-vue typecheck` 通过并记录证据后，才能开始主体任务。后续依次完成组件库、Nuxt 文档站、VitePress client 插件与根站接入。一期禁止真实 LLM、RAG、Nitro、LangGraph、向量库、`baseUrl`、API key、模型配置和真实网络请求；Nuxt/VitePress SSR shell 必须可构建，AI 交互可 client-only，模块顶层不得访问浏览器 API。

使用探索、编辑、复核子代理；主代理负责工件链、任务选择与最终验收。发现遗漏先以文件级 checkbox 补写 `tasks.md`，必要时同步 `design.md` 或 `specs/`，运行 `openspec validate build-ai-chat-packages --strict` 后再实施。关闭完成的子代理，并运行 `cleanup-agent-team-node-processes` 清理或 dry-run 审计残留 Node 进程。

验证覆盖包级 test/typecheck/build、Nuxt build/preview、VitePress build/dev；优先用 agent-browser 验收按钮、对话框、mock 收发与 console。change 根目录不得散放过程报告；`agent-progress.md` 和 `agent-findings.md` 固定在根目录且只保留摘要索引。

执行至全部任务完成，并通过最终 strict validate、`git diff --check` 与工作区审计。仅在权限问题、破坏性风险、需求冲突或连续 3 次同类失败时停止，输出 BLOCKED 原因、证据和下一步建议。
```

---

设计基于 turbo 的串行调度
我们最终的交付产品是根包的 vitepress 文档，可是我们现在的 docs:build 一定是失败的，因为在生产环境的 vercel 内，build 的时候没有做好依赖调度。
在生产环境内，是能够拿到全部的仓库子包的代码的，问题在于 build 的时候没有使用 turbo 实现依赖调度。所以构建失败。
我要求这样改动我们的 ci 流水线和 vercel 生产环境的调度：

1. 在 根包 package.json 内，新建一个 build 命令，这个 build 命令最终的目的是实现 vitepress 文档的构建。需要什么子包的调度就一律用 turbo 完成调度。你应该在 turbo.json 内实现基于依赖拓扑结构的命令匹配和统一调度，用 turbo.json 实现优雅的子包串行调度 build。不要给我写冗长 pnpm 筛选命令，太离谱了。
2. 用 vercel MCP 或者是 vercel cli，修改本项目的 vercel 云项目的 build 配置，确保可以实现 turbo 的串行调度，确保使用正常。
   - 我这边猜测你直接修改根目录的 vercel.json 文件即可。
   - 我们项目虽然是 monorepo，但是在 vercel 云项目内，实际上还是使用单包模式，我们不是直接部署本 monorepo 的子包，所以你在使用 `use-vercel-deploy-in-monorepo` 技能时，不要被误导了。我们现在部署的生产环境目标是来自根包的 vitepress 文档，不是来自子包的内容。
3. 在我们 github 的 ci yaml 流水线文件内，我们应该也要弄一个经可能模仿 vercel 生产环境构建流程的 ci 自检文件。
4. 你应该去模仿 `D:\code\ruan-cat` 的其他项目，模仿具体的 ci.yaml 工作流的制作。
5. 结合我们全局技能，实现自检 ci 工作流文件的新建。
6. 自检自测流程
   - 我们应该实现 git-commit 之后，然后 push，在 github 和 vercel 的 main 分支内
   - 检查清楚我们的 github ci 工作流是否在 dev 分支正常执行
   - 检查 vercel 在 main 分支内是否正常执行。
   - 你必须严格使用全局技能 git-commit 和 rebase2main 来完成 git commit 信息的编写，然后切换分支，自己完成 git push，并且去检查清楚 github 和 vercel 的构建情况。你需要同时使用 github 和 vercel 的 MCP，或者是 github 和 vercel 的 cli。

---

我不喜欢你写 `"build": "turbo run build --filter=@ruan-cat-drill-doc/ai-vitepress-plugins && pnpm run docs:build",`
这个命令冗长不优雅。
我要求你这样做： 利用 pnpm 的工作区协议，将全部子包都加入到根包的依赖内。你应该酌情增加到 dependencies 和 devDependencies 内。这样能充分发挥 turbo 的拓扑依赖构建能力，这样能完成更好的依赖调度行为。我很讨厌这种 --filter 参数写法。这加剧了固定的耦合度，依赖顺序调度能力是 turbo 本身就有的，我们要做的是在根包内建立依赖，建立依赖拓扑关系。

## 002 <!-- TODO: Codex正在做 --> 以拓展简历能力为核心目的，逐步增加核心 AI 能力

<!--
docs\superpowers\plans\2026-07-29-ai-rag-phase2-plan.md
docs\superpowers\specs\2026-07-29-ai-rag-phase2-design.md
-->

阅读以下文档和建议的 AI 入门计划：

- D:\store\WorkBuddy\2026-6-30-common\2026-7-8-learn-use-LangGraph-with-typescript\2026-07-11-langgraph-typescript-entry-research.md
- `D:\code\ruan-cat\resume\简历\转型到AI方向\index.md`

我需要你帮我完成一个合理的二期 AI 化任务设计。

---

我有好几个技术问题需要你先解答一下，和我沟通一下：

你先看这些上下文，然后准备继续回答我的问题：

- D:\store\WorkBuddy\2026-6-30-common\2026-7-8-learn-use-LangGraph-with-typescript\2026-07-11-langgraph-typescript-entry-research.md
- `D:\code\ruan-cat\resume\简历\转型到AI方向\index.md`
- docs\superpowers\plans\2026-07-29-ai-rag-phase2-plan.md
- docs\superpowers\specs\2026-07-29-ai-rag-phase2-design.md
- docs\handoffs\2026-07-29-ai-rag-phase2-handoff.md （该文件看完就删掉）
- 执行 `memorix context --task "AI 转型二期任务执行"` 命令获取上下文

1. Chroma chromadb ，为什么选择这个？其他技术选型为什么你不选呢？这个数很主流的方案么？
2. 编写固定大小 Chunk 函数？在 typescript 为技术栈的 AI agent RAG 项目内， Chunk 切分函数以及切分策略，没有现成的方案么？以后我需要动态调整 Chunk 分割细粒度怎么办？
   - 根据文档类型以及特定格式来确定 chunk 策略，然后进行词嵌入向量化，最后优化检索。我们的数据来源是 `docs\docx` 目录的全部 markdown 文件。你有针对这个场景做专门的 chuck 拆分方案么？
3. 现在在 typescript agent 项目内，对 vitest 的测试用例编写有什么现成的方案么？你在 github 仓库内有看到什么合适的教程和项目指导你这样做么？
4. 你写的是 `const docText = await Bun.file('data/test-docs.md').text();` ，我们的生产环境是 vercel，开发环境是 window，我们都没有设置运行时是 bun，我们都是 node。照你这么说，我们做 typescript 的 AI RAG 知识库项目，岂不是要更换运行时为 bun ？这个改动设计太破坏性了，我记得大多数方案都是 node 运行时的。
5. BM25 是什么东西啊？跟我说说吧，我对这个确实不懂。
6. 搭建 Neon 本地 Postgres，你有想好怎么去 neon 内新建一个云数据库么？你把这个链路准备好了吗？
7. 我们项目 Nitro API 项目，我们只能提供 nitro 接口，你做好我们项目的 api 接口分包设计了么？我们没有 nuxt 项目的。
8. 实现前端 Chat UI，我们不是已经有了 AI 对话组件了么？ packages\ai-vue 不就是已经设计好的 AI 对话组件了么？

---

我需要跟你说明清楚我需要做的 RAG 项目要做到什么功能，我们项目目前在开发环境和生产环境内，会有办法获取到 `docs\docx` 目录的全部 markdown 文件，我们的核心检索的文件就是这一大堆的 markdown 文件。我需要做的智能 AI 对话助手，主要的任务目标就是为了实现智能化的 AI 对话，知识库智能助手的知识库就是 `docs\docx` 目录的全部文件。
这些文件是随时都有可能更新的，毕竟是获取来自上游的 docx 文件。所以我们的 AI 应用面对的知识库本身就是动态变化的。
在这个核心需求前提下，你去适当改动我们的 2026-07-29-ai-rag-phase2-plan 和 2026-07-29-ai-rag-phase2-design 文档；

---

你还没有回答我的这几个问题呢，以报告的形式来回答我的疑问：

1. Chroma chromadb ，为什么选择这个？其他技术选型为什么你不选呢？这个数很主流的方案么？
2. 现在在 typescript agent 项目内，对 vitest 的测试用例编写有什么现成的方案么？你在 github 仓库内有看到什么合适的教程和项目指导你这样做么？
3. BM25 是什么东西啊？跟我说说吧，我对这个确实不懂。
4. 搭建 Neon 本地 Postgres，你有想好怎么去 neon 内新建一个云数据库么？你把这个链路准备好了吗？

---

我对这个 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api add nitropack h3 ai @ai-sdk/openai drizzle-orm postgres zod` 很不满意。特别是你的你的 nitro 实现，你应该看 `D:\code\ruan-cat\01s-11comm\apps\api` 这个项目的做法，看这个项目 nitro 接口实现。我们用的是 nitro v3 版本来实现独立可用 nitro 接口的。不允许你使用 nitropack 这个 v2 版本的包。
安排独立的子代理，去改正这个写法，你这个写法就不对，不合适。

---

我们现在的 spec 和 plan 内根本没说明清楚你怎么去完成 neon 新数据库的生成，以及 neon 连接向量插件 pgvector 。这个具体的做法细节没说明清楚，你的调研不齐全。应该多用 content7 MCP 或者是其他联网查询工具看具体的问题，来实现 pgvector + neon 的功能。说明清楚怎么新建数据库，怎么使用 neon cli 完成任务。
另外，我已经给我们这个项目的云 vercel 项目，安装了 neon-smallalice-ai-rag 这个 neon 数据库，你给我记清楚了，本 git 项目链接的 vercel 项目，其对接的云数据库名称是 `neon-smallalice-ai-rag` 。未来你链接 neon 数据库需要的敏感环境变量，你应该要先走 vercel 获取云环境的变量，再开始完成数据库连接。
参考 https://neon.com/docs/extensions/pgvector 和 reports\2026-07-31-ai-rag-phase2-technical-decisions.md ，确保这个云 neon 数据库可以连接 pgvector 。

---

`vue-element-plus-x` 管对话壳，`markstream-vue` 管流式 Markdown，`@shikijs/stream` 管生成中代码块；`AI Elements Vue` 属于另一套 shadcn/Tailwind UI 体系，不应与 Element Plus X 混作同一主界面
把这个重要的技术选型说明，写清楚，写到 packages\ai-vue\package.json 的 READMD 和 根 README.md，做好必要的技术选型说明，确保你自己不要迷糊，也确保我能够正常阅读清楚必要的内容。
正确更新 spec 和 plan。

### 对 AI 组件库的思考设计

vue-element-plus-x — AI 对话壳层，提供这些基础能力：

核心组件矩阵
组件 解决什么问题 AI 场景价值
ChatBubble 对话气泡（用户/AI 双向） 支持头像、时间戳、操作按钮（复制/重试/点赞）
Typewriter 打字机逐字输出效果 可配置速度、光标样式，模拟 AI "正在思考" 的体感
Thinking 思考链/推理过程折叠展示 DeepSeek R1、QwQ 等推理模型的 thinking 内容展示
Welcome 欢迎语 + 推荐问题 首次进入对话时的引导，降低用户冷启动成本
MessageInput 增强输入框 支持多行、快捷键发送、文件上传、字数限制
ConversationList 会话列表管理 多轮对话的历史管理、重命名、删除

这些东西对么？按照官网来说这些对么？我们的 `@ruan-cat-drill-doc/ai-vue` AI 对话组件库，有充分的使用这些么？我们的 ChatBubble Typewriter Thinking MessageInput 这些基础组件，你有设计并使用么？还是说我们现在的组件库没做好？这些是不是纯纯的就是第一期制作套壳对话模板时，没做好的部分？你认为这些东西算作是对一期纯静态套壳 AI 对话框的补充么？你认为这些东西适合插入到我们二期项目的 `2026-07-29-ai-rag-phase2-plan` 和 `2026-07-29-ai-rag-phase2-design` 文档么？
思考并和我讨论一下。

---

### 继续推进二期项目改造

我正在持续推进 `docs\superpowers\specs\2026-07-29-ai-rag-phase2-design.md` 和 `docs\superpowers\plans\2026-07-29-ai-rag-phase2-plan.md` 的 superpower 长任务。上一个会话已经结束了。我正在本会话继续推进该内容。我遇到以下 goal 任务的暂停事项：

PostgreSQL provider 的离线合同仍保持候选状态：
代码与测试已在本地通过，SQL、行映射、1536 维校验和余弦距离约束都有覆盖。
仍缺少独立复核记录，且不能将其描述为真实 PostgreSQL provider 已完成。
真实数据库连接、pgvector 查询、embedding、同步事务、生产装配、部署和演示视频仍受明确的外部授权与证据门禁约束。

---

整体二期目标仍未完成，以下事项继续受真实外部证据门禁约束：
PostgreSQL/pgvector 真实连接、查询和索引验证；
embedding 服务与真实向量写入；
增量同步事务、失败回滚保护和 advisory lock；
生产 event.context.rag 接入真实 provider；
真实模型端到端 /v1/chat；
Vercel 部署、线上回归和演示视频；
真实生产浏览器 hydration 与逐 token Shiki 高亮兼容性。

---

请问为了解决这些问题，我应该怎么做？

1. 首先你先跟我解释一下上面这些东西为什么导致 goal 任务暂停了。
2. 然后告诉我应该怎么给你做好提前授权，然后让你有足够的工具完成自主测试。
3. 最后在 `reports` 目录内给我新建一个专门的报告，说明清楚我该怎么做。

### <!-- TODO: --> 实现任务格式改造

我要求你实现任务文档格式的大幅度改造。

我不打算继续使用 `docs\superpowers\specs\2026-07-29-ai-rag-phase2-design.md` 和 `docs\superpowers\plans\2026-07-29-ai-rag-phase2-plan.md` 文件来管理这个长任务了，我要求改换成基于 openspec 的 do-long-task 长任务任务存储体系。

这个任务需要你大幅度的改动任务进度、任务规格的存储方式。

1. 我要求你先完成历史上下文的获取，安排足够多的子代理，真实的探索清楚任务进度情况。
2. 结合 memorix 的历史信息，按照二期、AI 化改造这些关键词，去找本项目近期的记忆存储内容，确保不要出现失忆的情况。
3. 我们的最终目的是彻底取代 2026-07-29-ai-rag-phase2-design.md 和 2026-07-29-ai-rag-phase2-plan.md 文件，把里面的全部细节都做到精准的 openspec 任务规格迁移。做成基于 do-long-task 技能的长任务规格，你很容易出现理解失忆的情况，你必须非常谨慎的，逐步的完成内容迁移和改造。

## 003 <!-- 已完成 --> 安装 grill-me 技能

1. 运行命令。
2. 及时在 AI 记忆文档内，记录项目局部技能，说明清楚这批次的技能都是 grill-me 的衍生技能。

```bash
skills add https://github.com/mattpocock/skills `
  --skill grill-me grilling grill-with-docs domain-modeling wayfinder to-spec `
  setup-matt-pocock-skills ask-matt `
  -y `
  -a claude-code `
  -a codex `
  -a cursor `
```

---

我不喜欢 tsconfig.json 内 的"paths": 处理方式，这种方式就说明了我们每一个子包本身就没做好自己的 export 和类型导出的职责，反而要在项目级别的 monorepo 的 tsconfig.json 内完成。这就不成熟，不对！
每一个子包应该自己在 package.json 内完成自己要负责的 export 路径，和必要的 typescript 类型文件的生成，和 `*.d.ts` 文件的生成。而不是用这种变通的方式来完成全局整体性质的路径处理。这就很偷懒，而且耦合度很高，万一我以后增加了更多的子包，岂不是根包 tsconfig.json 配置越来越臃肿了？
你去看看 D:\code\ruan-cat\monorepo 和 D:\code\ruan-cat\01s-11comm ，D:\code\ruan-cat\eams-component-lib ，这几个项目那个会想你一样弄这种根 tsconfig.json 的写死路径别名？你这个做法就不优雅，耦合度很大。每个子包的 typescript 路径暴露职责都没做好！

## 004 <!-- TODO: --> 调研来自 docx 文档生成的 x-emf 格式文件的转换方案

---

## 005 <!-- TODO: 作为交互优化级别的项目 --> 网站 title 标题的动态切换

我要求你实现 AI 应用标题的动态切换功能，我们完成一轮对话沟通后，标题应该立刻切换，并且去提示用户尽快处理。

1. 在浏览器层面，应该申请浏览器弹框的权限。如果用户提供权限，那么 AI 对话完成后，就应该弹出浏览器弹框，通知用户已经完成了对话。
   - 浏览器弹框的 icon 图标应该默认使用你这个 vitepress 站点默认提供的 favicon，未来我可能会改换别的通知弹框方式和 icon 图标。
2. 浏览器标题应该立刻切换，以便完成通知用户的效果。
   - 应该使用 vueuse 的工具函数，来实现你的浏览器标题切换功能。
   - 在你的 vitepress 应用中，你应该注意看清楚在哪里去实现这个功能，你可能是在 `packages\ai-vitepress-plugins\package.json` 子包内完成这个浏览器标题切换功能。注意你是在 vitepress 应用内完成这个功能。我给的建议可能不对，你做好调研和思考后再开始做。核心查询点是： 在 vitepress 应用内使用 vueuse 的 useTitle 函数完成应用的标题切换。

## 006 <!-- TODO: --> 持续推进二期 AI 项目改造

## 007 <!-- TODO: -->
