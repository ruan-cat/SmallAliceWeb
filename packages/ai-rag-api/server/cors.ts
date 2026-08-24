type CorsRequest = Readonly<{
	method: string;
	pathname: string;
}>;

const ragCorsHeaders = {
	"access-control-allow-headers": "content-type",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-allow-origin": "*",
};

/** 为跨域 JSON 请求创建 RAG API 的成功预检响应。 */
export function createRagCorsPreflightResponse(request: CorsRequest): Response | undefined {
	if (request.method !== "OPTIONS" || !request.pathname.startsWith("/v1/")) return undefined;

	return new Response(null, { status: 204, headers: ragCorsHeaders });
}
