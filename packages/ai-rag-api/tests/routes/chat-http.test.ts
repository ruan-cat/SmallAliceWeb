import { createApp, defineEventHandler } from "nitro/h3";
import { describe, expect, test } from "vitest";
import chatRoute from "../../server/routes/v1/chat.post";
import type { ChatStreamRequest } from "../../server/contracts/chat";

describe("POST /v1/chat 真实 Nitro/H3 HTTP harness", () => {
	test("未装配 RAG 时通过真实 Request/Response 返回 503 JSON", async () => {
		const app = createApp();
		app.use("/v1/chat", chatRoute);

		const response = await app.fetch(
			new Request("http://localhost/v1/chat", {
				method: "POST",
			}),
		);

		expect(response.status).toBe(503);
		expect(response.headers.get("content-type")).toMatch(/application\/json/);
		expect(await response.json()).toEqual({
			success: false,
			code: 503,
			message: "RAG_NOT_CONFIGURED",
			data: null,
		});
	});

	test("通过内存 middleware 注入 fake provider 时保留真实 data-stream Response 与来源 DTO", async () => {
		let streamed: ChatStreamRequest | undefined;
		const streamResponse = new Response('2:[{"type":"source","id":"chunk-1"}]\n0:"hi"\n', {
			headers: {
				"content-type": "text/plain; charset=utf-8",
				"x-vercel-ai-data-stream": "v1",
			},
		});
		const app = createApp();
		app.use(
			"/v1/chat",
			defineEventHandler((event) => {
				event.context.rag = {
					retrieve: async () => [
						{
							id: "chunk-1",
							content: "RAG source",
							score: 0.9,
							sourcePath: "docs/docx/guide.md",
							headingPath: ["Guide"],
							headingIndex: 0,
							headingAnchor: "rag-heading-x",
							chunkIndex: 0,
							imageUrls: [],
						},
					],
					stream: (request: ChatStreamRequest) => {
						streamed = request;
						return streamResponse;
					},
				};
			}),
		);
		app.use("/v1/chat", chatRoute);

		const response = await app.fetch(
			new Request("http://localhost/v1/chat", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ message: "What is RAG?", conversationId: "conversation-1" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(response.headers.get("x-vercel-ai-data-stream")).toBe("v1");
		expect(await response.text()).toBe('2:[{"type":"source","id":"chunk-1"}]\n0:"hi"\n');
		expect(streamed).toMatchObject({
			conversationId: "conversation-1",
			sources: [{ sourceHref: "/docx/guide.html#rag-heading-x" }],
		});
		expect(streamed?.system).toContain("[1] RAG source");
	});
});
