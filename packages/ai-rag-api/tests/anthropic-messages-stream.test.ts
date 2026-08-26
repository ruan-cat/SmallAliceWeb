import { afterEach, describe, expect, test, vi } from "vitest";
import { createAnthropicChatStream } from "../server/services/anthropic-chat";

const anthropicSse = [
	{
		type: "message_start",
		message: { id: "msg-test", model: "claude-sonnet-5[1m]", usage: { input_tokens: 10, output_tokens: 0 } },
	},
	{ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
	{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "第一段" } },
	{ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "第二段" } },
	{ type: "content_block_stop", index: 0 },
	{ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } },
	{ type: "message_stop" },
]
	.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
	.join("");

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("Anthropic Messages 真实 SDK 流式合同", () => {
	test("请求 /v1/messages 并把 Anthropic SSE 文本增量转换为 AI SDK data stream", async () => {
		const fetchMock = vi.fn<typeof fetch>(
			async () =>
				new Response(anthropicSse, {
					status: 200,
					headers: { "content-type": "text/event-stream" },
				}),
		);
		vi.stubGlobal("fetch", fetchMock);

		const response = await createAnthropicChatStream({
			apiKey: "anthropic-test-key",
			protocol: "anthropic-messages",
			baseUrl: "https://api.code-tab.com/v1",
			model: "claude-sonnet-5[1m]",
		})({
			message: "什么是 RAG？",
			system: "只根据资料回答。",
			sources: [],
		});
		const dataStream = await response.text();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://api.code-tab.com/v1/messages");
		expect(init?.method).toBe("POST");
		expect(new Headers(init?.headers).get("anthropic-version")).toBe("2023-06-01");
		expect(new Headers(init?.headers).get("x-api-key")).toBe("anthropic-test-key");
		const body = JSON.parse(String(init?.body));
		expect(body).toMatchObject({ model: "claude-sonnet-5[1m]", stream: true });
		expect(body.messages).toEqual([{ role: "user", content: [{ type: "text", text: "什么是 RAG？" }] }]);
		expect(body.system).toEqual([{ type: "text", text: "只根据资料回答。" }]);
		expect(dataStream).toContain("第一段");
		expect(dataStream).toContain("第二段");
		expect(response.headers.get("x-vercel-ai-data-stream")).toBe("v1");
	});
});
