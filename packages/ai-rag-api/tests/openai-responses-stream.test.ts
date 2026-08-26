import { afterEach, describe, expect, test, vi } from "vitest";
import { createOpenAiChatStream } from "../server/services/openai-chat";

const responsesSse = [
	{
		type: "response.created",
		response: { id: "resp-test", created_at: 1_700_000_000, model: "gpt-5.6-luna" },
	},
	{ type: "response.output_text.delta", delta: "第一段" },
	{ type: "response.output_text.delta", delta: "第二段" },
	{
		type: "response.completed",
		response: {
			usage: {
				input_tokens: 10,
				input_tokens_details: { cached_tokens: 0 },
				output_tokens: 4,
				output_tokens_details: { reasoning_tokens: 0 },
			},
		},
	},
]
	.map((event) => `data: ${JSON.stringify(event)}\n\n`)
	.join("");

function createConfig() {
	return {
		apiKey: "test-key",
		protocol: "openai-responses" as const,
		baseUrl: "https://api.code-tab.com/v1",
		model: "gpt-5.6-luna",
	};
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("OpenAI Responses 流式合同", () => {
	test("请求 /v1/responses 并把 SSE 文本增量转换为 AI SDK data stream", async () => {
		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				new Response(responsesSse, {
					status: 200,
					headers: { "content-type": "text/event-stream" },
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await createOpenAiChatStream(createConfig())({
			message: "什么是 RAG？",
			system: "只根据资料回答。",
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
		const dataStream = await response.text();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://api.code-tab.com/v1/responses");
		expect(init?.method).toBe("POST");
		const body = JSON.parse(String(init?.body));
		expect(body).toMatchObject({ model: "gpt-5.6-luna", stream: true });
		expect(body.input).toBeDefined();
		expect(dataStream).toContain("第一段");
		expect(dataStream).toContain("第二段");
		expect(dataStream).toContain("source-1");
		expect(response.headers.get("x-vercel-ai-data-stream")).toBe("v1");
	});
});
