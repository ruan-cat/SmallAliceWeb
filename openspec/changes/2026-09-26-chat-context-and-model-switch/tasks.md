# 任务清单：chat-api 动态上下文与模型切换（CC-0 + MS-0 合并变更包）

> 实施顺序遵循 plan 15.9 / 16.9：本变更包 spec 修订先行合入（openspec validate 通过）→ CC-1 → CC-2 → CC-3 → CC-4 → CC-5 与 MS-1 → MS-2 → MS-3 → MS-4 → MS-5。FC-1（客户端 pageContext 采集）的开发可与 CC-1 并行，但合入以 CC-1 的 PageContext schema 定稿为硬前置。spec 纪律：spec 修订合入后才允许动 `contracts/chat.ts` 与 `llm-config.ts` 等后端代码。

## 1. 规格门禁（CC-0 + MS-0，本变更包自身）

- [x] 1.1 [验证] `openspec/changes/2026-09-26-chat-context-and-model-switch/` - proposal.md 与 delta spec（`specs/ai-rag/chat-api/spec.md`）已就位：Requirement 1 / Requirement 8 的 MODIFIED 版本、Requirement 10 / Requirement 11 的 ADDED 版本。
- [x] 1.2 [验证] `openspec validate 2026-09-26-chat-context-and-model-switch --strict` - 输出 `Change '2026-09-26-chat-context-and-model-switch' is valid`（exit 0），代码任务门禁已开。

## 2. CC 动态上下文（plan 15.3-15.7）

- [ ] 2.1 [CC-1] [新增] `packages/ai-rag-core/src/page-context.ts` - PageContext zod schema（`pagePath` 必填 min(1).max(512)、`title` 可选 max(256)）并导出推导类型；`ai-vitepress-plugins` 增加 `"@ruan-cat-drill-doc/ai-rag-core": "workspace:*"` 依赖，FC-1 采集类型改为引用该 schema。
  - 验收：`pnpm --filter @ruan-cat-drill-doc/ai-rag-core run typecheck` 与 `pnpm --filter @ruan-cat-drill-doc/ai-vitepress-plugins run typecheck` 通过。
- [ ] 2.2 [CC-2] [新增] `packages/ai-rag-api/server/context/types.ts` 与 `server/context/sources.ts` - ChatContext 容器、ServerFetchDefinition 类型预留（v1 不实现执行器）、`normalizeClientContext` / `assembleChatContext` 归一化装配：合法返回值，非法或缺失返回 undefined、永不抛错。
  - 验收：归一化三态（合法 / 非法 / 缺失）单测通过。
- [ ] 2.3 [CC-3] [新增] `packages/ai-rag-api/server/context/prompt-template.ts` - `buildSystemPrompt` 五段式函数式模板（角色设定 / 检索引导 / 引用格式 / 页面上下文条件注入段 / 参考资料与拒答策略），段落常量独立导出，页面上下文段附带防误引声明。
  - 验收：有 / 无 pageContext 两态渲染快照；对外行为与现实现逐字对齐（除新增注入段外），openspec 行为验收不变。
- [ ] 2.4 [CC-4] [修改] `packages/ai-rag-api/server/contracts/chat.ts` - `chatRequestSchema` 增加可选 `pageContext` 字段（引用 ai-rag-core schema）；硬编码 prompt 替换为 `assembleChatContext` + `buildSystemPrompt` 调用；来源帧、abort 传播、错误映射逻辑零改动。
  - 验收：现有 chat 用例全绿；新增「携带合法 pageContext 的集成用例」断言 system 含页面路径。
- [ ] 2.5 [CC-5] [验证] `packages/ai-rag-api/tests/` vitest 覆盖 - prompt-template 两态快照、sources 归一化三态、降级路径（非法 pageContext → 基础模板输出、无异常抛出）、入站校验回归（pageContext 非法值返回 400 与统一错误体，Requirement 3 行为不变）。出站来源数据帧构造不加运行时校验（数据库自有数据属可信边界，spec 11.6 第 2 条）。
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
