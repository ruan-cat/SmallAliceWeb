import { createSourceUrl, resolveSourceHref } from "@ruan-cat-drill-doc/ai-rag-core";
import { assertKnowledgeSyncAuth, type KnowledgeSyncCredentials } from "./auth";
import { ApiHttpError, getStatusCode, toErrorResponse } from "./errors";
export { searchRequestSchema, syncRequestSchema, syncRunsQuerySchema, evaluationRunsQuerySchema } from "./schemas";
import { searchRequestSchema, syncRequestSchema, syncRunsQuerySchema, evaluationRunsQuerySchema } from "./schemas";

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
	parentId?: string;
	strategy?: string;
};

type HandlerResult<T> = { status: number; body: T };

type ApiSuccess<T> = { success: true; code: 200; message: "ok"; data: T };

const success = <T>(data: T): ApiSuccess<T> => ({
	success: true,
	code: 200,
	message: "ok",
	data,
});

/** 将检索结果映射为前端可直接展示和跳转的来源 DTO。 */
export async function handleSearchRequest(
	input: unknown,
	deps: {
		search: (
			query: string,
			options: {
				limit: number;
				k: number;
				candidateLimit: number;
				finalLimit: number;
			},
		) => Promise<SearchItem[]>;
	},
): Promise<
	HandlerResult<
		ApiSuccess<{
			items: Array<SearchItem & { sourceUrl: string; sourceHref: string }>;
		}>
	>
> {
	try {
		const request = searchRequestSchema.parse(input);
		const items = await deps.search(request.query, {
			limit: request.finalLimit,
			candidateLimit: request.candidateLimit,
			finalLimit: request.finalLimit,
			k: request.k,
		});
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
		return {
			status: getStatusCode(error),
			body: toErrorResponse(error, "搜索失败") as never,
		};
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
		return {
			status: getStatusCode(error),
			body: toErrorResponse(error, "同步失败"),
		};
	}
}

/** 解析分页参数并返回同步记录。 */
export async function handleSyncRunsRequest(
	input: unknown,
	deps: { listRuns: (options: { limit: number }) => Promise<unknown[]> },
) {
	try {
		const query = syncRunsQuerySchema.parse(input);
		return {
			status: 200,
			body: success({ items: await deps.listRuns({ limit: query.limit }) }),
		};
	} catch (error) {
		return {
			status: getStatusCode(error),
			body: toErrorResponse(error, "同步记录查询失败"),
		};
	}
}

/** 解析分页参数并返回评估运行列表（EV-3，plan 17.4）。查询非法时 400（chat.ts safeParse 约定）。 */
export async function handleEvaluationRunsRequest(
	input: unknown,
	deps: {
		listRuns: (options: { limit: number; cursor?: string }) => Promise<unknown[]>;
	},
) {
	try {
		const parsed = evaluationRunsQuerySchema.safeParse(input);
		if (!parsed.success) {
			return {
				status: 400,
				body: { success: false, code: 400, message: "评估运行查询无效", data: null },
			};
		}
		return {
			status: 200,
			body: success({
				items: await deps.listRuns({ limit: parsed.data.limit, cursor: parsed.data.cursor }),
			}),
		};
	} catch (error) {
		return {
			status: getStatusCode(error),
			body: toErrorResponse(error, "评估运行查询失败"),
		};
	}
}

/** 按 id 返回评估运行详情；不存在时 404 与统一错误体一致。 */
export async function handleEvaluationRunByIdRequest(id: string, deps: { getRun: (id: string) => Promise<unknown> }) {
	try {
		const run = await deps.getRun(id);
		if (!run) {
			throw new ApiHttpError(404, "EVALUATION_RUN_NOT_FOUND", "评估运行不存在。");
		}
		return { status: 200, body: success(run) };
	} catch (error) {
		return {
			status: getStatusCode(error),
			body: toErrorResponse(error, "评估运行查询失败"),
		};
	}
}

export { ApiHttpError };
