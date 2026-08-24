import { describe, expect, test, vi } from "vitest";

const ai = vi.hoisted(() => ({
	streamText: vi.fn(),
	StreamData: vi.fn(),
}));

vi.mock("ai", () => ai);

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
				databaseUrl: "",
				syncDatabaseUrl: "",
				embeddingModel: "",
				openaiApiKey: "",
				baseUrl: "",
				chatModel: "",
				knowledgeSyncToken: "",
				cronSecret: "",
				public: { apiBase: "/v1" },
			}),
		).toThrow("RAG chat provider is not configured");
	});

	test("为每个来源写入并关闭 data-stream writer 后返回原生响应", () => {
		const append = vi.fn();
		const close = vi.fn();
		const response = new Response('0:"回答"\n');
		const toDataStreamResponse = vi.fn(() => response);
		ai.StreamData.mockImplementation(() => ({ append, close }));
		ai.streamText.mockReturnValue({ toDataStreamResponse });

		const stream = createOpenAiChatStream({
			databaseUrl: "",
			syncDatabaseUrl: "",
			embeddingModel: "",
			openaiApiKey: "test-key",
			baseUrl: "",
			chatModel: "gpt-test",
			knowledgeSyncToken: "",
			cronSecret: "",
			public: { apiBase: "/v1" },
		});
		const result = stream({
			message: "什么是 RAG？",
			system: "系统提示",
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
		expect(close.mock.invocationCallOrder[0]).toBeLessThan(toDataStreamResponse.mock.invocationCallOrder[0]);
		expect(toDataStreamResponse).toHaveBeenCalledWith({ data: expect.anything() });
		expect(result).toBe(response);
	});
});
