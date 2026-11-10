# 2026-11-10 deepseek-harness 与 ZCode 模型配置 UI 源码调研

> - **Agent 工具**：ZCode（主代理 + 2 个串行 Explore 探索子代理 + 1 个复核子代理，蜂群架构）
> - **AI 模型**：GLM-5.3-Flash（`account:bigmodel-start-plan/GLM-5.3-Flash`）
> - **调研日期**：2026-11-10

## 背景与调研目标

SmallAliceWeb 准备新增一个功能：基于 Neon Postgres 数据库，实现一个**动态添加大模型配置的 UI 界面**，新增的模型配置信息存储到 Neon 内。

为了照抄/模仿成熟 agent harness 的实现，本次调研克隆并深读了两个仓库的源码：

| 仓库                                                                            | 克隆位置                                      | 规模       |
| ------------------------------------------------------------------------------- | --------------------------------------------- | ---------- |
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | `D:\code\store\deepseek-harness__deepseek-ai` | 20665 文件 |
| [zai-org/ZCode](https://github.com/zai-org/ZCode)                               | `D:\code\store\ZCode__zai-org`                | 17237 文件 |

核心调研问题：

1. 模型配置的**数据模型**（一个"模型配置"有哪些字段、类型定义在哪）。
2. 添加/编辑模型配置的 **UI 组件实现**（表单、校验、测试连接）。
3. **持久化机制**（配置存哪、apiKey 怎么存）。
4. **运行时切换链路**（从 UI 点击到请求层生效）。

## 调研方法

两仓库均为 pnpm monorepo，克隆命令（`--depth=1 --no-single-branch` 浅克隆全分支）：

```bash
git clone --depth=1 --no-single-branch https://github.com/deepseek-ai/deepseek-harness deepseek-harness__deepseek-ai
git clone --depth=1 --no-single-branch https://github.com/zai-org/ZCode ZCode__zai-org
```

克隆日志（节选）：

```log
Cloning into 'D:/code/store/deepseek-harness__deepseek-ai'...
Updating files: 100% (20665/20665), done.
Cloning into 'D:/code/store/ZCode__zai-org'...
Updating files: 100% (17237/17237), done.
```

探索方式：主代理派发只读 Explore 子代理，按「架构 → 数据模型 → UI 组件 → 持久化 → 切换链路」五问深挖，全部结论要求带 `file:line` 证据。下文相对路径均以各自仓库根为基准。

## 一、deepseek-harness 的实现

### 1.1 架构与技术栈

| 层        | 技术                                                                                                                 | 证据                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| CLI 入口  | `apps/cli`（`@deepseek-ai/dsh`），启动 web 服务                                                                      | `apps/cli/package.json:2-3`                                                                         |
| Web 前端  | `apps/web` = vite 构建 `@deepseek-ai/dsh-client-web`                                                                 | `apps/web/package.json:2-3,43`                                                                      |
| UI 框架   | React 18 + **自研组件库** `dsh-client-ui-primitives`（Button/Modal/SegmentedControl/Toast 等），无 antd/radix/shadcn | `packages/client/ui-settings-models/src/client/ModelListEditor.tsx:24`                              |
| 样式      | CSS Modules                                                                                                          | `ModelsSection.module.css`                                                                          |
| 状态管理  | 自研 snapshot store（`createSnapshotStore` + 订阅侧 `useSyncExternalStore`）                                         | `ui-settings-models/src/client/store.ts:15,187`；`ui-model-selection/src/client/ModelSelect.tsx:68` |
| Schema 库 | `@deepseek-ai/schemastery`（zod 风格，声明即表单 schema）                                                            | `packages/llm/llm-deepseek-api-key/src/config.ts:3`                                                 |
| 后端      | Cordis 插件化 host；配置读写统一走 `settings-controller`                                                             | `packages/api/settings-controller/src/index.ts:221`                                                 |

模型配置 UI 分布在两个包：

- **设置页（添加/编辑）**：`packages/client/ui-settings-models`
- **会话内切换器**：`packages/client/ui-model-selection`

设置页按命名空间分两种"适配器家族"：`llm-deepseek`（官方 API）与 `llm-pi-ai`（任意 OpenAI/Anthropic 兼容网关），组件按家族切换布局（`ProviderEditor.tsx:154-158` 的 `layoutOf`）。

### 1.2 模型配置数据模型：Provider(route) → models[] 两层结构

**自定义 Provider**（`llm-pi-ai`，任意网关）定义在 `packages/llm/llm-pi-ai/src/config.ts:105-208`（`PiAiProviderProfile`）：

| 字段                                        | 说明                                                | 行号                 |
| ------------------------------------------- | --------------------------------------------------- | -------------------- |
| `apiKeyEnv`                                 | 凭据**引用名**（环境变量名），真实 key 不入配置     | config.ts:107        |
| `displayName`                               | 选择器显示名                                        | config.ts:109        |
| `api`                                       | 线协议（openai-compatible / anthropic-messages 等） | config.ts:115        |
| `baseURL`                                   | 端点                                                | config.ts:117        |
| `models`                                    | `PiAiModelProfile[]`，替换内置清单                  | config.ts:123        |
| `modelOverrides`                            | 按 id 覆盖内置模型                                  | config.ts:132        |
| `defaultContextWindow` / `defaultMaxTokens` | 兜底 1M / 128K                                      | config.ts:146 / :152 |
| `headers` / `retryPolicy` 等                | 路由级杂项                                          | config.ts:165 起     |

**单个模型条目**（`packages/llm/llm-pi-ai/src/catalog.ts:604-615`）：

```ts
export interface PiAiModelProfile {
	id: string; // 发给 provider 的模型 id
	name?: string; // 选择器显示名
	contextWindow?: number; // 最大上下文
	maxTokens?: number; // 最大输出 token
	input?: PiAiModality[]; // ['text'] / ['text','image']
	reasoningEfforts?: false | PiAiReasoningEfforts; // Thinking 开关：false=禁用
	compat?: PiAiCompatProfile; // 线兼容开关（maxTokensField 等）
}
```

注意：**温度不在模型配置里**——`temperature` 属于请求级 `LlmCallControls`（`packages/llm/llm/src/call-config.ts:15-20`），是会话请求头状态而非模型配置。

**内置模型清单**：`packages/llm/llm-deepseek/src/models.ts:9-27`（`DEFAULT_MODELS`），官方部署还会跟随 `/models` listing 动态合并（`packages/llm/llm-deepseek/src/listed-catalog.ts:30-46`）。

### 1.3 添加/编辑模型配置的 UI 组件

组件目录 `packages/client/ui-settings-models/src/client/`：

| 文件                                        | 职责                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `ModelsSection.tsx`（757 行）               | 设置页区块；Add 卡片两模式 `AddMode='catalog'\|'custom'`（:60）           |
| `CustomProviderCard.tsx`（325 行）          | **新建自定义 provider 表单**（route/displayName/baseURL/协议/key/models） |
| `ProviderEditor.tsx`（583 行）              | 编辑已有 provider 卡片（key + 折叠「自定义设置」区）                      |
| `ModelListEditor.tsx`（454 行）             | 模型行列表 + **拉取远端模型列表**（probe）                                |
| `ModelRow.tsx` / `DeepSeekModelsEditor.tsx` | 单模型行（id/name/上下文/最大输出）编辑                                   |
| `ModelReasoningEfforts.tsx`                 | 每模型 Thinking 档位编辑                                                  |
| `ApiKeyInput.tsx` / `apiKey.ts`             | key 输入与前端校验                                                        |
| `operations.ts`（99 行）                    | 4 个 Host 操作回调：storeCredential / writeSettings / discoverModels      |
| `store.ts`（417 行）                        | 页面快照 store、`deriveKeyRef`、`protocolChoices`                         |

**关键实现 1 — 新建 provider 的 profile 组装与乐观锁写入**（`CustomProviderCard.tsx:160-190`）：

```ts
const createOnce = async (): Promise<string | undefined> => {
  const keyRef = deriveKeyRef(route)          // route → ROUTE_API_KEY
  const profile = {
    ...displayName.length === 0 ? {} : { displayName },
    ...storesKey ? { apiKeyEnv: keyRef } : {}, // 只有真存了 key 才写引用
    api: protocol, baseURL: normalizedBaseURL,
    models: models.map(model => ({ ...model })),
  }
  const written = await operations.writeSettings(NS,
    [{ op: 'set', path: ['providers', route], value: profile as JsonValue }],
    openedAt)                                   // openedAt = 打开时的 revision → 乐观锁
```

- route id 校验：`ROUTE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`（`CustomProviderCard.tsx:55`，须可作 POSIX 凭据名词干）。
- baseURL 校验：`isHttpUrl`（:57-64）。

**关键实现 2 — Test Connection = `discoverModels`（GET /models 探测）**。前端把"表单当前显示的端点 + **未保存的 key**"发给 Host 探测（`ModelListEditor.tsx:216-231`）：

```ts
const answer = await operations.discoverModels(probe.settingsNs, {
	...(probe.baseURL === undefined ? {} : { baseURL: probe.baseURL }),
	...(probe.api === undefined ? {} : { api: probe.api }),
	...(probe.apiKey === undefined ? {} : { apiKey: probe.apiKey }),
});
```

服务端实现 `packages/llm/llm-pi-ai/src/discovery.ts`：OpenAI 兼容走 `GET {baseURL}/models`（Bearer），Anthropic 走 `{root}/v1/models`（`x-api-key` + `anthropic-version`，:111-121）；兼容 `data[]` 与 `models{}` 两种返回（:182-201）；探测失败不阻塞，提示"手动填模型"（:192-194）。

**关键实现 3 — API key 前端校验**（`apiKey.ts:12`）：只允许可打印 ASCII `^[\x21-\x7E]+$`，拒绝整行 `NAME=value` 粘贴与引号包裹；空 = 沿用已存 key。key 引用派生 `deriveKeyRef`（`store.ts:125-127`）：`route.toUpperCase().replace(/[^A-Z0-9]+/g,'_') + '_API_KEY'`。

**关键实现 4 — 编辑走最小 path ops**（`ProviderEditor.tsx:134-151`）而非整节替换，防误删；带 revision 乐观锁（:302-303），冲突时提示"另一处已修改"。

### 1.4 持久化机制

| 数据             | 存储位置                                                                        | 证据                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Provider profile | Cordis profile patch 文件（`cordis.patch.yml`），原子写 + 文件锁，`mode: 0o600` | `packages/boot/config-editor/src/index.ts:38-40,141`；`packages/api/settings-controller/src/index.ts:152-157,187-202` |
| API key 明文     | **配置与密钥分离**：`$DSH_HOME/.credentials.yaml`                               | `packages/credentials/credentials-local/src/index.ts:1-27`                                                            |
| 默认模型选择     | 同样经 configEditor 写 profile patch                                            | `packages/core/agent-default-model/src/index.ts:52-53,82-96`                                                          |
| 客户端缓存       | 内存快照 store + Host 推送失效事件                                              | `store.ts:15,187`；`ui-model-selection/src/client/service.ts:54-58`                                                   |

核心设计：**配置只存 `apiKeyEnv` 引用名，明文 key 永不落配置文件**。

### 1.5 运行时模型切换链路

1. UI：`ModelSelect.tsx` 两级下拉（模型/思考档位），provider 分组、>4 个模型出搜索框 → `directory.select({provider, model, reasoningEffort})`（`ui-model-selection/src/client/directory.ts:92-99`）。
2. 校验：`await ctx.llm.resolveCallConfig(selected)` 确认 route 可解析；失败抛 `session/model-unavailable`（`packages/api/session-controller/src/commands.ts:173-196`）。
3. 落会话：`agent.model.select(selected)`（`packages/core/agent/src/model-selection.ts:112`）；跨模型切换时注入"from → to"系统通知（model-selection.ts:157-176）。
4. 后台持久化默认选择：`saveSelection` 异步保存，失败仅告警不阻塞（commands.ts:182-185）。
5. 请求层：`LlmCallConfig { provider, model, reasoningEffort?, temperature?, maxTokens?, stop? }`（`packages/llm/llm/src/call-config.ts:25-30`）。

## 二、ZCode 的实现

### 2.1 架构与技术栈

| 层             | 技术                                                                                                                       | 证据                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 共享 UI 组件库 | `@zcode/ui`（packages/ui），**React 19 + Radix UI + Tailwind + zustand**                                                   | `packages/ui/package.json`                                          |
| 桌面端         | `@zcode/desktop` Electron，UI 复用 packages/ui                                                                             | `packages/desktop/package.json`                                     |
| Web 端         | `@zcode/web` 仅远程控制/分享/登录页，**无模型配置 UI**                                                                     | `packages/web/src` 目录结构                                         |
| CLI TUI        | `@zcode/tui`，React + `@mbears/opentui-react`（终端 React 渲染）                                                           | `apps/zcode-cli/packages/tui/package.json:23-24`                    |
| 领域层         | `@zcode/provider`（配置 Overlay/Registry/ConfigService）、`@zcode/model-option-map`（reasoningLevel/maxTokens DSL 编译器） | `packages/provider/src/config-service.ts`                           |
| 持久化         | `@zcode/provider-node`（文件仓储）+ `@zcode/services`（RPC facade）                                                        | `packages/provider-node/src/personal-provider-config-repository.ts` |
| 数据合同       | zod schema 在 `@zcode/shared`                                                                                              | `packages/shared/src/model-config.ts`                               |
| 请求层         | Vercel AI SDK（`@ai-sdk/openai-compatible`、`@ai-sdk/anthropic`）                                                          | 根 package.json patchedDependencies                                 |

**关键定位**：模型添加/选择 UI 全部在 `packages/ui/src/settings/model-provider-section/`（56 个文件）与 `packages/ui/src/chat-input-toolbar/`。

### 2.2 模型配置数据模型

**Provider 级**（`packages/provider/src/config/provider-data-schema.ts`）：

```ts
// provider-data-schema.ts:4-8, 32-41, 85-96
providerApiTypeDataSchema = z.enum(["anthropic-messages", "openai-chat-completions", "openai-responses"]);
apiKeyAccessDataSchema = z.object({
	type: z.enum(["api-key", "zhipu-coding-plan-api-key"]),
	apiKey: z.string().nullable().optional(), // 明文字符串
	apiKeyManagementUrl: z.string().url().optional(),
});
completeProviderApiDataSchema = z.object({
	// 端点配置
	type: providerApiTypeDataSchema,
	baseUrl: nonBlankRequiredString.pipe(z.string().url()),
	headers: z.record(z.string(), z.string()).optional(),
});
providerConfigDataSchema = z.object({
	// :85-96
	group: z.enum(["standard-personal", "zai-family", "bigmodel-family"]),
	logo,
	access,
	api,
	builtinModelIds: modelIds,
	personalModelIds: modelIds,
	modelOrder: modelIds,
	visibility: z.enum(["visible", "hidden"]),
});
```

**Model 级**（`packages/shared/src/model-config.ts:102-115`）：`enabled`、`properties`（contextWindow、输入/输出模态、supportsToolCall 等）、`optionSpecs`（reasoningLevel 档位 + maxOutputTokens，值到线格式的映射用 DSL 表达式，由 `@zcode/model-option-map` 编译）。

- 用户可编辑字段是子集 `ManualModelConfig`（`packages/provider/src/config/manual-model-config.ts:6-27`）：仅 enabled、contextWindow、模态 4 项、reasoningLevel、maxOutputTokens.max。
- 会话选择结构 `ModelSelection = {providerId, modelId, options:{reasoningLevel}}`（`packages/provider/src/registry.ts:3-7`）。
- **内置清单**：`config/provider/zcode-builtin.json` —— 用正则 `modelMatch`（如 `".*glm-5.*"`）批量规则定义模型能力 + 精确覆盖，34 个模板 + 10 个 provider。

### 2.3 添加自定义模型 / provider 的 UI 组件

均在 `packages/ui/src/settings/model-provider-section/`：

| 功能                                                 | 组件                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------- |
| 添加入口：模板网格 + 「创建自定义供应商」Plus 卡片   | `ProviderTemplatePicker.tsx:21-134`（other 分组渲染 Plus 卡，:96-107） |
| 自定义 provider 表单（名称/baseUrl/apiKey 内联编辑） | `InlineEditableProviderCard.tsx`（860 行）                             |
| API 格式选择                                         | `ProviderApiFormatSelect.tsx:14-26`                                    |
| 自定义模型元数据对话框                               | `ProviderModelMetadataDialog.tsx` + `ProviderFormControls.tsx`         |
| reasoning 档位编辑                                   | `ProviderModelReasoningLevelEditor.tsx`                                |
| 测试连接按钮                                         | `ProviderFormControls.tsx:137-235`                                     |
| 编排层                                               | `settings/ModelProviderSection.tsx`（1213 行）                         |

**关键实现 1 — 测试连接 = 复用正式请求链**（`ProviderFormControls.tsx:137-155` + `useModelProviders.ts:183-224`）：先 `commitPendingDraft("connectivity-test")` 落盘草稿，再调 `providerSettingsService.testModelConnectivity({workspacePath, providerId, modelId})`；服务端注释明确「Provider 鉴权、headers、reasoning 映射和流消费全部由正式 Model 执行链负责」（`services/src/model-provider/providerSettingsConnectivity.ts:15`）。结果以 success/failure 横幅反馈。

**关键实现 2 — 创建自定义 provider**（`packages/provider/src/config-service.ts:223-274`）：校验 templateId、自动生成不冲突的 `providerId` 与 label，初始 `group:"standard-personal"`、空 `personalModelIds`，追加到 providerOrder；保存走 `savePersonalProviderOverlay`（:144-221），带 membership CAS 与重名校验。

**关键实现 3 — sparse/complete 双 schema**：`provider-data-schema.ts:39-41, 79-82` ——「编辑中可暂存」的 sparse schema 与「保存时严格」的 complete schema 两份；前端草稿态用 sparse 校验，落盘用 complete 校验。

**关键实现 4 — 乐观 UI + 草稿事务**（`InlineEditableProviderCard.tsx:442-468`）：idle 自动保存 + blur 提交 + 切换前兜底保存；apiKey 掩码回显（`getProviderFormApiKey` + `apiKeyVisible` 切换，:194-195）。

### 2.4 持久化机制

- **路径**：`~/.zcode/v2/provider_config.json`（`services/src/node.ts:1588`；`provider-node/src/runtime-paths.ts:5`）。
- **文件信封**（`provider-config-file-codec.ts:112-124`）：`{schemaVersion:1, config:{providerOrder, providerConfigRules, modelConfigRules, defaultModelSelection}}`，含版本迁移器框架（:14-70）。
- **读写实现**（`personal-provider-config-repository.ts`）：`update()` 内 `withFileLock` + `atomicWritePrivateTextFile`（:74-89, :143-151）；快照 revision 用 sha256（:262-272）；1s 轮询监听外部修改。
- **apiKey 存储 = 明文 JSON**：schema 为 `z.string()`（provider-data-schema.ts:35），无加密步骤。桌面端另有 SSH credential service（safeStorage 类）但**不用于模型 apiKey**（`desktop/src/host/sourceServerDirectory.ts:150`）。这是单机文件权限场景下的取舍。
- **三层合并**：Built-in（远端下载 + bundled 兜底，`provider-node/src/zcode-builtin-download.ts:48-55`）→ Personal（provider_config.json）→ Account（权益状态），Overlay 合并在 `packages/provider/src/config-overlay.ts`。

### 2.5 运行时模型切换链路

1. UI：输入框工具栏 `ModelConfigSelect.tsx`（Radix DropdownMenu）→ `ComposerModelMenu.tsx:102-187`；分组=provider，底部含「管理模型」跳转（:526）与 effort 滑杆。
2. 回调：`onSelectModel(providerId, modelId, reasoningLevel?)` → `SessionPane.tsx:4570-4587` 先入草稿态，提交时生效。
3. 校验：选择成为 `ModelSelection`，经 Registry 校验（`registry.ts:74+` validateSelection：provider/model/reasoning 三级错误码）；默认选择持久化到 `defaultModelSelection`。
4. 请求层：`ExecutableModel` + `ModelExecutor{generateText, streamText}`，provider 的 access.apiKey + api.baseUrl/headers 在执行链装配。
5. CLI：`/model` 命令异步 `listModelOptions()` 拉取目录，value 格式 `providerId/modelId`（`apps/zcode-cli/packages/tui/src/app-model-command.ts:28-39`）。

## 三、两者对比

| 维度          | deepseek-harness                                                              | ZCode                                                           |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| UI 技术栈     | React 18 + 自研组件库 + CSS Modules                                           | React 19 + Radix + Tailwind + zustand                           |
| 配置结构      | Provider(route) → models[]，两层                                              | Provider → personalModelIds/modelOrder，两层                    |
| 协议枚举      | openai-compatible / anthropic-messages 等                                     | anthropic-messages / openai-chat-completions / openai-responses |
| apiKey 存储   | **引用解耦**（配置只存 `apiKeyEnv`，明文进独立 `.credentials.yaml`）          | 明文存本地 JSON + UI 掩码回显                                   |
| 测试连接      | `GET {baseURL}/models` 轻探测（不消耗 token，兼容 OpenAI/Anthropic 两种返回） | 复用正式请求链真实跑一次（验证最彻底）                          |
| 并发防护      | path ops + revision 乐观锁                                                    | membership CAS + sha256 快照 revision                           |
| schema 演进   | schemastery 声明式                                                            | `schemaVersion` 信封 + 迁移器链 + sparse/complete 双 schema     |
| 模型能力定义  | 每模型显式字段 + `modelOverrides`                                             | **正则规则批量匹配**（`modelMatch`）+ 精确覆盖                  |
| 温度/采样参数 | 属请求级状态，不进模型配置                                                    | 属请求级 DSL 映射，不进模型配置                                 |

**共识设计**（两个 harness 都这么做，照抄价值最高）：

1. **两层结构**：provider（端点 + 鉴权）与 model（能力 + 限额）分离。
2. **采样参数不入模型配置**：temperature/maxTokens 属于请求级/会话级状态。
3. **默认选择可持久化**：切换模型时后台静默保存默认值，失败不阻塞。
4. **编辑不整节替换**：最小 diff 写入 + 乐观锁防并发覆盖。

## 四、SmallAliceWeb 落地方案建议

SmallAliceWeb 实际技术栈（已验证）：**Vue 3.5 + element-plus 2.11 + vue-element-plus-x + Vite 6 + TS 5.9**，挂件源码在 `packages/ai-vue/src/components/ai-chat/`（AiChat.vue、cards/、parts/、types.ts），另有 `ai-rag-api` / `ai-rag-core` 包可承载服务端逻辑。

### 4.1 Neon 数据库表结构建议

照抄两个 harness 的两层结构，建两表 + 可选密钥表：

```sql
-- provider 表（端点 + 鉴权 + 排序）
CREATE TABLE model_providers (
  id            TEXT PRIMARY KEY,          -- 路由 id，正则 ^[a-z][a-z0-9]*(-[a-z0-9]+)*$（仿 deepseek ROUTE_PATTERN）
  display_name  TEXT NOT NULL,
  api_type      TEXT NOT NULL,             -- 'openai-chat-completions' | 'anthropic-messages' | 'openai-responses'
  base_url      TEXT NOT NULL,
  headers       JSONB DEFAULT '{}',
  api_key_ref   TEXT,                      -- 引用解耦：只存密钥引用名，不存明文（仿 deepseek apiKeyEnv）
  model_order   JSONB DEFAULT '[]',        -- 模型排序（仿 ZCode modelOrder）
  visibility    TEXT DEFAULT 'visible',
  revision      INTEGER NOT NULL DEFAULT 1, -- 乐观锁（deepseek revision 模式）
  schema_version INTEGER NOT NULL DEFAULT 1, -- 结构演进（ZCode 信封模式）
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- model 表（能力 + 限额）
CREATE TABLE provider_models (
  id                 TEXT PRIMARY KEY,     -- `${provider_id}/${model_id}`
  provider_id        TEXT NOT NULL REFERENCES model_providers(id) ON DELETE CASCADE,
  model_id           TEXT NOT NULL,        -- 发给 provider 的模型 id
  display_name       TEXT,
  context_window     INTEGER DEFAULT 1000000,   -- 兜底 1M（deepseek 默认）
  max_output_tokens  INTEGER DEFAULT 131072,    -- 兜底 128K
  input_modalities   JSONB DEFAULT '["text"]',  -- ["text"] / ["text","image"]
  reasoning_levels   JSONB,                -- Thinking 档位；NULL = 不支持
  enabled            BOOLEAN DEFAULT true,
  sort               INTEGER DEFAULT 0
);

-- api key 表（与配置分离，仿 deepseek .credentials.yaml）
CREATE TABLE provider_credentials (
  ref        TEXT PRIMARY KEY,             -- 如 OPENROUTER_API_KEY
  api_key    TEXT NOT NULL,                -- 服务端加密存储，UI 永不回显明文
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.2 API 层设计建议

| 端点                                            | 语义                                             | 模仿来源                       |
| ----------------------------------------------- | ------------------------------------------------ | ------------------------------ |
| `GET /api/model-providers`                      | 列表（含 models 聚合，供选择器）                 | deepseek `modelCatalog()`      |
| `POST /api/model-providers`                     | 创建（服务端生成不冲突 id + 重名校验）           | ZCode `createPersonalProvider` |
| `PATCH /api/model-providers/:id`                | 最小 diff 更新，body 带 `revision`，冲突返回 409 | deepseek path ops + 乐观锁     |
| `DELETE /api/model-providers/:id`               | 级联删 models                                    | —                              |
| `POST /api/model-providers/:id/test-connection` | 测试连接                                         | 见 4.3                         |
| `PUT /api/credentials/:ref`                     | 写密钥（服务端加密），响应不回明文               | deepseek credentials/set       |

校验：**zod schema 前后端共用一份**（deepseek 注释明说前后端"保持同步"；Vue3 项目直接用 zod 两端引用同一 schema 文件即可），分 sparse（编辑草稿）与 complete（保存）两档（ZCode 模式）。

### 4.3 测试连接：两种策略对比与推荐

| 策略                           | 来源                                    | 优点                                                                 | 缺点                       |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------- | -------------------------- |
| `GET {base_url}/models` 轻探测 | deepseek `discovery.ts`                 | 不消耗 token、毫秒级、兼容 OpenAI `data[]` 与 Anthropic `/v1/models` | 不验证模型 id 是否真实可用 |
| 正式请求链跑一次               | ZCode `providerSettingsConnectivity.ts` | 验证鉴权 + 模型 id + reasoning 映射全链路                            | 消耗少量 token、较慢       |

**推荐**：先用 `GET /models` 探测（把表单当前值含未保存 key 直接发去探测，而非已存值——deepseek 语义）；探测通过后可选再做一次 `max_tokens=1` 的真实补全验证模型 id（ZCode 语义）。探测失败不阻塞保存，提示"可手动填写模型"。

### 4.4 Vue 组件拆分建议（映射到 element-plus）

| harness 原组件                                      | SmallAliceWeb 对应（element-plus）                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `CustomProviderCard` / `InlineEditableProviderCard` | `el-dialog` + `el-form`：名称 / api_type 下拉 / baseURL / apiKey（`el-input type=password` + 掩码切换） |
| `ModelListEditor` + `ModelRow`                      | provider 卡片内嵌 `el-table` 行编辑 + 「从端点拉取模型列表」按钮                                        |
| `discoverModels` 探测                               | 按钮 → 调 test-connection 端点 → 成功则把返回模型列表填充 `el-select`（multiple）供勾选                 |
| `ModelSelect` / `ComposerModelMenu` 会话切换器      | 挂件顶部 `el-select` 分组（group by provider），切换后调后端保存默认选择                                |
| 校验错误横幅                                        | `el-alert` success/error，探测结果就地反馈                                                              |

### 4.5 安全要求（两个 harness 的教训合集）

1. **apiKey 永不回显明文**：UI 只显示"已配置"状态 + 掩码（`sk-***abc`）；编辑时留空 = 沿用已存 key（deepseek 语义）。ZCode 明文存本地 JSON 的做法**不可照抄**——Neon 是多用户网络存储，必须服务端加密（列级 AES-GCM 或引用 secret manager）。
2. **乐观锁防并发覆盖**：`revision` 列 + `WHERE revision = ?` 更新，冲突返回 409 让前端提示。
3. **route/id 白名单校验**：provider id 正则约束 + baseURL 强制 http(s) URL（两端同源校验）。
4. **schema_version 列**：从第一天就带上，配置结构演进时走迁移函数（ZCode 信封模式）。

## 五、风险与待确认事项

1. **仓库版本时效**：deepseek-harness v0.2.2-rc.1、ZCode v3.17.2 均为浅克隆（`--depth=1`，2026-11-10 快照），上游可能继续演进，照抄前建议回看对应文件的最新版本。
2. **ZCode 的 apiKey 明文存储是单机取舍**：直接照抄会违反 SmallAliceWeb 的多用户 Neon 场景的安全要求，落地时必须升级为服务端加密（见 4.5）。
3. **temperature 等采样参数**：两个 harness 都不放进模型配置；SmallAliceWeb 若需要每模型默认温度，建议放 `provider_models` 的 JSONB 扩展列，请求级覆盖仍走会话状态。
4. **待用户确认**：4.1 的表结构、4.2 的端点划分是否符合预期；挂件内是否需要完整设置页，还是仅做"会话内切换 + 简单添加"轻量版。
