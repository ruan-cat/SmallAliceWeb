# 2026-11-10 轻量版模型动态配置功能设计（spec）

> - **状态**：已评审（2026-11-11 用户对 Q1/Q2/Q3 及自动推断采纳 D4 正式拍板，见第九节；本文档未经实施，不携带任何完成标记）
> - **上游调研**：[../2026-11-10-deepseek-harness-zcode-model-config-ui-research.md](../2026-11-10-deepseek-harness-zcode-model-config-ui-research.md)、[../2026-11-11-zcode-model-auto-inference-research.md](../2026-11-11-zcode-model-auto-inference-research.md)（第十节的依据）
> - **执行计划**：[../plans/2026-11-10-lightweight-model-config-plan.md](../plans/2026-11-10-lightweight-model-config-plan.md)
> - **由谁产出**：ZCode + GLM-5.3-Flash，按 superpower brainstorming/writing-plans 技能规范撰写

## 一、意图与背景

SmallAliceWeb 挂件当前的大模型配置写死在 `packages/ai-rag-api/src/llm-config.ts` 的 `ragLlmConfig` 静态注册表里（2 个 provider，硬编码 baseUrl 与模型名）。改一个模型要改代码、发版、重新部署。

本次功能要把这张静态注册表升级为 **Neon Postgres 动态配置**：用户通过 UI 动态添加 provider 与模型，配置存 Neon，挂件内可即时切换。

上游调研（deepseek-harness 与 ZCode 源码）给出两个成熟 harness 的共识模式，本设计直接采纳：

1. **两层结构**：provider（端点 + 鉴权）与 model（能力 + 限额）分离。
2. ~~apiKey 引用/加密解耦~~：**经用户 2026-11-11 拍板不采纳**——本产品定位为公开协作存储（见第九节 D1/D2），key 明文入库，不做加密。
3. **测试连接 = `GET {baseUrl}/models` 轻探测**（deepseek `discovery.ts` 语义，不耗 token），可选补真实请求验证。
4. **revision 乐观锁**：并发写入防覆盖。
5. **temperature 等采样参数不入模型配置**（属请求级状态）。
6. **填模型自动推断 = 本地正则规则引擎**（ZCode `modelMatch` 规则模式）：经用户 2026-11-11 拍板 D4 照抄采纳，设计见第十节。

## 二、目标 / 非目标 / 反目标

### 目标（本期交付）

1. 用户可通过 UI 表单动态添加「provider + 模型列表」，配置写入 Neon。
2. 挂件内出现 provider 与模型的切换下拉（含迁入种子的 2 个 provider 与动态添加的 provider）。
3. 添加前可「测试连接」并从端点拉取远端模型列表供勾选。
4. `llm-config.ts` 静态注册表的 2 个 provider **迁移为 Neon 种子数据**，静态注册表退役；chat 链路的 key 来源从 Vercel 环境变量切换为 Neon。
5. 用户在表单填写模型 id 时，系统按本地正则规则引擎**自动推荐**该模型的上下文窗口、最大输出与思考档位（拍板 D4，见第十节）。

### 非目标（本期不做，留待后续版本）

- provider 编辑（PATCH）与完整设置页（本期只有添加 + 删除 + 切换）。
- `AiModalChat` / `AiSidebarChat` 容器的 MS-4 props 透传（本期两种容器不渲染切换器与设置入口，见 7.4；透传改造留后续）。
- 库级默认模型选择持久化（本期用前端 localStorage）。
- api key 轮换管理 UI、多租户隔离、任何形式的鉴权（D1：完全公开是设计而非缺失）。
- per-provider headers 自定义（表结构预留 `headers` JSONB 列，UI 不出字段）。

### 反目标（出现任意一条即本功能失败）

> 2026-11-11 用户拍板后本节整体重写：原「加密落库 / 静态兜底降级」两条反目标按新决策废除。

1. API 响应把 `apiKey` 字段原样回显给前端（列表/编辑场景均无需读回 key，写入方自持 key；这是功能设计而非安全门禁）。
2. 前端直接持有 Neon 连接串（连接串只存在于 nitro 服务端 runtimeConfig）。
3. 在未经用户确认的情况下给写接口加鉴权或限流（完全公开写入是**故意的产品设计**）。

**明确接受的单点风险**：静态注册表迁入 Neon 且废除代码兜底后，Neon 成为唯一权威——Neon 不可用时 provider API 与 chat 模型解析不可用。用户已知情接受（「我们不负责那么多东西，只负责简单存储」）。

## 三、约束

| 约束          | 值                                                                                                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 服务端框架    | nitro 3（`packages/ai-rag-api`，沿用现有 `server/` 目录结构）                                                                                                                                                         |
| ORM 与迁移    | drizzle-orm 0.44 + drizzle-kit（迁移走 `pnpm db:generate` / `pnpm db:migrate`）                                                                                                                                       |
| Postgres 驱动 | postgres.js（`postgres` 包，与现有 db 层一致）                                                                                                                                                                        |
| 校验          | zod ^3.25，前后端共用同一 schema 文件                                                                                                                                                                                 |
| 前端          | Vue 3.5 + element-plus 2.11（组件落在 `packages/ai-vue/src/components/ai-chat/`）                                                                                                                                     |
| 凭据存储      | **明文**存 Neon `model_providers.api_key` 列（用户拍板 D2：公开存储产品定位，废除 AES 加密与环境变量注入；现行生产密钥在 Worker `small-alice-web-api` 与 Neon，删除 Vercel 项目内遗留环境变量不等于删除现行生产密钥） |
| 凭据卫生      | 任何仓库文档/日志/测试不得出现真实 key 值（产品存储明文 ≠ 仓库文档可写明文）；测试一律用占位符                                                                                                                        |
| 协议枚举      | 沿用现有 `RagLlmProtocol = "openai-responses" \| "anthropic-messages"`，本期不新增                                                                                                                                    |
| 规则引擎      | 纯本地计算、零网络请求（拍板 D4）；规则文件格式照抄 ZCode `zcode-builtin.json` 的 `modelConfigRules`（Apache-2.0，来源声明见 10.7）                                                                                   |

## 四、已定决策

### 用户已拍板

1. 形态取**轻量版先行**：Neon 两表 + 最小 API + 「添加 provider 与模型」表单 + 切换下拉，验证链路后再补全。
2. 本阶段只产出 spec 与 plan 文档，**不落地代码**；实施由用户另行授权。
3. （2026-11-11 补）Q1/Q2/Q3 三项正式拍板：完全公开写入（D1）、废除加密与环境变量（D2）、静态兜底迁入 Neon（D3），详见第九节。
4. （2026-11-11 补）**D4：照抄 ZCode 的「填模型自动推断」本地正则规则引擎**（前次调研报告第八节整合建议正式采纳），设计见第十节。

### my call（我做的设计决定，用户评审时可否决）

| #   | 决定                                                                                                                                      | 理由                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Neon 为**唯一权威**：静态 2 provider 迁为种子数据，无代码兜底合并读取                                                                     | 用户拍板 D3（2026-11-11）：原「合并+降级」设计废除，接受 Neon 单点                                  |
| 2   | key **明文**列存储，无加密、无 key_version                                                                                                | 用户拍板 D2（2026-11-11）：废除 AES-256-GCM 与环境变量注入，公开存储产品定位                        |
| 3   | provider id 正则沿用 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`（deepseek `ROUTE_PATTERN`）                                                        | 已被验证的命名约束，可作凭据引用词干                                                                |
| 4   | contextWindow 兜底 1000000、maxOutputTokens 兜底 131072（deepseek 默认 1M/128K）                                                          | 用户不填时服务端兜底                                                                                |
| 5   | 模型切换的「默认选择」存前端 localStorage                                                                                                 | 轻量版不建库表；后续版本可迁库                                                                      |
| 6   | UI 入口 = `AiChatFloatingButton.vue` header 文本按钮「模型设置」→ 原生遮罩弹窗（不引入 `el-dialog`，见 7.1 / 7.4）                        | 挂件内自包含，不改文档站路由；容器内不渲染（透传留后续）                                            |
| 7   | 测试连接端点不落库，直接吃表单当前值（含未保存 key）探测                                                                                  | deepseek `discoverModels` 语义，「添加前先测」体验最佳                                              |
| 8   | 写接口不做任何鉴权与用户隔离                                                                                                              | 用户拍板 D1（2026-11-11）：公网站点 drill.ruan-cat.com 全公开，任何人可写 provider 与 key，故意设计 |
| 9   | 推荐值在**创建时物化**进 `provider_models`（非读取时动态解析）                                                                            | 轻量版实现简单；规则集更新后已入库模型不重算（已知取舍，后续版本可改动态解析）                      |
| 10  | 规则集**自维护精简版**：只搬 `modelRules` + `modelApiRules` 两类 + 万能兜底，不搬 templateModel/builtinProviderModel 规则与 z.ai 模板体系 | 无模板体系需求；`providerSiteRules`（model+协议+baseUrl 三维匹配）后续按需再加                      |
| 11  | **不搬**受限 CEL 解释器：思考档位映射用结构化 `reasoningLevels` 数组表达                                                                  | 规则文件不写 map DSL 表达式；约 700 行解释器的复杂度轻量版不需要                                    |

## 五、数据模型（Neon 两表；2026-11-11 修订：三表简化为两表）

drizzle 定义追加到 `packages/ai-rag-api/server/db/schema.ts`（对齐该文件现有风格），SQL 语义如下：

```sql
-- provider 表（端点 + 鉴权引用 + 排序）
CREATE TABLE model_providers (
  id             TEXT PRIMARY KEY,            -- 正则 ^[a-z][a-z0-9]*(-[a-z0-9]+)*$
  display_name   TEXT NOT NULL,
  api_type       TEXT NOT NULL,               -- 'openai-responses' | 'anthropic-messages'
  base_url       TEXT NOT NULL,               -- 强制 http(s) URL
  api_key        TEXT NOT NULL,               -- 明文存储（用户拍板 D2：公开存储产品定位，废除加密）
  headers        JSONB DEFAULT '{}',          -- 本期 UI 不出字段，预留
  model_order    JSONB DEFAULT '[]',          -- 模型展示顺序（模型 id 数组）
  is_dynamic     BOOLEAN NOT NULL DEFAULT true, -- 动态配置标记（区别于静态兜底）
  revision       INTEGER NOT NULL DEFAULT 1,  -- 乐观锁
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- model 表（能力 + 限额）
CREATE TABLE provider_models (
  id                TEXT PRIMARY KEY,         -- `${providerId}/${modelId}`
  provider_id       TEXT NOT NULL REFERENCES model_providers(id) ON DELETE CASCADE,
  model_id          TEXT NOT NULL,            -- 发给 provider 的模型 id
  display_name      TEXT,
  context_window    INTEGER NOT NULL DEFAULT 1000000,
  max_output_tokens INTEGER NOT NULL DEFAULT 131072,
  input_modalities  JSONB NOT NULL DEFAULT '["text"]',
  reasoning_levels  JSONB,                    -- NULL = 不支持思考档位
  enabled           BOOLEAN NOT NULL DEFAULT true,
  sort              INTEGER NOT NULL DEFAULT 0
);

```

设计说明：

- **apiKey 直接进 provider 表（明文）**：废除独立的 `provider_credentials` 表——明文设计下凭据分离表失去意义；key 与 provider 一次 POST 一并写入（用户拍板 D2）。
- `provider_models` 级联删除跟随 provider。
- **静态注册表迁为种子数据**（用户拍板 D3）：`llm-config.ts` 里现有 2 个 provider（openai / anthropic）作为迁移种子插入 `model_providers` / `provider_models`，`ragLlmConfig` 静态表退役；chat 链路 key 来源同步切换为 Neon。

## 六、API 契约（nitro 路由，全部挂在 `server/routes/v1/model-providers/` 下）

沿用现有 `/v1/*` 命名空间，不另开 `/api` 前缀。

统一响应包：成功直接返回数据，失败返回 `{ error: { code, message } }`；zod 校验失败统一 400。

| 端点                                  | 方法   | 请求体                                                    | 成功响应                                                                                                    | 失败                                           |
| ------------------------------------- | ------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `/v1/model-providers`                 | GET    | —                                                         | `{ providers: [{ id, displayName, apiType, baseUrl, models: [...], revision }] }`（响应不含 `apiKey` 字段） | 500（Neon 断连如实报错，无静态兜底）           |
| `/v1/model-providers`                 | POST   | complete schema（见下），`apiKey` **必填**                | 201 `{ id, revision }`                                                                                      | 400 校验失败；409 id 或重名冲突                |
| `/v1/model-providers/:id`             | DELETE | —                                                         | 204                                                                                                         | 404 不存在                                     |
| `/v1/model-providers/test-connection` | POST   | `{ apiType, baseUrl, apiKey? }`（表单当前值，**不落库**） | 200 `{ ok: true, models: [{ id, displayName? }] }`                                                          | 200 `{ ok: false, error }`（探测失败也是 200） |

POST 的 complete schema 字段：

```ts
{
  id: string,                 // ROUTE_PATTERN 校验
  displayName: string,        // 1..64 字符
  apiType: "openai-responses" | "anthropic-messages",
  baseUrl: string,            // z.string().url() 且必须 http/https
  models: [{                  // 1..50 个
    modelId: string,          // 非空，1..128 字符
    displayName?: string,
    contextWindow?: number,   // 正整数，缺省 1000000
    maxOutputTokens?: number, // 正整数，缺省 131072
    reasoningLevels?: string[] | null,
  }],
  apiKey: string,             // 必填；可打印 ASCII ^[\x21-\x7E]+$（deepseek 校验语义）；明文入库（拍板 D2）
}
```

sparse 规则：前端表单**草稿态**用 sparse schema（全部字段 optional，只校验已填字段的格式），提交落库时用 complete schema 严格校验（ZCode 双 schema 模式）。两份 schema 同文件导出，前后端共用。

**测试连接探测实现**（`server/services/` 下新模块）：

- `openai-responses`：`GET {baseUrl}/models`，`Authorization: Bearer {apiKey}`，兼容响应 `data[]` 或 `models{}`。
- `anthropic-messages`：`GET {root}/v1/models`，`x-api-key` + `anthropic-version` header。
- 探测失败返回 `{ ok: false }`，不抛 5xx。

### 与现有 `GET /v1/models` 的关系

D3 落地后，`server/routes/v1/models.get.ts`（现返回编译期注册表 `ragLlmConfig`，仅 openai / anthropic 两个 provider）必须改为查 Neon（`model-provider-store` 的 `listProviders`）；响应保持 `payload.data.models` 兼容形状——宿主 `useKnowledgeChat` 按现有解析逻辑消费该响应（`useKnowledgeChat.ts` 的 `:179-209` 与 `:397` 两处），**宿主零改动**是本项的验收目标。注册表模型映射为 `AiChatModelOption { id, label, model }` 喂 MS-4 选择器的 `models` props。

### chat 契约动态化

- `server/contracts/chat.ts:25` 的 `provider: z.enum(["anthropic", "openai"])` 动态化为 `string` + Neon 存在性校验：未知 provider / model 仍 400，缺省回退 `activeProvider` 的语义保留。
- 实施前先读 `server/contracts/chat.ts` 全文，确认 `model` 字段现状再定改法。

## 七、前端交互（ai-vue 组件层 + ai-vitepress-plugins 宿主层）

### 7.0 现状基线（MS-4 与宿主数据流）

1. `AiChat.vue` 为 shadow / light 双分支模板，已内置 MS-4 模型选择器（`el-segmented`）：props 为 `models`（`AiChatModelOption[] { id, label, model }`）与 `selectedModelId`，emit `select-model(string)`；`responding` 期间不禁用——切换在下一条消息生效。
2. ai-vue 是**纯受控组件**：零 fetch、零 API 配置、不碰 localStorage；请求与持久化全部在宿主 `packages/ai-vitepress-plugins/src/client/composables/useKnowledgeChat.ts`（baseURL 取 `VITE_RAG_API_BASE`；`loadModels` 调 `GET /v1/models` 解析 `payload.data.models`；localStorage 键为 `ai-chat-provider`）。
3. 现有端点命名空间为 `/v1/*`（`/v1/chat`、`/v1/models`）。
4. `AiModalChat` / `AiSidebarChat` 两个容器当前不透传 MS-4 的 props。
5. 两个宿主的 element-plus 版本不一致（`^2.11.8` vs `^2.13.5`；后者在 dependencies 非 peerDependencies）。

### 7.1 「模型设置」弹窗（原生遮罩 + 分组表单）

- **外壳**：复用 `AiModalChat.vue` 的原生 div 遮罩 + ESC 关闭，**不引入 `el-dialog`**——理由：`el-dialog` 会 teleport 到 body 丢 `--ai-chat-*` CSS 变量；维持轻 element 路线；测试零 stub 成本。遮罩容器层做 shadow / light 双模板（叶子组件保持单模板纯受控）。
- **表单**：单个 `el-form` + `el-divider` 分组；校验为纯函数（**禁用 `el-form` rules**），直接复用 plan Task 2 的 zod 契约 `safeParse`；`computed ready` 就绪门 + 只提示下一个未满足项。
- **字段控件**：显示名、provider id（自动由显示名生成 kebab-case，可改）、apiType 下拉（两项）、baseUrl、apiKey（`el-input show-password`，必填；提交后不回显）；数字字段（contextWindow / maxOutputTokens）用 `el-input` + 原生 placeholder 填推荐值（**禁用 `el-input-number`**）；能力开关用 `el-checkbox-group` + `el-checkbox-button` chip；reasoning 档位内联增删改（不做拖拽排序）。
- **模型区**：`v-for` 渲染 `ModelRowCard` 行卡片（**禁用 `el-table`**）；候选拉取由 `CandidatePicker` 承担，probe 由父层（宿主）执行后回传。
- **入口**：文本按钮「模型设置」，不引入 element-plus 图标。
- **提交**：纯函数校验（complete schema `safeParse`）通过后经宿主适配器创建，成功后刷新 provider 列表。

### 7.2 会话内切换器（MS-4 增量演进）

- **定位**：MS-4 增量演进——保留 `models` / `selectedModelId` props 与 `select-model` emit 契约不变，option value 语义升级为 `providerId/modelId`。
- **控件裁定**：「种子即 2 个 provider 分组」是硬需求，本期直接升级为 `ComposerModelPicker`：自研触发器 + `el-popover`（`:teleported="false"`）自渲染 provider 分组列表 + `el-input` 搜索框（仅候选 >4 条时显示）；`el-segmented` 保留为「单 provider 且候选 ≤4」的降级渲染分支。
- **否决理由**：`el-select` / `el-option-group` 分组方案在 shadow 分支会 teleport 到 body，丢 `--ai-chat-*` 变量，故不采用。
- **持久化裁定**：沿用宿主现有键 `ai-chat-provider`（值结构扩展为 `{ providerId, modelId }`，旧字符串值读取时回退默认选择）。
- **chat 契约动态化**：chat 请求体 provider 字段从 `z.enum(["anthropic", "openai"])`（`server/contracts/chat.ts:25`）动态化为 `string` + Neon 存在性校验——未知 provider / model 仍 400，缺省回退 `activeProvider` 语义保留；实施前先读 `server/contracts/chat.ts` 全文确认 `model` 字段现状再定改法。切换请求注入现有 chat 调用链，服务端解析**只查 Neon**（静态注册表已退役），未命中走既有的非法 provider 错误路径。

### 7.3 数据流归属（谁发请求）

- ai-vue 零 fetch 纪律不破：`GET /v1/model-providers`、`POST test-connection` / `recommend-config` / create / delete 全部由宿主 `useKnowledgeChat.ts` 新增函数发起，经 props（api 适配器对象）注入弹窗与切换器。
- 推荐联动的 1.2s 防抖与 override 追踪在 ai-vue composable 内，到期 emit 请求事件，由宿主执行 fetch 并经 props 回传结果。

### 7.4 容器透传与设置入口

- 现状：`AiModalChat` / `AiSidebarChat` 对 MS-4 零透传。
- 裁定（my call，用户可否决）：本期两种容器**不渲染切换器与设置入口**，列入非目标；透传改造留后续版本。
- 设置入口 = `AiChatFloatingButton.vue` header 文本按钮「模型设置」开弹窗 + 弹窗内管理。

### 7.5 样式与测试纪律

- 新增样式在 `styles/index.scss` 与 `styles/shadow-scoped.ts` 双份分节注释机械同步。
- jsdom 测试按 `ms4-model-picker.test.ts` 先例对用到的 element-plus 组件统一 `vi.mock` stub。
- 组件只用两宿主 element-plus 共有 API（`^2.11.8` vs `^2.13.5`）。

## 八、验收标准（每条都可在 plan 中找到对应测试或手动步骤）

1. `pnpm db:migrate` 后 Neon 内两表结构与第五节一致（`\d model_providers` 等）。
2. `POST /v1/model-providers` 创建成功（apiKey 必填）后，`GET /v1/model-providers` 返回该 provider，且响应体任何位置不含 `apiKey` 字段。
3. 种子迁移执行后，`GET /v1/model-providers` 返回迁入的 2 个静态 provider（openai / anthropic）及其模型清单。
4. `POST .../test-connection` 对 OpenAI 兼容端点返回 `data[]`、对 Anthropic 端点返回 `models{}` 时都能解析出模型列表。
5. 前端表单对非法 id（大写/中文/特殊字符）、非 http(s) baseUrl、空模型列表给出纯函数校验的错误提示，不发起请求。
6. 同 id 重复 POST 返回 409。
7. `DELETE` 后 `GET` 列表不再包含该 provider，且 `provider_models` 级联清空。
8. 挂件内切换到动态模型并发消息，chat 链路按动态配置的 baseUrl/模型发起请求（服务端日志或 mock 可证）。
9. ai-vue 与 ai-rag-api 的 `vitest run` 全绿，`vue-tsc --noEmit` 与 `tsc --noEmit` 零错误。
10. `POST /v1/model-providers/recommend-config` 对 `glm-5` 族返回规则命中的 200K 上下文、对未知模型返回 `.*` 兜底的 1M 上下文，且全程零网络请求（测试中 mock fetch 断言未被调用）。
11. 前端表单输入模型 id 停止输入 1.2 秒后，contextWindow/maxOutputTokens 的 placeholder 显示推荐值；用户已覆盖的字段不被推荐值冲掉。
12. 新增样式在 `styles/index.scss` 与 `styles/shadow-scoped.ts` 双份均存在（diff 比对通过），shadow 挂件视觉走查无样式丢失。
13. 容器行为符合 7.4 裁定：`AiModalChat` / `AiSidebarChat` 本期不渲染切换器与设置入口。
14. D3 落地后 `GET /v1/models` 返回 Neon 动态数据且保持 `payload.data.models` 兼容形状，VitePress 挂件零改动拉到动态 provider。
15. chat 契约动态化后：动态 provider 发消息成功，未知 provider / model id 得 400，缺省回退 activeProvider 语义保留。

## 九、已拍板决策记录与存量迁移（2026-11-11）

### 9.1 决策记录（原开放问题 Q1/Q2/Q3 的用户正式答复）

| #   | 决策                                                                                                                                                                                                                                                                   | 影响                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| D1  | **完全公开写入是故意设计**：公网站点 `https://drill.ruan-cat.com/` 允许任何人填写 api 与 key，只负责简单存储、不负责安全，key 仅用于完成 RAG 任务                                                                                                                      | 写接口不加鉴权/限流；spec 反目标重写                                                   |
| D2  | **废除环境变量与加密**：key 明文存 Neon；执行本系列 spec 任务时清理 Vercel 项目 `smallalice-docs-ai-nitro-api` 内遗留的 `NITRO_OPENAI_API_KEY` 与 `NITRO_ANTHROPIC_API_KEY`（生产已迁 Worker `small-alice-web-api`，删 Vercel 变量仅去遗留配置，不等于删现行生产密钥） | `provider_credentials` 表与 AES 方案整体删除（三表简化为两表）；chat 链路 key 来源切换 |
| D3  | **静态兜底迁入 Neon**：`llm-config.ts` 的 2 个静态 provider 迁为 Neon 种子数据，静态注册表退役                                                                                                                                                                         | 原目标 4「兜底降级」废除；Neon 成为唯一权威（单点风险已知情接受）                      |
| D4  | **照抄 ZCode 填模型自动推断**：本地正则规则引擎（`modelMatch` 万能兜底 + 逐层深度 overlay），推荐值创建时物化入库                                                                                                                                                      | 新增第十节设计；plan 新增 Task 4 规则引擎；原非目标「正则规则匹配」条目废除            |

### 9.2 存量迁移清单（实施时执行，对应 plan Task 6；2026-11-11 D4 新增规则引擎任务后顺延）

1. **种子迁移**：2 个静态 provider（含各自的 baseUrl/模型清单/key）作为幂等种子插入 `model_providers` / `provider_models`（重复执行不重复插入）。
2. **Vercel 遗留环境变量清理**（云端副作用操作，执行时须用户在场确认）：删除 Vercel 项目 `smallalice-docs-ai-nitro-api` 内仍残留的 `NITRO_OPENAI_API_KEY` 与 `NITRO_ANTHROPIC_API_KEY`。现行 LLM 生产凭据在 Worker `small-alice-web-api`（secret/vars）与 Neon；本步不等于撤销现行生产密钥。
3. **代码切换**（排查确认最小改动点仅两处：`server/plugins/rag.ts` 的 envFieldMap 与 `server/cli/local-sync.ts:55-56`；runtimeConfig 合同、静态注册表、门禁形状按 plan Task 6 清理）；`llm-config.ts` 静态注册表退役（`RagLlmProtocol` 等类型定义保留）。现有代码无硬编码 key fallback，`resolveActiveRagLlmConfig` 空值即抛 not configured，门禁语义保留。
4. **文档更新**：仓库内所有提及「LLM key 走环境变量/Vercel 注入」的 markdown 文档按 9.3 清单更新。

### 9.3 markdown 文档过时点排查清单（2026-11-11 排查代理产出；只记录位置与表述，不含任何 key 值）

**必改（随 plan Task 6 实施）：**

| 文档                                                    | 位置     | 现表述摘要                                                                                               | 更新方向                                                |
| ------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `docs/about/rag-embedding-cost.md`（docs 站正式页面）   | :78      | RAG 必需 env 清单含两个 `NITRO_*_API_KEY`                                                                | 删两项，改「LLM key 存 Neon 数据库，无需环境变量」      |
| `openspec/specs/ai-rag/deployment/spec.md`（现行 spec） | :180-190 | 「MUST NOT 保存 API key……Vercel 三环境 `NITRO_OPENAI_API_KEY` 原值保留、`NITRO_ANTHROPIC_API_KEY` 接线」 | 整段重写：key 明文存 Neon、环境变量废除、门禁语义保留   |
| `openspec/specs/ai-rag/chat-api/spec.md`（现行 spec）   | :138-142 | Scenario：激活 provider 的 `NITRO_*_API_KEY` 缺失门禁                                                    | 改为「激活 provider 在数据库中无 key 时 MUST 阻止装配」 |
| `.github/workflows/rag-sync-schedule.yaml`              | :47      | secrets 注入 `NITRO_ANTHROPIC_API_KEY`                                                                   | 删该行 + 删 GitHub Secrets 两条目（云端操作须用户在场） |

**历史文档（默认不改，是否补「已废除」注由实施会话与用户确认）：**

- `docs/superpowers/specs/2026-08-07-nitro-api-vercel-deploy-design.md`（:34,161-162,169,197-199，历史设计稿；`docs/.vitepress/dist/` 下为其构建镜像，重新构建自动同步）
- `openspec/changes/archive/2026-08-31-ai-rag-phase2/`（tasks/design/specs/history 多处，phase2 归档）
- `prompts/index.md`（:553-589，用户历史指令记录）
- `reports/2026-11-10-vercel-to-cloudflare/2026-11-10-external-evidence.md:39`（昨日 Vercel env 盘点）
- `reports/2026-9-5-learn-inkeep-agents-repo/`（学习笔记与镜像 spec 多处）

**环境变量快照文件**：根目录多个 `.env*`（`vercel env pull` 产物，受 `.env*` gitignore 保护）在 env 删除后重拉或手删；仓库无 `.env.example` 类示例文件，无需改。

## 十、模型能力规则引擎设计（2026-11-11 拍板 D4 新增；照抄 ZCode 机制）

> 依据：[自动推断机制调研报告](../2026-11-11-zcode-model-auto-inference-research.md)。目标体验：用户在表单填入模型 id 后，系统**纯本地、零网络**地推荐出合理的上下文窗口、最大输出与思考档位——未知模型落到保守兜底，已知模型族被正则规则逐层修正。

### 10.1 功能语义

1. 前端表单输入 modelId → 防抖后调 `recommend-config` 端点 → 返回该模型的推荐配置。
2. 推荐值以 **placeholder** 呈现（不回填输入框）：contextWindow/maxOutputTokens 留空 = 创建时采用推荐值物化入库（my call #9）。
3. 用户手动覆盖过的字段记录为 override，推荐值不再冲掉（ZCode `overriddenFieldsValue` 语义）。
4. 「智能推荐」开关（默认开）：关闭后表单回到纯手动模式。

### 10.2 规则文件（自维护精简规则集，my call #10）

落点：`packages/ai-rag-api/server/config/model-capability-rules.json`。格式照抄 ZCode `zcode-builtin.json` 的 `modelConfigRules` 中的两类（`modelRules` + `modelApiRules`），**不搬** templateModelRules / builtinProviderModelRules（无模板体系）与 providerSiteRules（三维匹配，后续按需加）。初始规则集（内容自维护，格式为 ZCode 数据格式）：

```json
{
	"schemaVersion": 1,
	"rules": {
		"modelRules": [
			{
				"modelMatch": ".*",
				"config": {
					"contextWindow": 1000000,
					"maxOutputTokens": 131072,
					"inputModalities": ["text"],
					"supportsToolCall": true,
					"reasoningLevels": null
				}
			},
			{
				"modelMatch": ".*glm-5(?!.*flash).*",
				"config": { "contextWindow": 200000, "maxOutputTokens": 64000, "reasoningLevels": ["disabled", "enabled"] }
			},
			{
				"modelMatch": ".*glm-5.*flash.*",
				"config": { "contextWindow": 1000000, "maxOutputTokens": 128000, "reasoningLevels": ["disabled", "enabled"] }
			},
			{
				"modelMatch": ".*claude-(sonnet|opus).*",
				"config": { "contextWindow": 200000, "maxOutputTokens": 64000, "reasoningLevels": ["disabled", "enabled"] }
			},
			{
				"modelMatch": ".*gpt-5.*",
				"config": { "contextWindow": 400000, "maxOutputTokens": 128000, "reasoningLevels": ["disabled", "low", "high"] }
			}
		],
		"modelApiRules": [
			{
				"modelMatch": ".*",
				"apiTypeMatch": "anthropic-messages",
				"config": { "reasoningLevels": ["disabled", "enabled"] }
			},
			{
				"modelMatch": ".*",
				"apiTypeMatch": "openai-responses",
				"config": { "reasoningLevels": ["disabled", "low", "high"] }
			}
		]
	}
}
```

> 初始数值为合理预设，非权威数据；规则条目随实际使用持续维护。`modelApiRules` 仅按协议收敛思考档位（my call #11：不写 ZCode 的 map DSL 表达式）。

### 10.3 解析引擎语义（照抄 ZCode `ModelConfigRules.resolve`，来源声明见 10.7）

- **匹配**：`new RegExp(`^(?:${pattern})$`).test(value)` 全串匹配（防 `glm-5` 误命中 `glm-50`）；`modelMatch` 忽略大小写，`apiTypeMatch` 敏感。
- **合并**：规则数组顺序 = `modelRules` → `modelApiRules`；命中即**深 overlay**：`undefined` 继承上一层、显式 `null` 清空该字段、对象递归合并——严禁浅 spread。
- **入口签名**：`resolveModelCapability({ apiType, baseUrl?, modelId }) → { contextWindow, maxOutputTokens, inputModalities, reasoningLevels, matchedRule }`（`matchedRule` 返回命中的最后一条规则 pattern，供前端显示「已匹配 xxx 规则」）。
- 落点：`packages/ai-rag-api/server/services/model-capability-rules.ts`（引擎 + JSON 加载），核心约 60 行。

### 10.4 recommend-config 端点契约

| 端点                                   | 方法 | 请求体                                                                           | 成功响应                                                                                                                |
| -------------------------------------- | ---- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `/v1/model-providers/recommend-config` | POST | `{ apiType, baseUrl?, models: [{ modelId }] }`（1..50 个，**不含 key，不落库**） | 200 `{ recommendations: [{ modelId, contextWindow, maxOutputTokens, inputModalities, reasoningLevels, matchedRule }] }` |

纯本地计算（测试断言 fetch 未被调用）；批量设计避免前端逐模型循环请求。

### 10.5 前端联动（状态在 ai-vue，请求在宿主）

- **ai-vue 侧 `useProviderDraftCard`**：1.2s idle 防抖 + blur/提交前 flush（ZCode `MODEL_PROVIDER_TEXT_IDLE_TRIGGER_MS = 1_200` 语义）+ IME 守卫；override 字段集合追踪；推荐值 placeholder 呈现 +「已匹配规则」轻提示；到期 emit `request-recommend(modelId 集合)`，组件内不发任何网络请求。
- **宿主侧**：`useKnowledgeChat.ts` 新增 `recommendConfig()` 调 `POST /v1/model-providers/recommend-config`，经 props 回传结果；勾选远端拉取的模型后，对全部勾选模型的批量补推荐由宿主执行。

### 10.6 与入库物化的关系

创建 provider 时：用户留空的 contextWindow/maxOutputTokens/reasoningLevels 字段，服务端用规则引擎解析值物化写入 `provider_models`（表列保持 NOT NULL DEFAULT 不变）。已知取舍：规则集后续更新不回溯重算已入库模型（my call #9）。

### 10.7 合规与来源声明

- ZCode 为 Apache-2.0（LICENSE 第一手确认）；规则数据格式与引擎语义照抄合规，保留来源声明：在 `model-capability-rules.ts` 文件头加注释 `// 语义照抄自 zai-org/ZCode (Apache-2.0) packages/provider/src/config/model-config.ts ModelConfigRules.resolve`。
- 规则内容为自维护（不照搬 z.ai 业务模板与套餐信息）；未匹配任何具体规则时走 `.*` 兜底，兜底值调整需评审。
