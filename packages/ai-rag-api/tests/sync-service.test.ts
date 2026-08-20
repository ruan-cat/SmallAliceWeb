import { describe, expect, test } from "vitest";
import { ApiHttpError } from "../server/contracts/errors";
import {
	createKnowledgeSyncService,
	type SyncDocumentRow,
	type SyncSqlExecutor,
} from "../server/services/knowledge-sync";

type FakeState = {
	documents: SyncDocumentRow[];
	mutations: string[];
	transactions: number;
	locked: boolean;
	sessionCalls?: string[];
	batchSizes?: number[];
};

function makeExecutor(state: FakeState): SyncSqlExecutor {
	return {
		async execute(statement, parameters) {
			state.sessionCalls?.push(statement);
			if (statement.includes("pg_try_advisory_lock")) return [{ acquired: state.locked }];
			if (statement.trimStart().startsWith("SELECT") && statement.includes("FROM documents")) return state.documents;
			state.mutations.push(statement);
			return [];
		},
		async transaction(callback) {
			state.transactions += 1;
			return callback(this);
		},
	};
}

function makeService(state: FakeState, source: { content: string; sourcePath: string }[], embeddings?: number[][]) {
	let embeddingIndex = 0;
	return createKnowledgeSyncService({
		executor: makeExecutor(state),
		profileVersion: "markdown-structure-v1",
		embeddingModel: "text-embedding-test",
		scanner: async () => source,
		chunker: () => [
			{
				content: "chunk",
				sourcePath: source[0]?.sourcePath ?? "docs/docx/empty.md",
				headingPath: ["标题"],
				headingIndex: 0,
				headingAnchor: "rag-heading-test",
				chunkIndex: 0,
				chunkKind: "prose",
				imageUrls: [],
			},
		],
		embedding: {
			createEmbedding: async () => embeddings?.[embeddingIndex++] ?? Array.from({ length: 1024 }, () => 0.1),
		},
		idFactory: () => "fixed-id",
		clock: () => new Date("2026-08-19T00:00:00.000Z"),
	});
}

describe("createKnowledgeSyncService", () => {
	test("新增文档先生成 embedding，再以事务写入并记录 writtenChunkCount", async () => {
		const state: FakeState = { documents: [], mutations: [], transactions: 0, locked: true };
		const service = makeService(state, [{ sourcePath: "docs/docx/a.md", content: "# A\n\n内容" }]);

		const result = await service.sync({ dryRun: false });

		expect(result).toMatchObject({
			scannedFileCount: 1,
			createdFileCount: 1,
			writtenChunkCount: 1,
			status: "succeeded",
		});
		expect(state.transactions).toBe(1);
		expect(state.mutations.some((statement) => statement.includes("INSERT INTO knowledge_sync_runs"))).toBe(true);
		expect(state.mutations.some((statement) => statement.includes("INSERT INTO chunks"))).toBe(true);
	});

	test("内容、profile 与模型均未变化时跳过 embedding", async () => {
		const state: FakeState = {
			documents: [
				{
					id: "doc-1",
					sourcePath: "docs/docx/a.md",
					contentHash: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
					profileVersion: "markdown-structure-v1",
					embeddingModel: "text-embedding-test",
				},
			],
			mutations: [],
			transactions: 0,
			locked: true,
		};
		const service = makeService(state, [{ sourcePath: "docs/docx/a.md", content: "a" }]);
		const result = await service.sync({ dryRun: false });

		expect(result.unchangedFileCount).toBe(1);
		expect(result.writtenChunkCount).toBe(0);
	});

	test("embedding 失败时保留旧版本且不执行文档替换", async () => {
		const state: FakeState = {
			documents: [
				{ id: "doc-1", sourcePath: "docs/docx/a.md", contentHash: "old", profileVersion: "old", embeddingModel: "old" },
			],
			mutations: [],
			transactions: 0,
			locked: true,
		};
		const service = createKnowledgeSyncService({
			executor: makeExecutor(state),
			profileVersion: "new",
			embeddingModel: "new",
			scanner: async () => [{ sourcePath: "docs/docx/a.md", content: "changed" }],
			chunker: () => [
				{
					content: "chunk",
					sourcePath: "docs/docx/a.md",
					headingPath: [],
					headingIndex: -1,
					headingAnchor: "rag-document-a",
					chunkIndex: 0,
					chunkKind: "prose",
					imageUrls: [],
				},
			],
			embedding: {
				createEmbedding: async () => {
					throw new Error("provider down");
				},
			},
		});

		const result = await service.sync({ dryRun: false });

		expect(result.status).toBe("partial");
		expect(result.failedFiles).toEqual(["docs/docx/a.md"]);
		expect(state.mutations.some((statement) => statement.includes("DELETE FROM chunks"))).toBe(false);
	});

	test("扫描不完整时不删除缺失来源，完整扫描才删除", async () => {
		const state: FakeState = {
			documents: [
				{
					id: "doc-1",
					sourcePath: "docs/docx/missing.md",
					contentHash: "old",
					profileVersion: "p",
					embeddingModel: "m",
				},
			],
			mutations: [],
			transactions: 0,
			locked: true,
		};
		const service = createKnowledgeSyncService({
			executor: makeExecutor(state),
			profileVersion: "p",
			embeddingModel: "m",
			scanner: async () => ({ documents: [], complete: false, failedFiles: ["docs/docx/unreadable.md"] }),
			chunker: () => [],
			embedding: { createEmbedding: async () => [] },
		});
		await service.sync({ dryRun: false });
		expect(state.mutations.some((statement) => statement.includes("DELETE FROM documents"))).toBe(false);

		const completeService = createKnowledgeSyncService({
			executor: makeExecutor(state),
			profileVersion: "p",
			embeddingModel: "m",
			scanner: async () => [],
			chunker: () => [],
			embedding: { createEmbedding: async () => [] },
		});
		await completeService.sync({ dryRun: false });
		expect(state.mutations.some((statement) => statement.includes("DELETE FROM documents"))).toBe(true);
	});

	test("advisory lock 冲突返回 409", async () => {
		const state: FakeState = { documents: [], mutations: [], transactions: 0, locked: false };
		const service = makeService(state, []);
		await expect(service.sync({ dryRun: false })).rejects.toMatchObject({ status: 409 });
	});

	test("整个同步生命周期使用同一个 reserved session，并在结束后释放", async () => {
		const state: FakeState = { documents: [], mutations: [], transactions: 0, locked: true, sessionCalls: [] };
		const base = makeExecutor(state);
		let released = false;
		const reserved = {
			...base,
			release: async () => {
				released = true;
			},
		};
		const service = createKnowledgeSyncService({
			executor: { ...base, reserve: async () => reserved },
			profileVersion: "markdown-structure-v1",
			embeddingModel: "text-embedding-test",
			scanner: async () => [],
			chunker: () => [],
			embedding: { createEmbedding: async () => [] },
		});

		await service.sync({ dryRun: false });

		expect(released).toBe(true);
		expect(state.sessionCalls?.[0]).toContain("pg_try_advisory_lock");
		expect(state.sessionCalls?.at(-1)).toContain("pg_advisory_unlock");
	});

	test("embedding provider 按最多 100 个文本分批调用", async () => {
		const state: FakeState = { documents: [], mutations: [], transactions: 0, locked: true, batchSizes: [] };
		const chunks = Array.from({ length: 205 }, (_, index) => ({
			content: `chunk-${index}`,
			sourcePath: "docs/docx/batch.md",
			headingPath: [],
			headingIndex: -1,
			headingAnchor: "rag-document-batch",
			chunkIndex: index,
			chunkKind: "prose" as const,
			imageUrls: [],
		}));
		const service = createKnowledgeSyncService({
			executor: makeExecutor(state),
			profileVersion: "p",
			embeddingModel: "m",
			scanner: async () => [{ sourcePath: "docs/docx/batch.md", content: "many" }],
			chunker: () => chunks,
			embedding: {
				createEmbeddings: async (contents) => {
					state.batchSizes?.push(contents.length);
					return contents.map(() => Array.from({ length: 1024 }, () => 0.1));
				},
				createEmbedding: async () => Array.from({ length: 1024 }, () => 0.1),
			},
			maxEmbeddingTexts: 205,
		});

		const result = await service.sync({ dryRun: false });

		expect(result.writtenChunkCount).toBe(205);
		expect(state.batchSizes).toEqual([100, 100, 5]);
		expect(state.batchSizes?.every((size) => size <= 100)).toBe(true);
	});

	test("累计 embedding 文本超过 100 时在调用 provider 前停止", async () => {
		const state: FakeState = { documents: [], mutations: [], transactions: 0, locked: true, batchSizes: [] };
		let called = false;
		const chunks = Array.from({ length: 101 }, (_, index) => ({
			content: `chunk-${index}`,
			sourcePath: "docs/docx/over-limit.md",
			headingPath: [],
			headingIndex: -1,
			headingAnchor: "rag-document-over-limit",
			chunkIndex: index,
			chunkKind: "prose" as const,
			imageUrls: [],
		}));
		const service = createKnowledgeSyncService({
			executor: makeExecutor(state),
			profileVersion: "p",
			embeddingModel: "m",
			scanner: async () => [{ sourcePath: "docs/docx/over-limit.md", content: "too much" }],
			chunker: () => chunks,
			embedding: {
				createEmbeddings: async (contents) => {
					called = true;
					state.batchSizes?.push(contents.length);
					return contents.map(() => Array.from({ length: 1024 }, () => 0.1));
				},
				createEmbedding: async () => Array.from({ length: 1024 }, () => 0.1),
			},
		});

		const result = await service.sync({ dryRun: false });

		expect(called).toBe(true);
		expect(state.batchSizes).toEqual([100]);
		expect(result.writtenChunkCount).toBe(100);
		expect(state.transactions).toBe(1);
		expect(result.status).toBe("partial");
		expect(result.failedFiles).toEqual(["docs/docx/over-limit.md"]);
	});

	test("没有 transaction 能力时拒绝执行文档替换", async () => {
		const state: FakeState = { documents: [], mutations: [], transactions: 0, locked: true };
		const executor = makeExecutor(state);
		delete (executor as Partial<SyncSqlExecutor>).transaction;
		const service = createKnowledgeSyncService({
			executor: executor as SyncSqlExecutor,
			profileVersion: "p",
			embeddingModel: "m",
			scanner: async () => [{ sourcePath: "docs/docx/a.md", content: "a" }],
			chunker: () => [
				{
					content: "a",
					sourcePath: "docs/docx/a.md",
					headingPath: [],
					headingIndex: -1,
					headingAnchor: "rag-document-a",
					chunkIndex: 0,
					chunkKind: "prose",
					imageUrls: [],
				},
			],
			embedding: { createEmbedding: async () => Array.from({ length: 1024 }, () => 0.1) },
		});

		await expect(service.sync({ dryRun: false })).rejects.toThrow("transaction");
		expect(state.mutations).toEqual([]);
	});
});
