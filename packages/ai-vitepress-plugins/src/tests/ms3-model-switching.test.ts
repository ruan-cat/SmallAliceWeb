import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, test, vi } from "vitest";
import { effectScope } from "vue";
import { useKnowledgeChat } from "../client/composables/useKnowledgeChat";

/**
 * MS-3 单元测试：useKnowledgeChat 模型切换全链路。
 *
 * 覆盖：
 * - selectModel 写入 selectedProvider + localStorage
 * - selectModel 拒绝白名单外 id
 * - experimental_prepareRequestBody 携带 provider 字段（缺省/合法/未设）
 * - localStorage 脏值回退默认；valid 命中恢复
 * - initialProvider 优先级高于 localStorage
 * - /v1/models 拉取失败（fetch reject）时聊天功能不受影响
 * - initialModels 注入时不发起 /v1/models 网络请求
 * - refreshModels 暴露给宿主手动调用
 */

function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

const fakeModels = [
	{ id: "anthropic", label: "Claude Sonnet 5", model: "claude-sonnet-5[1m]" },
	{ id: "openai", label: "GPT-5.6 Luna", model: "gpt-5.6-luna" },
];

describe("MS-3 useKnowledgeChat 模型切换 state 单元", () => {
	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	test("initialModels 注入时 models 与 selectedProvider 立即就绪", () => {
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-init", {
				api: "http://test/v1/chat",
				fetch: vi.fn(),
				initialModels: fakeModels,
			}),
		)!;

		expect(chat.models.value).toEqual(fakeModels);
		// 未传 initialProvider 时 selectedProvider 缺省为空串（由 request 体不携带 provider）
		expect(chat.selectedProvider.value).toBe("");
		scope.stop();
	});

	test("selectModel 接受白名单内 id：写 selectedProvider + localStorage", () => {
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-select", {
				api: "http://test/v1/chat",
				fetch: vi.fn(),
				initialModels: fakeModels,
			}),
		)!;

		chat.selectModel("openai");
		expect(chat.selectedProvider.value).toBe("openai");
		expect(localStorage.getItem("ai-chat-provider")).toBe("openai");

		chat.selectModel("anthropic");
		expect(chat.selectedProvider.value).toBe("anthropic");
		expect(localStorage.getItem("ai-chat-provider")).toBe("anthropic");
		scope.stop();
	});

	test("selectModel 拒绝白名单外 id：selectedProvider 与 localStorage 不变", () => {
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-reject", {
				api: "http://test/v1/chat",
				fetch: vi.fn(),
				initialModels: fakeModels,
			}),
		)!;

		chat.selectModel("anthropic");
		const before = chat.selectedProvider.value;
		const beforeStorage = localStorage.getItem("ai-chat-provider");

		chat.selectModel("google"); // 白名单外
		expect(chat.selectedProvider.value).toBe(before);
		expect(localStorage.getItem("ai-chat-provider")).toBe(beforeStorage);

		chat.selectModel(""); // 空串
		expect(chat.selectedProvider.value).toBe(before);

		scope.stop();
	});

	test("initialProvider 优先级高于 localStorage（白名单校验后覆盖）", () => {
		localStorage.setItem("ai-chat-provider", "anthropic");
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-prio", {
				api: "http://test/v1/chat",
				fetch: vi.fn(),
				initialModels: fakeModels,
				initialProvider: "openai",
			}),
		)!;

		expect(chat.selectedProvider.value).toBe("openai");
		scope.stop();
	});

	test("initialProvider 不在白名单内时回退默认（白名单语义）", () => {
		localStorage.setItem("ai-chat-provider", "openai");
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-prio-fall", {
				api: "http://test/v1/chat",
				fetch: vi.fn(),
				initialModels: fakeModels,
				initialProvider: "google", // 白名单外
			}),
		)!;

		// initialProvider 白名单校验失败 → 回退 localStorage "openai"
		expect(chat.selectedProvider.value).toBe("openai");
		scope.stop();
	});
});

describe("MS-3 useKnowledgeChat /v1/models 拉取行为", () => {
	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	test("initialModels 已注入时不调用 fetch（避免重复拉取）", () => {
		const fetchMock = vi.fn();
		const scope = effectScope();
		scope.run(() =>
			useKnowledgeChat("ms3-skip-fetch", {
				api: "http://test/v1/chat",
				fetch: fetchMock,
				initialModels: fakeModels,
			}),
		)!;
		// 不发起 /v1/models 网络请求
		expect(fetchMock).not.toHaveBeenCalled();
		scope.stop();
	});

	test("api 为绝对 URL 时跳过自动 loadModels（测试场景）", () => {
		const fetchMock = vi.fn();
		const scope = effectScope();
		scope.run(() =>
			useKnowledgeChat("ms3-absolute-api", {
				api: "http://127.0.0.1:3000/chat",
				fetch: fetchMock,
			}),
		)!;
		// 绝对 URL → 不自动发起 /v1/models 请求（避免污染测试 server）
		expect(fetchMock).not.toHaveBeenCalled();
		scope.stop();
	});

	test("models 拉取失败（fetch reject）时聊天功能完全不受影响", async () => {
		const fetchMock = vi.fn(async () => {
			throw new Error("network down");
		});
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-fetch-fail", {
				api: "/v1/chat", // 相对路径触发自动 loadModels
				fetch: fetchMock,
			}),
		)!;

		// 触发 fetch 调用（异步）
		await flushMicrotasks();
		await flushMicrotasks();

		// 失败静默：models 与 selectedProvider 保持空
		expect(chat.models.value).toEqual([]);
		expect(chat.selectedProvider.value).toBe("");

		// selectModel 仍可调用（仅受 initialModels 白名单约束；空列表下任何 id 都被拒绝）
		chat.selectModel("openai");
		expect(chat.selectedProvider.value).toBe(""); // 拒绝：白名单为空

		scope.stop();
	});

	test("models 拉取返回 200 但 body 非法 JSON 时失败静默", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => {
				throw new SyntaxError("invalid JSON");
			},
		}));
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-bad-json", {
				api: "/v1/chat",
				fetch: fetchMock,
			}),
		)!;

		await flushMicrotasks();
		await flushMicrotasks();

		// 失败静默：models 仍为空
		expect(chat.models.value).toEqual([]);
		scope.stop();
	});

	test("models 拉取返回非 ok 状态码时失败静默", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: false,
			status: 503,
		}));
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-not-ok", {
				api: "/v1/chat",
				fetch: fetchMock,
			}),
		)!;

		await flushMicrotasks();
		await flushMicrotasks();

		expect(chat.models.value).toEqual([]);
		scope.stop();
	});

	test("models 拉取成功后 selectedProvider 优先级：initialProvider > localStorage > list[0]", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({ success: true, code: 200, data: { models: fakeModels } }),
		}));
		localStorage.setItem("ai-chat-provider", "openai");

		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-recovery", {
				api: "/v1/chat",
				fetch: fetchMock,
			}),
		)!;

		await flushMicrotasks();
		await flushMicrotasks();

		expect(chat.models.value).toEqual(fakeModels);
		// localStorage "openai" 在 list 内 → 恢复为 openai
		expect(chat.selectedProvider.value).toBe("openai");

		scope.stop();
	});

	test("models 拉取成功后 localStorage 脏值回退 list[0]", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({ success: true, code: 200, data: { models: fakeModels } }),
		}));
		localStorage.setItem("ai-chat-provider", "google"); // 脏值：注册表变更后残留

		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-dirty", {
				api: "/v1/chat",
				fetch: fetchMock,
			}),
		)!;

		await flushMicrotasks();
		await flushMicrotasks();

		expect(chat.models.value).toEqual(fakeModels);
		// localStorage 脏值不在 list → 回退 list[0] = "anthropic"
		expect(chat.selectedProvider.value).toBe("anthropic");

		scope.stop();
	});

	test("models 拉取后无 localStorage 时 selectedProvider 回退 list[0]", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({ success: true, code: 200, data: { models: fakeModels } }),
		}));

		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-first", {
				api: "/v1/chat",
				fetch: fetchMock,
			}),
		)!;

		await flushMicrotasks();
		await flushMicrotasks();

		expect(chat.selectedProvider.value).toBe("anthropic"); // list[0]
		scope.stop();
	});

	test("models 拉取后 localStorage 命中并覆盖 list[0]", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({ success: true, code: 200, data: { models: fakeModels } }),
		}));
		localStorage.setItem("ai-chat-provider", "openai");

		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-storage-wins", {
				api: "/v1/chat",
				fetch: fetchMock,
			}),
		)!;

		await flushMicrotasks();
		await flushMicrotasks();

		expect(chat.selectedProvider.value).toBe("openai");
		scope.stop();
	});

	test("/v1/models URL 由 chat api 派生：/v1/chat → /v1/models", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({ success: true, code: 200, data: { models: fakeModels } }),
		}));

		const scope = effectScope();
		scope.run(() =>
			useKnowledgeChat("ms3-url", {
				api: "/v1/chat",
				fetch: fetchMock,
			}),
		)!;

		await flushMicrotasks();
		await flushMicrotasks();

		expect(fetchMock).toHaveBeenCalledWith("/v1/models");
		scope.stop();
	});
});

describe("MS-3 useKnowledgeChat refreshModels 暴露", () => {
	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	test("refreshModels 可被宿主手动调用以重新拉取（onMounted 后刷新场景）", async () => {
		let callCount = 0;
		const fetchMock = vi.fn(async () => {
			callCount += 1;
			return {
				ok: true,
				json: async () => ({ success: true, code: 200, data: { models: fakeModels } }),
			};
		});

		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-refresh", {
				api: "/v1/chat",
				fetch: fetchMock,
			}),
		)!;

		await flushMicrotasks();
		await flushMicrotasks();
		const firstCallCount = callCount;

		chat.refreshModels();
		await flushMicrotasks();
		await flushMicrotasks();

		expect(callCount).toBeGreaterThan(firstCallCount);
		expect(chat.models.value).toEqual(fakeModels);

		scope.stop();
	});
});

/**
 * MS-3 请求体携带 provider 字段：复用真实 HTTP server 模式（与 use-knowledge-chat-http.test.ts 同源）。
 * api 传绝对 URL 跳过自动 /v1/models 拉取，避免污染 server.request。
 */

type ChatRequestRecord = { body: string };

async function createChatCaptureServer(): Promise<{
	url: string;
	request: Promise<ChatRequestRecord>;
	close: () => Promise<void>;
}> {
	let resolveRequest!: (record: ChatRequestRecord) => void;
	const request = new Promise<ChatRequestRecord>((resolve) => {
		resolveRequest = resolve;
	});
	let server!: Server;
	server = createServer((req, res) => {
		let body = "";
		req.setEncoding("utf8");
		req.on("data", (chunk: string) => {
			body += chunk;
		});
		req.on("end", () => {
			resolveRequest({ body });
			res.writeHead(200, {
				"Content-Type": "text/plain; charset=utf-8",
				"x-vercel-ai-data-stream": "v1",
			});
			res.end('0:"ok"\n');
		});
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("server listen failed");
	const url = `http://127.0.0.1:${address.port}`;
	return {
		url,
		request,
		close: () => new Promise<void>((resolve) => server.close(() => resolve())),
	};
}

describe("MS-3 请求体携带 provider 字段", () => {
	afterEach(() => {
		localStorage.clear();
		vi.restoreAllMocks();
	});

	test("selectedProvider 已设置 → 请求体携带 provider 字段", async () => {
		const server = await createChatCaptureServer();
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-body-provider", {
				api: server.url,
				fetch: globalThis.fetch,
				initialModels: fakeModels,
				initialProvider: "openai",
			}),
		)!;

		await chat.send({ id: "user-1", role: "user", content: "切换到 GPT" });

		const body = JSON.parse((await server.request).body);
		expect(body).toEqual({
			message: "切换到 GPT",
			conversationId: "ms3-body-provider",
			provider: "openai",
		});

		scope.stop();
		await server.close();
	});

	test("selectedProvider 未设置（初始为空串）→ 请求体不携带 provider 字段", async () => {
		const server = await createChatCaptureServer();
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-body-no-provider", {
				api: server.url,
				fetch: globalThis.fetch,
				initialModels: fakeModels,
			}),
		)!;

		await chat.send({ id: "user-1", role: "user", content: "无 provider" });

		const body = JSON.parse((await server.request).body);
		expect(body).toEqual({
			message: "无 provider",
			conversationId: "ms3-body-no-provider",
		});
		expect(body).not.toHaveProperty("provider");

		scope.stop();
		await server.close();
	});

	test("selectModel 后下一次 send 携带新 provider（切换即时生效）", async () => {
		const server = await createChatCaptureServer();
		const scope = effectScope();
		const chat = scope.run(() =>
			useKnowledgeChat("ms3-switch", {
				api: server.url,
				fetch: globalThis.fetch,
				initialModels: fakeModels,
				initialProvider: "anthropic",
			}),
		)!;

		chat.selectModel("openai");
		await chat.send({ id: "user-1", role: "user", content: "切换后" });

		const body = JSON.parse((await server.request).body);
		expect(body.provider).toBe("openai");

		scope.stop();
		await server.close();
	});
});