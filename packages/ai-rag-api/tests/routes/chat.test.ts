import { afterEach, describe, expect, test, vi } from "vitest";
import { handleChatRequest, type ChatStreamRequest } from "../../server/contracts/chat";

const h3 = vi.hoisted(() => ({ readBody: vi.fn(), setResponseStatus: vi.fn() }));

vi.mock("nitro/h3", () => ({
	defineEventHandler: <T>(handler: T) => handler,
	readBody: h3.readBody,
	setResponseStatus: h3.setResponseStatus,
}));

const { default: chatRoute } = await import("../../server/routes/v1/chat.post");

const source = {
	id: "chunk-1",
	content: "RAG 使用检索结果作为回答上下文。",
	score: 0.9,
	sourcePath: "docs/docx/guide.md",
	headingPath: ["指南"],
	headingIndex: 0,
	headingAnchor: "rag-heading-x",
	chunkIndex: 0,
	imageUrls: [],
};

describe("POST /v1/chat 合同", () => {
	afterEach(() => {
		h3.readBody.mockReset();
		h3.setResponseStatus.mockReset();
	});

	test("无效输入返回 400 JSON，且不进入检索或模型边界", async () => {
		let retrieved = false;
		const result = await handleChatRequest(
			{ message: " " },
			{
				retrieve: async () => {
					retrieved = true;
					return [];
				},
				stream: () => new Response(),
			},
		);

		expect(result).not.toBeInstanceOf(Response);
		expect(retrieved).toBe(false);
		if (result instanceof Response) throw new Error("无效输入不应返回流响应");
		expect(result).toEqual({ status: 400, body: { success: false, code: 400, message: "对话请求无效", data: null } });
	});

	test("成功分支保留来源 DTO 并原样返回 AI SDK data stream Response", async () => {
		let streamed: ChatStreamRequest | undefined;
		const dataStreamResponse = new Response('0:"回答"\n', {
			headers: {
				"content-type": "text/plain; charset=utf-8",
				"x-vercel-ai-data-stream": "v1",
			},
		});
		const result = await handleChatRequest(
			{ message: "什么是 RAG？", conversationId: "conversation-1" },
			{
				retrieve: async () => [source],
				stream: (request) => {
					streamed = request;
					return dataStreamResponse;
				},
			},
		);

		expect(result).toBeInstanceOf(Response);
		if (!(result instanceof Response) || !streamed) throw new Error("成功分支应返回流响应并调用模型边界");
		expect(result.headers.get("content-type")).toBe("text/plain; charset=utf-8");
		expect(result.headers.get("x-vercel-ai-data-stream")).toBe("v1");
		expect(streamed.sources[0]).toMatchObject({
			sourceUrl: "/docx/guide.html",
			sourceHref: "/docx/guide.html#rag-heading-x",
		});
		expect(streamed.system).toContain("[1] RAG 使用检索结果作为回答上下文。");
		expect(await result.text()).toBe('0:"回答"\n');
	});

	test("合法 pageContext 注入 system：system 包含页面路径与防误引声明", async () => {
		let streamed: ChatStreamRequest | undefined;
		const dataStreamResponse = new Response('0:"回答"\n', {
			headers: { "x-vercel-ai-data-stream": "v1" },
		});
		const result = await handleChatRequest(
			{
				message: "这个怎么配？",
				pageContext: { pagePath: "/guide/install", title: "安装指南" },
			},
			{
				retrieve: async () => [source],
				stream: (request) => {
					streamed = request;
					return dataStreamResponse;
				},
			},
		);

		expect(result).toBeInstanceOf(Response);
		if (!(result instanceof Response) || !streamed) throw new Error("合法 pageContext 应进入流式分支");
		expect(streamed.system).toContain("/guide/install");
		expect(streamed.system).toContain("安装指南");
		/** 防误引声明：页面上下文段独立，模型不应把页面信息混入 [来源N] */
		expect(streamed.system).toContain("【页面上下文】");
		expect(streamed.system).toContain("不计入 [来源N] 编号");
	});

	test("非法 pageContext 返回 400 统一错误体，不进入检索或模型边界", async () => {
		let retrieved = false;
		const result = await handleChatRequest(
			{
				message: "这个怎么配？",
				pageContext: { pagePath: "" },
			},
			{
				retrieve: async () => {
					retrieved = true;
					return [];
				},
				stream: () => new Response(),
			},
		);

		expect(result).not.toBeInstanceOf(Response);
		expect(retrieved).toBe(false);
		if (result instanceof Response) throw new Error("非法 pageContext 不应返回流响应");
		expect(result).toEqual({ status: 400, body: { success: false, code: 400, message: "对话请求无效", data: null } });
	});

	test("缺失 pageContext 走基础模板（不含【页面上下文】段）", async () => {
		let streamed: ChatStreamRequest | undefined;
		const dataStreamResponse = new Response('0:"回答"\n', {
			headers: { "x-vercel-ai-data-stream": "v1" },
		});
		const result = await handleChatRequest(
			{ message: "什么是 RAG？" },
			{
				retrieve: async () => [source],
				stream: (request) => {
					streamed = request;
					return dataStreamResponse;
				},
			},
		);

		expect(result).toBeInstanceOf(Response);
		if (!(result instanceof Response) || !streamed) throw new Error("缺失 pageContext 应走基础模板分支");
		/** 不应出现页面上下文段 */
		expect(streamed.system).not.toContain("【页面上下文】");
		/** 但基础模板仍在（参考资料段标识） */
		expect(streamed.system).toContain("[1] RAG 使用检索结果作为回答上下文。");
		expect(streamed.system).toContain("如果资料不足");
	});
});

describe("POST /v1/chat Nitro 路由", () => {
	test("缺少任一 RAG 装配时返回 503，且不调用已存在的模型边界", async () => {
		const stream = vi.fn(() => new Response());
		const response = await chatRoute({ context: { rag: { stream } } } as never);

		expect(response).toEqual({ success: false, code: 503, message: "RAG_NOT_CONFIGURED", data: null });
		expect(h3.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 503);
		expect(h3.readBody).not.toHaveBeenCalled();
		expect(stream).not.toHaveBeenCalled();
	});

	test("导入的 Nitro 路由原样返回可完整读取至 EOF 的流响应", async () => {
		const streamResponse = new Response(
			new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode('0:"完整回答"\n'));
					controller.close();
				},
			}),
			{ headers: { "content-type": "text/plain; charset=utf-8", "x-vercel-ai-data-stream": "v1" } },
		);
		h3.readBody.mockResolvedValue({ message: "什么是 RAG？" });
		const request = new Request("http://localhost/v1/chat", { method: "POST" });
		const response = await chatRoute({
			req: request,
			context: {
				rag: {
					retrieve: async () => [source],
					stream: () => streamResponse,
				},
			},
		} as never);

		if (!(response instanceof Response)) throw new Error("成功路由应返回原生流响应");
		expect(response.headers.get("x-vercel-ai-data-stream")).toBe("v1");
		expect(await response.text()).toBe('0:"完整回答"\n');
	});
});
