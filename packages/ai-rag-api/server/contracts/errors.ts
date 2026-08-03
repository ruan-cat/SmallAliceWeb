export class ApiHttpError extends Error {
	constructor(
		public readonly status: number,
		public readonly errorCode: string,
		message: string,
	) {
		super(message);
		this.name = "ApiHttpError";
	}
}

/** RAG 运行时未完成装配时返回的统一响应。 */
export const ragNotConfiguredResponse = {
	success: false,
	code: 503,
	message: "RAG_NOT_CONFIGURED",
	data: null,
} as const;

/** 将业务异常转换为统一的 API 响应体。 */
export function toErrorResponse(error: unknown, fallback: string) {
	if (error instanceof ApiHttpError) {
		return {
			success: false,
			code: error.status,
			message: error.message,
			data: null,
		};
	}
	return { success: false, code: 500, message: fallback, data: null };
}

/** 提取可公开的 HTTP 状态码，未知异常统一视为 500。 */
export function getStatusCode(error: unknown): number {
	return error instanceof ApiHttpError ? error.status : 500;
}
