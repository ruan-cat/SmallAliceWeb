import { defineEventHandler, getHeader, setResponseStatus } from "nitro/h3";
import { handleSyncRequest } from "../../../contracts/handlers";

/** Vercel Cron 使用 CRON_SECRET 触发的同一同步服务入口。 */
export default defineEventHandler(async (event) => {
	const rag = event.context.rag as
		| { config?: { syncToken?: string; cronSecret?: string }; sync?: (input: { dryRun: boolean }) => Promise<unknown> }
		| undefined;
	const response = await handleSyncRequest(
		{},
		{ method: "GET", headers: { authorization: getHeader(event, "authorization") } },
		{ sync: rag?.sync ?? (async () => ({ status: "accepted" })) },
		rag?.config ?? {},
	);
	setResponseStatus(event, response.status);
	return response.body;
});
