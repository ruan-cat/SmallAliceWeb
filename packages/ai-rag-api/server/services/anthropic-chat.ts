import { createAnthropic } from "@ai-sdk/anthropic";
import { StreamData, streamText } from "ai";
import type { RagLlmProviderConfig } from "../../src/llm-config";
import type { ChatDependencies } from "../contracts/chat";

type AnthropicChatConfig = RagLlmProviderConfig & {
	apiKey: string;
};

export type AnthropicTelemetryEvent = {
	event:
		| "request_start"
		| "response"
		| "message_start"
		| "content_block_delta"
		| "message_stop"
		| "abort"
		| "stream_error";
	endpoint: string;
	status?: number;
	elapsedMs?: number;
	error?: string;
};

export type AnthropicTelemetryLogger = (event: AnthropicTelemetryEvent) => void;

function defaultAnthropicTelemetryLogger(event: AnthropicTelemetryEvent): void {
	console.info(`[rag.anthropic] ${JSON.stringify(event)}`);
}

function resolveEndpoint(input: RequestInfo | URL): string {
	try {
		return new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).pathname;
	} catch {
		return "unknown";
	}
}

async function observeAnthropicSse(
	stream: ReadableStream<Uint8Array>,
	endpoint: string,
	logger: AnthropicTelemetryLogger,
): Promise<void> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const consumeEvent = (rawEvent: string) => {
		const eventName = rawEvent
			.split("\n")
			.find((line) => line.startsWith("event:"))
			?.slice("event:".length)
			.trim();
		if (eventName === "message_start" || eventName === "content_block_delta" || eventName === "message_stop") {
			logger({ event: eventName, endpoint });
		}
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });
		const events = buffer.split("\n\n");
		buffer = events.pop() ?? "";
		for (const event of events) consumeEvent(event.replaceAll("\r\n", "\n"));
	}
	buffer += decoder.decode();
	if (buffer.trim()) consumeEvent(buffer.replaceAll("\r\n", "\n"));
}

/** 包装 Anthropic fetch，仅记录脱敏的请求、响应、SSE 事件和 abort 生命周期。 */
export function createAnthropicObservedFetch(
	logger: AnthropicTelemetryLogger = defaultAnthropicTelemetryLogger,
): typeof fetch {
	return async (input, init) => {
		const endpoint = resolveEndpoint(input);
		const startedAt = Date.now();
		let abortLogged = false;
		const logAbort = () => {
			if (abortLogged) return;
			abortLogged = true;
			logger({ event: "abort", endpoint, elapsedMs: Date.now() - startedAt });
		};
		init?.signal?.addEventListener("abort", logAbort, { once: true });
		logger({ event: "request_start", endpoint });

		try {
			const response = await globalThis.fetch(input, init);
			logger({ event: "response", endpoint, status: response.status, elapsedMs: Date.now() - startedAt });
			if (!response.body) return response;
			const [observedStream, forwardedStream] = response.body.tee();
			void observeAnthropicSse(observedStream, endpoint, logger).catch((error) => {
				logger({
					event: "stream_error",
					endpoint,
					elapsedMs: Date.now() - startedAt,
					error: error instanceof Error ? error.name : String(error),
				});
			});
			return new Response(forwardedStream, {
				status: response.status,
				statusText: response.statusText,
				headers: response.headers,
			});
		} catch (error) {
			if (init?.signal?.aborted) logAbort();
			logger({
				event: "stream_error",
				endpoint,
				elapsedMs: Date.now() - startedAt,
				error: error instanceof Error ? error.name : String(error),
			});
			throw error;
		}
	};
}

/** 以 Anthropic Messages provider 创建规范化的 AI SDK 聊天流。 */
export function createAnthropicChatStream(config: AnthropicChatConfig): ChatDependencies["stream"] {
	if (!config.apiKey || !config.baseUrl || !config.model) throw new Error("RAG chat provider is not configured");

	const provider = createAnthropic({
		apiKey: config.apiKey,
		baseURL: config.baseUrl,
		fetch: createAnthropicObservedFetch(),
	});
	return (request) => {
		const data = new StreamData();
		for (const source of request.sources) {
			data.append({
				type: "source",
				data: {
					id: source.id,
					label: source.headingPath.at(-1) ?? source.sourcePath,
					sourceHref: source.sourceHref,
				},
			});
		}
		data.close();

		return streamText({
			model: provider.messages(config.model),
			system: request.system,
			prompt: request.message,
			abortSignal: request.abortSignal,
			onError({ error }) {
				console.error("RAG chat stream failed", error instanceof Error ? error.message : String(error));
			},
		}).toDataStreamResponse({ data });
	};
}
