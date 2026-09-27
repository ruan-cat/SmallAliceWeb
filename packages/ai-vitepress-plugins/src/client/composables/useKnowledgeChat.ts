import { useChat } from "@ai-sdk/vue";
import type { AiChatMessage, AiChatSource, ChatEvent } from "@ruan-cat-drill-doc/ai-vue";
import type { PageContext } from "@ruan-cat-drill-doc/ai-rag-core";
import { computed, ref, watch } from "vue";

type SourceFrame = {
	type: "source";
	data: {
		id: string;
		label: string;
		sourceHref: string;
		snippet?: string;
	};
};

type ActiveRequest = {
	requestId: number;
	knownMessageIds: Set<string>;
	targetAssistantMessageId?: string;
	stopped: boolean;
	completionNotified: boolean;
};

export type KnowledgeChatOptions = {
	/** 覆盖默认的本地聊天 API，便于文档站或本地集成测试使用。 */
	api?: string;
	/** 覆盖 AI SDK 使用的 fetch，实现本地 HTTP 或运行时代理。 */
	fetch?: typeof globalThis.fetch;
	/** 当前请求自然完成且产生新助手消息时触发一次。 */
	onResponseComplete?: () => void;
	/**
	 * 统一事件回调（FC-3 接入）：首 chunk 延迟触发的 response-metadata 事件经此出口；
	 * 旧消费方忽略即可（plan 14.6「现有 emit 契约不变」）。
	 */
	onChatEvent?: (event: ChatEvent) => void;
	/**
	 * 客户端页面上下文（FC-1 接入）：由宿主采集当前 VitePress 文档页元数据，
	 * 每次 send 时调用 getPageContext 重采最新 pagePath / title / keywords；
	 * 缺失或非法时由后端 pageContextSchema 拦截，前端不重试、不阻断
	 * （spec 11.6 验证层纪律 + plan 14.2「requiredToFetch 降级语义」）。
	 */
	getPageContext?: () => PageContext | undefined;
};

/** 解析文档站聊天 API，生产环境可通过 VITE_RAG_API_BASE 指向独立 Nitro 域名。 */
export function resolveKnowledgeChatApi(api?: string) {
	if (api?.trim()) return api.trim();
	const base = import.meta.env.VITE_RAG_API_BASE?.trim().replace(/\/+$/, "");
	return base ? `${base}/v1/chat` : "/v1/chat";
}

/** 将 data-stream 中的来源帧缩减为聊天组件可展示的安全字段。 */
function toSource(frame: unknown): AiChatSource | undefined {
	if (!frame || typeof frame !== "object" || !("type" in frame) || frame.type !== "source") return;
	const data = (frame as SourceFrame).data;
	if (!data || typeof data !== "object" || typeof data.id !== "string" || typeof data.sourceHref !== "string") {
		return;
	}

	return {
		id: data.id,
		label: typeof data.label === "string" ? data.label : "参考资料",
		sourceHref: data.sourceHref,
		...(typeof data.snippet === "string" ? { snippet: data.snippet } : {}),
	};
}

/** 展开 AI SDK data 帧可能产生的嵌套数组，统一提取来源。 */
function toSources(frame: unknown): AiChatSource[] {
	if (Array.isArray(frame)) return frame.flatMap(toSources);
	const source = toSource(frame);
	return source ? [source] : [];
}

/** 从原始 AI SDK data stream 捕获来源帧，避免客户端状态更新时序丢失来源。 */
export async function collectSourceFrames(
	stream: ReadableStream<Uint8Array>,
	onSources: (sources: AiChatSource[]) => void,
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	const consumeLine = (line: string) => {
		if (!line.startsWith("2:")) return;
		try {
			const sources = toSources(JSON.parse(line.slice(2)));
			if (sources.length) onSources(sources);
		} catch {}
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) consumeLine(line.trimEnd());
	}
	buffer += decoder.decode();
	if (buffer) consumeLine(buffer.trimEnd());
}

/**
 * 为 VitePress 页面提供本地 RAG 聊天 transport、来源帧和可清除错误状态。
 *
 * @param conversationId 会话追溯标识（FC-5）：
 *   - 默认 `"knowledge-chat"` 向后兼容：所有 VitePress 页面共享同一会话分组，
 *     适合无状态的"单轮问答"使用方式
 *   - 宿主可传入页面级 ID 提升回流粒度：示例 `docs/getting-started#s-3f9a`（即
 *     `${pagePath}#${sessionSeed}`），让后端 qa_records 与评估运行能按页面分组
 *   - **仅作追溯分组标识，不携带历史注入语义**：前端不会基于该 ID 注入历史消息；
 *     多轮能力由宿主（sessionStorage / 路由状态）自行管理，本函数不强制实现
 *   - 该 ID 出现在请求体（experimental_prepareRequestBody）、日志（Nitro 终端）
 *     与 ai-vue response-metadata 事件（FC-3），形成完整的回链
 */
export function useKnowledgeChat(conversationId = "knowledge-chat", options: KnowledgeChatOptions = {}) {
	const capturedSources = ref<AiChatSource[]>([]);
	const emit = options.onChatEvent;
	const sourceAwareFetch: typeof fetch = async (input, init) => {
		const fetcher = options.fetch ?? globalThis.fetch;
		const requestStart = Date.now();
		const response = await fetcher(input, init);
		if (!response.body) return response;
		const [rawCapture, responseStream] = response.body.tee();
		/**
		 * 在 captureStream 上挂 TransformStream：首次非空 chunk 触发 response-metadata 事件，
		 * ttftMs = firstChunkAt - requestStart。
		 */
		let firstChunkReported = false;
		const captureStream = rawCapture.pipeThrough(
			new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, controller) {
					if (!firstChunkReported) {
						firstChunkReported = true;
						emit?.({
							type: "response-metadata",
							conversationId,
							tags: ["chat", "response", "metadata"],
							properties: { ttftMs: Date.now() - requestStart },
						});
					}
					controller.enqueue(chunk);
				},
			}),
		);
		void collectSourceFrames(captureStream, (nextSources) => {
			const byId = new Map(capturedSources.value.map((source) => [source.id, source]));
			for (const source of nextSources) byId.set(source.id, source);
			capturedSources.value = [...byId.values()];
		}).catch(() => {});
		return new Response(responseStream, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		});
	};
	const chat = useChat({
		api: resolveKnowledgeChatApi(options.api),
		id: conversationId,
		fetch: sourceAwareFetch,
		experimental_prepareRequestBody({ messages }) {
			const latestMessage = messages.at(-1);
			/**
			 * 每次 send 时按需采集最新 pageContext；
			 * 宿主未传 getPageContext 时（向后兼容）跳过 pageContext 字段。
			 */
			const pageContext = options.getPageContext?.();
			return {
				message: typeof latestMessage?.content === "string" ? latestMessage.content : "",
				conversationId,
				...(pageContext ? { pageContext } : {}),
			};
		},
	});
	const activeRequest = ref<ActiveRequest>();
	let nextRequestId = 0;
	const sourcesByAssistantMessageId = ref<Record<string, AiChatSource[]>>({});
	const sources = computed(() => {
		const byId = new Map(capturedSources.value.map((source) => [source.id, source]));
		for (const source of (chat.data.value ?? []).flatMap(toSources)) byId.set(source.id, source);
		return [...byId.values()];
	});
	const targetAssistantMessageId = computed(() => {
		const request = activeRequest.value;
		if (!request) return;
		if (
			request.targetAssistantMessageId &&
			chat.messages.value.some((message) => message.id === request.targetAssistantMessageId)
		) {
			return request.targetAssistantMessageId;
		}
		return chat.messages.value.find(
			(message) => message.role === "assistant" && !request.knownMessageIds.has(message.id),
		)?.id;
	});

	watch(targetAssistantMessageId, (messageId) => {
		const request = activeRequest.value;
		if (!request || !messageId || request.targetAssistantMessageId === messageId) return;
		activeRequest.value = { ...request, targetAssistantMessageId: messageId };
	});

	watch([targetAssistantMessageId, sources], ([messageId, requestSources]) => {
		if (!messageId) return;
		sourcesByAssistantMessageId.value = {
			...sourcesByAssistantMessageId.value,
			[messageId]: requestSources,
		};
	});

	const messages = computed<AiChatMessage[]>(() =>
		chat.messages.value.map((message) => {
			const mappedSources = sourcesByAssistantMessageId.value[message.id];
			const pendingSources = message.id === targetAssistantMessageId.value ? sources.value : undefined;
			const messageSources = mappedSources?.length ? mappedSources : pendingSources;
			return {
				id: message.id,
				role: message.role === "assistant" ? "assistant" : "user",
				content: message.content,
				...(messageSources?.length ? { sources: messageSources } : {}),
			};
		}),
	);
	const isResponding = computed(() => chat.status.value === "submitted" || chat.status.value === "streaming");
	const errorMessage = computed(() => {
		if (!chat.error.value) return;
		return chat.error.value.message.includes("RAG_NOT_CONFIGURED")
			? "知识库服务尚未配置，请稍后再试。"
			: chat.error.value.message;
	});

	/** 发送一条非空用户消息。 */
	async function send(message: AiChatMessage) {
		const content = message.content.trim();
		if (!content) return;
		const requestId = ++nextRequestId;
		activeRequest.value = {
			requestId,
			knownMessageIds: new Set(chat.messages.value.map((item) => item.id)),
			stopped: false,
			completionNotified: false,
		};
		chat.setData(undefined);
		capturedSources.value = [];
		/**
		 * ai-vue AiChatMessage 携带 sources/component/itemType/data 等渲染指令，
		 * @ai-sdk/vue 的 CreateMessage 不识别这些字段——AI SDK 不会读它们，丢失不影响 chat 行为。
		 * 显式 narrow 出 id/role/content 三字段后再 cast，避免触发 noUnusedParameters 等隐性问题。
		 */
		const sdkMessage = { id: message.id, role: message.role, content } as Parameters<typeof chat.append>[0];
		await chat.append(sdkMessage);

		const request = activeRequest.value;
		if (!request || request.requestId !== requestId || request.stopped || request.completionNotified) return;
		if (chat.error.value) return;
		const hasNewAssistantMessage = chat.messages.value.some(
			(item) => item.role === "assistant" && !request.knownMessageIds.has(item.id),
		);
		if (!hasNewAssistantMessage) return;

		activeRequest.value = { ...request, completionNotified: true };
		options.onResponseComplete?.();
	}

	/** 中止当前 SDK 请求并保留已接收的流内容。 */
	function stop() {
		const request = activeRequest.value;
		if (request && !request.stopped) {
			activeRequest.value = { ...request, stopped: true };
		}
		chat.stop();
	}

	/** 清除当前 SDK 错误，使对话可继续输入。 */
	function clearError() {
		chat.error.value = undefined;
	}

	return { messages, isResponding, errorMessage, send, stop, clearError };
}
