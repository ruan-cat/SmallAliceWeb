import { describe, expect, test, vi } from "vitest";

const ai = vi.hoisted(() => ({
	streamText: vi.fn(),
	StreamData: vi.fn(),
}));
const anthropic = vi.hoisted(() => ({
	createAnthropic: vi.fn(),
}));

vi.mock("ai", () => ai);
vi.mock("@ai-sdk/anthropic", () => anthropic);

import { createAnthropicChatStream } from "../server/services/anthropic-chat";

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

		expect(anthropic.createAnthropic).toHaveBeenCalledWith({
			apiKey: "anthropic-test-key",
			baseURL: "https://api.code-tab.com/v1",
		});
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
});
