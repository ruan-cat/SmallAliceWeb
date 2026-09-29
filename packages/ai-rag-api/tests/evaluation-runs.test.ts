import { describe, expect, test } from "vitest";
import { ApiHttpError } from "../server/contracts/errors";
import { handleEvaluationRunByIdRequest, handleEvaluationRunsRequest } from "../server/contracts/handlers";
import {
	createEvaluationRunsRepository,
	computeDatasetVersion,
	recordEvaluationRunFromEnv,
	type EvaluationRunRecord,
} from "../server/evaluation/runs-repository";
import runsRoute from "../server/routes/v1/evaluation/runs.get";
import runsIdRoute from "../server/routes/v1/evaluation/runs-id.get";

/**
 * EV-4：评估运行仓储 + 只读两枚接口契约测试（learn-agents-ui plan 17.5）。
 *
 * SQL 执行器以 mock 注入——与 knowledge-sync 既有测试同一风格；
 * 真实数据库 smoke 依赖部署环境连接，随 SY-3/EV 真实运行补做。
 */

const sampleRow = {
	id: "evalrun-1",
	datasetVersion: "abc123def456",
	kind: "retrieval",
	params: { mode: "local" },
	metrics: { recallAt5: 0.8 },
	corpusIsolation: null,
	createdAt: "2026-09-29T00:00:00.000Z",
};

/** 记录调用语句与参数的 fake executor。 */
function createFakeExecutor(rows: Record<string, unknown>[] = []) {
	const calls: { statement: string; parameters: readonly unknown[] }[] = [];
	return {
		calls,
		execute: async (statement: string, parameters: readonly unknown[] = []) => {
			calls.push({ statement, parameters });
			return rows;
		},
	};
}

describe("EV-4 evaluation_runs 仓储单元", () => {
	test("insertEvaluationRun 生成 id 并写入全部字段（SQL 与参数断言）", async () => {
		const executor = createFakeExecutor([sampleRow]);
		const repository = createEvaluationRunsRepository({ executor });

		const inserted = await repository.insertEvaluationRun({
			datasetVersion: "abc123def456",
			kind: "retrieval",
			params: { mode: "local" },
			metrics: { recallAt5: 0.8 },
		});

		expect(inserted).toEqual(sampleRow as unknown as EvaluationRunRecord);
		expect(executor.calls).toHaveLength(1);
		const { statement, parameters } = executor.calls[0]!;
		expect(statement).toContain("INSERT INTO evaluation_runs");
		expect(statement).toContain("RETURNING");
		expect(parameters?.[1]).toBe("abc123def456");
		expect(parameters?.[2]).toBe("retrieval");
		// jsonb 列传原生对象（postgres-js 字符串参数会双重编码，2026-09-29 jsonb lab 实证）
		expect(parameters?.[3]).toEqual({ mode: "local" });
		expect(parameters?.[4]).toEqual({ recallAt5: 0.8 });
		expect(parameters?.[5]).toBeNull();
	});

	test("listEvaluationRuns 无 cursor 时按 created_at 倒序分页", async () => {
		const executor = createFakeExecutor([sampleRow]);
		const repository = createEvaluationRunsRepository({ executor });

		const items = await repository.listEvaluationRuns({ limit: 20 });

		expect(items).toHaveLength(1);
		const { statement, parameters } = executor.calls[0]!;
		expect(statement).toContain("ORDER BY created_at DESC, id DESC LIMIT $1");
		expect(statement).not.toContain("WHERE");
		expect(parameters).toEqual([20]);
	});

	test("listEvaluationRuns 携带 cursor 时走 keyset 过滤", async () => {
		const executor = createFakeExecutor([]);
		const repository = createEvaluationRunsRepository({ executor });

		await repository.listEvaluationRuns({
			limit: 10,
			cursor: "2026-09-28T00:00:00.000Z|evalrun-0",
		});

		const { statement, parameters } = executor.calls[0]!;
		expect(statement).toContain("WHERE (created_at, id) < ($2, $3)");
		expect(parameters?.[1]).toBeInstanceOf(Date);
		expect(parameters?.[2]).toBe("evalrun-0");
	});

	test("listEvaluationRuns 非法 limit 返回 400 ApiHttpError", async () => {
		const repository = createEvaluationRunsRepository({ executor: createFakeExecutor() });

		await expect(repository.listEvaluationRuns({ limit: 0 })).rejects.toMatchObject({
			status: 400,
			errorCode: "INVALID_LIMIT",
		});
		await expect(repository.listEvaluationRuns({ limit: 101 })).rejects.toBeInstanceOf(ApiHttpError);
	});

	test("listEvaluationRuns 非法 cursor 返回 400 ApiHttpError", async () => {
		const repository = createEvaluationRunsRepository({ executor: createFakeExecutor() });

		await expect(repository.listEvaluationRuns({ limit: 10, cursor: "not-a-cursor" })).rejects.toMatchObject({
			status: 400,
			errorCode: "INVALID_CURSOR",
		});
	});

	test("getEvaluationRunById 命中返回记录、未命中返回 undefined", async () => {
		const repository = createEvaluationRunsRepository({
			executor: createFakeExecutor([sampleRow]),
		});
		const hit = await repository.getEvaluationRunById("evalrun-1");
		expect(hit).toEqual(sampleRow as unknown as EvaluationRunRecord);

		const missRepository = createEvaluationRunsRepository({
			executor: createFakeExecutor([]),
		});
		await expect(missRepository.getEvaluationRunById("missing")).resolves.toBeUndefined();
	});

	test("insertEvaluationRun 非法 kind 与空 datasetVersion 返回 400", async () => {
		const repository = createEvaluationRunsRepository({ executor: createFakeExecutor() });

		await expect(
			repository.insertEvaluationRun({
				datasetVersion: "abc",
				kind: "unknown-kind" as never,
				metrics: {},
			}),
		).rejects.toMatchObject({ status: 400, errorCode: "INVALID_KIND" });
		await expect(
			repository.insertEvaluationRun({ datasetVersion: "  ", kind: "real", metrics: {} }),
		).rejects.toMatchObject({ status: 400, errorCode: "INVALID_DATASET_VERSION" });
	});

	test("computeDatasetVersion 输出 sha256 前 12 位且内容不变时稳定", () => {
		const version = computeDatasetVersion("gold-set-content");
		expect(version).toHaveLength(12);
		expect(computeDatasetVersion("gold-set-content")).toBe(version);
		expect(computeDatasetVersion("changed")).not.toBe(version);
	});
});

describe("EV-4 评估运行两枚接口契约", () => {
	test("handleEvaluationRunsRequest 合法查询返回 200 与 items 包装", async () => {
		const response = await handleEvaluationRunsRequest(
			{ limit: 5, cursor: undefined },
			{
				listRuns: async () => [sampleRow],
			},
		);

		expect(response.status).toBe(200);
		expect(response.body).toEqual({
			success: true,
			code: 200,
			message: "ok",
			data: { items: [sampleRow] },
		});
	});

	test("handleEvaluationRunsRequest 非法 limit 返回 400", async () => {
		const response = await handleEvaluationRunsRequest(
			{ limit: "999" },
			{
				listRuns: async () => [],
			},
		);

		expect(response.status).toBe(400);
		expect(response.body).toMatchObject({ success: false, code: 400 });
	});

	test("handleEvaluationRunByIdRequest 命中返回 200、未命中返回 404", async () => {
		const hit = await handleEvaluationRunByIdRequest("evalrun-1", {
			getRun: async () => sampleRow,
		});
		expect(hit.status).toBe(200);
		expect(hit.body).toMatchObject({ success: true, code: 200 });

		const miss = await handleEvaluationRunByIdRequest("missing", {
			getRun: async () => undefined,
		});
		expect(miss.status).toBe(404);
		expect(miss.body).toMatchObject({ success: false, code: 404 });
	});
});

describe("EV-4 评估运行路由真实 Nitro/H3 合同", () => {
	const expectedNotConfigured = {
		success: false,
		code: 503,
		message: "RAG_NOT_CONFIGURED",
		data: null,
	};

	async function requestWithRag(path: string, rag: Record<string, unknown> | undefined): Promise<Response> {
		const { createApp, defineEventHandler } = await import("nitro/h3");
		const app = createApp();
		app.use(
			defineEventHandler((event) => {
				event.context.rag = rag;
			}),
		);
		if (path === "/v1/evaluation/runs") {
			app.use(path, runsRoute as never);
		} else {
			app.use("/v1/evaluation/runs/:id", runsIdRoute as never);
		}
		return app.fetch(new Request(`http://localhost${path}`));
	}

	test("GET /v1/evaluation/runs 未装配 RAG 时返回 503", async () => {
		const response = await requestWithRag("/v1/evaluation/runs", undefined);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual(expectedNotConfigured);
	});

	test("GET /v1/evaluation/runs/:id 未装配 RAG 时返回 503", async () => {
		const response = await requestWithRag("/v1/evaluation/runs/evalrun-1", undefined);

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual(expectedNotConfigured);
	});

	test("GET /v1/evaluation/runs 装配 provider 后返回 200 items", async () => {
		const response = await requestWithRag("/v1/evaluation/runs", {
			evaluationRuns: async () => [sampleRow],
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			code: 200,
			message: "ok",
			data: { items: [sampleRow] },
		});
	});

	test("GET /v1/evaluation/runs/:id 命中返回 200 详情", async () => {
		const response = await requestWithRag("/v1/evaluation/runs/evalrun-1", {
			evaluationRun: async () => sampleRow,
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			success: true,
			code: 200,
			message: "ok",
			data: sampleRow,
		});
	});

	test("GET /v1/evaluation/runs/:id 未命中返回 404 统一错误体", async () => {
		const response = await requestWithRag("/v1/evaluation/runs/missing", {
			evaluationRun: async () => undefined,
		});

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ success: false, code: 404 });
	});
});

describe("EV-4 CLI 落库失败不阻断评估", () => {
	test("未配置 NITRO_DATABASE_URL 时静默跳过并给出原因", async () => {
		const logs: string[] = [];
		const outcome = await recordEvaluationRunFromEnv(
			{ datasetVersion: "abc", kind: "real", metrics: {} },
			{ databaseUrl: "", log: (message) => logs.push(message) },
		);

		expect(outcome).toEqual({ written: false, reason: "missing-database-url" });
		expect(logs[0]).toContain("跳过评估运行落库");
	});

	test("客户端连接失败时返回 written:false 且不抛出", async () => {
		const logs: string[] = [];
		const outcome = await recordEvaluationRunFromEnv(
			{ datasetVersion: "abc", kind: "real", metrics: {} },
			{
				databaseUrl: "postgres://user:pass@localhost:5432/db",
				createClient: () => {
					throw new Error("connection refused");
				},
				log: (message) => logs.push(message),
			},
		);

		expect(outcome.written).toBe(false);
		expect(outcome.reason).toContain("connection refused");
		expect(logs[0]).toContain("落库失败");
	});

	test("写入成功返回 id；客户端 end 失败不影响结果", async () => {
		const outcome = await recordEvaluationRunFromEnv(
			{ datasetVersion: "abc", kind: "real", metrics: { ok: 1 } },
			{
				databaseUrl: "postgres://user:pass@localhost:5432/db",
				createClient: () => ({
					unsafe: async () => [{ id: "evalrun-x" }],
					end: async () => {
						throw new Error("end failed");
					},
				}),
			},
		);

		expect(outcome).toEqual({ written: true, id: "evalrun-x" });
	});
});
