import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { RagNitroConfig } from "../../src/runtime-config";
import type { ChatDependencies } from "../contracts/chat";

/** 以 Nitro 私有运行时配置创建聊天流适配器，不读取裸环境变量。 */
export function createOpenAiChatStream(config: RagNitroConfig["runtimeConfig"]): ChatDependencies["stream"] {
	if (!config.openaiApiKey || !config.chatModel) throw new Error("RAG chat provider is not configured");

	const provider = createOpenAI({ apiKey: config.openaiApiKey });
	return (request) =>
		streamText({
			model: provider(config.chatModel),
			system: request.system,
			prompt: request.message,
		}).toDataStreamResponse();
}
