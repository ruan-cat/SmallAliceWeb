import { defineEventHandler, readBody, setResponseStatus } from "nitro/h3";
import { type ChatDependencies, handleChatRequest } from "../../contracts/chat";
import { ragNotConfiguredResponse } from "../../contracts/errors";

/** 仅接入已装配的 RAG 依赖；未装配时拒绝请求，避免静默调用外部模型。 */
export default defineEventHandler(async (event) => {
	const rag = event.context.rag as Partial<ChatDependencies> | undefined;
	if (typeof rag?.retrieve !== "function" || typeof rag.stream !== "function") {
		setResponseStatus(event, 503);
		return ragNotConfiguredResponse;
	}

	const response = await handleChatRequest(
		await readBody(event),
		{
			retrieve: rag.retrieve,
			stream: rag.stream,
		},
		{ abortSignal: event.req.signal },
	);

	if (response instanceof Response) return response;
	setResponseStatus(event, response.status);
	return response.body;
});
