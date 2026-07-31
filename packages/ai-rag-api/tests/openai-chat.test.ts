import { describe, expect, test } from "vitest";
import { createOpenAiChatStream } from "../server/services/openai-chat";

describe("OpenAI 聊天流适配器", () => {
	test("缺少 Nitro 私有配置时拒绝创建适配器且不请求模型", () => {
		expect(() =>
			createOpenAiChatStream({
				databaseUrl: "",
				embeddingModel: "",
				openaiApiKey: "",
				chatModel: "",
				knowledgeSyncToken: "",
				cronSecret: "",
				public: { apiBase: "/v1" },
			}),
		).toThrow("RAG chat provider is not configured");
	});
});
