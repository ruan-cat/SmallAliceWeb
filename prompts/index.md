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

## 002 <!-- 任务太长，移交给其他章节继续； Codex正在做 --> 以拓展简历能力为核心目的，逐步增加核心 AI 能力

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

---

请你先用 openspec 的技能，检查清楚现在的 openspec 工件内的任务进度。用 memorix 去检查二期 AI 项目的进度。我们准备完成授权，并继续推进任务。在此之前，我们已经做了：

- 完成了完整的 nitro 接口部署。
- 改造了基于 superpower 的 spec 和 plan 文件，全部换成 do-long-task 的任务工件了。
- 调研清楚 agent 继续完成本任务需要的授权信息。
  - 本地 agent 无法持续完成任务的报告，和需要人工授权的内容： `reports\2026-08-04-ai-rag-phase2-external-authorization-guide.md`

以下是我对之前授权卡顿的疑问，和我给你的授权情况。

1. 不会创建 PostgreSQL 连接？为什么？我们不是已经有了 nitro 接口么？我们的 nitro 接口难道没办法首先先获取到来自 vercel 的环境变量，然后用获取到的 neon 环境变量，完成 PostgreSQL 数据库的链接么？你的自测流程难道没有先开启 nitro 本地接口服务么？
   - 云 nitro API rag 已经完成了。你继续。
2. 外部系统具有副作用，代理不能替用户猜授权
   - 你应该大胆的使用 drizzle 完成数据库 migration ，如果这个操作你不知道规范，你应该自己去看看 `D:\code\ruan-cat\01s-11comm` 的 api 子包是怎么做到用 drizzle 完成 neon 数据库的 migration 合并的。别害怕更改数据库表。我们现在是刚刚开始做这个功能，别怕修改数据库表。功能都没稳定，别害怕。你再这个部分过于保守了。
   - 按量计费的模型请求。别害怕。我会给你提供多款不同格式的，不同 baseUrl 和 apikey 的，不同接口响应格式的渠道。你可以大胆的实现测试。不用太害怕产生费用。
   - Vercel 部署会改变可访问的运行版本和环境绑定。你应该大胆的完成 vercel 推送和部署。我们项目目前完成 dev 分支的推送后，就会触发有意义构建。就会更新生产环境了。你应该要先设计好要实现生产环境的更新的测试流程，再开始逐步完成面向生产环境的联调。先完成本地级别的 dev 测试，和 preview 测试。再考虑用 git commit 和 git push 来触发 vercel 的 build，进入生产环境的测试。
   - 我不明白你说的这个什么`视频上传`是什么意思？浏览器回归是什么意思？本地的，基于 agent-browser 的浏览器验证有什么问题么？你不就是用 agent-browser 来完成 dev、preview、和生产环境 build 的浏览器功能测试么？这有什么疑惑呢？
   - 别害怕把测试数据上传给外部的公开模型，我们的文本数据本身就是在 github 开源公开的。
3. 你先直接使用 neon cli 或者是 curl 的手段，直接完成 neon 数据的真实 embedding 写入，再开始完成下一步的测试。

以下是授权范围：

```text
授权范围：SmallAliceWeb AI RAG 二期
允许工作目录：D:\code\ruan-cat\SmallAliceWeb
目标环境：development / preview / production（3个环境都做测试）
Neon 资源：复用 patient-cloud-43432277，数据库 neon-smallalice-ai-rag；禁止新建同用途资源
允许 A0 本地验证：是
允许 A1 只读资源核对和拉取 development 环境变量：是
允许 A2 development migration、SQL smoke test、测试数据写入：是
允许 A3 development 真实 embedding 和同步：是
允许 A4 Vercel preview 部署和真实 API/浏览器回归：否
允许 A5 production 部署、线上回归、视频录制或上传：是
embedding 限制：最多 100 个文本，费用上限 不懂，允许的模型 低成本模型。或者是我指定的模型。
数据库写入限制： 每个环境均可；允许 migration 是；允许写入的表 均可。
测试数据： 均可，不考虑数据脱敏。
停止条件： 出现非预期环境、权限错误、费用超限、数据不一致或 secrets 泄露迹象时立即停止。
证据保存位置：.superpowers/sdd/2026-07-29-ai-rag-phase2-plan/
```

你能够使用的工具：

- neon cli 我已经完成授权。你按照我提供给你的 neon 数据库组织 id 和数据库 id 来完成，在根 `README.md` 内有写清楚。
- vercel cli 已授权，可使用。
- 浏览器工具优先使用 agent-browser ，实在不行才使用谷歌浏览器 MCP。

现在我已经给够你东西了，请你调查清楚上下文。明确清楚自己要做的任务和内容，然后继续推进这款 `openspec\changes\ai-rag-phase2` 长任务。

### <!-- 已完成； ZCode正在做；ChatGPT web正在做；先等待其他的skills批量升级一次，再开始安排agent做格式转换任务 --> 实现任务格式改造

@Github @Skill Router MCP

1. PR 目标和信息表：
   - 你的 pr github 仓库地址为： https://github.com/SmallAliceWeb
   - 你的 pr 目标分支为： dev
   - 你的 pr 工作主分支为： 2026-8-16-change-to-do-long-task

---

我要求你实现任务文档格式的大幅度改造。

我不打算继续使用 `docs\superpowers\specs\2026-07-29-ai-rag-phase2-design.md` 和 `docs\superpowers\plans\2026-07-29-ai-rag-phase2-plan.md` 文件来管理这个长任务了，我要求改换成基于 openspec 的 do-long-task 长任务任务存储体系。

这个任务需要你大幅度的改动任务进度、任务规格的存储方式。

1. 我要求你先完成历史上下文的获取，安排足够多的子代理，真实的探索清楚任务进度情况。
   - 其中，openspec\changes\ai-rag-phase2\all-memorix 目录有更多关于该 AI 化 rag 任务的历史信息。
2. 结合 memorix 的历史信息，按照二期、AI 化改造这些关键词，去找本项目近期的记忆存储内容，确保不要出现失忆的情况。
3. 我们的最终目的是彻底取代 2026-07-29-ai-rag-phase2-design.md 和 2026-07-29-ai-rag-phase2-plan.md 文件，把里面的全部细节都做到精准的 openspec 任务规格迁移。做成基于 do-long-task 技能的长任务规格，你很容易出现理解失忆的情况，你必须非常谨慎的，逐步的完成内容迁移和改造。
4. 迁移改造时，务必要看清楚历史的 `.agents\skills\fix-bug\record-bug-fix-memory` 错误，不要出现错误遗漏和失忆。

请注意，现在在 `openspec\changes\ai-rag-phase2` 目录内已经有其他 AI 模型率先完成一部分迁移改造任务，但是我非常担心害怕其他模型的做法不合适，有欠缺，理解不够透彻，导致重要的格式迁移任务，出现严重的理解偏差和缺漏。因此我需要你来完成复核，兜底，补强。确保这个任务工件迁移任务，你顺利的完成迁移改造。

---

我稍后会将任务委托给更强的 ChatGPT sol 模型来完成大规模的文本理解，迁移，改造，复核。但是有个缺点，就是云 ChatGPT web 是没有本地 memorix 的任何历史记忆的，因此我要求你将 memorix 相关的历史记忆和决策，都变成实体 markdown 文档。全部存储到 `openspec\changes\ai-rag-phase2\all-memorix` 目录内，作为可用 ChatGPT web 直接阅读的文本文件，请你主动使用 memorix 提供的能力完成这样的文本输出和导出。

---

请你继续完成上一轮云 ChatGPT web 没有完成的任务。
我要求你彻底的，全面的让 `openspec\changes\ai-rag-phase2` 这个 do-long-task 长任务工件，永久吸收 `docs\superpowers\specs\2026-07-29-ai-rag-phase2-design.md` 和 `docs\superpowers\plans\2026-07-29-ai-rag-phase2-plan.md` 文件，并彻底的，永久删除这两个文件。我要求你务必在 openspec 的 spec 或者是其他的文件完成对上述内容的吸收。以便彻底完成 superpower 任务工件迁移成基于 openspec 的 do-long-task 任务工件。

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

## 004 已完成 调研并落地 docx 文档生成的 x-emf 格式文件转换方案

> 状态：**全部完成并上线验证**（2026-08-23）。调研与实施方案详见 `openspec/changes/handle-x-emf-img/`（tasks.md 21/21 完成、evidence/ 六份验证证据），生产站点 drill.ruan-cat.com 的 EMF 图片已全部以 PNG 形态上线。历史过程记录保留如下，供追溯。

### 调研并生成任务工件

<!-- 有效文档： reports\2026-08-22-docx-x-emf-conversion-research.md -->

我们项目的处理脚本，曾经是没办法解决 x-emf 文件格式的。

1. 你先给我看看我们整个项目，是在哪里处理 x-emf 文件格式的。
2. 告诉我为什么曾经的纯 node typescript 方案内为什么不能实现该需求。
3. 然后我要求你做好充分的调研，告诉我要用那些合适点的方案实现这个任务。rust 行不行？纯 node 还行不行？

---

按照 `reports\2026-08-22-docx-x-emf-conversion-research.md` 报告，在 `openspec\changes\handle-x-emf-img` 目录内新建完整的，基于 openspec 的长任务执行工件。你的任务是新建一些列的 markdown 任务工件，而不是执行任务。

---

### 持续执行任务工件并完成任务

先用 memorix 获取 `handle-x-emf-img` 相关的记忆，然后开始持续执行 `openspec\changes\handle-x-emf-img` 任务。

---

你用这样的方式触发文档站点的部署与验证：

对于 small-alice-web-odse(docs 项目) 来说，你首先触发有意义的 git commit 即可。确保 main 主分支出现了有意义的 git commit，那么文档站点就会出现真实的 vercel 部署。随后，你就能用 vercel MCP 或者是 vercel cli 来获取部署情况了。
你稍后还可以用 agent-browser 来完成浏览器视觉验证和功能验证。
不要用 `pnpm run deploy-vercel` 命令来完成部署。
你要用全局技能 git-commit 来完成分门别类编写提交信息，完成有意义的部署。
你要及时的 rebase dev 的内容到 remote main 内，才能完成生产环境的部署。
你的开发始终在 dev 内，而不是直接在 main 内完成开发。
只在你需要完成生产环境部署并完成验证时，你才使用 git commit。
你的 git-commit 看清楚修改的内容，确保做好 .gitattributes 二进制文件的设置，和 .gitignore 垃圾文件的忽略。

---

1. 以注释的形式在关键地方增加说明：

```txt
执行中抓出的关键实测修正（已回写 design/findings）
napi Canvas 原型不可变：setPrototypeOf 静默失效 → 改用 Symbol.hasInstance（否则 instance 分派失败全部转换返 null）
napi drawImage 原生类型检查：Proxy 包装被拒且错误被 emf-converter 静默吞掉 → 改给 Image 实例直接挂 close 属性
emf-converter 截断容错：截断输入输出残片 PNG 不抛错，测试断言按实测调整
PNG IHDR 大端序：测试首轮 LE 误读假失败
```

既然你已经找到问题了，就用 jsdoc 注释的形式来补充这些东西。

2. 用 `.agents\skills\fix-bug\record-bug-fix-memory\SKILL.md` 项目级技能，增加经验教训。
3. 及时去看看本项目其他的 readme 文档，为本次重大变更做出及时的文档更新，我们成功实现了 emf 矢量图变成可阅读的 png 图片了！重大技术突破，应该要在 readme 文档内说明这个情况。过往的很多 markdown 肯定记录不准确，需要你做出更新的。
4. 用 memorix 做好记录。

## 005 <!-- 2026-8-20 已完成 作为交互优化级别的项目；codex正在做 --> 网站 title 标题的动态切换

我要求你实现 AI 应用标题的动态切换功能，我们完成一轮对话沟通后，标题应该立刻切换，并且去提示用户尽快处理。

1. 在浏览器层面，应该申请浏览器弹框的权限。如果用户提供权限，那么 AI 对话完成后，就应该弹出浏览器弹框，通知用户已经完成了对话。
   - 浏览器弹框的 icon 图标应该默认使用你这个 vitepress 站点默认提供的 favicon，未来我可能会改换别的通知弹框方式和 icon 图标。
2. 浏览器标题应该立刻切换，以便完成通知用户的效果。
   - 应该使用 vueuse 的工具函数，来实现你的浏览器标题切换功能。
   - 在你的 vitepress 应用中，你应该注意看清楚在哪里去实现这个功能，你可能是在 `packages\ai-vitepress-plugins\package.json` 子包内完成这个浏览器标题切换功能。注意你是在 vitepress 应用内完成这个功能。我给的建议可能不对，你做好调研和思考后再开始做。核心查询点是： 在 vitepress 应用内使用 vueuse 的 useTitle 函数完成应用的标题切换。

---

我们目前没有多轮并发对话的场景，我们只有一个单独的对话框。未来我可能会采用多个并行对话的形式，但是目前我在做 MVP，暂时不考虑多并发对话的情况。
所以我们目前不可能有超过 1 的数字计数。不会有错过对话漏回复的情况；

---

请注意，我现在没有完成 openspec\changes\ai-rag-phase2 要求的 embeddings 任务，这会不会影响你的自主浏览器测试？

---

/goal 完成 `docs\superpowers\specs\2026-08-20-ai-chat-completion-attention-design.md` 和 `docs\superpowers\plans\2026-08-20-ai-chat-completion-attention-plan.md` 的任务。

## 006 <!-- TODO: codex 正在做 --> 持续推进二期 AI 项目改造

<!-- 完成openspec改造后继续才 先用 do-long-task 设计一个合适的主驱动提示词。
 已完成openspec的任务工件改造
 -->

---

需要一个支持 /v1/embeddings 且返回 1536 维向量的渠道 ？

---

把你对免费 embeddings 模型的推荐，在 `D:\store\WorkBuddy\2026-6-30-common\docs\plan\2026-8-19-learn-embedding` 目录内编写报告文档，我稍后专门安排别的 AI，专门去学习了解这个知识点。我晚点专门学习 embeddings 这个概念和基础的模型。

### 先完成 embeddings 的事情

阅读 D:\store\WorkBuddy\2026-6-30-common\docs\plan\2026-8-19-learn-embedding\2026-08-19-free-embedding-models-for-rag.md 和 `openspec\changes\ai-rag-phase2` 必要的进度文档。以及 memorix 相关的历史记忆。

我打算使用 Cloudflare Workers AI 提供 `@cf/baai/bge-m3`，你帮我调研一下，能不能设置模型的向量维度啊，看看能不能满足我们项目的要求，你现在的 wrangler cli 能帮我完成这个云能力的接入和使用么？

---

放弃 1536 维设计，大胆的，全面的改动 二期的 embedding 契约；
做好 vercel nitro 项目接入，读取来自 cloudflare embedding 模型的接口设计；
你的这个更改预期是先更改好 `openspec\changes\ai-rag-phase2` 内全部必要的文档，和其他目录内的相关文档。
你先完成计划，调研，改动文档。稍后我会要你完成这个代码修改和数据库改动设计的任务。

---

你的卡点是这几个环境变量。

NITRO_CLOUDFLARE_ACCOUNT_ID
NITRO_CLOUDFLARE_API_TOKEN
NITRO_EMBEDDING_MODEL=@cf/baai/bge-m3

CLOUDFLARE_ACCOUNT_ID 和 CLOUDFLARE_API_TOKEN 怎么获取？你不是有办法直接完成环境变量的上传么？你不是有本地的 vercel cli 么？你直接上传环境变量到对应的 vercel 项目内不行么？就比如 `NITRO_EMBEDDING_MODEL=@cf/baai/bge-m3` ，这个你现在不能完成么？

---

对于 CLOUDFLARE_API_TOKEN 来说，你要的是 `Account-scoped tokens` 还是 `User-scoped API token` ？cloudflare 的 token 有两个种类的。

---

你现在确认 `NITRO_CLOUDFLARE_ACCOUNT_ID=3412269ab0def154c8806e38acd1b493` cloudflare 的用户 id，本质上不是敏感变量对不对？你能不能写到根目录的 `README.md` 内？不是有很多非敏感的变量都写到这里方便查阅和使用的么？

---

CLOUDFLARE_API_TOKEN 是 `Account-scoped tokens` ，我现在给你：

### 后继续

## 007 <!-- 已完成 高优先级 QoderWork 正在做 --> 完成独立 nitro 接口服务部署

我需要你使用全局技能 `use-vercel-deploy-in-monorepo` 来完成本项目子包的 packages\ai-rag-api\package.json ，即独立 nitro 接口的部署任务。

新的 vercel 项目名称 `smallalice-docs-ai-nitro-api` 。
注意搞清楚本项目的部署情况，不要胡乱删除掉根 vercel.json 配置。本项目的根内容就是文档库。是有意义的可部署对象，且已经有了对应的 vercel 项目。
将新的 vercel 项目名称，和本项目的 vercel 部署情况，都及时在根 README 内写清楚，避免出现失忆。
在 AI 记忆文档内写清楚必要的引用项，说明清楚 vercel 部署涉及到的项目和部署细节。

你首先先完成任务工件的定义，理清楚全部细节后，才开始完成部署和生产环境接口测试。

---

你的任务是单纯的完成 nitro 接口部署，因为上一个任务存在循环论证验证的情况，我必须要先准备好 nitro 接口，才能继续推进任务。你不要误解误会了。别扯到上一个任务的什么授权上面。本次任务核心点就是部署 nitro 接口

---

我要求你增加 NITRO_OPENAI_API_KEY 这个 vercel 云环境变量。
其中，baseUrl 你也要设计合适的环境变量，取值即： `https://api.code-tab.com`

---

改用官方 app 目录模式：`Root Directory = packages/ai-rag-api`，Install/Build/Output/本地 link 全套子包口径。你这边可以确保新的 vercel 项目能够得到 monorepo 的其他子包信息么？我不太认为这个做法合适，`Root Directory = packages/ai-rag-api` 的设置合适。是不是我们的根包 D:\code\ruan-cat\SmallAliceWeb\vercel.json 设计写死了，太严格了？
我们能不能这样处理，你直接去改动 vercel 项目 smallalice，去部署配置那里做更改，避免我们项目直接在根写死 vercel.json 文件，导致你无法完成 monorepo 级别的 vercel 子项目部署和产物移动的需求。我记得我们不写死根 vercel.json 文件也能让根项目完成 build 的。
这是破坏性变更，你做好更新，做好根 README.md 的说明，和其他必要文件的改写，因为我们删除了根 vercel.json 文件。

---

Neon ID: patient-cloud-43432277 的数据库 `neon-smallalice-ai-rag` ，现在我已经实现在 `smallalice-docs-ai-nitro-api` 和 `small-alice-web-odse` 这两个 vercel 云项目内的链接了，并且环境都是齐全的。Production, Preview, Development 这三个 vercel 环境都允许使用 `neon-smallalice-ai-rag` 数据库。

---

我没有在 - https://vercel.com/ruancat-projects/smallalice-docs-ai-nitro-api/settings/build-and-deployment 内看到有意义的，基于 `use-vercel-deploy-in-monorepo` 技能的配置路径写法。你是不是忽略了 vercel 云项目 `smallalice-docs-ai-nitro-api` 的云配置了？请你用 vercel MCP 和 vercel cli 来完成云项目的配置，不要丢三落四。

---

我要求你通过 git-commit 的方式来触发 nitro 接口的 vercel 生产环境部署，我已经做好配置了，dev origin push，就会触发生产环境部署，nitro 接口的生产环境就会更新。你不要再依赖直接推送工件的方式来完成部署了。用 git-commit 技能，对你的修改做分门别类的提交，用有意义的 git-commit 来触发 nitro 再 dev 的更新，并实现生产环境更新。

---

你确定你已经把 `docs\superpowers\specs\2026-08-07-nitro-api-vercel-deploy-design.md` 全部的任务都完成了？本次会话的全部任务和我给你的要求都做完了？你没有缺漏么？
安排子代理做出审核，我不太信任你的成果，做出检查和核验。

---

我们这次 vercel nitro 接口部署和其他相关的处理，本质上也客观的推动了 `2026-07-29-ai-rag-phase2` 系列任务进度。请你在最后恰当的更新 `docs\superpowers\specs\2026-07-29-ai-rag-phase2-design.md` 和 `docs\superpowers\plans\2026-07-29-ai-rag-phase2-plan.md` 文件。也在必要的 memorix 内记录记忆。

---

更新文档，我手动完成 `https://smallalice-docs-ai-nitro-api.ruan-cat.com/` 的生产环境设置了。对于 nitro 接口来说，`https://smallalice-docs-ai-nitro-api.vercel.app` 是 vercel 默认分配的生产环境地址，我不用这个，我用的是 `https://smallalice-docs-ai-nitro-api.ruan-cat.com/` 。

- 去改文档，改相关的 markdown 文档，包括 spec 和 plan，还有 README。
- 去 nitro 子包的 package.json 内，给 homepage 字段增加这个生产环境地址。
- 去找找其他地方，看看哪里还需要声明清楚这个生产环境地址。

---

对于本次会话，对复杂任务的上下文加载控制、提示词设计、skills 和 MCP 调度等，你有什么好的改进建议么？我希望你可以从中总结成合适的方案，便于我在下一次完成这样复杂的任务的时候，能够更好的控制这些东西：

- 帮助我从本次会话内吸取教训，我该如何优化提示词设计呢？
- 我该如何优化上下文加载控制呢？
- 我该如何设计合适的子代理呢？
- 设计的子代理怎么才能实现强模型和弱模型的高低搭配呢？
- 我该如何做好 skill 和 MCP 工具的调度呢？
- 我还应该做到那些东西才能更加节省 token 呢？

请你以教练、复盘者、局外人、观察者的角度，去审视，批判我在本次会话调度、任务控制、纠偏管理的表现，并按照本项目的报告规格要求，编写一个报告，帮助我更好的迭代，学会与 AI agent 协作开发的工作流。

---

请你认真思考一下，在本次任务中， use-vercel-deploy-in-monorepo 这款技能还能做到那些东西？还能怎样做才能做的更好？给我出示一份报告。

---

## 008 <!-- 已完成 WorkBuddy正在做 --> 处理 vercel 的 vitepress 文档云构建错误

- 失败日志： https://vercel.com/ruancat-projects/small-alice-web-odse/F1oDwcRXtacbsyKmbjW2NgNqb4ZA

关键错误：

```log
[@nolebase/vitepress-plugin-git-changelog] Command failed with exit code 128: git config --local core.quotepath false
```

排查方向：

1. 先看看是不是偶发问题，调阅足够多的 production vercel 生产环境构建成功案例，来完成检查自检。
2. scripts\build-doc-in-vercel\index.ts 脚本在 vercel 内事实上在 drill-docx 目录内，会产出一个 .git 文件夹，在 vercel 云构建流水线内，会多出一个 git 目录，这个可能会导致 vitepress 的 `@ruan-cat/vitepress-preset-config` 依赖的 `@nolebase/vitepress-plugin-git-changelog` 插件，产生 git 路径识别错误。
3. 结合 `@ruan-cat/vitepress-preset-config` 的文档，和 `@nolebase/vitepress-plugin-git-changelog` 包的文档，你看看怎么在 `docs\.vitepress\theme\index.ts` 和 `docs\.vitepress\config.mts` 内实现对 `@nolebase/vitepress-plugin-git-changelog` 的配置，确保不要出现这样的识别错误。看看有没有什么忽略配置可以来配置：
   - `@ruan-cat/vitepress-preset-config` https://vitepress-preset.ruancat6312.top/
   - `@nolebase/vitepress-plugin-git-changelog` https://nolebase-integrations.ayaka.io/pages/zh-CN/integrations/vitepress-plugin-git-changelog/

## 009 <!-- 已完成 Codex正在做 --> 检查频繁出现的 vercel pnpm 安装失败的错误

<!-- 本质上是缺少 直接修复是 ENABLE_EXPERIMENTAL_COREPACK=1。 环境变量 -->

- https://vercel.com/ruancat-projects/smallalice-docs-ai-nitro-api/6d69tZcmmESbt6GTX53LU3gL9cpi

我们项目的 vercel 流水线，对于 smallalice-docs-ai-nitro-api 这个 vercel 项目来说，总是出现 `ERR_PNPM_META_FETCH_FAIL` 的错误。是不是我们项目在流水线内多 git clone 了一个项目，导致 .npmrc 的内容出错了？请你帮我排查清楚。并修复。

---

```txt
我的最终建议是：在 @ruan-cat/utils 增加非破坏性的 dereference?: boolean 和 --dereference，发布补丁版本后改回：
{
"build:vercel": "... && move-vercel-output-to-root --dereference"
}
```

我同意你这个方案，我很喜欢这个做法。你现在去 reports\2026-8-10-move-vercel-output-to-root-dereference 目录内，按照 superpower ，写 spec 和 plan，你直接去看看 `D:\code\ruan-cat\monorepo\packages\utils` 的 `@ruan-cat/utils` 源码，根据源码给出一个清晰的升级方案。稍后我会安排独立的 AI 去完成你需要的升级要求。

---

我已经完成了 2026-8-10-move-vercel-output-to-root-dereference 的升级，`@ruan-cat/utils` 已经按照你期望的方式完成升级了。请你继续做出配置改动。
请你注意在整个项目内，升级 `@ruan-cat/*` 系列的包，我大批量的对这些包完成了升级。你直接升级到最新版。升级后，你在继续完成你的改写。

---

然后你 git push，去看看 vercel 云流水线是不是还有故障？按理说应该不存在故障了。

---

--dereference 在本地构建看似正确，但没有解决云端最终的函数拓扑。Vercel 的规范允许 .func 目录以符号链接形式复用函数，因此这里需要重新设计产物搬运策略。你继续探究一下，你看看是不是移动策略问题。
不过我真的很疑惑，是不是哪里出问题了？我觉得是 nitro 配置有问题。而不是我们的文件移动方案和这款脚本出问题了。
我觉得是 nitro 配置的问题，凭什么我们之前本来的方案，在其他项目好好的，其他项目也是 monorepo 架构啊，也是有独立的 nitro 接口啊，但是别人 vercel 构建和文件目录移动就是正常啊。也不涉及到什么符号链接的问题啊。
我非常怀疑是 packages\ai-rag-api\nitro.config.ts 的写法，本身就很离谱，很错误，才导致我们 nitro 移动有问题。
你看看：

- D:\code\ruan-cat\01s-11comm\apps\api\nitro.config.ts

我真的觉得是你的 `compatibilityDate: "2024-09-19",` 没做到，没做好，所以才这样。compatibilityDate 没做好，才导致你构建产物的文件格式是软链接格式。而不是直接就能复制粘贴的实体文件。

---

我们的 move-vercel-output-to-root 增加了新的 `--dereference` 用来解决特定问题，请你以升级加固全局技能 `use-vercel-deploy-in-monorepo` 为目的，在 `reports\2026-8-10-up-use-vercel-deploy-in-monorepo` 目录内，编写技能加固文档，便于我进一步升级这款技能，说明清楚 move-vercel-output-to-root 的参数以及适用情况。

## 010 <!-- TODO: ChatGPT web正在做 --> 检查并解决 github workflow 流水线出现的 nuxt 构建内存超限的错误

@Github @Skill Router MCP

1. PR 目标和信息表：
   - 你的 pr github 仓库地址为： https://github.com/SmallAliceWeb
   - 你的 pr 目标分支为： dev
   - 你的 pr 工作主分支为： 2026-8-16-fix-shadcn-docs-nuxt

阅读该故障：

- https://github.com/ruan-cat/SmallAliceWeb/actions/runs/31272689831/job/93141201150
- 以及最近的几个失败的 github workflow 流水线。
- 以及该项目相关的 vercel 云流水线的失败日志。

节选错误日志：nuxt content 项目，内存构建超限。

```log
<--- Last few GCs --->

[3386:0x1c39a000]   103782 ms: Scavenge 4015.6 (4058.5) -> 4009.4 (4101.3) MB, pooled: 0 MB, 9.54 / 0.00 ms  (average mu = 0.262, current mu = 0.197) allocation failure;
[3386:0x1c39a000]   105520 ms: Mark-Compact (reduce) 4028.9 (4101.3) -> 4002.6 (4034.0) MB, pooled: 0 MB, 43.77 / 0.00 ms  (+ 1495.7 ms in 293 steps since start of marking, biggest step 8.0 ms, walltime since start of marking 1739 ms) (average mu = 0.316,
FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory
----- Native stack trace -----

 1: 0x74eae8 node::OOMErrorHandler(char const*, v8::OOMDetails const&) [node]
 2: 0xc42680  [node]
 3: 0xc4276f  [node]
 4: 0xee5fc5  [node]
 5: 0xee5ff2  [node]
 6: 0xee62ea  [node]
 7: 0xef6fea  [node]
 8: 0xefb390  [node]
 9: 0x198d931  [node]
Aborted (core dumped)
```

我不明白为什么我们的 `@ruan-cat-drill-doc/ai-vue-doc` 子包的 nuxt 项目如此脆弱，在 github workflow 也能出现内存不足的情况。这到底是怎么回事？为什么在本地 window 和云端 github workflow linux 都出现相同的内存不够的情况呢？到底是为什么的？ shadcn-docs-nuxt 这个文档框架真的在 monorepo 架构下非常困难艰难么？
请帮我调研思考，帮我彻底的，长久的克服掉这个错误。

- https://github.com/ruan-cat/SmallAliceWeb/actions/workflows/ci.yaml

我们的 ci.yaml 内的构建结果，全都是错误。请你想点办法完成批量修复。定位故障原因并且去修复。

在 `reports\2026-8-16-fix-shadcn-docs-nuxt` 目录内编写你的探索和判断。

---

我要求你尝试去完成故障修理！尝试去用 github ci 去完成修复，确保这个问题不要再出现了，太折磨了。难道 Nuxt + Nitro + Nuxt Content + shadcn-docs-nuxt + workspace 真的很垃圾么？

---

我不喜欢你写 `node ./scripts/run-nuxt-with-memory.mjs` 的方式来完成修复，这种方式只能是临时记录信息，不能作为长期解决方案。这种做法很容易导致片面的修复。

---

我希望你适当的去看看 shadcn-docs-nuxt 的源码，找到该问题的核心故障。你去看看 nuxt 和 nuxt content 的官方文档，看看有什么方式来解决掉该故障？避免出现在复杂依赖场景下屡次出现内存不够的故障。

---

根因是 Element Plus 的 npm alias runtime dependency 没有进入 Nitro output。

---

我们项目肯定是出现了很多风险项，请你在这个过程中遇到的风险项，全部都记录到 `reports/2026-8-16-fix-shadcn-docs-nuxt/next-steps` 目录内，以 markdown 的形式记录好，便于我后续安排独立的 AI agent 或者是新的会话完成这些风险项的识别和封堵加固。

---

我们在 `packages/ai-vue-doc/nuxt.config.ts` 内大规模的删改掉这些依赖识别配置，请你补充专门的文档，说明清楚为什么你要选择删除这些配置，以及这些配置为什么不能有助于解决问题。在你处理这个配置时，你看看本项目还有哪些文档曾经说明清楚要这些罗列具体的排除依赖项的，由你来纠偏。并且说明清楚为什么在解决这种复杂依赖问题上，为什么不能按照旧的 ssr.noExternal 和 nitro.externals.inline 罗列依赖项的方式来解决问题？

---

`packages/ai-vue-doc/scripts/run-nuxt-with-memory.mjs` 的设计本质上是你设计的临时脚本吧。这本质上是一种错误收集和排查校验的经验教训，你记录好这种报错收集的经验技巧了么？
你在 `packages/ai-vue-doc/package.json` 内有适当的回退对 `run-nuxt-with-memory.mjs` 的使用么？
当我们回退该临时脚本使用后，我们项目在 github workflow 和 vercel ci 两个流水线内，都还能正常的完成 build 且不会报错是么？

## 009 <!-- TODO: --> emf 矢量图转换出现文本丢失的情况

我们的文档站点，现在终于实现的了 emf 矢量图的转换了。但是我们项目很多图片仍然是出现乱码。

![2026-08-23-11-43-24](https://gh-img-store.ruan-cat.com/img/2026-08-23-11-43-24.png)

我这边认定是 emf 转换成 png 图片的时候，字体文件或者是 UTF-8 中文字符的转换处理没做好。请你重点看看这方面的问题，并且完成处置。
你阅读这几个文件后，了解一下别人给的方案后，再继续处理故障：

- reports\2026-08-23-emf-text-loss-handoff.md
- reports\2026-08-23-emf-text-loss-research.md
- reports\2026-08-23-emf-text-loss-solution.md

### 自主部署与验证要求

对于 small-alice-web-odse(docs 项目) 来说，你首先触发有意义的 git commit 即可。确保 main 主分支出现了有意义的 git commit，那么文档站点就会出现真实的 vercel 部署。随后，你就能用 vercel MCP 或者是 vercel cli 来获取部署情况了。
你稍后用 agent-browser 来完成浏览器视觉验证和功能验证。
不要用 `pnpm run deploy-vercel` 命令来完成部署。
你要用全局技能 git-commit 来完成分门别类编写提交信息，完成有意义的部署。
你要及时的 rebase dev 的内容到 remote main 内，才能完成生产环境的部署。
你的开发始终在 dev 内，而不是直接在 main 内完成开发。
只在你需要完成生产环境部署并完成验证时，你才使用 git commit。
你的 git-commit 看清楚修改的内容，确保做好 .gitattributes 二进制文件的设置，和 .gitignore 垃圾文件的忽略。

### 本任务特点

本任务可能 debug 难度不大。
但是很容易让你误解上下文，加载过多不必要的上下文文件。
而且加载等待 vercel 部署时，也需要花费时间，可能会导致你误解误导。
对于生产环境的浏览器视觉测试，对你来说也是较大的 token 消耗挑战。

### 具体指令

你先完成 do-long-task 长任务的新建，预期在 `openspec\changes\2026-8-23-fix-emf` 内新建基于 openspec 的长任务工件。你先完成新建任务。而不是在 `fix-emf-text-loss` 内新建。

---

找到关于 `openspec\changes\2026-8-23-fix-emf` 长任务的 memorix 历史记忆。本会话完成接力任务。

---

执行 `openspec\changes\2026-8-23-fix-emf` 长任务。
