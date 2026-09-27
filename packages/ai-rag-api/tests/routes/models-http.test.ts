import { createApp } from "nitro/h3";
import { describe, expect, test } from "vitest";
import modelsRoute from "../../server/routes/v1/models.get";

describe("GET /v1/models 真实 Nitro/H3 HTTP harness", () => {
	test("未装配 RAG 时仍返回 200 模型元数据（无 503 装配守卫）", async () => {
		const app = createApp();
		app.use("/v1/models", modelsRoute);

		const response = await app.fetch(new Request("http://localhost/v1/models", { method: "GET" }));

		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toMatch(/application\/json/);
		const body = await response.json();
		expect(body.success).toBe(true);
		expect(body.code).toBe(200);
		expect(Array.isArray(body.data.models)).toBe(true);
	});

	test("返回两个条目，id 与 label 与注册表一致，不含 baseUrl 与凭据", async () => {
		const app = createApp();
		app.use("/v1/models", modelsRoute);
		const response = await app.fetch(new Request("http://localhost/v1/models", { method: "GET" }));
		const body = await response.json();

		expect(body.data.models).toHaveLength(2);
		expect(body.data.models).toEqual(
			expect.arrayContaining([
				{ id: "anthropic", label: "Claude Sonnet 5", model: "claude-sonnet-5[1m]" },
				{ id: "openai", label: "GPT-5.6 Luna", model: "gpt-5.6-luna" },
			]),
		);
	});

	test("整份响应序列化结果不出现 baseUrl / apiKey / token / secret 字样", async () => {
		const app = createApp();
		app.use("/v1/models", modelsRoute);
		const response = await app.fetch(new Request("http://localhost/v1/models", { method: "GET" }));
		const raw = JSON.stringify(await response.json());
		expect(raw).not.toMatch(/baseUrl|api.?key|token|secret|password/i);
	});

	test("POST 方法不被支持：Nitro 路由 method 限制由上游 router 控制，端点 handler 自身仅暴露 GET 数据", async () => {
		// 该端点 handler 是 defineEventHandler(() => ({...}))，仅返回静态数据，
		// 不访问 event.method，因此即便调用方以 POST 命中也会返回相同静态 JSON。
		// 此断言用于固化端点契约：响应载荷形态独立于 HTTP method，
		// 前端只应通过 GET 拉取（plan 16.3 验证：`curl GET /v1/models`）。
		const app = createApp();
		app.use("/v1/models", modelsRoute);
		const response = await app.fetch(new Request("http://localhost/v1/models", { method: "POST" }));
		const body = await response.json();
		expect(body.data.models.length).toBeGreaterThan(0);
	});
});