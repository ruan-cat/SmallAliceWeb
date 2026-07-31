import { defineEventHandler, readBody, setResponseStatus } from "nitro/h3";
import { handleChatRequest, type ChatDependencies } from "../../contracts/chat";

const ragNotConfigured = { success: false, code: 503, message: "RAG_NOT_CONFIGURED", data: null } as const;

/** 仅接入已装配的 RAG 依赖；未装配时拒绝请求，避免静默调用外部模型。 */
export default defineEventHandler(async (event) => {
	const rag = event.context.rag as Partial<ChatDependencies> | undefined;
	if (typeof rag?.retrieve !== "function" || typeof rag.stream !== "function") {
		setResponseStatus(event, 503);
		return ragNotConfigured;
	}

	const response = await handleChatRequest(await readBody(event), {
		retrieve: rag.retrieve,
		stream: rag.stream,
	});

	if (response instanceof Response) return response;
	setResponseStatus(event, response.status);
	return response.body;
});
