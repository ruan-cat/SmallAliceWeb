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
