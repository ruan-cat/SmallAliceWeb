import { createOpenAI } from "@ai-sdk/openai";
import { StreamData, streamText } from "ai";
import type { RagNitroConfig } from "../../src/runtime-config";
import type { ChatDependencies } from "../contracts/chat";

/** 规范化 OpenAI 兼容服务地址，确保 SDK 使用带 `/v1` 的 API 根路径。 */
export function normalizeOpenAIBaseUrl(baseUrl: string): string {
	const normalized = baseUrl.trim().replace(/\/+$/, "");
	if (!normalized) return "";
	return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

/** 以 Nitro 私有运行时配置创建聊天流适配器，不读取裸环境变量。 */
export function createOpenAiChatStream(config: RagNitroConfig["runtimeConfig"]): ChatDependencies["stream"] {
	if (!config.openaiApiKey || !config.chatModel) throw new Error("RAG chat provider is not configured");

	const provider = createOpenAI({
		apiKey: config.openaiApiKey,
		...(config.baseUrl ? { baseURL: normalizeOpenAIBaseUrl(config.baseUrl) } : {}),
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
			model: provider(config.chatModel),
			system: request.system,
			prompt: request.message,
		}).toDataStreamResponse({ data });
	};
}
