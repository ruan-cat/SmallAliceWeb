import { createApp, defineEventHandler } from "nitro/h3";
import { describe, expect, test } from "vitest";
import {
	chatRequestSchema,
	handleChatRequest,
	type ChatStreamRequest,
} from "../server/contracts/chat";
import {
	createRagRuntimeContext,
	RagProviderNotConfiguredError,
	RagRuntimeNotConfiguredError,
	type RagRuntimeConfig,
	type RagRuntimeContext,
	type RagRuntimeProviderFactories,
} from "../server/runtime/rag-assembly";
import chatRoute from "../server/routes/v1/chat.post";

/** MS-2: 构造两个 provider 都配置了 key 的完整 RAG runtime。 */
function makeFullConfig(): RagRuntimeConfig {
	return {
		databaseUrl: "postgres://fake",
		syncDatabaseUrl: "postgres://sync-fake",
		embeddingModel: "embedding-fake",
		rerankerMode: "disabled",
		rerankerProvider: "",
		rerankerModel: "",
		rerankerVersion: "",
		rerankerCandidateLimit: 20,
		rerankerMaxInputTokens: 2000,
		rerankerTimeoutMs: 800,
		rerankerMaxCostUsd: 0,
		openaiApiKey: "openai-key-fake",
		anthropicApiKey: "anthropic-key-fake",
		knowledgeSyncToken: "sync-fake",
		cronSecret: "cron-fake",
		public: { apiBase: "/v1" },
	};
}

/** MS-2: 构造双 provider 都返回可识别流的 factory（每个 provider 一行 stdout）。 */
function makeDualModelFactories() {
	const calls: string[] = [];
	const factories: RagRuntimeProviderFactories = {
		createDatabase: async () => ({
			lexicalSearch: async () => [],
			vectorSearch: async () => [],
		}),
		createEmbedding: async () => ({ createEmbedding: async () => [0.1, 0.2] }),
		createModel: async (input) => {
			calls.push(`model:${input.provider.id}`);
			return {
				stream: (request: ChatStreamRequest) => {
					// 把所选 provider 写到响应首字节便于测试断言。
					return new Response(`0:"${input.provider.id}:${request.provider ?? "default"}"\n`, {
						headers: {
							"content-type": "text/plain; charset=utf-8",
							"x-vercel-ai-data-stream": "v1",
						},
					});
				},
			};
		},
		createSync: async () => ({ sync: async () => ({ ok: true }), syncRuns: async () => [] }),
	};
	return { calls, factories };
}

const fakeSource = {
	id: "chunk-1",
	content: "RAG source",
	score: 0.9,
	sourcePath: "docs/guide.md",
	headingPath: ["Guide"],
	headingIndex: 0,
	headingAnchor: "guide",
	chunkIndex: 0,
	imageUrls: [],
};

async function installRuntime(
	app: ReturnType<typeof createApp>,
	path: string,
	context: RagRuntimeContext,
) {
	app.use(
		path,
		defineEventHandler((event) => {
			event.context.rag = context;
		}),
	);
}

describe("MS-2 模型切换 schema 校验", () => {
	test("合法 provider 字段（anthropic / openai）通过校验", () => {
		expect(chatRequestSchema.parse({ message: "hi", provider: "anthropic" }).provider).toBe("anthropic");
		expect(chatRequestSchema.parse({ message: "hi", provider: "openai" }).provider).toBe("openai");
	});

	test("provider 字段可选：缺失时 undefined（由装配层回退 activeProvider）", () => {
		const parsed = chatRequestSchema.parse({ message: "hi" });
		expect(parsed.provider).toBeUndefined();
	});

	test("非法 provider 字段由 zod enum 直接拒绝（spec 12.2 / plan 16.8 V3 → 400）", () => {
		expect(() => chatRequestSchema.parse({ message: "hi", provider: "google" })).toThrow();
		expect(() => chatRequestSchema.parse({ message: "hi", provider: "" })).toThrow();
		expect(() => chatRequestSchema.parse({ message: "hi", provider: "ANTHROPIC" })).toThrow();
		expect(() => chatRequestSchema.parse({ message: "hi", provider: 123 })).toThrow();
	});
});

describe("MS-2 双 adapter 装配与分发", () => {
	test("装配阶段为所有有 key 的 provider 构造 adapter；缺 key 的 provider 不构造", async () => {
		const { calls, factories } = makeDualModelFactories();
		const context = await createRagRuntimeContext(
			makeFullConfig(),
			factories,
		);
		// activeProvider=anthropic + openai 都有 key → 两个 adapter 都构造
		expect(calls.sort()).toEqual(["model:anthropic", "model:openai"]);

		// 缺 openaiApiKey 时只构造 anthropic adapter
		const partialConfig: RagRuntimeConfig = { ...makeFullConfig(), openaiApiKey: "" };
		const partial = await createRagRuntimeContext(partialConfig, makeDualModelFactories().factories);
		const streamRequest: ChatStreamRequest = {
			message: "hi",
			sources: [],
			system: "",
		};
		const anthropicText = await (await partial.stream({ ...streamRequest, provider: "anthropic" })).text();
		expect(anthropicText).toBe('0:"anthropic:anthropic"\n');
		// 缺 key 的 provider 请求应抛 RagProviderNotConfiguredError
		await expect(partial.stream({ ...streamRequest, provider: "openai" })).rejects.toBeInstanceOf(
			RagProviderNotConfiguredError,
		);
	});

	test("stream 缺省回退 activeProvider（spec Requirement 8）", async () => {
		const { factories } = makeDualModelFactories();
		const context = await createRagRuntimeContext(makeFullConfig(), factories);
		const streamRequest: ChatStreamRequest = {
			message: "hi",
			sources: [],
			system: "",
		};
		// request.provider 缺省时由装配层回退到 activeProvider="anthropic"
		const text = await (await context.stream(streamRequest)).text();
		expect(text).toBe('0:"anthropic:default"\n');
	});

	test("显式 provider 字段正确路由到对应 adapter", async () => {
		const { factories } = makeDualModelFactories();
		const context = await createRagRuntimeContext(makeFullConfig(), factories);
		const streamRequest: ChatStreamRequest = {
			message: "hi",
			sources: [],
			system: "",
		};
		const openaiText = await (await context.stream({ ...streamRequest, provider: "openai" })).text();
		expect(openaiText).toBe('0:"openai:openai"\n');
		const anthropicText = await (await context.stream({ ...streamRequest, provider: "anthropic" })).text();
		expect(anthropicText).toBe('0:"anthropic:anthropic"\n');
	});

	test("RagProviderNotConfiguredError 携带 provider id 与 status 500", () => {
		const error = new RagProviderNotConfiguredError("openai");
		expect(error).toBeInstanceOf(Error);
		expect(error.provider).toBe("openai");
		expect(error.status).toBe(500);
		expect(error.code).toBe("RAG_PROVIDER_NOT_CONFIGURED");
		expect(error.message).toBe("RAG provider openai not configured");
	});
});

describe("MS-2 chat HTTP 路由与契约集成", () => {
	test("POST /v1/chat 携带合法 provider:openai → 走 openai adapter 流式响应", async () => {
		const { factories } = makeDualModelFactories();
		const context = await createRagRuntimeContext(makeFullConfig(), factories);

		const app = createApp();
		await installRuntime(app, "/v1/chat", context);
		app.use("/v1/chat", chatRoute);

		const response = await app.fetch(
			new Request("http://localhost/v1/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: "RAG", provider: "openai" }),
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('0:"openai:openai"\n');
	});

	test("POST /v1/chat 携带非法 provider:google → 返回 400 与统一错误体", async () => {
		const { factories } = makeDualModelFactories();
		const context = await createRagRuntimeContext(makeFullConfig(), factories);

		const app = createApp();
		await installRuntime(app, "/v1/chat", context);
		app.use("/v1/chat", chatRoute);

		const response = await app.fetch(
			new Request("http://localhost/v1/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: "RAG", provider: "google" }),
			}),
		);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			success: false,
			code: 400,
			message: "对话请求无效",
			data: null,
		});
	});

	test("POST /v1/chat provider 字段缺省 → 回退 activeProvider（anthropic）", async () => {
		const { factories } = makeDualModelFactories();
		const context = await createRagRuntimeContext(makeFullConfig(), factories);

		const app = createApp();
		await installRuntime(app, "/v1/chat", context);
		app.use("/v1/chat", chatRoute);

		const response = await app.fetch(
			new Request("http://localhost/v1/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: "RAG" }),
			}),
		);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('0:"anthropic:default"\n');
	});

	test("POST /v1/chat 选择未配置 key 的 provider → 500 + 可识别 message（spec Requirement 8）", async () => {
		const { factories } = makeDualModelFactories();
		// 只配 anthropic key，openai adapter 不构造
		const partialConfig: RagRuntimeConfig = { ...makeFullConfig(), openaiApiKey: "" };
		const context = await createRagRuntimeContext(partialConfig, factories);

		const app = createApp();
		await installRuntime(app, "/v1/chat", context);
		app.use("/v1/chat", chatRoute);

		const response = await app.fetch(
			new Request("http://localhost/v1/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: "RAG", provider: "openai" }),
			}),
		);
		expect(response.status).toBe(500);
		expect(await response.json()).toEqual({
			success: false,
			code: 500,
			message: "RAG provider openai not configured",
			data: null,
		});
	});

	test("缺 activeProvider key 时仍抛 RagRuntimeNotConfiguredError（503 守卫行为不变）", async () => {
		const { factories } = makeDualModelFactories();
		// activeProvider=anthropic 缺 key → 必须 503（保留装配守卫纪律）
		const noActiveConfig: RagRuntimeConfig = { ...makeFullConfig(), anthropicApiKey: "" };
		await expect(createRagRuntimeContext(noActiveConfig, factories)).rejects.toBeInstanceOf(
			RagRuntimeNotConfiguredError,
		);
	});

	test("handleChatRequest 在 stream 抛出 RagProviderNotConfiguredError 时仍返回 500 + 可识别 message", async () => {
		// 直接调用 handleChatRequest，绕过路由；模拟 stream 抛出 RagProviderNotConfiguredError
		const error = new RagProviderNotConfiguredError("openai");
		const result = await handleChatRequest(
			{ message: "RAG", provider: "openai" },
			{
				retrieve: async () => [],
				stream: () => {
					throw error;
				},
			},
		);
		expect(result).toEqual({
			status: 500,
			body: {
				success: false,
				code: 500,
				message: "RAG provider openai not configured",
				data: null,
			},
		});
	});
});

// suppress unused warning for fakeSource 顶层（保留供后续用例扩展）
void fakeSource;