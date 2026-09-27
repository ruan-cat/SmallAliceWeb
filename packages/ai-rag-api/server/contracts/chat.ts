import { createSourceUrl, pageContextSchema, resolveSourceHref } from "@ruan-cat-drill-doc/ai-rag-core";
import { z } from "zod";
import type { RagLlmProviderId } from "../../src/llm-config";
import { RagProviderNotConfiguredError } from "../runtime/rag-assembly";
import { assembleChatContext } from "../context/sources";
import { buildSystemPrompt } from "../context/prompt-template";

/**
 * 当前站点标识：用于 system prompt 的 site 字段。
 * 后续若需运行时配置，可从 RagRuntimeContext.config 透传。
 */
const SITE_NAME = "SmallAliceWeb";

export const chatRequestSchema = z.object({
	message: z.string().trim().min(1).max(4_000),
	conversationId: z.string().trim().min(1).max(128).optional(),
	/** 客户端页面上下文（FC-1 透传），缺失或非法时 400 拦截，不阻断成功后端响应。 */
	pageContext: pageContextSchema.optional(),
	/**
	 * MS-2 引入：请求级 provider 选择（与注册表 provider key 同源）。
	 * - 字段缺失时由装配层回退 activeProvider（spec Requirement 8）
	 * - 非法值由 zod enum 直接拒绝 → 400（spec 12.2 / plan 16.8 V3）
	 * - 选中的 provider 若未配置凭据由装配层返回 500 `RAG provider not configured`（不静默回退）
	 */
	provider: z.enum(["anthropic", "openai"]).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatSource = {
	id: string;
	content: string;
	score: number;
	sourcePath: string;
	headingPath: string[];
	headingIndex: number;
	headingAnchor: string;
	chunkIndex: number;
	imageUrls: string[];
};

export type ChatSourceDto = ChatSource & {
	sourceUrl: string;
	sourceHref: string;
};

export type ChatStreamRequest = ChatRequest & {
	sources: ChatSourceDto[];
	system: string;
	abortSignal?: AbortSignal;
	/** MS-2 引入：已通过 zod 校验的合法 provider 字段（或 undefined）；缺省由装配层回退 activeProvider。 */
	provider?: RagLlmProviderId;
};

export type ChatDependencies = {
	retrieve: (message: string, options: { limit: number }) => Promise<ChatSource[]>;
	stream: (request: ChatStreamRequest) => Promise<Response> | Response;
};

type ChatErrorResponse = {
	status: number;
	body: { success: false; code: number; message: string; data: null };
};

function linkAbortSignal(parentSignal: AbortSignal | undefined): {
	signal: AbortSignal;
	cleanup: () => void;
} {
	const controller = new AbortController();
	if (!parentSignal) return { signal: controller.signal, cleanup: () => undefined };
	const abort = () => controller.abort(parentSignal.reason);
	if (parentSignal.aborted) abort();
	else parentSignal.addEventListener("abort", abort, { once: true });
	return {
		signal: controller.signal,
		cleanup: () => parentSignal.removeEventListener("abort", abort),
	};
}

function wrapCancellableResponse(response: Response, controller: AbortController, cleanup: () => void): Response {
	if (!response.body) {
		cleanup();
		return response;
	}
	const reader = response.body.getReader();
	let settled = false;
	const finish = () => {
		if (settled) return;
		settled = true;
		cleanup();
	};
	const body = new ReadableStream<Uint8Array>({
		async pull(streamController) {
			try {
				const { done, value } = await reader.read();
				if (done) {
					finish();
					streamController.close();
				} else if (value) {
					streamController.enqueue(value);
				}
			} catch (error) {
				finish();
				streamController.error(error);
			}
		},
		async cancel(reason) {
			if (!settled) controller.abort(reason);
			finish();
			await reader.cancel(reason);
		},
	});
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
}

/** 接收可替换的检索与流式模型边界，并直接交还 AI SDK 的原生流响应。 */
export async function handleChatRequest(
	input: unknown,
	deps: ChatDependencies,
	options: { abortSignal?: AbortSignal } = {},
): Promise<Response | ChatErrorResponse> {
	const parsed = chatRequestSchema.safeParse(input);
	if (!parsed.success) {
		return {
			status: 400,
			body: { success: false, code: 400, message: "对话请求无效", data: null },
		};
	}

	const linkedAbort = linkAbortSignal(options.abortSignal);
	const upstreamAbortController = new AbortController();
	const forwardAbort = () => upstreamAbortController.abort(linkedAbort.signal.reason);
	if (linkedAbort.signal.aborted) forwardAbort();
	else linkedAbort.signal.addEventListener("abort", forwardAbort, { once: true });
	const cleanupAbort = () => {
		linkedAbort.signal.removeEventListener("abort", forwardAbort);
		linkedAbort.cleanup();
	};

	try {
		const sources = (await deps.retrieve(parsed.data.message, { limit: 5 })).map((source) => ({
			...source,
			sourceUrl: createSourceUrl(source.sourcePath),
			sourceHref: resolveSourceHref(source),
		}));
		const context = assembleChatContext(parsed.data.pageContext, SITE_NAME);
		const system = buildSystemPrompt(
			context,
			sources.map((source) => source.content),
		);

		const response = await deps.stream({
			...parsed.data,
			sources,
			system,
			abortSignal: upstreamAbortController.signal,
		});
		return wrapCancellableResponse(response, upstreamAbortController, cleanupAbort);
	} catch (error) {
		cleanupAbort();
		// MS-2: 请求选择了未配置凭据的 provider → 500 + 可识别错误 message（spec Requirement 8 / plan 16.4）
		if (error instanceof RagProviderNotConfiguredError) {
			return {
				status: 500,
				body: { success: false, code: 500, message: error.message, data: null },
			};
		}
		return {
			status: 500,
			body: { success: false, code: 500, message: "对话请求失败", data: null },
		};
	}
}
