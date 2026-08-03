import { createApp } from "nitro/h3";
import { describe, expect, test } from "vitest";
import syncRunsRoute from "../../server/routes/v1/knowledge/sync-runs.get";
import syncGetRoute from "../../server/routes/v1/knowledge/sync.get";
import syncPostRoute from "../../server/routes/v1/knowledge/sync.post";
import searchRoute from "../../server/routes/v1/search.post";

const expectedNotConfigured = {
	success: false,
	code: 503,
	message: "RAG_NOT_CONFIGURED",
	data: null,
};

async function requestWithoutRag(path: string, method: "GET" | "POST", route: unknown) {
	const app = createApp();
	app.use(path, route as never);
	return app.fetch(new Request(`http://localhost${path}`, { method }));
}

describe("RAG 路由真实 Nitro/H3 未装配合同", () => {
	test("POST /v1/search 未装配 RAG 时返回 503，而不是空结果 200", async () => {
		const response = await requestWithoutRag("/v1/search", "POST", searchRoute);

		expect(response.status).toBe(503);
		expect(response.headers.get("content-type")).toMatch(/application\/json/);
		expect(await response.json()).toEqual(expectedNotConfigured);
	});

	test("POST /v1/knowledge/sync 未装配 RAG 时返回 503，而不是 accepted 200", async () => {
		const response = await requestWithoutRag("/v1/knowledge/sync", "POST", syncPostRoute);

		expect(response.status).toBe(503);
		expect(response.headers.get("content-type")).toMatch(/application\/json/);
		expect(await response.json()).toEqual(expectedNotConfigured);
	});

	test("GET /v1/knowledge/sync 未装配 RAG 时返回 503，而不是 accepted 200", async () => {
		const response = await requestWithoutRag("/v1/knowledge/sync", "GET", syncGetRoute);

		expect(response.status).toBe(503);
		expect(response.headers.get("content-type")).toMatch(/application\/json/);
		expect(await response.json()).toEqual(expectedNotConfigured);
	});

	test("GET /v1/knowledge/sync-runs 未装配 RAG 时返回 503，而不是空数组 200", async () => {
		const response = await requestWithoutRag("/v1/knowledge/sync-runs", "GET", syncRunsRoute);

		expect(response.status).toBe(503);
		expect(response.headers.get("content-type")).toMatch(/application\/json/);
		expect(await response.json()).toEqual(expectedNotConfigured);
	});
});
