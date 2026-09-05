# 2026-09-05 调研 agents-cookbook docs-assistant：对标分析与升级方案

> 报告类型：对标调研报告
> 对标对象：[inkeep/agents](https://github.com/inkeep/agents) `agents-cookbook/template-projects/docs-assistant`（commit `602e36b6`）
> 本项目：SmallAliceWeb `packages/ai-rag-api` + `packages/ai-vitepress-plugins` + `packages/ai-vue`
> 关联文档：[主调研报告](./README.md)、[learn-agents-ui spec](./learn-agents-ui/spec.md)、[learn-agents-ui plan](./learn-agents-ui/plan.md)

---

## 一、调研背景与方法

### 1.1 为什么对标 docs-assistant

SmallAliceWeb 的定位是**智能客服**（文档站 AI 问答是第一个落地场景）。inkeep/agents 的 `docs-assistant` 是官方 cookbook 里与本场景最接近的样板——同样是"文档知识库 + 问答"。它用极少的代码展示了"官方认为正确"的文档问答 Agent 形态，是我们校准方向的最佳参照物。同目录的 `customer-support` 模板则展示了从"文档问答"扩位到"完整客服"的路径，本报告一并纳入视野。

### 1.2 调研方法

遵循本仓库「外部依赖 API 结论必须产物实测」的纪律，本次对标**直接读取源码**，不采信二手转述：

| 读取对象 | 文件                                                                                                                    | 说明               |
| :------- | :---------------------------------------------------------------------------------------------------------------------- | :----------------- |
| 对方     | `template-projects/docs-assistant/index.ts`                                                                             | project 装配入口   |
| 对方     | `template-projects/docs-assistant/agents/docs-assistant.ts`                                                             | Agent 定义         |
| 对方     | `template-projects/docs-assistant/tools/inkeep-rag-mcp.ts`                                                              | RAG 工具定义       |
| 对方     | `agents-cookbook/evals/langfuse-dataset-example/`（目录）                                                               | 评估闭环样例       |
| 本项目   | `packages/ai-rag-api/server/contracts/chat.ts`                                                                          | 聊天管线核心       |
| 本项目   | `packages/ai-rag-api/server/contracts/schemas.ts`、`server/routes/v1/chat.post.ts`、`server/services/anthropic-chat.ts` | 请求契约与上游调用 |
| 本项目   | `openspec/specs/ai-rag/`（8 份 spec，重点 chat-api、rag-evaluation）                                                    | 当前能力基线       |
| 本项目   | `packages/ai-vitepress-plugins/src/client/composables/useKnowledgeChat.ts`                                              | 前端会话链路       |

---

## 二、docs-assistant 源码剖析

### 2.1 全部源码（仅 3 个业务文件）

**`index.ts` —— project 装配（模型基座声明在此）：**

```ts
import { project } from "@inkeep/agents-sdk";
import { docsAssistantAgent } from "./agents/docs-assistant";
import { inkeepRagMcpTool } from "./tools/inkeep-rag-mcp";

export const myProject = project({
	id: "docs-assistant",
	name: "Docs Assistant",
	description: "Docs assistant template",
	agents: () => [docsAssistantAgent],
	tools: () => [inkeepRagMcpTool],
	models: {
		base: { model: "openai/gpt-4o-mini" },
	},
});
```

**`agents/docs-assistant.ts` —— Agent 定义（prompt 仅两句话）：**

```ts
const docsAssistant = subAgent({
	id: "docs-assistant",
	name: "Docs Assistant",
	description: "A agent that can answer questions about Inkeep documentation",
	prompt: `You are a helpful assistant that answers questions about the documentation.
		Use the Inkeep RAG MCP tool to find relevant information.`,
	canUse: () => [inkeepRagMcpTool],
});

export const docsAssistantAgent = agent({
	id: "docs-assistant",
	name: "Docs Assistant",
	defaultSubAgent: docsAssistant,
	subAgents: () => [docsAssistant],
});
```

**`tools/inkeep-rag-mcp.ts` —— 工具定义（一行 serverUrl 接入托管 RAG）：**

```ts
export const inkeepRagMcpTool = mcpTool({
	id: "inkeep-rag-mcp",
	name: "Inkeep RAG MCP",
	serverUrl: "https://agents.inkeep.com/mcp",
});
```

### 2.2 它做对了什么：五条设计精髓

1. **检索是模型的工具，不是管线的固定步骤（Agentic RAG）。** 这是与我们的本质差异。它没有"先 retrieve Top-5 再拼 prompt"的固定管线，而是把 RAG 能力声明为模型可调用的工具。于是：查询改写（多轮指代消解"它怎么部署？"→"inkeep agents 怎么部署？"）、二次检索（第一次结果不好换个关键词再搜）、按需检索（闲聊不检索）、拒答判断（检索无果时模型自行说明）——全部交给模型在推理循环中自主完成。**固定管线的检索质量上限是"单次检索恰好命中"，工具化检索的上限是"模型持续追问直到命中"。**

2. **会话引擎平台化。** 多轮历史、上下文窗口管理、历史压缩摘要、事件流（delegation/tool_call/compression 等事件）全部由 agents-api 的 AgentSession 承担（主调研报告实测 2197 行）。业务侧只声明 agent，不写任何会话管理代码。

3. **声明式装配与一处式换模型。** `project({ models: { base: 'openai/gpt-4o-mini' } })` 一行声明基座模型，换模型改一行；加一个工具、加一个 subAgent 都是往数组里加声明。复杂的部分（工具协议、凭证注入、流式事件）被 SDK 封装。

4. **prompt 极简但职责清晰。** 只有两句话——因为检索的调用引导由工具的 name/description 承担，引用格式等由平台约定承担。提示词不堆砌，行为由架构保证，这比"prompt 里写一大段规则"更可靠。

5. **扩位路径现成 + 评估闭环样例。** 同目录 `customer-support` 模板展示了加一个 Coordinator subAgent + 专用工具（Zendesk）即变成完整客服；`evals/langfuse-dataset-example` 展示了把对话 trace 沉淀为 Langfuse dataset 做质量评估。从"文档问答"到"智能客服"的演进路线在 cookbook 内是连续的。

**需要同时看到的天花板**：docs-assistant 的 RAG 是黑盒托管服务（`agents.inkeep.com/mcp`），检索质量、chunk 策略、可解释性均不可控；运行时依赖平台（AgentSession），ELv2 许可证限制 SaaS 化。这些是我们"做得更好"的差异化空间。

---

## 三、我们的现状盘点（以代码与 spec 为准）

### 3.1 已有的强项（不妄自菲薄）

以下能力是 docs-assistant（含其托管 RAG 之外）没有或不具备细节的：

| 强项                                                                                       | 证据                                                                                               | 对方对应物                               |
| :----------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- | :--------------------------------------- |
| 混合检索（向量 + pg_trgm 全文）+ 重排序器（llm/noop 可切换）                               | `server/search/hybrid-search.ts`、`server/reranker/*`、openspec `hybrid-search`/`reranker` spec    | 黑盒托管，不可见                         |
| 检索参数化评估（gold-set 版本化、召回/排序/引用/生成分层指标、Promptfoo）                  | `server/evaluation/*`、`data/rag-gold-set.jsonl`、`promptfoo.yaml`、openspec `rag-evaluation` spec | `evals/` 仅有 langfuse 样例              |
| 双协议模型注册表（Anthropic `claude-sonnet-5[1m]` 激活 / OpenAI `gpt-5.6-luna` 备用）      | openspec `chat-api` Requirement 8                                                                  | `models.base` 一行（更简，但无备援语义） |
| 严谨的工程契约（503 未装配、400/409/500 错误映射、abortSignal 全链路传播、来源数据帧协议） | openspec `chat-api` Requirements 1-7                                                               | 样板项目未体现                           |
| 知识同步管线（本地 docs → chunk → bge-m3 向量入库，dry-run 与 sync-runs 可观测）           | `server/services/knowledge-sync.ts`、openspec `knowledge-sync` spec                                | 托管服务内不可见                         |
| 来源引用落地到 UI（`[来源N]` 标注 + 来源链接帧 + AiChat footer 渲染）                      | openspec `chat-api` Requirement 2、`ai-vue/AiChat.vue` `#footer`                                   | 组件库有 citation 组件，示例未串联       |

**结论：我们的"检索底盘"与"工程契约"是长板，差距集中在"会话与 agentic 行为"层。**

### 3.2 精确的缺失清单（逐条附证据）

1. **检索是固定管线，不是模型的工具。** `server/contracts/chat.ts:124` 固定执行 `retrieve(parsed.data.message, { limit: 5 })` —— 用用户原话单次检索。无查询改写、无二次检索、无"模型决定要不要搜"。`openspec/specs/ai-rag/chat-api/spec.md` Requirement 1 也将「Top-5」写死为规格行为。
2. **conversationId 收而不用的"假多轮"。** 前端已传（`useKnowledgeChat.ts:118` 将 conversationId 放入请求体），后端 schema 已收（`contracts/chat.ts:6`），但 `handleChatRequest` 从未消费该字段：无历史存储、无历史注入、无上下文压缩。上游模型请求只携带单条 user message + system。**用户体验上是"每轮都失忆"。**
3. **system prompt 硬编码在业务代码里。** `server/contracts/chat.ts:129` 内联拼接提示词与参考资料。改提示词要改代码、发版；无法按场景（不同页面/不同客群）差异化。
4. **无页面上下文注入。** 用户在浏览某篇文档时提问"这个怎么配"，模型不知道"这个"指什么。ContextConfig 模式（主调研报告识别为最值得借鉴的能力）在本仓库完全缺位——这也与 prompts 任务台账中 `learn-ContextConfig` 待办一致。
5. **评估覆盖单轮离线，缺多轮与会话回流。** 现有评估（gold-set 检索指标 + Promptfoo 生成评估）面向"单轮问答离线跑分"；缺多轮对话数据集、缺把真实线上对话 trace 回流为评估集的机制（inkeep 的 langfuse 样例演示的正是 trace → dataset 闭环）。
6. **前端无会话管理。** AiChat.vue 无会话列表/历史切换（spec 第九章已规划 `Conversations` 组件复用，属 ai-vue 层任务，此处不重复立项）。

---

## 四、差距矩阵

| 能力维度           | docs-assistant 做法              | 我们现状                             | 差距等级     | 备注            |
| :----------------- | :------------------------------- | :----------------------------------- | :----------- | :-------------- |
| 检索模式           | 模型工具化，可多轮自主调用       | 固定 Top-5 单次检索                  | **重大**     | 本报告升级 2    |
| 多轮对话           | AgentSession 全托管（历史+压缩） | conversationId 收而不用              | **重大**     | 本报告升级 1    |
| 查询改写           | 模型在工具调用中自主改写         | 用户原话直检                         | 重大         | 随升级 1/2 解决 |
| 拒答与兜底         | 模型按检索结果自主判断           | prompt 文本约定「资料不足时说明」    | 中等         | 随升级 2 增强   |
| system prompt 管理 | 声明在 agent 定义，随代码版本化  | 硬编码字符串                         | 中等         | 本报告升级 3    |
| 页面上下文注入     | ContextConfig 动态拉取           | 无                                   | 中等         | 本报告升级 3    |
| 评估闭环           | trace → dataset（Langfuse）      | 单轮离线评估（gold-set/Promptfoo）   | 中等         | 本报告升级 4    |
| 检索工程可控性     | 黑盒托管                         | hybrid + reranker + 参数评估，全自主 | **我们领先** | 长板            |
| 工程契约严谨度     | 样板未体现                       | 503/错误映射/abort/来源帧全 spec 化  | **我们领先** | 长板            |
| 换模型/加工具成本  | 改一行声明                       | 双协议注册表已具雏形                 | 低           | 保持            |
| 运行时依赖与许可   | 平台托管 + ELv2                  | 自有栈（Nitro+Neon），MIT 生态       | **我们领先** | 差异化空间      |

---

## 五、升级与补全方案

### 5.1 总策略

**不引入 inkeep 平台**（主调研报告已论证：技术栈不匹配、架构过重、ELv2 限制），而是**把 AgentSession 与 agentic 循环的好设计，在我们已有的 Nitro + Neon 自有栈上补齐**。我们的长板（可控检索、参数评估、工程契约）是底座，缺口（工具化检索、真多轮、上下文注入）按以下顺序补全，并与既有 roadmap（`learn-agents-ui/plan.md` 的 P0-P4、主报告 12 项增强、`learn-ContextConfig` 待办）衔接，不重复立项。

### 5.2 升级 1：激活 conversationId，做真·多轮对话（P0 级，一切的地基）

现状是"假多轮"，这是所有客服体验问题的根源，也最廉价可修：

- **数据层**：按主调研报告 7.3 的设计在 Neon 新增 `conversations` / `messages` 表（含 role、content、tokens、created_at），drizzle 迁移管理。
- **管线层**：`handleChatRequest` 消费 `conversationId` —— 读取最近 N 轮历史（建议 N=8 且按 token 预算截断），以 `messages` 数组注入上游（我们已是 Anthropic Messages 协议，天然支持多轮 messages）；超预算时用小模型摘要早期历史（借鉴 AgentSession 压缩设计，保留原始记录不删）。
- **前端层**：`useKnowledgeChat` 维持 conversationId 贯通即可（已具备），ai-vue 的会话管理 UI 按 learn-agents-ui plan 的 P3/P4 排期，不阻塞本升级。
- **验收**：同一 conversationId 下第二轮能理解"它"的指代（用 gold-set 加一条多轮用例固化）。

### 5.3 升级 2：把检索升级为模型的工具（P0/P1 级，客服能力的引擎）

模仿 docs-assistant 的核心动作——检索从"管线固定步骤"变为"模型可多次调用的工具"：

- **最小实现**：在 ai-rag-api 内用 Anthropic Messages 的 tool-use 协议定义 `search_knowledge_base(query: string, limit?: number)` 工具，内部直调现有 `hybrid-search` + `reranker`。允许模型在单次回答内调用 2-3 次。
- **为什么这是"更好"而不是"照抄"**：docs-assistant 的工具是托管黑盒；我们的工具背后是**可参数化、可评估、可解释的混合检索**——检索质量迭代不依赖任何平台，且已有 gold-set 指标可量化每次工具调用的命中质量。这是黑盒方案做不到的。
- **与主报告「增强 2：MCP 工具调用」的关系**：先用内部 function calling 把行为跑通（不引 MCP 协议栈），验证价值后再把工具层对齐 MCP 标准（工具定义与协议解耦，届时切换成本低）。**不建议第一步就上 MCP。**
- **护栏**：单请求工具调用次数上限、工具调用超时与 abort 贯通（复用现有 abortSignal 链）、工具调用事件写入来源数据帧协议（前端可展示"正在检索……"，呼应 StatusComponent 模式）。
- **验收**：构造"第一轮检索无果、改写关键词后命中"的评估用例；对比升级前后 gold-set 命中率与拒答准确率。

### 5.4 升级 3：system prompt 配置化 + 页面上下文注入（P1 级）

- **prompt 抽离**：将 `contracts/chat.ts:129` 的内联提示词抽为类型化 prompt 模块（先代码内模块，后续可挪库表），按「角色设定 / 检索引导 / 引用格式 / 拒答策略」分段管理，学习 docs-assistant "prompt 极简、职责由架构承担"的取向——引用格式由协议保证而非 prompt 祈求。
- **ContextConfig 最小版**：定义类型化的上下文注入点（当前文档路径/标题、站点版本），`useKnowledgeChat` 采集、后端校验（zod schema）后注入 prompt。这就是主调研报告 ContextConfig 结论的最小可落地版，与 prompts 台账 `learn-ContextConfig` 待办合并推进。
- **验收**：在文档页 A 提问"这个怎么配"，回答针对页面 A 内容；修改提示词不需要改 `contracts/chat.ts`。

### 5.5 升级 4：评估补多轮与会话回流（P2 级，质量闭环）

- 在现有 gold-set 体系上**新增多轮对话数据集**（含指代消解、连续追问、检索改写三类用例），评估维度补"上下文保持"与"工具调用效率"（平均检索次数、无效检索率）。
- 建立**真实会话回流**：将线上 conversationId 的对话（脱敏后）定期导出为候选评估集——即 langfuse 样例演示的 trace → dataset 模式的自有实现，存储在我们已有的 Neon 中，不引 Langfuse 亦可先跑通。

### 5.6 实施顺序与依赖

| 顺序 | 升级项                             | 依赖                                             | 关联既有任务             | 核心验收                |
| :--- | :--------------------------------- | :----------------------------------------------- | :----------------------- | :---------------------- |
| 1    | 升级 1：真·多轮对话                | 无（drizzle 迁移 + chat.ts 消费 conversationId） | 主报告增强 4             | 多轮指代消解用例通过    |
| 2    | 升级 2：检索工具化                 | 升级 1（多轮历史是改写的上下文）                 | 主报告增强 2 的最小版    | 检索改写用例 + 护栏生效 |
| 3    | 升级 3：prompt 配置化 + 上下文注入 | 无强依赖，建议在 1/2 后                          | learn-ContextConfig 待办 | 页面上下文用例通过      |
| 4    | 升级 4：评估闭环                   | 升级 1/2 产生真实数据                            | rag-evaluation spec 扩展 | 多轮数据集跑通          |
| 并行 | ai-vue 会话 UI / 富卡片            | learn-agents-ui plan P0-P4                       | 不变                     | 见该 plan               |

### 5.7 "做得更好"的差异化定位

模仿之后的超越点，全部建立在我们已有而对方没有的底盘上：

1. **检索自主可控**：对方是托管黑盒，我们是 hybrid + reranker + 参数评估的全透明管线——同样的 agentic 外壳，我们的"工具"可以持续被量化调优。
2. **评估分层闭环**：单轮检索指标（已有）+ 多轮对话评估 + 真实回流（升级 4）= 三层质量体系，对方样例只给了 trace 层。
3. **零平台依赖**：客服能力长在我们自己的 Nitro + Neon 上，无 ELv2 顾虑、无托管费、可离线部署。
4. **成本可调度**：双协议注册表 + 工具循环内的"轻模型改写、重模型作答"分工（Coordinator 用轻模型的思路，见主报告风险节）可以按渠道精细化控制成本。

---

## 六、风险与注意事项

1. **工具循环的延迟与成本放大**：每次工具调用都是一轮上游往返。护栏：调用次数上限（2-3 次）、检索接口内部超时、简单问题短路（首轮高置信命中即作答）。
2. **多轮上下文的 token 膨胀**：历史 + 检索片段同时注入。护栏：历史按 token 预算截断 + 摘要压缩；检索片段沿用「前 200 字符」来源帧截取策略并在 prompt 层控制条数。
3. **拒答边界**：工具化后模型可能"过度自信地不检索"或"检索无果仍作答"。护栏：拒答策略写进分段 prompt + 评估集固化拒答用例。
4. **与现有 spec 的同步**：`chat-api` spec 的 Requirement 1 将 Top-5 固定检索写成了规格行为，升级 2 落地时**必须以 openspec change 修订该 spec**，避免实现与规格漂移（本仓库纪律：spec 是唯一事实源）。
5. **不要重复立项**：本报告升级 1/2/3 分别覆盖主报告增强 4/2/3 的最小可落地版；ai-vue 侧能力一律归 learn-agents-ui plan 的 P0-P4，后端不越界做前端的事。

---

## 七、结论

docs-assistant 用 30 行业务代码示范了文档问答 Agent 的正确骨架：**检索即工具、会话平台管、装配靠声明、prompt 极简、评估有闭环**。我们的差距不在检索底盘（这是长板），而在"会话与 agentic 行为"层——conversationId 收而不用、检索固定单次、prompt 硬编码、上下文不注入。

补全顺序：**先激活真·多轮（升级 1），再把检索交给模型调用（升级 2），然后 prompt 配置化与上下文注入（升级 3），最后评估闭环（升级 4）**。全程不引入 inkeep 平台，把它的好设计长在我们自己的 Nitro + Neon 栈上；前端侧完全复用 learn-agents-ui 既有的 P0-P4 路线，后端与前端并行推进。落地时按本仓库纪律，以 openspec change 承载 spec 修订后再动代码。
