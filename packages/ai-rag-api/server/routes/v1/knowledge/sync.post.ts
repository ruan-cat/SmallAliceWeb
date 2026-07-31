import { defineEventHandler, getHeader, readBody, setResponseStatus } from "nitro/h3";
import { handleSyncRequest } from "../../../contracts/handlers";

/** 上游 DOCX 转换完成后使用的受控同步入口。 */
export default defineEventHandler(async (event) => {
	const rag = event.context.rag as
		| { config?: { syncToken?: string; cronSecret?: string }; sync?: (input: { dryRun: boolean }) => Promise<unknown> }
		| undefined;
	const response = await handleSyncRequest(
		await readBody(event),
		{ method: "POST", headers: { authorization: getHeader(event, "authorization") } },
		{ sync: rag?.sync ?? (async () => ({ status: "accepted" })) },
		rag?.config ?? {},
	);
	setResponseStatus(event, response.status);
	return response.body;
});
