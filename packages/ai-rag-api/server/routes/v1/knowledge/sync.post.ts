import { defineEventHandler, getHeader, readBody, setResponseStatus } from "nitro/h3";
import { ragNotConfiguredResponse } from "../../../contracts/errors";
import { handleSyncRequest } from "../../../contracts/handlers";

/** 上游 DOCX 转换完成后使用的受控同步入口。 */
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
		await readBody(event),
		{
			method: "POST",
			headers: { authorization: getHeader(event, "authorization") },
		},
		{ sync: rag.sync },
		rag?.config ?? {},
	);
	setResponseStatus(event, response.status);
	return response.body;
});
