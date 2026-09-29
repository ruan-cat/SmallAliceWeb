import { defineEventHandler, getRouterParam, setResponseStatus } from "nitro/h3";
import { ragNotConfiguredResponse } from "../../../contracts/errors";
import { handleEvaluationRunByIdRequest } from "../../../contracts/handlers";

/** 返回单条评估运行详情契约（EV-3），数据 provider 由部署层注入。 */
export default defineEventHandler(async (event) => {
	const rag = event.context.rag as { evaluationRun?: (id: string) => Promise<unknown> } | undefined;
	if (typeof rag?.evaluationRun !== "function") {
		setResponseStatus(event, 503);
		return ragNotConfiguredResponse;
	}
	const id = getRouterParam(event, "id") ?? "";
	const response = await handleEvaluationRunByIdRequest(id, {
		getRun: rag.evaluationRun,
	});
	setResponseStatus(event, response.status);
	return response.body;
});
