import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
	handleSearchRequest,
	handleSyncRequest,
	handleSyncRunsRequest,
	searchRequestSchema,
	syncRequestSchema,
	syncRunsQuerySchema,
} from "../server/contracts/handlers";
import { assertKnowledgeSyncAuth } from "../server/contracts/auth";
import { ApiHttpError, getStatusCode, toErrorResponse } from "../server/contracts/errors";

describe("ai-rag-api HTTP contracts", () => {
	test("schemas validate search and sync input", () => {
		expect(searchRequestSchema.parse({ query: "RAG" })).toMatchObject({ query: "RAG", limit: 10, k: 60 });
		expect(syncRequestSchema.parse({})).toEqual({ dryRun: false });
		expect(syncRunsQuerySchema.parse({ limit: "3" })).toMatchObject({ limit: 3 });
		expect(() => searchRequestSchema.parse({ query: " " })).toThrow(z.ZodError);
	});

	test("auth distinguishes missing and invalid controlled credentials", () => {
		expect(() => assertKnowledgeSyncAuth("POST", {}, { syncToken: "sync", cronSecret: "cron" })).toThrowError(
			new ApiHttpError(401, "UNAUTHORIZED", "缺少同步凭据"),
		);
		expect(() =>
			assertKnowledgeSyncAuth("POST", { authorization: "Bearer wrong" }, { syncToken: "sync", cronSecret: "cron" }),
		).toThrowError(new ApiHttpError(403, "FORBIDDEN", "同步凭据无效"));
		expect(
			assertKnowledgeSyncAuth("GET", { Authorization: "Bearer cron" }, { syncToken: "sync", cronSecret: "cron" }),
		).toMatchObject({ kind: "cron" });
		expect(
			assertKnowledgeSyncAuth("POST", { authorization: "Bearer sync" }, { syncToken: "sync", cronSecret: "cron" }),
		).toMatchObject({ kind: "sync-token" });
	});

	test("error mapping preserves HTTP status", () => {
		const conflict = new ApiHttpError(409, "SYNC_IN_PROGRESS", "同步正在进行");
		expect(getStatusCode(conflict)).toBe(409);
		expect(toErrorResponse(conflict, "fallback")).toEqual({
			success: false,
			code: 409,
			message: "同步正在进行",
			data: null,
		});
		expect(getStatusCode(new Error("unexpected"))).toBe(500);
	});

	test("search handler validates, calls injected search, and returns source href", async () => {
		const result = await handleSearchRequest(
			{ query: "RAG", limit: 2 },
			{
				search: async () => [
					{
						id: "chunk-1",
						content: "内容",
						score: 0.8,
						sourcePath: "docs/docx/guide.md",
						headingPath: ["指南"],
						headingIndex: 0,
						headingAnchor: "rag-heading-x",
						chunkIndex: 0,
						imageUrls: [],
					},
				],
			},
		);
		expect(result).toMatchObject({ status: 200, body: { success: true } });
		const responseBody = result.body;
		if (!responseBody.success) throw new Error("检索成功响应应包含数据");
		expect(responseBody.data.items[0]).toMatchObject({
			sourceUrl: "/docx/guide.html",
			sourceHref: "/docx/guide.html#rag-heading-x",
		});
	});

	test("sync handler enforces auth and maps conflicts", async () => {
		const deps = {
			sync: async () => {
				throw new ApiHttpError(409, "SYNC_IN_PROGRESS", "同步正在进行");
			},
		};
		const denied = await handleSyncRequest({}, { method: "POST", headers: {} }, deps, {
			syncToken: "sync",
			cronSecret: "cron",
		});
		expect(denied).toMatchObject({ status: 401, body: { code: 401 } });
		const conflict = await handleSyncRequest({}, { method: "POST", headers: { authorization: "Bearer sync" } }, deps, {
			syncToken: "sync",
			cronSecret: "cron",
		});
		expect(conflict).toMatchObject({ status: 409, body: { code: 409, success: false } });
	});

	test("sync-runs handler parses query and returns injected records", async () => {
		const result = await handleSyncRunsRequest(
			{ limit: "1" },
			{ listRuns: async ({ limit }) => [{ id: "run-1", limit }] },
		);
		expect(result).toEqual({
			status: 200,
			body: { success: true, code: 200, message: "ok", data: { items: [{ id: "run-1", limit: 1 }] } },
		});
	});
});
