import { afterEach, describe, expect, test, vi } from "vitest";

const ai = vi.hoisted(() => ({
	streamText: vi.fn(),
	StreamData: vi.fn(),
}));
const anthropic = vi.hoisted(() => ({
	createAnthropic: vi.fn(),
}));

vi.mock("ai", () => ai);
vi.mock("@ai-sdk/anthropic", () => anthropic);

import { createAnthropicChatStream, createAnthropicObservedFetch } from "../server/services/anthropic-chat";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Anthropic Messages 聊天流适配器", () => {
	test("使用 provider base URL 和模型创建 Messages 流，并保留来源帧", () => {
		const append = vi.fn();
		const close = vi.fn();
		const messages = vi.fn(() => ({ provider: "anthropic-model" }));
		const provider = { messages };
		const response = new Response('0:"回答"\n');
		const toDataStreamResponse = vi.fn(() => response);
		anthropic.createAnthropic.mockReturnValue(provider);
		ai.StreamData.mockImplementation(() => ({ append, close }));
		ai.streamText.mockReturnValue({ toDataStreamResponse });

		const stream = createAnthropicChatStream({
			apiKey: "anthropic-test-key",
			protocol: "anthropic-messages",
			baseUrl: "https://api.code-tab.com/v1",
			model: "claude-sonnet-5[1m]",
		});
		const abortController = new AbortController();
		const result = stream({
			message: "什么是 RAG？",
			system: "系统提示",
			abortSignal: abortController.signal,
			sources: [
				{
					id: "source-1",
					content: "第一段内容",
					score: 0.9,
					sourcePath: "docs/one.md",
					headingPath: ["第一篇"],
					headingIndex: 0,
					headingAnchor: "one",
					chunkIndex: 0,
					imageUrls: [],
					sourceUrl: "/one.html",
					sourceHref: "/one.html#one",
				},
			],
		});

		expect(anthropic.createAnthropic).toHaveBeenCalledWith(
			expect.objectContaining({
				apiKey: "anthropic-test-key",
				baseURL: "https://api.code-tab.com/v1",
				fetch: expect.any(Function),
			}),
		);
		expect(messages).toHaveBeenCalledWith("claude-sonnet-5[1m]");
		expect(append).toHaveBeenCalledWith({
			type: "source",
			data: { id: "source-1", label: "第一篇", sourceHref: "/one.html#one" },
		});
		expect(close).toHaveBeenCalledTimes(1);
		expect(ai.streamText.mock.calls[0]?.[0]).toMatchObject({
			model: { provider: "anthropic-model" },
			system: "系统提示",
			prompt: "什么是 RAG？",
			abortSignal: abortController.signal,
		});
		expect(toDataStreamResponse).toHaveBeenCalledWith({ data: expect.anything() });
		expect(result).toBe(response);
	});

	test("缺少 Anthropic key 时拒绝创建适配器", () => {
		expect(() =>
			createAnthropicChatStream({
				apiKey: "",
				protocol: "anthropic-messages",
				baseUrl: "https://api.code-tab.com/v1",
				model: "claude-sonnet-5[1m]",
			}),
		).toThrow("RAG chat provider is not configured");
	});

	test("观察上游 Messages SSE 生命周期且不记录响应正文", async () => {
		const events: Array<Record<string, unknown>> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						[
							"event: message_start",
							'data: {"type":"message_start"}',
							"",
							"event: content_block_delta",
							'data: {"type":"content_block_delta","delta":{"text":"secret"}}',
							"",
							"event: message_stop",
							'data: {"type":"message_stop"}',
							"",
						].join("\n"),
					),
			),
		);
		const observedFetch = createAnthropicObservedFetch((event) => events.push(event));
		const response = await observedFetch("https://api.code-tab.com/v1/messages");

		expect(await response.text()).toContain("secret");
		expect(events.map((event) => event.event)).toEqual([
			"request_start",
			"response",
			"message_start",
			"content_block_delta",
			"message_stop",
		]);
		expect(events.every((event) => !Object.hasOwn(event, "body"))).toBe(true);
	});

	test("请求中止时记录 abort 生命周期事件", async () => {
		const events: Array<Record<string, unknown>> = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("event: message_start\ndata: {}\n")),
		);
		const controller = new AbortController();
		const observedFetch = createAnthropicObservedFetch((event) => events.push(event));

		await observedFetch("https://api.code-tab.com/v1/messages", { signal: controller.signal });
		controller.abort();

		expect(events.map((event) => event.event)).toContain("abort");
	});

	test("聊天请求 abort 时记录服务端生命周期事件", () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
		const append = vi.fn();
		const close = vi.fn();
		ai.StreamData.mockImplementation(() => ({ append, close }));
		ai.streamText.mockReturnValue({ toDataStreamResponse: vi.fn(() => new Response("")) });
		const provider = { messages: vi.fn(() => ({ provider: "anthropic-model" })) };
		anthropic.createAnthropic.mockReturnValue(provider);
		const stream = createAnthropicChatStream({
			apiKey: "anthropic-test-key",
			protocol: "anthropic-messages",
			baseUrl: "https://api.code-tab.com/v1",
			model: "claude-sonnet-5[1m]",
		});
		const controller = new AbortController();

		stream({ message: "abort", system: "system", abortSignal: controller.signal, sources: [] });
		controller.abort();

		expect(info).toHaveBeenCalledWith(expect.stringContaining('"event":"abort"'));
	});
});
