# 轻量版模型动态配置功能实施计划（plan）

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 按任务逐个实施本计划。步骤使用 checkbox（`- [ ]`）语法跟踪。**每个任务末尾的提交步骤，必须获得用户在当前会话的明确授权后才执行 git commit。**

**目标（Goal）：** 在 SmallAliceWeb 内实现「UI 动态添加大模型配置存入 Neon Postgres + 挂件内切换」；静态注册表 2 个 provider 迁入 Neon 作种子数据后退役（用户拍板 D3），key 明文入库（拍板 D2），写接口完全公开（拍板 D1），填模型自动推断照抄 ZCode 本地规则引擎（拍板 D4）。决策记录见 spec 第九节（2026-11-11），规则引擎设计见 spec 第十节。

**架构（Architecture）：** `ai-rag-api`（nitro 3）内新增两张 drizzle 表与五个 API 端点（四个 CRUD/探测 + recommend-config 推荐），Neon 为唯一权威（无静态兜底合并——拍板 D3 废除）；apiKey 明文存 `model_providers.api_key` 列（拍板 D2 废除 AES 与环境变量注入），API 响应不回显 `apiKey` 字段；模型能力规则引擎纯本地零网络照抄 ZCode `ModelConfigRules.resolve`（spec 第十节）；存量迁移把 `llm-config.ts` 两个静态 provider 变成 Neon 种子，并清理 Vercel 项目内遗留的两个 LLM key 环境变量（生产密钥在 Worker `small-alice-web-api`，删 Vercel 变量不等于删现行生产密钥）、更新仓库过时文档。`ai-vue` 挂件新增设置弹窗（含推荐联动）与分组切换器（MS-4 增量演进，spec 第七节）；ai-vue 保持零 fetch 纯受控，网络请求与持久化全部在 ai-vitepress-plugins 宿主（默认选择持久化在宿主键 `ai-chat-provider`）。设计模式照抄 deepseek-harness / ZCode（见 spec 引用的两份调研报告）。

**技术栈（Tech Stack）：** nitro 3 + drizzle-orm 0.44 + postgres.js + zod 3.25 + Vue 3.5 + element-plus 2.11 + vitest（无加密依赖——拍板 D2 废除 node:crypto 方案）。

**Spec：** [../specs/2026-11-10-lightweight-model-config-design.md](../specs/2026-11-10-lightweight-model-config-design.md)（本计划的每一步都从 spec 论证；执行者须同读 spec 与本计划）

## 全局约束（Global Constraints）

- 协议枚举只有 `"openai-responses" | "anthropic-messages"`，本期不新增（spec 第三节）。
- apiKey **明文存 Neon**（拍板 D2，公开存储产品定位）；但 `apiKey` 字段不得出现在任何 API 响应体、日志、测试文件与仓库文档中（spec 反目标 1）。测试一律用占位符如 `sk-test-000`。
- `contextWindow` 兜底 1000000，`maxOutputTokens` 兜底 131072（spec 第四节 my call #4）。
- provider id 正则 `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`（spec my call #3）。
- 规则引擎**纯本地、零网络**（拍板 D4）：规则文件格式照抄 ZCode `modelConfigRules`，未匹配走 `.*` 万能兜底；深 overlay 语义（undefined 继承 / null 清空）严禁写成浅 spread（spec 第十节）。
- ai-vue 保持**零 fetch / 零 localStorage / 零 API 配置**的纯受控纪律：一切网络请求与持久化在 ai-vitepress-plugins 宿主（spec 7.3）。
- 组件只用两宿主 element-plus **共有 API**（peer `^2.11.8` vs `^2.13.5`）；禁用依赖 teleport 到 body 的组件路径（`el-dialog` / `el-select` 在 shadow 分支丢 `--ai-chat-*` 变量）（spec 7.5）。
- commit 提交动作：须用户在当前会话明确授权后执行；提交信息带 `Assisted-by: ZCode / <会话模型>` 署名。
- 包管理一律 `pnpm`，禁止 `npx` 长驻命令。
- 不得修改全局技能目录与 common 工作区；所有改动限定在 SmallAliceWeb 仓库内。

## 评审焦点（Review Focus）

spec 暗示了、但常规功能测试最容易漏掉的五类失败输入（每条已在对应任务内置测试；2026-11-11 随拍板 D2/D3 修订删去「静态兜底降级」与「解密失败」两条，随 D4 新增规则引擎一条）：

1. **apiKey 首尾空白或换行**：用户粘贴 key 常带 `\n`。期望行为：服务端 trim 后再校验；trim 后为空 = 校验失败（key 必填，不存在「留空沿用」）。→ Task 2 测试。
2. **baseUrl 末尾斜杠与 `/v1` 后缀**：`https://x/v1/` 拼接 `/models` 不得变成 `/v1//models`。期望行为：probe 内先去尾斜杠再 join。→ Task 5 测试。
3. **种子迁移幂等性**：迁移重复执行（重跑 `db:migrate`、部署重放）不得产生重复 provider 或主键冲突报错。期望行为：种子 SQL 用 `ON CONFLICT (id) DO NOTHING`。→ Task 6 测试。
4. **响应体泄漏**：期望行为：所有 provider 相关 API 响应的顶层与嵌套键集合中不含 `apiKey`。→ Task 5 测试。
5. **规则匹配边界**：规则正则必须全串匹配（`^(?:pattern)$`）——`glm-5` 不得误命中 `glm-50`；规则数组顺序敏感（后面的规则覆盖前面的），深 overlay 后已有字段不得被无关字段冲掉。期望行为：`glm-5-flash` 与 `glm-5` 各命中各自规则；零网络断言 fetch 未被调用。→ Task 4 测试。

## 文件结构（File Structure）

| 动作 | 路径（相对 SmallAliceWeb 仓库根）                                                    | 职责                                                      |
| ---- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| 修改 | `packages/ai-rag-api/server/db/schema.ts`                                            | 追加两表 drizzle 定义                                     |
| 新建 | `packages/ai-rag-api/drizzle/0006_add_model_provider_tables.sql`                     | 迁移（由 drizzle-kit 生成）                               |
| 新建 | `packages/ai-rag-api/scripts/seed-static-providers.ts`                               | 静态 2 provider 种子脚本（从 env 读值写库，幂等，Task 6） |
| 新建 | `packages/ai-rag-api/server/contracts/model-provider.ts`                             | zod sparse/complete 双 schema + 类型（前后端共用）        |
| 新建 | `packages/ai-rag-api/server/config/model-capability-rules.json`                      | 模型能力初始规则集（自维护，spec 10.2，Task 4）           |
| 新建 | `packages/ai-rag-api/server/services/model-capability-rules.ts`                      | 规则解析引擎（语义照抄 ZCode，Task 4）                    |
| 新建 | `packages/ai-rag-api/server/routes/v1/model-providers/recommend-config.post.ts`      | 推荐端点（纯本地零网络，Task 4）                          |
| 新建 | `packages/ai-rag-api/server/services/model-provider-store.ts`                        | 仓储层：唯一权威读取 / 创建 / 删除                        |
| 新建 | `packages/ai-rag-api/server/services/connectivity-probe.ts`                          | `GET {baseUrl}/models` 探测                               |
| 新建 | `packages/ai-rag-api/server/routes/v1/model-providers/index.get.ts`                  | 列表端点                                                  |
| 新建 | `packages/ai-rag-api/server/routes/v1/model-providers/index.post.ts`                 | 创建端点                                                  |
| 新建 | `packages/ai-rag-api/server/routes/v1/model-providers/[id].delete.ts`                | 删除端点                                                  |
| 新建 | `packages/ai-rag-api/server/routes/v1/model-providers/test-connection.post.ts`       | 测试连接端点                                              |
| 新建 | `packages/ai-rag-api/test/model-capability-rules.test.ts`                            | 规则引擎单测（Task 4）                                    |
| 新建 | `packages/ai-rag-api/test/model-provider-contract.test.ts`                           | 契约单测                                                  |
| 新建 | `packages/ai-rag-api/test/model-provider-store.test.ts`                              | 仓储层单测                                                |
| 新建 | `packages/ai-rag-api/test/model-provider-routes.test.ts`                             | 路由集成测试（含泄漏断言）                                |
| 修改 | `packages/ai-rag-api/src/llm-config.ts`                                              | 静态注册表退役，`RagLlmProtocol` 类型保留（Task 6）       |
| 修改 | `packages/ai-rag-api/server/routes/v1/models.get.ts`                                 | 改查 Neon，保持 `payload.data.models` 兼容形状（Task 6）  |
| 修改 | `packages/ai-rag-api/server/contracts/chat.ts`                                       | chat 契约 provider 校验动态化（Task 6）                   |
| 修改 | `packages/ai-rag-api/server/routes/v1/chat.post.ts`                                  | chat 请求体 provider 校验动态化落地（Task 6）             |
| 新建 | `packages/ai-vue/src/components/ai-chat/parts/ModelSettingsDialog.vue`               | 设置弹窗外壳 + 编排（含推荐联动，Task 7）                 |
| 新建 | `packages/ai-vue/src/components/ai-chat/parts/ModelRowCard.vue`                      | 弹窗模型行卡片（Task 7）                                  |
| 新建 | `packages/ai-vue/src/components/ai-chat/parts/CandidatePicker.vue`                   | 候选拉取（probe 由宿主执行，Task 7）                      |
| 新建 | `packages/ai-vue/src/components/ai-chat/parts/ModelChipToggle.vue`                   | 能力开关 chip（Task 7）                                   |
| 新建 | `packages/ai-vue/src/components/ai-chat/parts/useProviderDraftCard.ts`               | 草稿与推荐联动 composable（Task 7）                       |
| 修改 | `packages/ai-vue/src/styles/index.scss` + `src/styles/shadow-scoped.ts`              | 双份样式分节注释同步（Task 7/8）                          |
| 修改 | `packages/ai-vue/src/components/ai-chat/AiChat.vue`                                  | 双分支定点插入切换器（MS-4 增量，Task 8）                 |
| 修改 | `packages/ai-vue/src/components/ai-chat/AiChatFloatingButton.vue`                    | header「模型设置」入口（Task 8）                          |
| 新建 | `packages/ai-vue/src/components/ai-chat/parts/ComposerModelPicker.vue`               | 自研触发器分组切换器（Task 8）                            |
| 新建 | `packages/ai-vue/src/components/ai-chat/parts/__tests__/ModelSettingsDialog.test.ts` | 组件测试                                                  |
| 修改 | `packages/ai-vitepress-plugins/src/client/composables/useKnowledgeChat.ts`           | 宿主数据流扩展：请求与持久化（Task 8）                    |
| 新建 | `packages/ai-vitepress-plugins/src/client/api/modelConfig.ts`                        | 宿主侧 api 适配器（落点随宿主现有请求封装，Task 8）       |
| 修改 | （按 9.3 排查清单）仓库内提及「LLM key 走环境变量」的 markdown 文档                  | 过时文档更新（Task 6，清单见 spec 9.3）                   |

> nitro 路由文件名遵循 nitro 文件路由约定（`index.get.ts` / `[id].delete.ts`）；动手前先读 `server/routes/v1/` 下现有文件确认命名风格，以现有风格为准。`server/db/schema.ts` 与 `AiChat.vue` 的修改，先读目标文件再按现有风格追加，不得整文件重写。

---

### Task 1: drizzle 两表 schema 与迁移

**Files:**

- Modify: `packages/ai-rag-api/server/db/schema.ts`（追加，不重写）
- Create: `packages/ai-rag-api/drizzle/0006_*.sql`（由 drizzle-kit 生成，文件名以后缀自动编号为准）

**Interfaces:**

- Consumes: 现有 `schema.ts` 的 drizzle 导入与表定义风格。
- Produces: `modelProviders`、`providerModels` 两个 drizzle 表对象，供 Task 3 仓储层 import。

- [ ] **Step 1: 读现有 schema.ts 风格**

Run: `head -40 packages/ai-rag-api/server/db/schema.ts`
记录：pgTable 导入方式、列定义风格（`text()` / `integer()` / `jsonb()` 的调用形式）、是否用 `pgTable` 第二参回调建索引。

- [ ] **Step 2: 追加两表定义（按现有风格改写以下语义）**

```ts
// ===== 模型动态配置（spec 2026-11-10 第五节，2026-11-11 修订为两表）=====
export const modelProviders = pgTable("model_providers", {
	id: text("id").primaryKey(), // 正则校验在 zod 层
	displayName: text("display_name").notNull(),
	apiType: text("api_type").notNull(), // 'openai-responses' | 'anthropic-messages'
	baseUrl: text("base_url").notNull(),
	apiKey: text("api_key").notNull(), // 明文存储（拍板 D2；响应层不回显此列）
	headers: jsonb("headers").default({}),
	modelOrder: jsonb("model_order").default([]),
	isDynamic: boolean("is_dynamic").notNull().default(true),
	revision: integer("revision").notNull().default(1),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerModels = pgTable("provider_models", {
	id: text("id").primaryKey(), // `${providerId}/${modelId}`
	providerId: text("provider_id")
		.notNull()
		.references(() => modelProviders.id, { onDelete: "cascade" }),
	modelId: text("model_id").notNull(),
	displayName: text("display_name"),
	contextWindow: integer("context_window").notNull().default(1000000),
	maxOutputTokens: integer("max_output_tokens").notNull().default(131072),
	inputModalities: jsonb("input_modalities").notNull().default(["text"]),
	reasoningLevels: jsonb("reasoning_levels"),
	enabled: boolean("enabled").notNull().default(true),
	sort: integer("sort").notNull().default(0),
});
```

（若现有文件使用不同列助手名，如 `text()` 与 `text("col")` 差异，以现有风格为准改写，语义不变。）

- [ ] **Step 3: 生成并执行迁移**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api db:generate && pnpm --filter @ruan-cat-drill-doc/ai-rag-api db:migrate`
Expected: 生成 `0006_*.sql` 且执行无报错；Neon 内两表建成。

- [ ] **Step 4: 验证表结构**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api exec drizzle-kit push --dry-run`（或用 Neon MCP `describe_table_schema` 核对两表列）
Expected: 列名、默认值、级联删除与 spec 第五节一致（`model_providers.api_key` 明文列为 NOT NULL）。

- [ ] **Step 5: 提交（须用户授权）**

```bash
git add packages/ai-rag-api/server/db/schema.ts packages/ai-rag-api/drizzle/
git commit -m "feat(ai-rag-api): 新增模型动态配置两表 schema 与迁移"
```

---

### Task 2: zod 契约（sparse/complete）

**Files:**

- Create: `packages/ai-rag-api/server/contracts/model-provider.ts`
- Test: `packages/ai-rag-api/test/model-provider-contract.test.ts`

**Interfaces:**

- Consumes: `RagLlmProtocol` 类型（`src/llm-config.ts:2`）。
- Produces（Task 3/4/5 依赖）:

```ts
export const ROUTE_PATTERN: RegExp; // /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
export const providerIdSchema: z.ZodString;
export const modelEntryInputSchema: z.ZodObject; // modelId 必填，其余可选
export const providerCreateCompleteSchema: z.ZodObject; // spec 第六节字段
export const providerCreateSparseSchema: z.ZodObject; // 全部 optional，只校验已填字段格式
export const testConnectionRequestSchema: z.ZodObject; // { apiType, baseUrl, apiKey? }
export type ProviderCreateInput = z.infer<typeof providerCreateCompleteSchema>;
export type TestConnectionRequest = z.infer<typeof testConnectionRequestSchema>;
```

- [ ] **Step 1: 写失败测试**

`packages/ai-rag-api/test/model-provider-contract.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import {
	providerCreateCompleteSchema,
	providerIdSchema,
	testConnectionRequestSchema,
} from "../server/contracts/model-provider";

describe("providerIdSchema", () => {
	it.each(["openai", "my-gateway-2"])("接受合法 id %s", (id) => {
		expect(providerIdSchema.safeParse(id).success).toBe(true);
	});
	it.each(["OpenAI", "模型1", "a_b", "-lead", "trail-"])("拒绝非法 id %s", (id) => {
		expect(providerIdSchema.safeParse(id).success).toBe(false);
	});
});

describe("providerCreateCompleteSchema", () => {
	it("接受合法输入并补默认上下文窗口", () => {
		const r = providerCreateCompleteSchema.parse({
			id: "my-gateway",
			displayName: "我的网关",
			apiType: "openai-responses",
			baseUrl: "https://api.example.com/v1",
			models: [{ modelId: "gpt-test" }],
		});
		expect(r.models[0].contextWindow).toBe(1000000);
		expect(r.models[0].maxOutputTokens).toBe(131072);
	});
	it("拒绝非 http(s) baseUrl、空模型列表、缺失或含换行的 apiKey", () => {
		const base = { id: "g", displayName: "g", apiType: "openai-responses", models: [{ modelId: "m" }] };
		expect(providerCreateCompleteSchema.safeParse({ ...base, baseUrl: "ftp://x.com" }).success).toBe(false);
		expect(providerCreateCompleteSchema.safeParse({ ...base, baseUrl: "https://x.com", models: [] }).success).toBe(
			false,
		);
		expect(
			providerCreateCompleteSchema.safeParse({ ...base, baseUrl: "https://x.com", apiKey: "sk-a\n" }).success,
		).toBe(false); // schema 层拒绝换行；服务端提交前先 trim
		expect(providerCreateCompleteSchema.safeParse({ ...base, baseUrl: "https://x.com" }).success).toBe(false); // apiKey 必填（拍板 D2）
	});
});

describe("testConnectionRequestSchema", () => {
	it("apiKey 可选；apiType 超出枚举拒绝", () => {
		expect(
			testConnectionRequestSchema.safeParse({ apiType: "openai-responses", baseUrl: "https://x.com" }).success,
		).toBe(true);
		expect(testConnectionRequestSchema.safeParse({ apiType: "grpc", baseUrl: "https://x.com" }).success).toBe(false);
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test -- model-provider-contract`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 zod 契约**

`server/contracts/model-provider.ts` 核心内容：

```ts
import { z } from "zod";

export const ROUTE_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const providerIdSchema = z
	.string()
	.min(1)
	.max(64)
	.regex(ROUTE_PATTERN, "id 只允许小写字母数字与中划线，且不以中划线开头结尾");

export const modelEntryInputSchema = z.object({
	modelId: z.string().min(1).max(128),
	displayName: z.string().max(128).optional(),
	contextWindow: z.number().int().positive().default(1000000),
	maxOutputTokens: z.number().int().positive().default(131072),
	reasoningLevels: z.array(z.string()).max(8).nullable().default(null),
});

const printableAscii = /^[\x21-\x7E]+$/;

const apiKeyField = z.string().regex(printableAscii, "apiKey 只允许可打印 ASCII 字符");

export const providerCreateCompleteSchema = z
	.object({
		id: providerIdSchema,
		displayName: z.string().min(1).max(64),
		apiType: z.enum(["openai-responses", "anthropic-messages"]),
		baseUrl: z
			.string()
			.url()
			.refine((v) => v.startsWith("http://") || v.startsWith("https://"), "baseUrl 必须是 http(s) URL"),
		models: z.array(modelEntryInputSchema).min(1).max(50),
		apiKey: apiKeyField, // 必填（拍板 D2：明文入库，创建时一并写入）
	})
	.strict();

// sparse：全部 optional，只校验已填字段的格式（ZCode 双 schema 模式）
export const providerCreateSparseSchema = z.object({
	id: providerIdSchema.optional(),
	displayName: z.string().max(64).optional(),
	apiType: z.enum(["openai-responses", "anthropic-messages"]).optional(),
	baseUrl: z
		.string()
		.url()
		.refine((v) => v.startsWith("http://") || v.startsWith("https://"))
		.optional(),
	apiKey: apiKeyField.optional(),
});

export const testConnectionRequestSchema = z.object({
	apiType: z.enum(["openai-responses", "anthropic-messages"]),
	baseUrl: z.string().url(),
	apiKey: apiKeyField.optional(),
});

export type ProviderCreateInput = z.infer<typeof providerCreateCompleteSchema>;
export type TestConnectionRequest = z.infer<typeof testConnectionRequestSchema>;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test -- model-provider-contract`
Expected: PASS 全绿。

- [ ] **Step 5: 提交（须用户授权）**

```bash
git add packages/ai-rag-api/server/contracts/ packages/ai-rag-api/test/model-provider-contract.test.ts
git commit -m "feat(ai-rag-api): 模型配置 zod 契约"
```

---

### Task 3: 仓储层 model-provider-store（唯一权威读取 / 创建 / 删除）

**Files:**

- Create: `packages/ai-rag-api/server/services/model-provider-store.ts`
- Test: `packages/ai-rag-api/test/model-provider-store.test.ts`

**Interfaces:**

- Consumes: Task 1 表对象（`modelProviders` / `providerModels`）。
- Produces（Task 5/6 依赖）:

```ts
export class ProviderConflictError extends Error;   // → 409
export class ProviderNotFoundError extends Error;   // → 404
export interface ProviderSummary {
	id: string; displayName: string; apiType: "openai-responses" | "anthropic-messages";
	baseUrl: string; models: { modelId: string; displayName?: string; contextWindow: number; maxOutputTokens: number }[];
	revision: number;
}
export async function listProviders(): Promise<ProviderSummary[]>;   // 只查 Neon；Neon 断连时异常向上抛（如实 500，无静态兜底）
export async function createProvider(input: ProviderCreateInput): Promise<{ id: string; revision: number }>; // input.apiKey 必填，内部 trim 后落 api_key 列
export async function deleteProvider(id: string): Promise<void>;
export async function resolveProviderForChat(providerId: string, modelId: string): Promise<{ apiKey: string; baseUrl: string; apiType: string } | undefined>; // chat 链路取用（Task 5 迁移用）
```

- [ ] **Step 1: 写失败测试**（核心用例：同 id 重复创建 → `ProviderConflictError`；apiKey 带 `\n` 创建后落库值已 trim；级联删除后 models 清空；列表响应不含 apiKey）

```ts
import { describe, expect, it, vi } from "vitest";
import {
	createProvider,
	deleteProvider,
	listProviders,
	ProviderConflictError,
} from "../server/services/model-provider-store";
import type { ProviderCreateInput } from "../server/contracts/model-provider";

const input: ProviderCreateInput = {
	id: "test-gw",
	displayName: "测试网关",
	apiType: "openai-responses",
	baseUrl: "https://api.test.local/v1",
	apiKey: "sk-test-000\n", // 尾部换行，验证 trim（评审焦点 1）
	models: [{ modelId: "m-1", contextWindow: 1000000, maxOutputTokens: 131072, reasoningLevels: null }],
};

describe("model-provider-store", () => {
	it("同 id 重复创建抛 ProviderConflictError", async () => {
		await createProvider(input);
		await expect(createProvider(input)).rejects.toThrow(ProviderConflictError);
	});
	it("列表响应不含 apiKey 字段（评审焦点 4）", async () => {
		const r = await listProviders();
		expect(r.length).toBeGreaterThanOrEqual(1);
		expect(Object.keys(r[0])).not.toContain("apiKey");
	});
});
```

（测试需要真实或 mock 的 Neon 连接：实施时读 `server/db/` 现有连接获取方式，按仓库现有测试基建选 mock 或测试库。）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test -- model-provider-store`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现仓储层**

实现要点（对照 spec 第五节/第六节，2026-11-11 修订版）：

1. `listProviders()`：查 Neon（`modelProviders` join `providerModels` 按 `sort` 排序）；**返回的 ProviderSummary 不含 apiKey**（SQL 不 select 该列，评审焦点 4）；Neon 异常向上抛（如实 500，无静态兜底——拍板 D3）。
2. `createProvider()`：事务内查重 id → 冲突抛 `ProviderConflictError`；插入 provider（`revision: 1`）+ 逐条 models（`id = providerId/modelId`，`sort` 递增）；`input.apiKey` 先 `trim()`，trim 后为空抛校验错误（评审焦点 1），明文落 `api_key` 列（拍板 D2）。
3. `deleteProvider()`：不存在抛 `ProviderNotFoundError`；存在则删除（models 级联）。
4. `resolveProviderForChat()`：按 providerId+modelId 查 Neon 返回执行所需三元组，供 Task 5 的 chat 链路切换使用。

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test -- model-provider-store`
Expected: PASS 全绿。

- [ ] **Step 5: 提交（须用户授权）**

```bash
git add packages/ai-rag-api/server/services/model-provider-store.ts packages/ai-rag-api/test/model-provider-store.test.ts
git commit -m "feat(ai-rag-api): 模型配置仓储层（Neon 唯一权威）"
```

---

### Task 4: 模型能力规则引擎（自动推断，拍板 D4）

**Files:**

- Create: `packages/ai-rag-api/server/config/model-capability-rules.json`（初始规则集，spec 10.2）
- Create: `packages/ai-rag-api/server/services/model-capability-rules.ts`（引擎，语义照抄 ZCode，spec 10.3）
- Create: `packages/ai-rag-api/server/routes/v1/model-providers/recommend-config.post.ts`
- Test: `packages/ai-rag-api/test/model-capability-rules.test.ts`

**Interfaces:**

- Consumes: `RagLlmProtocol` 协议枚举值。
- Produces（Task 5 端点编排、Task 7 前端联动依赖）:

```ts
export interface ModelCapabilityRecommendation {
	modelId: string;
	contextWindow: number;
	maxOutputTokens: number;
	inputModalities: string[];
	reasoningLevels: string[] | null;
	matchedRule: string; // 命中的最后一条规则 pattern
}
export async function resolveModelCapability(input: {
	apiType: "openai-responses" | "anthropic-messages";
	baseUrl?: string;
	modelId: string;
}): Promise<ModelCapabilityRecommendation>;
```

- [ ] **Step 1: 写失败测试**（核心断言：未知模型走 `.*` 兜底 1M/128K；`glm-5.*flash.*` 命中 1M；`.*glm-5(?!.*flash).*` 对 glm-5 命中 200K 且对 glm-5-flash 不命中；`modelApiRules` 按协议收敛 `reasoningLevels`；`modelMatch` 忽略大小写；零网络——mock fetch 断言未被调用）

```ts
import { describe, expect, it, vi } from "vitest";
import { resolveModelCapability } from "../server/services/model-capability-rules";

describe("resolveModelCapability", () => {
	it("未知模型走 .* 兜底（1M/128K）", async () => {
		const r = await resolveModelCapability({ apiType: "openai-responses", modelId: "totally-unknown-model" });
		expect(r.contextWindow).toBe(1000000);
		expect(r.maxOutputTokens).toBe(131072);
		expect(r.matchedRule).toBe(".*");
	});
	it("glm-5-flash 命中 flash 规则（1M），glm-5.2 命中 200K 规则；大小写不敏感", async () => {
		const flash = await resolveModelCapability({ apiType: "openai-responses", modelId: "GLM-5-Flash" });
		expect(flash.contextWindow).toBe(1000000);
		const base = await resolveModelCapability({ apiType: "openai-responses", modelId: "glm-5.2" });
		expect(base.contextWindow).toBe(200000);
	});
	it("modelApiRules 按协议收敛 reasoningLevels", async () => {
		const r = await resolveModelCapability({ apiType: "anthropic-messages", modelId: "totally-unknown-model" });
		expect(r.reasoningLevels).toEqual(["disabled", "enabled"]);
	});
	it("零网络：fetch 未被调用（评审焦点 5）", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
		await resolveModelCapability({ apiType: "openai-responses", modelId: "glm-5.2" });
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test -- model-capability-rules`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现规则文件与引擎**

规则 JSON 按 spec 10.2 落盘；引擎核心（语义照抄 ZCode `ModelConfigRules.resolve`，文件头 ATTRIBUTION 注释见 spec 10.7）：

```ts
// server/services/model-capability-rules.ts
// 语义照抄自 zai-org/ZCode (Apache-2.0) packages/provider/src/config/model-config.ts ModelConfigRules.resolve
import rulesJson from "../config/model-capability-rules.json";

/** 深 overlay：undefined 继承上层，显式 null 清空该字段，对象递归合并。严禁浅 spread（spec 10.3）。 */
function deepOverlay<T extends Record<string, unknown>>(base: T, patch: Partial<T> | null | undefined): T {
	if (patch === undefined || patch === null) return base;
	const out: Record<string, unknown> = { ...base };
	for (const [k, v] of Object.entries(patch)) {
		if (v === undefined) continue; // 继承
		if (v === null) {
			delete out[k]; // 显式清空
		} else if (
			typeof v === "object" &&
			!Array.isArray(v) &&
			typeof out[k] === "object" &&
			out[k] !== null &&
			!Array.isArray(out[k])
		) {
			out[k] = deepOverlay(out[k] as Record<string, unknown>, v as Record<string, unknown>);
		} else {
			out[k] = v;
		}
	}
	return out as T;
}

function matchesRule(pattern: string, value: string, ignoreCase = false): boolean {
	return new RegExp(`^(?:${pattern})$`, ignoreCase ? "i" : undefined).test(value);
}

export async function resolveModelCapability(input: {
	apiType: "openai-responses" | "anthropic-messages";
	baseUrl?: string;
	modelId: string;
}): Promise<ModelCapabilityRecommendation> {
	let result: Record<string, unknown> = {
		contextWindow: 1000000,
		maxOutputTokens: 131072,
		inputModalities: ["text"],
		reasoningLevels: null,
	};
	let matchedRule = "";
	for (const rule of [...rulesJson.rules.modelRules, ...rulesJson.rules.modelApiRules]) {
		if (!matchesRule(rule.modelMatch, input.modelId, true)) continue;
		if ("apiTypeMatch" in rule && rule.apiTypeMatch !== undefined && rule.apiTypeMatch !== input.apiType) continue;
		result = deepOverlay(result, rule.config as Record<string, unknown>);
		matchedRule = rule.modelMatch;
	}
	return {
		modelId: input.modelId,
		contextWindow: result.contextWindow as number,
		maxOutputTokens: result.maxOutputTokens as number,
		inputModalities: result.inputModalities as string[],
		reasoningLevels: (result.reasoningLevels as string[] | null) ?? null,
		matchedRule,
	};
}
```

（JSON 导入需 tsconfig `resolveJsonModule`；若未开启则改用 `readFileSync` + `JSON.parse`，语义不变。）

- [ ] **Step 4: 实现 recommend-config 端点**

```ts
// server/routes/v1/model-providers/recommend-config.post.ts
import { defineEventHandler, readValidatedBody, createError } from "h3";
import { z } from "zod";
import { resolveModelCapability } from "../../../services/model-capability-rules";

const bodySchema = z.object({
	apiType: z.enum(["openai-responses", "anthropic-messages"]),
	baseUrl: z.string().url().optional(),
	models: z
		.array(z.object({ modelId: z.string().min(1).max(128) }))
		.min(1)
		.max(50),
});

export default defineEventHandler(async (event) => {
	const parsed = await readValidatedBody(event, (raw) => bodySchema.safeParse(raw));
	if (!parsed.success) {
		throw createError({
			statusCode: 400,
			data: { error: { code: "VALIDATION", message: parsed.error.issues.map((i) => i.message).join("; ") } },
		});
	}
	const recommendations = await Promise.all(
		parsed.data.models.map((m) =>
			resolveModelCapability({ apiType: parsed.data.apiType, baseUrl: parsed.data.baseUrl, modelId: m.modelId }),
		),
	);
	return { recommendations }; // 纯本地计算，零网络（spec 10.4）
});
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test -- model-capability-rules`
Expected: PASS 全绿。

- [ ] **Step 6: 提交（须用户授权）**

```bash
git add packages/ai-rag-api/server/config/ packages/ai-rag-api/server/services/model-capability-rules.ts packages/ai-rag-api/server/routes/v1/model-providers/recommend-config.post.ts packages/ai-rag-api/test/model-capability-rules.test.ts
git commit -m "feat(ai-rag-api): 模型能力规则引擎与推荐端点（拍板 D4）"
```

---

### Task 5: nitro 四个路由端点 + 测试连接探测

**Files:**

- Create: `packages/ai-rag-api/server/routes/v1/model-providers/index.get.ts`
- Create: `packages/ai-rag-api/server/routes/v1/model-providers/index.post.ts`
- Create: `packages/ai-rag-api/server/routes/v1/model-providers/[id].delete.ts`
- Create: `packages/ai-rag-api/server/routes/v1/model-providers/test-connection.post.ts`
- Create: `packages/ai-rag-api/server/services/connectivity-probe.ts`
- Test: `packages/ai-rag-api/test/model-provider-routes.test.ts`

**Interfaces:**

- Consumes: Task 2 schema、Task 3 仓储。
- Produces: spec 第六节契约的全部端点行为；`probeModels(req): Promise<{ ok: true; models: { id: string; displayName?: string }[] } | { ok: false; error: string }>`。

- [ ] **Step 1: 写失败测试**（路由层用 nitro 的 `describeHandler`/`$fetch` 集成测试或直接调用 handler 函数，按现有 `server/` 测试惯例选一；核心断言：409 映射、404 映射、zod 400、探测失败 200、**响应键集合无 `apiKey`（评审焦点 4）、baseUrl 尾斜杠规范化（评审焦点 2）**）

```ts
// 评审焦点 2 的探测单测（connectivity-probe 层）
import { describe, expect, it, vi } from "vitest";
import { probeModels } from "../server/services/connectivity-probe";

describe("probeModels baseUrl 规范化", () => {
	it("末尾斜杠不产生 //models", async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: "m-1" }] }) });
		vi.stubGlobal("fetch", fetchMock);
		await probeModels({ apiType: "openai-responses", baseUrl: "https://api.test.local/v1/" });
		expect(fetchMock.mock.calls[0][0]).toBe("https://api.test.local/v1/models");
	});
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test -- model-provider-routes`
Expected: FAIL。

- [ ] **Step 3: 实现 connectivity-probe**

```ts
import type { TestConnectionRequest } from "../contracts/model-provider";

/** 把任意 OpenAI/Anthropic 模型清单响应归一为 [{ id, displayName? }]；兼容 data[] 与 models{}。 */
function normalizeModelListing(body: unknown): { id: string; displayName?: string }[] {
	if (typeof body !== "object" || body === null) return [];
	const b = body as Record<string, unknown>;
	// OpenAI 兼容：{ data: [{ id, ... }] }
	if (Array.isArray(b.data)) {
		return b.data
			.filter(
				(m): m is Record<string, unknown> =>
					typeof m === "object" && m !== null && typeof (m as Record<string, unknown>).id === "string",
			)
			.map((m) => ({ id: m.id as string, displayName: typeof m.displayName === "string" ? m.displayName : undefined }));
	}
	// Anthropic 变体：{ models: { "<id>": { id?, display_name? }, ... } }
	if (typeof b.models === "object" && b.models !== null && !Array.isArray(b.models)) {
		return Object.entries(b.models as Record<string, Record<string, unknown>>).map(([key, m]) => ({
			id: typeof m.id === "string" ? m.id : key,
			displayName: typeof m.display_name === "string" ? m.display_name : undefined,
		}));
	}
	return [];
}

export async function probeModels(req: TestConnectionRequest) {
	const base = req.baseUrl.replace(/\/+$/, ""); // 评审焦点 2：去尾斜杠
	const url = req.apiType === "anthropic-messages" ? `${base.replace(/\/v1$/, "")}/v1/models` : `${base}/models`;
	const headers =
		req.apiType === "anthropic-messages"
			? { "x-api-key": req.apiKey ?? "", "anthropic-version": "2023-06-01" }
			: { Authorization: `Bearer ${req.apiKey ?? ""}` };
	try {
		const res = await fetch(url, { headers });
		if (!res.ok) return { ok: false as const, error: `HTTP ${res.status}` };
		const body = (await res.json()) as unknown;
		return { ok: true as const, models: normalizeModelListing(body) };
	} catch (e) {
		return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
	}
}
```

- [ ] **Step 4: 实现五个路由 handler**

五个 handler 同构（parse → 仓储调用 → 错误映射），以 `index.post.ts` 为例给出完整实现，其余四个按同构规则改写：

```ts
// server/routes/v1/model-providers/index.post.ts
import { defineEventHandler, readValidatedBody, createError, setResponseStatus } from "h3";
import { providerCreateCompleteSchema } from "../../../contracts/model-provider";
import { createProvider, ProviderConflictError } from "../../../services/model-provider-store";

export default defineEventHandler(async (event) => {
	const body = await readValidatedBody(event, (raw) => providerCreateCompleteSchema.safeParse(raw));
	if (!body.success) {
		throw createError({
			statusCode: 400,
			data: { error: { code: "VALIDATION", message: body.error.issues.map((i) => i.message).join("; ") } },
		});
	}
	const { apiKey, ...input } = body.data;
	try {
		const created = await createProvider(input);
		setResponseStatus(event, 201);
		return created; // { id, revision } —— 响应永不含 apiKey
	} catch (e) {
		if (e instanceof ProviderConflictError) {
			throw createError({ statusCode: 409, data: { error: { code: "CONFLICT", message: e.message } } });
		}
		throw e;
	}
});
```

同构规则（对照 spec 第六节表格）：

| handler                   | 校验 schema / 输入             | 调用                                   | 错误映射                                 |
| ------------------------- | ------------------------------ | -------------------------------------- | ---------------------------------------- |
| `index.get.ts`            | 无 body                        | `listProviders()`                      | Neon 异常如实 500（无静态兜底，拍板 D3） |
| `index.post.ts`           | `providerCreateCompleteSchema` | `createProvider(input)`（apiKey 必填） | 400 / 409                                |
| `[id].delete.ts`          | 路由参数 id                    | `deleteProvider(id)`                   | 404 → `{ code: 'NOT_FOUND' }`；成功 204  |
| `test-connection.post.ts` | `testConnectionRequestSchema`  | `probeModels(req)`                     | 探测失败也是 200 `{ ok: false, error }`  |

所有 handler 禁止把输入对象原样序列化进响应或日志（common 仓库凭据卫生铁律的移植）。

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test`
Expected: 全部 PASS（含 Task 2/3/4 前序测试无回归）。

- [ ] **Step 6: 提交（须用户授权）**

```bash
git add packages/ai-rag-api/server/routes/v1/model-providers/ packages/ai-rag-api/server/services/connectivity-probe.ts packages/ai-rag-api/test/model-provider-routes.test.ts
git commit -m "feat(ai-rag-api): 模型配置四端点与连接探测"
```

---

### Task 6: 存量迁移（静态 provider 入库 + 环境变量废除 + 文档更新）

> 依据 spec 9.2 存量迁移清单与 9.3 文档排查清单（2026-11-11 排查代理产出）。**凭据卫生关键顺序：先让 key 进 Neon、验证切换成功，最后才清理 Vercel 遗留环境变量（现行生产密钥在 Worker `small-alice-web-api`，不等于删 Vercel 即删生产密钥）——真实 key 全程不进 git、不进仓库文档。**

**Files:**

- Create: `packages/ai-rag-api/scripts/seed-static-providers.ts`（种子脚本，从 env 读值写库，幂等）
- Modify: `packages/ai-rag-api/server/plugins/rag.ts:17-18,34-45`（envFieldMap 与 overlay：key 来源改 Neon）
- Modify: `packages/ai-rag-api/server/cli/local-sync.ts:55-56`（process.env 直读改 Neon）
- Modify: `packages/ai-rag-api/src/runtime-config.ts:20-21` 与 `packages/ai-rag-api/nitro.config.ts:18-19`（删 `openaiApiKey`/`anthropicApiKey` 两字段及「Vercel NITRO\_\* 覆盖」注释）
- Modify: `packages/ai-rag-api/src/llm-config.ts`（静态注册表退役，`RagLlmProtocol` 等类型保留）
- Modify: `packages/ai-rag-api/server/routes/v1/models.get.ts`（改查 Neon `listProviders`，保持 `payload.data.models` 兼容形状，删 `ragLlmConfig` 注册表读取）
- Modify: `packages/ai-rag-api/server/contracts/chat.ts:25` + `packages/ai-rag-api/server/routes/v1/chat.post.ts`（provider 校验动态化：`string` + Neon 存在性，未知 400、缺省回退保留）
- Modify: `docs/about/rag-embedding-cost.md:78`（env 清单页：删两个 NITRO\_\*\_API_KEY，改「LLM key 存 Neon」）
- Modify: `openspec/specs/ai-rag/deployment/spec.md:180-190`（MUST 条款重写：key 明文存 Neon、环境变量废除、门禁语义保留）
- Modify: `openspec/specs/ai-rag/chat-api/spec.md:138-142`（Scenario：激活 provider 数据库无 key 时 MUST 阻止装配）
- Modify: `.github/workflows/rag-sync-schedule.yaml:47`（删 `NITRO_ANTHROPIC_API_KEY` secrets 注入行；同步删 GitHub Secrets 两条目——云端操作须用户在场）
- 处置: 本地 `.env*` 快照文件（`vercel env pull` 产物，gitignore 保护）在 env 删除后重拉或手删

**Interfaces:**

- Consumes: Task 3 的 `resolveProviderForChat(providerId, modelId)`。
- Produces: chat 链路 key 来源 = Neon（`plugins/rag.ts` 的配置形状不变，仅数据源切换）；`rag-assembly.ts` 门禁与 `createModel` factory 形状不变（503/500 语义不变）。
- Produces: `/v1/models` 响应保持 `payload.data.models` 兼容形状（宿主零改动）。
- Produces: chat 契约 provider 校验动态化，400 / 回退错误语义不变。

- [ ] **Step 1: 写种子脚本并执行（此步必须在删 Vercel env 之前）**

`scripts/seed-static-providers.ts` 骨架：

```ts
// 从现有 Vercel env 读值 → 幂等写入 Neon；真实 key 不出现在任何仓库文件中
import postgres from "postgres";
// DATABASE_URL 取自本地 env；两个 key 取 process.env.NITRO_OPENAI_API_KEY / NITRO_ANTHROPIC_API_KEY
// 两个 provider 元数据（id/baseUrl/apiType/模型清单）与 llm-config.ts 现值一致：
//   openai    → openai-responses    / https://api.code-tab.com/v1 / gpt-5.6-luna
//   anthropic → anthropic-messages  / https://api.code-tab.com/v1 / claude-sonnet-5[1m]
// INSERT ... ON CONFLICT (id) DO NOTHING（幂等，评审焦点 3）
```

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api exec tsx scripts/seed-static-providers.ts`
Expected: 退出码 0；重复执行一次后 `SELECT count(*) FROM model_providers` 不变（幂等）。

- [ ] **Step 2: chat 链路切换到 Neon 取 key**

`server/plugins/rag.ts`：envFieldMap（:17-18）与 overlay（:34-45）改为「按激活 provider 调 `resolveProviderForChat`」——返回的 `{apiKey, baseUrl, apiType}` 填入原配置形状；Worker `__env__` 兼容通道（:26 附近 `readWorkerEnv`）随本次改造一并移除 key 字段。`server/cli/local-sync.ts:55-56` 同步改为从 Neon 读（仅需 DATABASE_URL）。

- [ ] **Step 3: 清理环境变量合同、静态注册表，并落地 `/v1/models` 迁移与 chat 契约动态化**

- `runtime-config.ts:20-21` 删 `openaiApiKey`/`anthropicApiKey`；`nitro.config.ts:18-19` 删对应默认值与「Vercel NITRO\_\* 覆盖」注释。
- `llm-config.ts`：删 `ragLlmConfig` 静态注册表与 `getRagLlmConfigById`/`getActiveRagLlmConfig` 的静态读取（改为从 Task 3 仓储查 Neon）；`RagLlmProtocol`/`RagLlmProviderConfig` 类型与「无 key 抛 not configured」门禁语义保留（`rag-assembly.ts:143-153,160-186` 不动，503/500 语义不变）。
- `server/routes/v1/models.get.ts`：改查 Neon `listProviders`，响应保持 `payload.data.models` 兼容形状，删 `ragLlmConfig` 注册表读取；模型映射为 `AiChatModelOption { id, label, model }`。
- `server/contracts/chat.ts` 与 `server/routes/v1/chat.post.ts`：provider 校验动态化（`string` + Neon 存在性，未知 400、缺省回退保留；改前先读 `chat.ts` 全文确认 `model` 字段现状）。

- [ ] **Step 4: 更新过时文档（按 9.3 清单）**

更新 4 个必改项（上表 3 个文档 + workflow yaml）并清理本地 `.env*` 快照；`docs/superpowers/` 历史设计稿、`openspec/changes/archive/`、`reports/` 历史报告默认不改（历史记录性质），是否补「已废除」注由实施会话与用户确认。

- [ ] **Step 5: 验证切换成功**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test && pnpm --filter @ruan-cat-drill-doc/ai-rag-api typecheck`
再实测：本地 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api dev` 起服后发一条 chat 请求。
Expected: 测试全绿；chat 请求成功（key 来自 Neon）。

- [ ] **Step 6: 验证 `/v1/models` 返回动态清单**

本地 `pnpm --filter @ruan-cat-drill-doc/ai-rag-api dev` 起服后请求 `GET /v1/models`（curl 或现有测试通道）。
Expected: 返回 Neon 动态 provider 清单（含种子 2 provider），响应保持 `payload.data.models` 兼容形状。

- [ ] **Step 7: 验证 chat 契约动态化**

用未注册的非法 provider id 发一条 chat 请求（命令示例一律占位 key）。
Expected: 得 400；不传 provider 的缺省请求回退 `activeProvider` 仍成功。

- [ ] **Step 8: 清理 Vercel 遗留环境变量（云端副作用，须用户在场确认）**

删除 Vercel 项目 `smallalice-docs-ai-nitro-api` 内仍残留的 `NITRO_OPENAI_API_KEY` 与 `NITRO_ANTHROPIC_API_KEY`（生产已迁 Worker `small-alice-web-api`，本步仅去 Vercel 遗留配置）；同步删除 GitHub Secrets 中对应条目。不得误以为删除 Vercel 变量即撤销 Worker/Neon 上的现行生产密钥。

- [ ] **Step 9: 提交（须用户授权）**

```bash
git add packages/ai-rag-api/ docs/about/rag-embedding-cost.md openspec/ .github/workflows/rag-sync-schedule.yaml
git commit -m "feat(ai-rag-api): LLM key 迁移至 Neon，废除环境变量注入"
```

---

### Task 7: ai-vue 模型设置弹窗组件

**Files:**

- Create: `packages/ai-vue/src/components/ai-chat/parts/ModelSettingsDialog.vue`（文件名裁定：保留，职责收敛为遮罩外壳 + 编排）
- Create: `packages/ai-vue/src/components/ai-chat/parts/ModelRowCard.vue`
- Create: `packages/ai-vue/src/components/ai-chat/parts/CandidatePicker.vue`
- Create: `packages/ai-vue/src/components/ai-chat/parts/ModelChipToggle.vue`
- Create: `packages/ai-vue/src/components/ai-chat/parts/useProviderDraftCard.ts`
- Modify: `packages/ai-vue/src/styles/index.scss` 与 `packages/ai-vue/src/styles/shadow-scoped.ts`（分节注释两份同步）
- Test: `packages/ai-vue/src/components/ai-chat/parts/__tests__/ModelSettingsDialog.test.ts`

**Interfaces:**

- Consumes: 宿主注入的 api 适配器（spec 7.3：ai-vue 零 fetch，一切网络请求在宿主执行）。
- Produces: `ModelSettingsDialog` 组件——props 注入宿主实现的适配器 `ModelConfigApi { listProviders; createProvider; deleteProvider; testConnection; recommendConfig }` 与状态 `{ open, providers }`；emits `['update:open', 'saved', 'request-recommend']`（`request-recommend` 携带 modelId 集合，宿主执行 recommend-config 后经 props 回传）。
- 硬约束：组件与 composable 内禁止出现 `fetch` / `import.meta.env`。

- [ ] **Step 1: 写失败组件测试**（jsdom + @vue/test-utils，按 ai-vue 现有测试写法；按 `ms4-model-picker.test.ts` 先例对用到的 element-plus 组件统一 `vi.mock` stub——jsdom 下 element-plus CSS 会炸。核心断言：非法 id / 非 http(s) baseUrl / 空模型列表时点击提交不调用注入的 api 适配器；合法输入调用一次 `createProvider` 且请求体经 complete schema 等价校验；apiKey 输入框 type 为 password；**输入 modelId 停止输入 1.2 秒后 emit 一次 `request-recommend` 且推荐值进入 placeholder（拍板 D4，spec 10.5）；用户已覆盖的字段不被推荐值冲掉（spec 验收 11）**。补充断言三条：ESC 关闭遮罩；防抖 1.2s 后 emit `request-recommend` 且组件内无 fetch；叶子组件（ModelRowCard / CandidatePicker / ModelChipToggle）单模板可独立测）

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-vue test -- ModelSettingsDialog`
Expected: FAIL。

- [ ] **Step 3: 实现组件**

结构（element-plus 轻量路线，对照 spec 7.1）：

1. **外壳**：原生 div 遮罩 + ESC 关闭（对齐 `AiModalChat.vue` 先例，不引入 `el-dialog`）；遮罩容器层 shadow / light 双模板分支，叶子组件单模板纯受控。
2. **表单**：单个 `el-form` + `el-divider` 分组；校验为纯函数——直接 `safeParse` Task 2 的 zod schema（前后端共用同一份契约）；`computed ready` 就绪门 + 只提示下一个未满足项的 hint。
3. **字段控件**：数字字段（contextWindow / maxOutputTokens）用 `el-input` + 原生 placeholder 填推荐值（禁 `el-input-number`）；能力开关用 `el-checkbox-group` + `el-checkbox-button` chip；reasoning 档位内联增删改（不做拖拽）；apiKey 用 `el-input show-password`（必填，提交后不回显）。
4. **模型区**：`v-for` 渲染 `ModelRowCard` 行卡片（禁 `el-table`）+ `CandidatePicker` 候选拉取（probe 由宿主执行后经 props 回传）。
5. **composable**：`useProviderDraftCard`（draft / dirty / markDirty / commitIfChanged / 1.2s idle 防抖 / 卸载兜底 flush / IME 守卫）；推荐联动到期 emit `request-recommend`，请求由宿主执行（spec 7.3）。

```vue
<script setup lang="ts">
// props: { open, providers, api: ModelConfigApi }（宿主注入，spec 7.3；组件内禁止 fetch / import.meta.env）
// 表单状态：displayName / id(自动 kebab 生成可改) / apiType / baseUrl / apiKey(show-password)
// 校验：纯函数 safeParse(Task 2 zod schema)；computed ready 就绪门 + 下一未满足项 hint
// 推荐联动（spec 10.5）：useProviderDraftCard 1.2s idle + blur/提交 flush + IME 守卫
//   → 到期 emit request-recommend(modelId 集合)，宿主调 recommend-config 后经 props 回传
//   → 推荐值进 placeholder（不回填 value）；overrideFields 集合追踪用户手动覆盖，覆盖后推荐不冲掉
//   →「智能推荐」开关（默认开），关闭即纯手动；勾选远端模型后的批量补推荐由宿主执行
// 提交：经注入的 api.createProvider（请求体先过 complete schema safeParse）；apiKey 提交前 trim（评审焦点 1 的前端侧）
// 契约 schema 的 import 路径：从 ai-rag-api 包导出（包内 contracts 模块加入 package.json exports），
//   或将 schema 文件复制为共享模块——以仓库现有跨包共享方式为准，二选一，实施时先调研再定
</script>
<template>
	<!-- shadow 分支与 light 分支各自的原生 div 遮罩容器（对齐 AiModalChat.vue 先例），ESC 关闭 -->
	<div class="ai-chat-modal-mask" @keydown.esc="emit('update:open', false)">
		<el-form> <!-- 单 el-form + el-divider 分组，纯函数校验 --> </el-form>
		<CandidatePicker :api="api" @picked="onPicked" />
		<!-- probe 由宿主执行 -->
		<ModelRowCard v-for="m in draftModels" :key="m.modelId" :model="m" />
		<!-- 行卡片，禁 el-table -->
	</div>
</template>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-vue test -- ModelSettingsDialog`
Expected: PASS。

- [ ] **Step 5: 提交（须用户授权）**

```bash
git add packages/ai-vue/src/components/ai-chat/parts/ packages/ai-vue/src/styles/
git commit -m "feat(ai-vue): 模型设置弹窗组件"
```

---

### Task 8: AiChat 切换器（MS-4 增量演进）与入口集成

**Files:**

- Modify: `packages/ai-vue/src/components/ai-chat/AiChat.vue`（双分支定点插入，不重写）
- Modify: `packages/ai-vue/src/components/ai-chat/AiChatFloatingButton.vue`（header 设置入口）
- 不改（按 spec 7.4 裁定显式不渲染处理）：`packages/ai-vue/src/components/ai-modal-chat/AiModalChat.vue` / `packages/ai-vue/src/components/ai-sidebar-chat/AiSidebarChat.vue`（本期零透传，不渲染切换器与设置入口）
- Create: `packages/ai-vue/src/components/ai-chat/parts/ComposerModelPicker.vue`
- Modify: `packages/ai-vitepress-plugins/src/client/composables/useKnowledgeChat.ts`（宿主扩展，见 Step 4）
- Create: 宿主侧 api 模块（如 `packages/ai-vitepress-plugins/src/client/api/modelConfig.ts`，落点随宿主现有请求封装）

服务端改动归 Task 6（chat 契约动态化与 `/v1/models` 迁移），本任务不碰 `packages/ai-rag-api`。

**Interfaces:**

- Consumes: Task 5 的 `GET /v1/model-providers`（返回含迁入种子的 provider），经宿主 `listProviders()` 适配注入。
- Produces: 挂件内经 `ComposerModelPicker` 切换模型——MS-4 props / emit 契约不变，option value 语义升级为 `providerId/modelId`；持久化写宿主现有键 `ai-chat-provider`（结构 `{ providerId, modelId }`，旧字符串值读取时回退默认）。

- [ ] **Step 1: 写失败测试**（AiChat 现有测试文件追加；断言：MS-4 收到含动态 provider 的 models 映射（`AiChatModelOption[] { id, label, model }`）；切换器在 shadow / light 双分支渲染；持久化写在宿主键 `ai-chat-provider`（ai-vue 组件内不出现 localStorage 调用））

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-vue test`
Expected: 新增断言 FAIL。

- [ ] **Step 3: 实现集成（MS-4 增量演进，对照 spec 7.2）**

- props / emit 契约不动：保留 `models` / `selectedModelId` props 与 `select-model` emit；option value 语义升级为 `providerId/modelId`。
- 新增 `ComposerModelPicker.vue`：自研触发器 + `el-popover`（`:teleported="false"`）自渲染 provider 分组列表 + `el-input` 搜索框（仅候选 >4 条时显示）；首版即替换 `el-segmented` 主路径（种子 2 个 provider 分组是硬需求）。
- `el-segmented` 保留为「单 provider 且候选 ≤4」的降级渲染分支。
- 选中值仍走 `select-model` emit；chat 请求体携带 `providerId` / `modelId`（服务端解析只查 Neon，未命中按现有非法 provider 错误路径；服务端改动归 Task 6）。
- `AiChatFloatingButton.vue` header 文本按钮「模型设置」打开 Task 7 弹窗，`saved` 事件刷新列表；按 spec 7.4 裁定，`AiModalChat` / `AiSidebarChat` 本期不渲染切换器与设置入口。

- [ ] **Step 4: 宿主 `useKnowledgeChat.ts` 扩展（对照 spec 7.3）**

新增函数清单：

- `listProviders()`：`GET /v1/model-providers`
- `createProvider` / `deleteProvider` / `testConnection` / `recommendConfig`：POST 对应端点（`/v1/model-providers`、`/v1/model-providers/:id`、`/v1/model-providers/test-connection`、`/v1/model-providers/recommend-config`）
- `mapProvidersToChatOptions()`：Neon providers → `AiChatModelOption[] { id, label, model }` 喂 MS-4 props
- `persistModelSelection()`：写宿主现有键 `ai-chat-provider`（结构 `{ providerId, modelId }`）
- chat 请求体携带 `providerId` / `modelId`

注意事项：显式传 `options.api` 会跳过自动 `loadModels`（`useKnowledgeChat.ts:194`）——扩展时保持默认加载路径或显式接管；`conversationId` 硬编码 `knowledge-chat`，勿顺手破坏。

- [ ] **Step 5: 跑测试确认通过 + 双包 typecheck + 样式双份比对**

Run: `pnpm --filter @ruan-cat-drill-doc/ai-vue test && pnpm --filter @ruan-cat-drill-doc/ai-vue typecheck && pnpm --filter @ruan-cat-drill-doc/ai-rag-api typecheck`
Expected: PASS / 零错误。
样式比对：本任务新增样式在 `packages/ai-vue/src/styles/index.scss` 与 `packages/ai-vue/src/styles/shadow-scoped.ts` 双份均存在（diff 比对两份分节注释同步）。

- [ ] **Step 6: 提交（须用户授权）**

```bash
git add packages/ai-vue/src/components/ai-chat/ packages/ai-vitepress-plugins/src/client/
git commit -m "feat: 挂件内模型动态切换与设置入口"
```

---

### Task 9: 端到端验收（对照 spec 第八节）

**Files:** 无新文件；产出验收记录（会话内汇报，不写仓库文档）。

- [ ] **Step 1: 迁移与表结构核对** — spec 验收 1。
- [ ] **Step 2: 全 API 行为走查** — spec 验收 2/4/6/7/10（用 curl 或现有 API 测试通道，curl 端点全部为 `/v1/model-providers*`；凭据卫生：命令示例一律占位 key）。种子迁移验收（spec 验收 3）已在 Task 6 Step 1/5 覆盖。
- [ ] **Step 3: 前端交互走查** — spec 验收 5/8/11/12/13/14/15（VitePress 本地起挂件依次验证：表单纯函数校验提示、动态模型发消息、推荐联动 placeholder、双分支双样式同步、容器行为（spec 7.4 裁定）、`/v1/models` 迁移、chat 契约动态化；浏览器操作遵守用户既有的浏览器可见性偏好）。
- [ ] **Step 4: 全量构建与测试** — spec 验收 9。

Run: `pnpm --filter @ruan-cat-drill-doc/ai-rag-api test && pnpm --filter @ruan-cat-drill-doc/ai-vue test && pnpm --filter @ruan-cat-drill-doc/ai-vue typecheck && pnpm --filter @ruan-cat-drill-doc/ai-rag-api typecheck`
Expected: 全绿零错误。

- [ ] **Step 5: 向用户汇报验收证据**（命令输出 + 截图或日志），等待用户确认后完成收尾提交。
