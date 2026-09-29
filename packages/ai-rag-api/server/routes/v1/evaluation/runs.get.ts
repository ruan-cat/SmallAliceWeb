import { defineEventHandler, getQuery, setResponseStatus } from "nitro/h3";
import { ragNotConfiguredResponse } from "../../../contracts/errors";
import { handleEvaluationRunsRequest } from "../../../contracts/handlers";

/** 返回评估运行分页列表契约（EV-3），数据 provider 由部署层注入。 */
export default defineEventHandler(async (event) => {
	const rag = event.context.rag as
		| { evaluationRuns?: (options: { limit: number; cursor?: string }) => Promise<unknown[]> }
		| undefined;
	if (typeof rag?.evaluationRuns !== "function") {
		setResponseStatus(event, 503);
		return ragNotConfiguredResponse;
	}
	const response = await handleEvaluationRunsRequest(getQuery(event), {
		listRuns: rag.evaluationRuns,
	});
	setResponseStatus(event, response.status);
	return response.body;
});
