import { useChat } from "@ai-sdk/vue";
import type { AiChatMessage, AiChatSource } from "@ruan-cat-drill-doc/ai-vue";
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
	knownMessageIds: Set<string>;
	targetAssistantMessageId?: string;
};

export type KnowledgeChatOptions = {
	/** 覆盖默认的本地聊天 API，便于文档站或本地集成测试使用。 */
	api?: string;
	/** 覆盖 AI SDK 使用的 fetch，实现本地 HTTP 或运行时代理。 */
	fetch?: typeof globalThis.fetch;
};

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

/** 为 VitePress 页面提供本地 RAG 聊天 transport、来源帧和可清除错误状态。 */
export function useKnowledgeChat(conversationId = "knowledge-chat", options: KnowledgeChatOptions = {}) {
	const chat = useChat({
		api: options.api ?? "/v1/chat",
		id: conversationId,
		fetch: options.fetch,
		experimental_prepareRequestBody({ messages }) {
			const latestMessage = messages.at(-1);
			return {
				message: typeof latestMessage?.content === "string" ? latestMessage.content : "",
				conversationId,
			};
		},
	});
	const activeRequest = ref<ActiveRequest>();
	const sourcesByAssistantMessageId = ref<Record<string, AiChatSource[]>>({});
	const sources = computed(() =>
		(chat.data.value ?? []).flatMap((frame) => {
			const source = toSource(frame);
			return source ? [source] : [];
		}),
	);
	const targetAssistantMessageId = computed(() => {
		const request = activeRequest.value;
		if (!request) return;
		if (request.targetAssistantMessageId) return request.targetAssistantMessageId;
		return chat.messages.value.find(
			(message) => message.role === "assistant" && !request.knownMessageIds.has(message.id),
		)?.id;
	});

	watch(targetAssistantMessageId, (messageId) => {
		const request = activeRequest.value;
		if (!request || request.targetAssistantMessageId || !messageId) return;
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
		chat.messages.value.map((message) => ({
			id: message.id,
			role: message.role === "assistant" ? "assistant" : "user",
			content: message.content,
			...(sourcesByAssistantMessageId.value[message.id]?.length
				? { sources: sourcesByAssistantMessageId.value[message.id] }
				: {}),
		})),
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
		activeRequest.value = {
			knownMessageIds: new Set(chat.messages.value.map((item) => item.id)),
		};
		chat.setData(undefined);
		await chat.append({ ...message, content });
	}

	/** 中止当前 SDK 请求并保留已接收的流内容。 */
	function stop() {
		chat.stop();
	}

	/** 清除当前 SDK 错误，使对话可继续输入。 */
	function clearError() {
		chat.error.value = undefined;
	}

	return { messages, isResponding, errorMessage, send, stop, clearError };
}
