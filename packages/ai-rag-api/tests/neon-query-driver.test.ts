import { describe, expect, test, vi } from "vitest";

const neonQuery = vi.fn(async () => [{ id: "row-1" }]);

vi.mock("@neondatabase/serverless", () => ({
	neon: (databaseUrl: string) => {
		neonQuery.mockName(databaseUrl);
		return { query: neonQuery };
	},
}));

import { createNeonQueryClient } from "../server/runtime/neon-query";
import { createRagRuntime, type ResolvedRagConfig } from "../server/runtime/rag-runtime";

function workerConfig(overrides: Partial<ResolvedRagConfig> = {}): ResolvedRagConfig {
	return {
		databaseUrl: "postgres://worker.example/db",
		syncDatabaseUrl: "",
		embeddingModel: "@cf/baai/bge-m3",
		rerankerMode: "disabled",
		rerankerProvider: "",
		rerankerModel: "",
		rerankerVersion: "",
		rerankerCandidateLimit: 20,
		rerankerMaxInputTokens: 2000,
		rerankerTimeoutMs: 800,
		rerankerMaxCostUsd: 0,
		cloudflareAccountId: "account",
		cloudflareApiToken: "token",
		openaiApiKey: "",
		anthropicApiKey: "anthropic-key",
		knowledgeSyncToken: "",
		cronSecret: "",
		knowledgeSourceRoot: "",
		repositoryRoot: "",
		public: { apiBase: "/v1" },
		...overrides,
	};
}

describe("Neon HTTP 查询驱动", () => {
	test("query 结果沿用 unsafe 的行数组形状", async () => {
		const client = createNeonQueryClient("postgres://worker.example/db");
		await expect(client.unsafe("select $1 as id", ["row-1"])).resolves.toEqual([{ id: "row-1" }]);
		expect(neonQuery).toHaveBeenCalledWith("select $1 as id", ["row-1"]);
	});

	test("Worker 查询路径不要求同步连接串", async () => {
		const cwd = process.cwd;
		Object.defineProperty(process, "cwd", { configurable: true, value: undefined });
		try {
			const runtime = await createRagRuntime(workerConfig(), { queryDriver: "neon" });
			await runtime.close();
		} finally {
			Object.defineProperty(process, "cwd", { configurable: true, value: cwd });
		}
	});
});
