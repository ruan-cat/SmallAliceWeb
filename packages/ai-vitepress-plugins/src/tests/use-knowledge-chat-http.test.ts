import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, test, vi } from "vitest";
import { effectScope, nextTick, type EffectScope } from "vue";
import { useKnowledgeChat } from "../client/composables/useKnowledgeChat";

type StreamMode = "complete" | "abort" | "nested-source";
type RequestRecord = { body: string; aborted: boolean };

type TestServer = {
	url: string;
	request: Promise<RequestRecord>;
	aborted: Promise<void>;
	close: () => Promise<void>;
};

async function createTestServer(mode: StreamMode): Promise<TestServer> {
	let resolveRequest!: (record: RequestRecord) => void;
	const request = new Promise<RequestRecord>((resolve) => {
		resolveRequest = resolve;
	});
	let resolveAborted!: () => void;
	const aborted = new Promise<void>((resolve) => {
		resolveAborted = resolve;
	});
	let abortedResolved = false;
	const markAborted = () => {
		if (abortedResolved) return;
		abortedResolved = true;
		resolveAborted();
	};
	let streamTimer: ReturnType<typeof setTimeout> | undefined;
	let server!: Server;

	server = createServer((req, res) => {
		let body = "";
		const record: RequestRecord = { body: "", aborted: false };
		req.setEncoding("utf8");
		req.on("data", (chunk: string) => {
			body += chunk;
		});
		req.on("aborted", () => {
			record.aborted = true;
			markAborted();
		});
		req.on("end", () => {
			record.body = body;
			resolveRequest(record);
			res.writeHead(200, {
				"Content-Type": "text/plain; charset=utf-8",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			});
			res.write('0:"第一段"\n');
			if (mode === "complete") {
				res.write('2:[{"type":"source","data":{"id":"source-1","label":"指南","sourceHref":"/guide"}}]\n');
				res.write('0:"第二段"\n');
				res.end();
				return;
			}
			if (mode === "nested-source") {
				res.write(
					'2:[[ {"type":"source","data":{"id":"source-nested","label":"嵌套指南","sourceHref":"/nested"}} ]]\n',
				);
				res.end();
				return;
			}

			streamTimer = setTimeout(() => {
				res.write('2:[{"type":"source","data":{"id":"source-late","label":"延迟来源","sourceHref":"/late"}}]\n');
				res.write('0:"不应到达"\n');
				res.end();
			}, 2_000);
		});
		res.on("close", () => {
			if (mode === "abort" && !res.writableEnded) {
				record.aborted = true;
				markAborted();
			}
			if (streamTimer) clearTimeout(streamTimer);
		});
	});

	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	if (!address || typeof address === "string") throw new Error("测试 HTTP 服务未绑定端口");

	return {
		url: `http://127.0.0.1:${address.port}/v1/chat`,
		request,
		aborted,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			}),
	};
}

async function waitFor(predicate: () => boolean, timeout = 2_000): Promise<void> {
	const deadline = Date.now() + timeout;
	while (!predicate()) {
		if (Date.now() >= deadline) throw new Error("等待真实聊天流状态超时");
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}

describe("useKnowledgeChat 真实 @ai-sdk/vue HTTP 合同", () => {
	const servers: TestServer[] = [];
	const scopes: EffectScope[] = [];

	afterEach(async () => {
		for (const scope of scopes.splice(0)) scope.stop();
		await Promise.all(servers.splice(0).map((server) => server.close()));
	});

	test("通过本地 HTTP data stream 更新助手消息、来源和 ready 状态", async () => {
		const server = await createTestServer("complete");
		servers.push(server);
		if (!globalThis.fetch) throw new Error("当前测试运行时缺少 fetch");

		const scope = effectScope();
		scopes.push(scope);
		const completed = vi.fn();
		const chat = scope.run(() =>
			useKnowledgeChat("http-complete", {
				api: server.url,
				fetch: globalThis.fetch,
				onResponseComplete: completed,
			}),
		)!;
		await chat.send({ id: "user-1", role: "user", content: "什么是 RAG？" });
		await nextTick();

		expect(JSON.parse((await server.request).body)).toEqual({
			message: "什么是 RAG？",
			conversationId: "http-complete",
		});
		expect(chat.messages.value.map(({ role, content }) => ({ role, content }))).toEqual([
			{ role: "user", content: "什么是 RAG？" },
			{ role: "assistant", content: "第一段第二段" },
		]);
		expect(chat.messages.value.at(-1)?.sources).toEqual([{ id: "source-1", label: "指南", sourceHref: "/guide" }]);
		expect(chat.isResponding.value).toBe(false);
		expect(completed).toHaveBeenCalledTimes(1);
	});

	test("兼容 AI SDK data frame 额外包裹数组的来源帧", async () => {
		const server = await createTestServer("nested-source");
		servers.push(server);
		const scope = effectScope();
		scopes.push(scope);
		const chat = scope.run(() => useKnowledgeChat("http-nested-source", { api: server.url, fetch: globalThis.fetch }))!;

		await chat.send({ id: "user-nested", role: "user", content: "嵌套来源" });

		expect(chat.messages.value.at(-1)?.sources).toEqual([
			{ id: "source-nested", label: "嵌套指南", sourceHref: "/nested" },
		]);
	});

	test("调用 stop 时通过 AbortController 中止 HTTP 流并保留已接收内容", async () => {
		const server = await createTestServer("abort");
		servers.push(server);
		if (!globalThis.fetch) throw new Error("当前测试运行时缺少 fetch");

		const scope = effectScope();
		scopes.push(scope);
		const completed = vi.fn();
		const chat = scope.run(() =>
			useKnowledgeChat("http-abort", {
				api: server.url,
				fetch: globalThis.fetch,
				onResponseComplete: completed,
			}),
		)!;
		const sendPromise = chat.send({ id: "user-2", role: "user", content: "开始流式回答" });
		await waitFor(() => chat.messages.value.some((message) => message.content === "第一段"));

		chat.stop();
		await sendPromise;
		await nextTick();
		await server.aborted;
		const requestRecord = await server.request;

		expect(requestRecord.aborted).toBe(true);
		expect(chat.messages.value.at(-1)?.content).toBe("第一段");
		expect(chat.isResponding.value).toBe(false);
		expect(chat.errorMessage.value).toBeUndefined();
		expect(completed).not.toHaveBeenCalled();
	});
});
