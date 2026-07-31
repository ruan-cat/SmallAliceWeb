import { createSourceUrl, resolveSourceHref } from "@ruan-cat-drill-doc/ai-rag-core";
import { assertKnowledgeSyncAuth, type KnowledgeSyncCredentials } from "./auth";
import { ApiHttpError, getStatusCode, toErrorResponse } from "./errors";
export { searchRequestSchema, syncRequestSchema, syncRunsQuerySchema } from "./schemas";
import { searchRequestSchema, syncRequestSchema, syncRunsQuerySchema } from "./schemas";

type SearchItem = {
	id: string;
	content: string;
	score: number;
	sourcePath: string;
	headingPath: string[];
	headingIndex: number;
	headingAnchor: string;
	chunkIndex: number;
	imageUrls: string[];
};

type HandlerResult<T> = { status: number; body: T };

type ApiSuccess<T> = { success: true; code: 200; message: "ok"; data: T };

const success = <T>(data: T): ApiSuccess<T> => ({ success: true, code: 200, message: "ok", data });

/** 将检索结果映射为前端可直接展示和跳转的来源 DTO。 */
export async function handleSearchRequest(
	input: unknown,
	deps: { search: (query: string, options: { limit: number; k: number }) => Promise<SearchItem[]> },
): Promise<HandlerResult<ApiSuccess<{ items: Array<SearchItem & { sourceUrl: string; sourceHref: string }> }>>> {
	try {
		const request = searchRequestSchema.parse(input);
		const items = await deps.search(request.query, { limit: request.limit, k: request.k });
		return {
			status: 200,
			body: success({
				items: items.map((item) => ({
					...item,
					sourceUrl: createSourceUrl(item.sourcePath),
					sourceHref: resolveSourceHref(item),
				})),
			}),
		};
	} catch (error) {
		return { status: getStatusCode(error), body: toErrorResponse(error, "搜索失败") as never };
	}
}

/** 校验同步凭据并把并发冲突映射成稳定 HTTP 响应。 */
export async function handleSyncRequest(
	input: unknown,
	request: { method: string; headers: Record<string, string | undefined> },
	deps: { sync: (input: { dryRun: boolean }) => Promise<unknown> },
	credentials: KnowledgeSyncCredentials,
) {
	try {
		assertKnowledgeSyncAuth(request.method, request.headers, credentials);
		const body = syncRequestSchema.parse(input);
		return { status: 200, body: success(await deps.sync(body)) };
	} catch (error) {
		return { status: getStatusCode(error), body: toErrorResponse(error, "同步失败") };
	}
}

/** 解析分页参数并返回同步记录。 */
export async function handleSyncRunsRequest(
	input: unknown,
	deps: { listRuns: (options: { limit: number }) => Promise<unknown[]> },
) {
	try {
		const query = syncRunsQuerySchema.parse(input);
		return { status: 200, body: success({ items: await deps.listRuns({ limit: query.limit }) }) };
	} catch (error) {
		return { status: getStatusCode(error), body: toErrorResponse(error, "同步记录查询失败") };
	}
}

export { ApiHttpError };
