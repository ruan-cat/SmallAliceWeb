import { describe, expect, test } from "vitest";
import { createRagCorsPreflightResponse } from "../server/cors";

describe("RAG API CORS 预检", () => {
	test("为 /v1 chat 的跨域 JSON POST 返回 204 与许可头", () => {
		const response = createRagCorsPreflightResponse({ method: "OPTIONS", pathname: "/v1/chat" });

		expect(response).toBeInstanceOf(Response);
		expect(response?.status).toBe(204);
		expect(response?.headers.get("access-control-allow-origin")).toBe("*");
		expect(response?.headers.get("access-control-allow-methods")).toContain("POST");
	});

	test("不拦截非 API 或非 OPTIONS 请求", () => {
		expect(createRagCorsPreflightResponse({ method: "POST", pathname: "/v1/chat" })).toBeUndefined();
		expect(createRagCorsPreflightResponse({ method: "OPTIONS", pathname: "/health" })).toBeUndefined();
	});
});
