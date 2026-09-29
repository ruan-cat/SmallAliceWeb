# openspec 变更包归档：2026-09-26-chat-context-and-model-switch

> **⚠️ 2026-09-30 迁移说明（用户决策）**：本内容原为 openspec 任务工件 `openspec/changes/2026-09-26-chat-context-and-model-switch/`（创建于 4d31fc7），现按用户决策从 openspec 体系清退——learn-agents-ui 任务的进度记录**统一以本目录的 plan.md 与 spec.md 为唯一载体**。以下为原工件全文归档（proposal + tasks + delta spec，内容零删改）；其中 delta spec 的「MODIFIED/ADDED Requirements」文本为 chat-api / knowledge-sync spec 对应章节的修订蓝本，已完成合入主规格对应描述或标注搁置（见 plan 十五/十六/十八章与 19.6 总表）。

---

## 归档第一部分：原 proposal.md 全文

# 变更提案：chat-api 动态上下文与模型切换规格修订（CC-0 + MS-0）

## 1. Why

本变更是 learn-agents-ui 计划中两组代码任务的**规格前置**（spec 纪律：chat-api spec 修订先行合入，才允许动后端代码）：

1. **CC-0**：为 ContextConfig 动态上下文改造（CC-1..CC-5，plan 第十五章）修订 Requirement 1。现状缺口：Requirement 1 固定表述为「基于检索到的上下文（Top-5）组装 system prompt」，没有类型化上下文容器、页面上下文可选注入与降级语义；而客户端 pageContext 采集（FC-1，plan 14.2）已设计就绪，后端需要契约承接（spec 第十一章 11.2/11.3）。
2. **MS-0**：为模型切换功能（MS-1..MS-5，plan 第十六章）修订 Requirement 8。现状缺口：Requirement 8 固定「一个 activeProvider」，双协议能力对用户完全不可见——前端没有任何切换模型的入口，用户不能在提问前或对话进行中选择模型（spec 第十二章 12.1）。
3. **边界条款**：路线约束（单轮、无 MCP、web RAG）尚未在 spec 中固化为 MUST NOT 条款；主调研报告「SmallAliceWeb 当前缺乏对话历史压缩能力」的过时表述存在被后续 agent 误当待办实施的风险，需按 spec 11.7 拍板封印。

CC-0 与 MS-0 按计划（learn-agents-ui plan 任务表）合并为同一变更包。本变更包**只修订规格，不改任何代码**。

## 2. What Changes

### 2.1 Requirement 1（流式问答接口）修订要点

- 请求体扩为 `{message, conversationId?, pageContext?}`：`pageContext` 可选、MUST 进入 `chatRequestSchema` 校验，非法值返回 400 与统一错误体（Requirement 3 行为不变，spec 11.6 验证层纪律）。
- system prompt 组装语义由「基于检索到的上下文（Top-5）组装」扩为「由类型化上下文容器与函数式模板模块组装：检索 Top-5 作为参考资料，页面上下文作为可选注入段」（plan 15.2 措辞）。
- 固化降级语义（borrow 自 inkeep `requiredToFetch`）：任一上下文来源缺失、非法或装配失败时跳过该来源并回退基础模板，**问答永不因上下文问题而失败**（spec 11.2）。
- 固化注入规则：页面上下文以独立注入段渲染并附带防误引声明，MUST NOT 计入 `[来源N]` 来源编号体系（spec 11.2 拍板 Q4）。
- 固化组装纪律：system prompt 文本集中由模板模块维护，contracts 路由请求处理逻辑 MUST NOT 内联提示词文本（spec 11.4 验收标准第 3 条）。
- **行为验收保持不变**：来源数据帧、`[来源N]` 引用格式、「根据现有资料无法回答」拒答文案、流式契约零变化（spec 11.3）。

### 2.2 Requirement 8（双协议聊天模型注册表）修订要点

- 「固定一个 activeProvider」修订为「默认 activeProvider；请求 MAY 携带 `provider` 字段覆盖，覆盖值 MUST 属于注册表 provider key 白名单」（plan 16.2）。
- 白名单语义按拷问 V3 拍板校准，并**显式推翻 plan 16.2 原句「非法或缺失 MUST 回退 activeProvider」**：该句已被 spec 12.2 / plan 16.8 V3 拍板取代——**非法值返回 400**（错误输入显式报错，符合 Requirement 3 错误映射纪律），**字段缺失回退 activeProvider**，「回退」仅指字段缺失场景。
- 安全边界：MUST NOT 接受注册表白名单之外的自由 model 字符串，模型与 baseUrl 由服务端注册表唯一决定，杜绝模型名注入与成本失控（spec 12.2）。
- 装配分发：请求选择未配置凭据的 provider 时返回 500 与可识别的 `RAG provider not configured` 错误，MUST NOT 静默回退到其他 provider（plan 16.4 拍板，本条即计划要求的「记入 openspec 修订」项）。
- 响应回显：复用既有 `response-metadata` 事件回显实际使用的 provider 与 model，MUST NOT 新增第二套元数据通道（spec 12.2）。
- 切换仅影响单次请求，MUST NOT 绑定会话语义（spec 12.6 约束 3）。

### 2.3 新增 Requirement 10：模型列表下发接口（GET /v1/models）

- 返回 `{models: [{id, label, model}]}`，数据全部来自编译期注册表；注册表为每个 provider 补充 `label` 展示字段（plan 16.2「新增 Requirement」项）。
- 该端点不触碰 provider 运行时，MUST NOT 依赖 503 装配守卫（区别于 chat/search/sync 四路由）。
- 响应 MUST NOT 包含 `baseUrl` 与任何 API key 凭据（Requirement 8 红线延伸，spec 12.3）。
- 该端点是模型列表唯一事实源，前端 MUST NOT 硬编码第二份清单（spec 12.3/12.6）。

### 2.4 新增 Requirement 11：单轮上下文边界约束（MUST NOT 边界条款）

引用 spec 11.7 措辞，三项条款：

1. **禁多轮历史**：MUST NOT 引入多轮会话语义或维护跨请求的历史消息数组——上下文为单轮、无状态、全部可选。
2. **禁对话历史压缩**：MUST NOT 实现 LLM 摘要式对话历史压缩——该机制的压缩对象是多轮历史消息数组，在单轮架构下没有挂载对象；单轮请求上下文实测有界（system 模板 + Top-5 片段 + user message，约 1 万 tokens 量级，不足 1M 窗口的 1%）；单轮内若未来膨胀，正确工具是确定性裁剪（按 rerank 分数取 top-k、截断片段前 N 字符、上下文来源降级跳过），不是 LLM 摘要。压缩机制回归的触发条件：①重启多轮会话；②单轮引入全文注入场景且确定性裁剪不足。
3. **禁 MCP 接入**：MUST NOT 接入 MCP（Model Context Protocol）。

## 3. Capabilities

### Modified Capabilities

- `ai-rag/chat-api`：Requirement 1（流式问答接口）与 Requirement 8（双协议聊天模型注册表）修订；新增 Requirement 10（模型列表下发接口）与 Requirement 11（单轮上下文边界约束）。

### New Capabilities

无。

## 4. Impact

- **本变更包交付物**：delta spec（`specs/ai-rag/chat-api/spec.md`）与任务清单（`tasks.md`），不修改主规格、不改任何代码。
- **后续代码影响面**（CC-1..CC-5 / MS-1..MS-5 任务，见 tasks.md）：
  - `packages/ai-rag-core`：新增 PageContext zod schema（两端共用契约，spec 11.2 拍板 D3）。
  - `packages/ai-rag-api`：新增 `server/context/`（types/sources/prompt-template）；修改 `contracts/chat.ts`（pageContext + provider 字段、buildSystemPrompt 接线）；修改 `src/llm-config.ts`（label 字段）；新增 `server/routes/v1/models.get.ts`；修改 `server/runtime/rag-assembly.ts`（双 adapter 分发）。
  - `packages/ai-vitepress-plugins`：`useKnowledgeChat` 状态与请求注入。
  - `packages/ai-vue`：`AiChat` 分段选择器（条件渲染，向后兼容）。
- **契约兼容性**：`/v1/chat` 新增字段全部可选，向后兼容现有契约；`/v1/models` 为新增只读端点，不需要 503 装配守卫。
- **跨组依赖**：FC-1（客户端 pageContext 采集）的开发可与 CC-1 并行，但合入以 CC-1 的 PageContext schema 定稿为硬前置（plan 15.9）。
- **agent 纪律**：主调研报告「SmallAliceWeb 当前缺乏对话历史压缩能力」的表述已被 spec 11.7 封印，后续 agent MUST NOT 将其当作待办实施。

---

## 归档第二部分：原 tasks.md 全文

# 任务清单：chat-api 动态上下文与模型切换（CC-0 + MS-0 合并变更包）

> 实施顺序遵循 plan 15.9 / 16.9：本变更包 spec 修订先行合入（openspec validate 通过）→ CC-1 → CC-2 → CC-3 → CC-4 → CC-5 与 MS-1 → MS-2 → MS-3 → MS-4 → MS-5。FC-1（客户端 pageContext 采集）的开发可与 CC-1 并行，但合入以 CC-1 的 PageContext schema 定稿为硬前置。spec 纪律：spec 修订合入后才允许动 `contracts/chat.ts` 与 `llm-config.ts` 等后端代码。

## 1. 规格门禁（CC-0 + MS-0，本变更包自身）

- [x] 1.1 [验证] `openspec/changes/2026-09-26-chat-context-and-model-switch/` - proposal.md 与 delta spec（`specs/ai-rag/chat-api/spec.md`）已就位：Requirement 1 / Requirement 8 的 MODIFIED 版本、Requirement 10 / Requirement 11 的 ADDED 版本。
- [x] 1.2 [验证] `openspec validate 2026-09-26-chat-context-and-model-switch --strict` - 输出 `Change '2026-09-26-chat-context-and-model-switch' is valid`（exit 0），代码任务门禁已开。

## 2. CC 动态上下文（plan 15.3-15.7）

- [ ] 2.1 [CC-1] [新增] `packages/ai-rag-core/src/page-context.ts` - PageContext zod schema（`pagePath` 必填 min(1).max(512)、`title` 可选 max(256)）并导出推导类型；`ai-vitepress-plugins` 增加 `"@ruan-cat-drill-doc/ai-rag-core": "workspace:*"` 依赖，FC-1 采集类型改为引用该 schema。
  - 验收：`pnpm --filter @ruan-cat-drill-doc/ai-rag-core run typecheck` 与 `pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins run typecheck` 通过。
- [ ] 2.2 [CC-2] [新增] `packages/ai-rag-api/server/context/types.ts` 与 `server/context/sources.ts` - ChatContext 容器、ServerFetchDefinition 类型预留（v1 不实现执行器）、`normalizeClientContext` / `assembleChatContext` 归一化装配：合法返回值，非法或缺失返回 undefined、永不抛错（contracts 入站 schema 校验之下的纵深防御层，不与 400 分层冲突）。
  - 验收：归一化三态（合法 / 非法 / 缺失）单测通过。
- [ ] 2.3 [CC-3] [新增] `packages/ai-rag-api/server/context/prompt-template.ts` - `buildSystemPrompt` 五段式函数式模板（角色设定 / 检索引导 / 引用格式 / 页面上下文条件注入段 / 参考资料与拒答策略），段落常量独立导出，页面上下文段附带防误引声明。
  - 验收：有 / 无 pageContext 两态渲染快照；对外行为与现实现逐字对齐（除新增注入段外），openspec 行为验收不变。
- [ ] 2.4 [CC-4] [修改] `packages/ai-rag-api/server/contracts/chat.ts` - `chatRequestSchema` 增加可选 `pageContext` 字段（引用 ai-rag-core schema）；硬编码 prompt 替换为 `assembleChatContext` + `buildSystemPrompt` 调用；来源帧、abort 传播、错误映射逻辑零改动。
  - 验收：现有 chat 用例全绿；新增「携带合法 pageContext 的集成用例」断言 system 含页面路径。
- [ ] 2.5 [CC-5] [验证] `packages/ai-rag-api/tests/` vitest 覆盖 - prompt-template 两态快照、sources 归一化三态（合法 / 非法 / 缺失：归一化对非法输入返回 undefined、永不抛错）、降级路径（pageContext 字段缺失或归一化/装配失败 → 基础模板输出、无异常抛出）、入站校验回归（pageContext 结构非法即未通过请求 schema 校验 → 400 与统一错误体，Requirement 3 行为不变）。分层互斥：结构非法由 400 独占、不进入降级路径；降级仅覆盖字段缺失与归一化/装配失败（修正 plan 15.7 原文「非法 pageContext → 基础模板输出」与「非法值返回 400」的并排歧义）。出站来源数据帧构造不加运行时校验（数据库自有数据属可信边界，spec 11.6 第 2 条）。
  - 验收命令：`pnpm --filter @ruan-cat-drill-doc/ai-rag-api run test`。

## 3. MS 模型切换（plan 16.3-16.7）

- [ ] 3.1 [MS-1] [修改+新增] `packages/ai-rag-api/src/llm-config.ts` 与 `server/routes/v1/models.get.ts` - 注册表 providers 补充 `label` 展示字段（`Claude Sonnet 5` / `GPT-5.6 Luna`）与 `getRagLlmConfigById`；新增 `GET /v1/models` 静态下发端点（纯编译期注册表，无 503 装配守卫，响应不含 baseUrl 与凭据）。
  - 验收：本地启动后 curl 请求 `GET /v1/models`，断言响应含两个条目、不含 `baseUrl` / `apiKey` 字样。
- [ ] 3.2 [MS-2] [修改] `packages/ai-rag-api/server/contracts/chat.ts` 与 `server/runtime/rag-assembly.ts` - `chatRequestSchema` 增可选 `provider` 字段（enum 白名单，非法值 400、字段缺失回退 activeProvider）；双 adapter 构造并按 request.provider 分发；请求选择未配置 key 的 provider 返回 500 `RAG provider not configured`，不静默回退。
  - 验收：白名单内双 provider 各一例流式请求成功；缺失 provider 字段回退 activeProvider；非法 provider 返回 400。
- [ ] 3.3 [MS-3] [修改] `packages/ai-vitepress-plugins/src/client/composables/useKnowledgeChat.ts` - `models` / `selectedProvider` 状态；初始化拉取 `/v1/models`（失败静默，models 为空）；`experimental_prepareRequestBody` 注入 `provider` 字段；localStorage 持久化与脏值回退（不在列表则回退默认，仅存 UI 偏好、不携带会话语义）。
  - 验收：请求体携带 provider；存储脏值回退；models 拉取失败时聊天功能完全正常。
- [ ] 3.4 [MS-4] [修改] `packages/ai-vue/src/components/ai-chat/types.ts` 与 `AiChat.vue` - `AiChatModelOption` 类型与 props / emits 扩展；Sender 上方右对齐条件渲染 `el-segmented` 分段选择器（`models` prop 为空时整块不渲染，向后兼容）；responding 中不禁用选择器，切换仅改选中态、下一条消息生效，加 `title="切换后下一条消息生效"` 说明；样式走 `--ai-chat-*` 变量。
  - 验收：键盘 Tab + 方向键可切换（el-segmented 原生可访问性）；models 缺省渲染与现版本逐像素一致。
- [ ] 3.5 [MS-5] [验证] vitest 全链路覆盖 - ai-rag-api（`/v1/models` 契约：条目数、无 baseUrl / 凭据；chat 契约：provider 白名单 400、缺失回退、双 provider 分发 mock）、ai-vitepress-plugins（请求体注入 provider、localStorage 持久化与脏值回退、models 拉取失败不影响聊天）、ai-vue（选择器条件渲染、select-model 事件负载、responding 中可切换）。
  - 验收命令：`pnpm --filter @ruan-cat-drill-doc/ai-rag-api run test && pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins run test && pnpm --filter @ruan-cat-drill-doc/ai-vue run test`。

---

## 归档第三部分：原 delta spec 全文（能力修订蓝本）

## MODIFIED Requirements

### Requirement: 1. 流式问答接口

系统 MUST 提供 `POST /v1/chat` 接口，接收 `{message, conversationId?, pageContext?}` 请求体，其中 `message` 非空、`conversationId` 与 `pageContext` 可选；`pageContext` MUST 进入请求 schema 校验，结构非法（未通过请求 schema 校验）的值 MUST 返回 400 且不进入降级路径。系统 MUST 由类型化上下文容器与函数式模板模块组装 system prompt：检索到的上下文（Top-5）作为参考资料，页面上下文作为可选注入段；任一上下文来源缺失或归一化/装配失败时，系统 MUST 跳过该来源并回退基础模板，问答 MUST NOT 因上下文问题而失败。响应 MUST 为 AI SDK 标准流式 Response（含 data-stream content-type），MUST NOT 包装为 JSON，也 MUST NOT 在返回该 Response 后改写状态码；回答 MUST 为每个观点标注来源 `[来源N]`，资料不足时 MUST 说明「根据现有资料无法回答」。system prompt 文本 MUST 集中由模板模块维护，contracts 路由的请求处理逻辑 MUST NOT 内联提示词文本；提示词内容变更 SHALL 仅需修改模板模块。

#### Scenario: 有效请求返回流式响应

- **GIVEN** 客户端向 `POST /v1/chat` 提交非空 `message` 的请求
- **WHEN** 系统处理该请求
- **THEN** 系统 MUST 由类型化上下文与模板模块组装 system prompt，参考资料为检索 Top-5 结果
- **AND** 响应 SHALL 为 AI SDK 标准流式 Response，content-type 为 data-stream
- **AND** 系统 MUST NOT 将流式响应包装为 JSON，也 MUST NOT 在返回后改写状态码

#### Scenario: 无效输入返回 400

- **GIVEN** 请求体不满足校验规则（`message` 为空、缺失或类型非法，或 `pageContext` 结构非法、未通过请求 schema 校验）
- **WHEN** 系统校验该请求
- **THEN** 系统 MUST 返回 HTTP 400
- **AND** 错误响应体 SHALL 为统一错误体 `{success, code, message, data}`（Requirement 3 行为不变）

#### Scenario: 回答标注来源与资料不足说明

- **GIVEN** 检索返回参考资料片段
- **WHEN** 模型生成回答
- **THEN** 回答文本 MUST 以 `[来源N]` 标注对应来源
- **AND** 当检索上下文不足以回答问题时，回答 MUST 说明「根据现有资料无法回答」

#### Scenario: 页面上下文缺失或装配失败时降级

- **GIVEN** `pageContext` 字段缺失，或已通过请求 schema 校验但归一化/装配失败
- **WHEN** 客户端提交问答请求
- **THEN** 系统 MUST 跳过页面上下文来源并使用基础模板正常回答，无报错、无重试
- **AND** 问答 MUST NOT 因任何上下文来源问题而失败

#### Scenario: 页面上下文条件注入与防误引

- **GIVEN** 请求携带合法 `pageContext`
- **WHEN** 系统组装 system prompt
- **THEN** 页面上下文 MUST 以独立注入段渲染（含 `pagePath` 与可选 `title`），并 SHALL 附带防误引声明
- **AND** 页面上下文信息 MUST NOT 计入 `[来源N]` 来源编号体系
- **AND** 回答 SHALL 能结合页面上下文对「这个怎么配」类指代问题给出针对当前页面的回答

#### Scenario: 提示词组装集中于模板模块

- **GIVEN** 需要修改 system prompt 文本
- **WHEN** 实施提示词变更
- **THEN** 变更 SHALL 仅需修改模板模块
- **AND** contracts 路由的请求处理逻辑（schema 校验、检索调用、来源帧推送、abort 传播、错误映射）MUST 保持不变

### Requirement: 8. 双协议聊天模型注册表

聊天运行时 MUST 从 `packages/ai-rag-api` 内的类型化公开注册表读取 provider 的 `protocol`、`baseUrl` 与 `model`，并 MUST 维护一个 `activeProvider` 作为默认 provider；注册表 MUST 同时描述 OpenAI Responses 与 Anthropic Messages 两种协议，MUST NOT 从环境变量读取模型、base URL 或默认 provider 选择。当前默认激活 provider MUST 为 Anthropic，模型 MUST 为 `claude-sonnet-5[1m]`，地址 MUST 为 `https://api.code-tab.com/v1`。OpenAI provider MUST 保留 `gpt-5.6-luna` 与 Responses 协议作为可切换配置。

`/v1/chat` 请求体 MAY 携带可选 `provider` 字段进行请求级覆盖：覆盖值 MUST 属于注册表 provider key 白名单（当前 `anthropic` | `openai`），非法值 MUST 返回 HTTP 400，字段缺失 MUST 回退 `activeProvider`；系统 MUST NOT 接受注册表白名单之外的自由 model 字符串，模型与 baseUrl MUST 由服务端注册表唯一决定。回答 SHALL 复用既有 `response-metadata` 事件回显实际使用的 provider 与 model，MUST NOT 新增第二套元数据通道。切换仅影响单次请求，MUST NOT 绑定会话语义。

#### Scenario: 激活 Anthropic provider

- **GIVEN** 请求未携带 `provider` 字段
- **WHEN** 装配层选择聊天模型
- **THEN** 系统 MUST 回退注册表默认激活项 `activeProvider: "anthropic"`
- **AND** MUST 使用 `POST https://api.code-tab.com/v1/messages`
- **AND** 请求 MUST 包含 Anthropic Messages 所需的 `model`、`system`、`messages`、`stream: true` 与 `max_tokens`

#### Scenario: 请求级覆盖切换 provider

- **GIVEN** 请求携带属于注册表白名单的 `provider` 字段（如 `openai`）
- **WHEN** 装配层处理该次请求
- **THEN** 系统 MUST 使用注册表中该 provider 的配置（`gpt-5.6-luna` 与 Responses 协议 adapter）生成本次回答
- **AND** 本次回答 SHALL 通过 `response-metadata` 事件回显实际使用的 provider 与 model，MUST NOT 新增第二套元数据通道
- **AND** 切换仅影响本次请求，MUST NOT 绑定会话语义

#### Scenario: 非法 provider 返回 400

- **GIVEN** 请求携带的 `provider` 值不属于注册表 provider key 白名单
- **WHEN** 系统校验该请求
- **THEN** 系统 MUST 返回 HTTP 400 与统一错误体 `{success, code, message, data}`（Requirement 3 错误映射纪律）
- **AND** 系统 MUST NOT 将非法值静默回退为 `activeProvider`

#### Scenario: 白名单外的自由 model 字符串被拒绝

- **GIVEN** 请求试图携带注册表白名单之外的自由 model 字符串
- **WHEN** 系统校验该请求
- **THEN** 系统 MUST 返回 HTTP 400
- **AND** 请求 schema MUST NOT 提供接受自由 model 字符串的字段，模型与 baseUrl MUST 由服务端注册表唯一决定

#### Scenario: 选择未配置凭据的 provider 返回 500

- **GIVEN** 请求选择的 provider 其 API key 未配置，该 provider 未进入装配分发表
- **WHEN** 装配层分发本次请求
- **THEN** 系统 MUST 返回 HTTP 500 与可识别的 `RAG provider not configured` 错误
- **AND** 系统 MUST NOT 静默回退到其他 provider，也 MUST NOT 伪造成功

#### Scenario: 下游流格式保持稳定

- **GIVEN** OpenAI Responses 或 Anthropic Messages 任一 adapter 产生上游流
- **WHEN** 系统处理该上游流
- **THEN** 系统 MUST 将其规范化为现有 AI SDK Data Stream Response
- **AND** MUST 保留来源数据帧、客户端 abortSignal 与错误状态
- **AND** 路由和前端 MUST NOT 依赖某一上游 SSE 事件名称

#### Scenario: 仅校验激活 provider 密钥

- **GIVEN** runtime 检查聊天模型凭据
- **WHEN** 校验各 provider 的 API key
- **THEN** 激活 provider 对应的 `NITRO_ANTHROPIC_API_KEY` 缺失 MUST 阻止模型装配
- **AND** 未激活的 `NITRO_OPENAI_API_KEY` 缺失不得阻塞默认 provider 装配，该 provider 仅不进入装配分发表
- **AND** 两个 API key MUST NOT 出现在注册表、浏览器响应、日志、报告或测试快照

## ADDED Requirements

### Requirement: 10. 模型列表下发接口

系统 MUST 提供 `GET /v1/models` 接口，返回模型选择元数据 `{models: [{id, label, model}]}`；数据 MUST 全部来自编译期注册表，注册表 SHALL 为每个 provider 维护 `label` 展示字段（如 `Claude Sonnet 5` / `GPT-5.6 Luna`）；`models[].id` MUST 等于注册表 provider key，SHALL 可直接作为 `/v1/chat` 请求 `provider` 字段的覆盖值，MUST NOT 产生与注册表白名单不一致的标识。该端点不触碰 provider 运行时，MUST NOT 依赖 503 装配守卫，即使聊天运行时未装配也 SHALL 正常返回静态注册表数据；响应 MUST NOT 包含 `baseUrl` 与任何 API key 凭据。该端点 SHALL 作为模型列表的唯一事实源，前端 MUST NOT 硬编码第二份模型清单。

#### Scenario: 下发公开模型元数据

- **GIVEN** 编译期注册表包含全部 provider 配置
- **WHEN** 客户端请求 `GET /v1/models`
- **THEN** 系统 MUST 返回注册表全部 provider 的 `id`、`label` 与 `model`
- **AND** 每个条目的 `id` MUST 等于注册表 provider key，SHALL 可直接作为 `/v1/chat` 请求 `provider` 覆盖值
- **AND** 响应 MUST NOT 包含 `baseUrl` 与任何 API key 凭据

#### Scenario: 不受装配守卫约束

- **GIVEN** 聊天运行时未装配（`event.context.rag` 缺失）
- **WHEN** 客户端请求 `GET /v1/models`
- **THEN** 系统 SHALL 正常返回静态注册表数据
- **AND** 该端点 MUST NOT 返回 503 `RAG_NOT_CONFIGURED`

#### Scenario: 模型列表唯一事实源

- **GIVEN** 前端需要展示模型选择列表
- **WHEN** 前端获取模型列表
- **THEN** 前端 SHALL 从 `GET /v1/models` 端点获取
- **AND** 前端 MUST NOT 硬编码第二份模型清单

### Requirement: 11. 单轮上下文边界约束

动态上下文系统 MUST 保持单轮、无状态、全部可选：系统 MUST NOT 引入多轮会话语义或维护跨请求的历史消息数组（既有可选 `conversationId` 字段仅作请求关联标识，不构成多轮会话语义）；系统 MUST NOT 实现对话历史压缩机制（以 LLM 摘要替代早期轮次）——该机制的压缩对象是多轮历史消息数组，在单轮架构下没有挂载对象，且单轮请求上下文实测有界（system 模板 + Top-5 参考资料片段 + user message，约 1 万 tokens 量级，不足 1M 窗口的 1%）；单轮内上下文若膨胀，SHALL 采用确定性裁剪（按 rerank 分数取 top-k、截断片段前 N 字符、上下文来源降级跳过），MUST NOT 采用 LLM 摘要式压缩；系统 MUST NOT 接入 MCP（Model Context Protocol）。仅当重启多轮会话，或单轮引入全文注入场景且确定性裁剪不足时，才允许重新评估压缩机制。

#### Scenario: 上下文保持单轮无状态

- **GIVEN** 任意一次问答请求
- **WHEN** 系统组装请求上下文
- **THEN** 上下文 MUST 为单轮、无状态、全部可选
- **AND** 系统 MUST NOT 维护跨请求的多轮历史消息数组

#### Scenario: 禁止对话历史压缩

- **GIVEN** 上下文体积评估或上下文扩容场景
- **WHEN** 系统处理单轮上下文
- **THEN** 系统 MUST NOT 实现 LLM 摘要式对话历史压缩
- **AND** 单轮内上下文膨胀 SHALL 采用确定性裁剪（top-k、截断、来源降级跳过）

#### Scenario: 禁止 MCP 接入

- **GIVEN** 上下文来源或工具能力扩展场景
- **WHEN** 系统引入新的上下文来源
- **THEN** 系统 MUST NOT 接入 MCP（Model Context Protocol）
