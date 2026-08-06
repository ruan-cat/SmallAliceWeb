import { readFile } from "node:fs/promises";
import { createApp, defineEventHandler } from "nitro/h3";
import { describe, expect, test } from "vitest";
import type { RagRuntimeConfig, RagRuntimeContext, RagRuntimeProviderFactories } from "../server/runtime/rag-assembly";
import { createRagRuntimeContext, RagRuntimeNotConfiguredError } from "../server/runtime/rag-assembly";
import type { HybridSearchItem } from "../server/search/hybrid-search";
import chatRoute from "../server/routes/v1/chat.post";
import searchRoute from "../server/routes/v1/search.post";
import syncPostRoute from "../server/routes/v1/knowledge/sync.post";

const source: HybridSearchItem = {
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

function makeConfig(overrides: Partial<RagRuntimeConfig> = {}): RagRuntimeConfig {
	return {
		databaseUrl: "postgres://fake",
		embeddingModel: "embedding-fake",
		openaiApiKey: "key-fake",
		baseUrl: "",
		chatModel: "chat-fake",
		knowledgeSyncToken: "sync-fake",
		cronSecret: "cron-fake",
		public: { apiBase: "/v1" },
		...overrides,
	};
}

function makeFactories(overrides: Partial<RagRuntimeProviderFactories> = {}): RagRuntimeProviderFactories {
	return {
		createDatabase: async () => ({
			lexicalSearch: async () => [source],
			vectorSearch: async () => [source],
		}),
		createEmbedding: async () => ({ createEmbedding: async () => [0.1, 0.2] }),
		createModel: async () => ({
			stream: () =>
				new Response('0:"answer"\n', {
					headers: {
						"content-type": "text/plain; charset=utf-8",
						"x-vercel-ai-data-stream": "v1",
					},
				}),
		}),
		createSync: async () => ({
			sync: async ({ dryRun }) => ({ accepted: true, dryRun }),
			syncRuns: async () => [{ id: "run-1" }],
		}),
		...overrides,
	};
}

async function installContext(app: ReturnType<typeof createApp>, path: string, context: RagRuntimeContext) {
	app.use(
		path,
		defineEventHandler((event) => {
			event.context.rag = context;
		}),
	);
}

describe("RAG runtime assembly", () => {
	test("完整 fake factories 生成路由所需的 context，并注入只读配置", async () => {
		const calls: string[] = [];
		const context = await createRagRuntimeContext(
			makeConfig(),
			makeFactories({
				createDatabase: async (input) => {
					calls.push("database:" + input.databaseUrl);
					return { lexicalSearch: async () => [source], vectorSearch: async () => [source] };
				},
				createEmbedding: async (input) => {
					calls.push("embedding:" + input.model);
					return { createEmbedding: async () => [0.1, 0.2] };
				},
				createModel: async (input) => {
					calls.push("model:" + input.model);
					return {
						stream: () =>
							new Response('0:"answer"\n', {
								headers: {
									"content-type": "text/plain; charset=utf-8",
									"x-vercel-ai-data-stream": "v1",
								},
							}),
					};
				},
				createSync: async () => {
					calls.push("sync");
					return { sync: async () => ({ ok: true }), syncRuns: async () => [] };
				},
			}),
		);

		expect(calls).toEqual(["database:postgres://fake", "embedding:embedding-fake", "model:chat-fake", "sync"]);
		expect(context.config).toEqual({ apiBase: "/v1", syncToken: "sync-fake", cronSecret: "cron-fake" });
		expect(() => ((context.config as unknown as { apiBase: string }).apiBase = "/other")).toThrow();
		expect(await context.search("RAG", { limit: 1, k: 60 })).toHaveLength(1);
		expect(await context.retrieve("RAG", { limit: 1 })).toHaveLength(1);
		expect(await context.sync({ dryRun: true })).toEqual({ ok: true });
		expect(await context.syncRuns({ limit: 1 })).toEqual([]);
	});

	test("provider 方法依赖 this 时，assembly wrapper 保留调用接收者", async () => {
		class ThisDatabaseProvider {
			readonly marker = "database-this";

			async lexicalSearch() {
				return this.marker ? [source] : [];
			}

			async vectorSearch() {
				return this.marker ? [source] : [];
			}
		}

		class ThisEmbeddingProvider {
			readonly values = [0.1, 0.2];

			async createEmbedding() {
				return [...this.values];
			}
		}

		class ThisModelProvider {
			readonly answer = "this-answer";

			stream() {
				return new Response(`0:"${this.answer}"\n`, {
					headers: {
						"content-type": "text/plain; charset=utf-8",
						"x-vercel-ai-data-stream": "v1",
					},
				});
			}
		}

		class ThisSyncProvider {
			readonly marker = "sync-this";

			async sync(input: { dryRun: boolean }) {
				return { provider: this.marker, dryRun: input.dryRun };
			}

			async syncRuns() {
				return [{ provider: this.marker }];
			}
		}

		const context = await createRagRuntimeContext(
			makeConfig(),
			makeFactories({
				createDatabase: () => new ThisDatabaseProvider(),
				createEmbedding: () => new ThisEmbeddingProvider(),
				createModel: () => new ThisModelProvider(),
				createSync: () => new ThisSyncProvider(),
			}),
		);

		expect(await context.search("RAG", { limit: 1, k: 60 })).toHaveLength(1);
		expect(await context.retrieve("RAG", { limit: 1 })).toHaveLength(1);
		expect(await (await context.stream({ message: "RAG", sources: [], system: "" })).text()).toBe('0:"this-answer"\n');
		expect(await context.sync({ dryRun: true })).toEqual({ provider: "sync-this", dryRun: true });
		expect(await context.syncRuns({ limit: 1 })).toEqual([{ provider: "sync-this" }]);
	});

	test("chat、search、sync 路由可以消费真实 Nitro/H3 harness 注入的 assembly context", async () => {
		const context = await createRagRuntimeContext(makeConfig(), makeFactories());

		const chatApp = createApp();
		await installContext(chatApp, "/v1/chat", context);
		chatApp.use("/v1/chat", chatRoute);
		const chatResponse = await chatApp.fetch(
			new Request("http://localhost/v1/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: "RAG" }),
			}),
		);
		expect(chatResponse.status).toBe(200);
		expect(chatResponse.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(chatResponse.headers.get("x-vercel-ai-data-stream")).toBe("v1");
		expect(await chatResponse.text()).toBe('0:"answer"\n');

		const searchApp = createApp();
		await installContext(searchApp, "/v1/search", context);
		searchApp.use("/v1/search", searchRoute);
		const searchResponse = await searchApp.fetch(
			new Request("http://localhost/v1/search", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ query: "RAG", limit: 1, k: 60 }),
			}),
		);
		expect(searchResponse.status).toBe(200);
		expect((await searchResponse.json()).data.items).toHaveLength(1);

		const syncApp = createApp();
		await installContext(syncApp, "/v1/knowledge/sync", context);
		syncApp.use("/v1/knowledge/sync", syncPostRoute);
		const syncResponse = await syncApp.fetch(
			new Request("http://localhost/v1/knowledge/sync", {
				method: "POST",
				headers: { authorization: "Bearer sync-fake", "content-type": "application/json" },
				body: JSON.stringify({ dryRun: true }),
			}),
		);
		expect(syncResponse.status).toBe(200);
		expect((await syncResponse.json()).data).toEqual({ accepted: true, dryRun: true });
	});

	test.each([
		["database", { databaseUrl: "" }],
		["embedding", { embeddingModel: "" }],
		["model", { chatModel: "" }],
	] as const)("缺少 %s 配置时不创建半成品 context，路由继续返回 503", async (requirement, override) => {
		let factoryCalls = 0;
		const factories = makeFactories({
			createDatabase: async () => {
				factoryCalls += 1;
				return { lexicalSearch: async () => [], vectorSearch: async () => [] };
			},
		});
		await expect(createRagRuntimeContext(makeConfig(override), factories)).rejects.toMatchObject({
			code: "RAG_NOT_CONFIGURED",
			status: 503,
			missing: [requirement],
		});
		expect(factoryCalls).toBe(0);

		const app = createApp();
		app.use(
			"/v1/search",
			defineEventHandler(async (event) => {
				try {
					event.context.rag = await createRagRuntimeContext(makeConfig(override), factories);
				} catch (error) {
					if (!(error instanceof RagRuntimeNotConfiguredError)) throw error;
				}
			}),
		);
		app.use("/v1/search", searchRoute);
		const response = await app.fetch(new Request("http://localhost/v1/search", { method: "POST" }));
		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ code: 503, message: "RAG_NOT_CONFIGURED" });
	});

	test("provider factory 错误被显式包装，且不会通过路由返回 200 假成功", async () => {
		const failure = new Error("fake provider failure");
		await expect(
			createRagRuntimeContext(makeConfig(), makeFactories({ createEmbedding: async () => Promise.reject(failure) })),
		).rejects.toMatchObject({ provider: "createEmbedding", code: "RAG_PROVIDER_INIT_FAILED", status: 500 });

		const app = createApp();
		app.use(
			"/v1/search",
			defineEventHandler(async (event) => {
				event.context.rag = await createRagRuntimeContext(
					makeConfig(),
					makeFactories({ createEmbedding: async () => Promise.reject(failure) }),
				);
			}),
		);
		app.use("/v1/search", searchRoute);
		const response = await app.fetch(new Request("http://localhost/v1/search", { method: "POST" }));
		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ status: 500, unhandled: true });
	});

	test("工厂源码和路由不读取裸 process.env，外部环境变量不能替代显式配置", async () => {
		const assemblySource = await readFile(new URL("../server/runtime/rag-assembly.ts", import.meta.url), "utf8");
		const routeSources = await Promise.all([
			readFile(new URL("../server/routes/v1/chat.post.ts", import.meta.url), "utf8"),
			readFile(new URL("../server/routes/v1/search.post.ts", import.meta.url), "utf8"),
		]);
		expect(assemblySource).not.toContain("process.env");
		expect(routeSources.join("\\n")).not.toContain("process.env");

		const original = process.env.DATABASE_URL;
		process.env.DATABASE_URL = "postgres://should-not-be-read";
		try {
			await expect(createRagRuntimeContext(makeConfig({ databaseUrl: "" }), makeFactories())).rejects.toBeInstanceOf(
				RagRuntimeNotConfiguredError,
			);
		} finally {
			if (original === undefined) delete process.env.DATABASE_URL;
			else process.env.DATABASE_URL = original;
		}
	});
});
