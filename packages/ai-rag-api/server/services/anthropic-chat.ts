import { createAnthropic } from "@ai-sdk/anthropic";
import { StreamData, streamText } from "ai";
import type { RagLlmProviderConfig } from "../../src/llm-config";
import type { ChatDependencies } from "../contracts/chat";

type AnthropicChatConfig = RagLlmProviderConfig & {
	apiKey: string;
};

/** 以 Anthropic Messages provider 创建规范化的 AI SDK 聊天流。 */
export function createAnthropicChatStream(config: AnthropicChatConfig): ChatDependencies["stream"] {
	if (!config.apiKey || !config.baseUrl || !config.model) throw new Error("RAG chat provider is not configured");

	const provider = createAnthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
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
