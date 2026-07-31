import { defineEventHandler, getQuery, setResponseStatus } from "nitro/h3";
import { handleSyncRunsRequest } from "../../../contracts/handlers";

/** 返回同步记录查询契约，数据 provider 由部署层注入。 */
export default defineEventHandler(async (event) => {
	const rag = event.context.rag as { syncRuns?: (options: { limit: number }) => Promise<unknown[]> } | undefined;
	const response = await handleSyncRunsRequest(getQuery(event), { listRuns: rag?.syncRuns ?? (async () => []) });
	setResponseStatus(event, response.status);
	return response.body;
});
