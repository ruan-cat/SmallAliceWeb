import { defineEventHandler, getHeader, setResponseStatus } from "nitro/h3";
import { ragNotConfiguredResponse } from "../../../contracts/errors";
import { handleSyncRequest } from "../../../contracts/handlers";

/** Vercel Cron 使用 CRON_SECRET 触发的同一同步服务入口。 */
export default defineEventHandler(async (event) => {
	const rag = event.context.rag as
		| {
				config?: { syncToken?: string; cronSecret?: string };
				sync?: (input: { dryRun: boolean }) => Promise<unknown>;
		  }
		| undefined;
	if (typeof rag?.sync !== "function") {
		setResponseStatus(event, 503);
		return ragNotConfiguredResponse;
	}
	const response = await handleSyncRequest(
		{},
		{
			method: "GET",
			headers: { authorization: getHeader(event, "authorization") },
		},
		{ sync: rag.sync },
		rag?.config ?? {},
	);
	setResponseStatus(event, response.status);
	return response.body;
});
