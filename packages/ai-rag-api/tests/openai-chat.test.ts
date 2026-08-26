import { describe, expect, test, vi } from "vitest";

const ai = vi.hoisted(() => ({
	streamText: vi.fn(),
	StreamData: vi.fn(),
}));
const openai = vi.hoisted(() => ({
	createOpenAI: vi.fn(),
}));

vi.mock("ai", () => ai);
vi.mock("@ai-sdk/openai", () => openai);

import { createOpenAiChatStream, normalizeOpenAIBaseUrl } from "../server/services/openai-chat";

describe("OpenAI 聊天流适配器", () => {
	test("规范化 OpenAI base URL，避免遗漏或重复 /v1", () => {
		expect(normalizeOpenAIBaseUrl("https://api.example.com")).toBe("https://api.example.com/v1");
		expect(normalizeOpenAIBaseUrl("https://api.example.com/")).toBe("https://api.example.com/v1");
		expect(normalizeOpenAIBaseUrl("https://api.example.com/v1")).toBe("https://api.example.com/v1");
		expect(normalizeOpenAIBaseUrl("https://api.example.com/v1/")).toBe("https://api.example.com/v1");
	});

	test("缺少 Nitro 私有配置时拒绝创建适配器且不请求模型", () => {
		expect(() =>
			createOpenAiChatStream({
				apiKey: "",
				protocol: "openai-responses",
				baseUrl: "https://api.code-tab.com/v1",
				model: "gpt-test",
			}),
		).toThrow("RAG chat provider is not configured");
	});

	test("为每个来源写入并关闭 data-stream writer 后返回原生响应", () => {
		const append = vi.fn();
		const close = vi.fn();
		const responses = vi.fn(() => ({ provider: "responses-model" }));
		const chat = vi.fn(() => ({ provider: "chat-model" }));
		const provider = Object.assign(vi.fn(chat), { responses });
		openai.createOpenAI.mockReturnValue(provider);
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

		const response = new Response('0:"回答"\n');
		const toDataStreamResponse = vi.fn(() => response);
		ai.StreamData.mockImplementation(() => ({ append, close }));
		ai.streamText.mockReturnValue({ toDataStreamResponse });

		const stream = createOpenAiChatStream({
			apiKey: "test-key",
			protocol: "openai-responses",
			baseUrl: "https://api.code-tab.com/v1",
			model: "gpt-test",
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

		expect(append).toHaveBeenCalledTimes(1);
		expect(append).toHaveBeenCalledWith({
			type: "source",
			data: { id: "source-1", label: "第一篇", sourceHref: "/one.html#one" },
		});
		expect(responses).toHaveBeenCalledWith("gpt-test");
		expect(chat).not.toHaveBeenCalled();
		expect(close.mock.invocationCallOrder[0]).toBeLessThan(toDataStreamResponse.mock.invocationCallOrder[0]);
		const streamOptions = ai.streamText.mock.calls[0]?.[0];
		expect(streamOptions?.model).toEqual({ provider: "responses-model" });
		expect(streamOptions?.abortSignal).toBe(abortController.signal);
		expect(streamOptions?.onError).toEqual(expect.any(Function));
		streamOptions?.onError({ error: new Error("provider rejected stream") });
		expect(consoleError).toHaveBeenCalledWith("RAG chat stream failed", "provider rejected stream");
		expect(toDataStreamResponse).toHaveBeenCalledWith({ data: expect.anything() });
		expect(result).toBe(response);
		consoleError.mockRestore();
	});
});
