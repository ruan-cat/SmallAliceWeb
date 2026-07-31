import { defineEventHandler, readBody, setResponseStatus } from "nitro/h3";
import { handleSearchRequest } from "../../contracts/handlers";

/** 搜索路由的离线契约：先完成 schema 校验，再交给注入的 provider。 */
export default defineEventHandler(async (event) => {
	const rag = event.context.rag as { search?: Parameters<typeof handleSearchRequest>[1]["search"] } | undefined;
	const response = await handleSearchRequest(await readBody(event), {
		search: rag?.search ?? (async () => []),
	});
	setResponseStatus(event, response.status);
	return response.body;
});
