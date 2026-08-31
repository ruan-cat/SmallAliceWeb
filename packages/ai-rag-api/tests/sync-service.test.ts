import { describe, expect, test } from "vitest";
import { ApiHttpError } from "../server/contracts/errors";
import {
	createKnowledgeSyncService,
	type SyncDocumentRow,
	type SyncSqlExecutor,
} from "../server/services/knowledge-sync";
import { CloudflareEmbeddingError } from "../server/providers/cloudflare-embedding";

type FakeState = {
	documents: SyncDocumentRow[];
	mutations: string[];
	mutationParameters?: unknown[][];
	transactions: number;
	locked: boolean;
	sessionCalls?: string[];
	batchSizes?: number[];
};

function makeExecutor(state: FakeState): SyncSqlExecutor {
	return {
		async execute(statement, parameters) {
			state.sessionCalls?.push(statement);
			if (statement.includes("pg_try_advisory_lock"))
				return [{ acquired: state.locked }];
			if (
				statement.trimStart().startsWith("SELECT") &&
				statement.includes("FROM documents")
			)
				return state.documents;
			state.mutations.push(statement);
			state.mutationParameters?.push([...parameters]);
			return [];
		},
		async transaction(callback) {
			state.transactions += 1;
			return callback(this);
		},
	};
}

function makeService(
	state: FakeState,
	source: { content: string; sourcePath: string }[],
	embeddings?: number[][],
) {
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
			createEmbedding: async () =>
				embeddings?.[embeddingIndex++] ??
				Array.from({ length: 1024 }, () => 0.1),
		},
		idFactory: () => "fixed-id",
		clock: () => new Date("2026-08-19T00:00:00.000Z"),
	});
}

describe("createKnowledgeSyncService", () => {
	test("新增文档先生成 embedding，再以事务写入并记录 writtenChunkCount", async () => {
		const state: FakeState = {
			documents: [],
			mutations: [],
			transactions: 0,
			locked: true,
		};
		const service = makeService(state, [
			{ sourcePath: "docs/docx/a.md", content: "# A\n\n内容" },
		]);

		const result = await service.sync({ dryRun: false });

		expect(result).toMatchObject({
			scannedFileCount: 1,
			createdFileCount: 1,
			writtenChunkCount: 1,
			status: "succeeded",
		});
		expect(state.transactions).toBe(1);
		expect(
			state.mutations.some((statement) =>
				statement.includes("INSERT INTO knowledge_sync_runs"),
			),
		).toBe(true);
		expect(
			state.mutations.some((statement) =>
				statement.includes("INSERT INTO chunks"),
			),
		).toBe(true);
	});

	test("内容、profile 与模型均未变化时跳过 embedding", async () => {
		const state: FakeState = {
			documents: [
				{
					id: "doc-1",
					sourcePath: "docs/docx/a.md",
					contentHash:
						"ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
					profileVersion: "markdown-structure-v1",
					embeddingModel: "text-embedding-test",
				},
			],
			mutations: [],
			transactions: 0,
			locked: true,
		};
		const service = makeService(state, [
			{ sourcePath: "docs/docx/a.md", content: "a" },
		]);
		const result = await service.sync({ dryRun: false });

		expect(result.unchangedFileCount).toBe(1);
		expect(result.writtenChunkCount).toBe(0);
	});

	test("embedding 失败时保留旧版本且不执行文档替换", async () => {
		const state: FakeState = {
			documents: [
				{
					id: "doc-1",
					sourcePath: "docs/docx/a.md",
					contentHash: "old",
					profileVersion: "old",
					embeddingModel: "old",
				},
			],
			mutations: [],
			transactions: 0,
			locked: true,
		};
		const service = createKnowledgeSyncService({
			executor: makeExecutor(state),
			profileVersion: "new",
			embeddingModel: "new",
			scanner: async () => [
				{ sourcePath: "docs/docx/a.md", content: "changed" },
			],
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
		expect(
			state.mutations.some((statement) =>
				statement.includes("DELETE FROM chunks"),
			),
		).toBe(false);
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
			scanner: async () => ({
				documents: [],
				complete: false,
				failedFiles: ["docs/docx/unreadable.md"],
			}),
			chunker: () => [],
			embedding: { createEmbedding: async () => [] },
		});
		await service.sync({ dryRun: false });
		expect(
			state.mutations.some((statement) =>
				statement.includes("DELETE FROM documents"),
			),
		).toBe(false);

		const completeService = createKnowledgeSyncService({
			executor: makeExecutor(state),
			profileVersion: "p",
			embeddingModel: "m",
			scanner: async () => [],
			chunker: () => [],
			embedding: { createEmbedding: async () => [] },
		});
		await completeService.sync({ dryRun: false });
		expect(
			state.mutations.some((statement) =>
				statement.includes("DELETE FROM documents"),
			),
		).toBe(true);
	});

	test("advisory lock 冲突返回 409", async () => {
		const state: FakeState = {
			documents: [],
			mutations: [],
			transactions: 0,
			locked: false,
		};
		const service = makeService(state, []);
		await expect(service.sync({ dryRun: false })).rejects.toMatchObject({
			status: 409,
		});
	});

	test("整个同步生命周期使用同一个 reserved session，并在结束后释放", async () => {
		const state: FakeState = {
			documents: [],
			mutations: [],
			transactions: 0,
			locked: true,
			sessionCalls: [],
		};
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

	test("首轮同步持有 advisory lock 时，第二轮在 scanner 前返回 409", async () => {
		let locked = false;
		let notifyFirstScanner: (() => void) | undefined;
		let releaseFirstScanner: (() => void) | undefined;
		const firstScannerEntered = new Promise<void>((resolveEntered) => {
			notifyFirstScanner = resolveEntered;
		});
		const firstScannerGate = new Promise<void>((resolveGate) => {
			releaseFirstScanner = resolveGate;
		});
		let scannerCalls = 0;
		const executor: SyncSqlExecutor = {
			async execute() {
				throw new Error("同步必须先保留数据库会话。");
			},
			async transaction(callback) {
				return callback(this);
			},
			reserve: async () => {
				let ownsLock = false;
				const session: SyncSqlExecutor & { release: () => Promise<void> } = {
					execute: async (statement) => {
						if (statement.includes("pg_try_advisory_lock")) {
							if (locked) return [{ acquired: false }];
							locked = true;
							ownsLock = true;
							return [{ acquired: true }];
						}
						if (statement.includes("pg_advisory_unlock")) {
							locked = false;
							return [{ unlocked: true }];
						}
						return [];
					},
					transaction: async (callback) => callback(session),
					release: async () => {
						if (ownsLock) locked = false;
					},
				};
				return session;
			},
		};
		const service = createKnowledgeSyncService({
			executor,
			profileVersion: "p",
			embeddingModel: "m",
			scanner: async () => {
				scannerCalls += 1;
				if (scannerCalls === 1) {
					notifyFirstScanner?.();
					await firstScannerGate;
				}
				return [];
			},
			chunker: () => [],
			embedding: { createEmbedding: async () => [] },
		});

		const firstRun = service.sync({ dryRun: true });
		await firstScannerEntered;
		await expect(service.sync({ dryRun: true })).rejects.toMatchObject({
			status: 409,
			errorCode: "KNOWLEDGE_SYNC_CONFLICT",
		});
		releaseFirstScanner?.();
		await expect(firstRun).resolves.toMatchObject({ status: "succeeded" });
	});

	test("embedding provider 按最多 100 个文本分批调用", async () => {
		const state: FakeState = {
			documents: [],
			mutations: [],
			transactions: 0,
			locked: true,
			batchSizes: [],
		};
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
			scanner: async () => [
				{ sourcePath: "docs/docx/batch.md", content: "many" },
			],
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

	test("Cloudflare 返回 400/413 时按批次递归拆分并保留输入顺序", async () => {
		const state: FakeState = {
			documents: [],
			mutations: [],
			transactions: 0,
			locked: true,
			batchSizes: [],
		};
		const chunks = Array.from({ length: 4 }, (_, index) => ({
			content: `chunk-${index}`,
			sourcePath: "docs/docx/context-limit.md",
			headingPath: [],
			headingIndex: -1,
			headingAnchor: "rag-document-context-limit",
			chunkIndex: index,
			chunkKind: "prose" as const,
			imageUrls: [],
		}));
		const service = createKnowledgeSyncService({
			executor: makeExecutor(state),
			profileVersion: "p",
			embeddingModel: "m",
			scanner: async () => [
				{ sourcePath: "docs/docx/context-limit.md", content: "too much" },
			],
			chunker: () => chunks,
			embedding: {
				createEmbeddings: async (contents) => {
					state.batchSizes?.push(contents.length);
					if (contents.length > 1)
						throw new CloudflareEmbeddingError("context limit", {
							status: 400,
						});
					return contents.map(() => Array.from({ length: 1024 }, () => 0.1));
				},
				createEmbedding: async () => Array.from({ length: 1024 }, () => 0.1),
			},
		});

		const result = await service.sync({ dryRun: false });

		expect(state.batchSizes).toEqual([4, 2, 1, 1, 2, 1, 1]);
		expect(result.status).toBe("succeeded");
		expect(result.failedFiles).toEqual([]);
		expect(result.writtenChunkCount).toBe(4);
	});

	test("默认同步可跨多个 100 条 provider batch 完成同一文档", async () => {
		const state: FakeState = {
			documents: [],
			mutations: [],
			transactions: 0,
			locked: true,
			batchSizes: [],
		};
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
			scanner: async () => [
				{ sourcePath: "docs/docx/over-limit.md", content: "too much" },
			],
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
		expect(state.batchSizes).toEqual([100, 1]);
		expect(result.writtenChunkCount).toBe(101);
		expect(state.transactions).toBe(1);
		expect(result.status).toBe("succeeded");
		expect(result.failedFiles).toEqual([]);
	});

	test("没有 transaction 能力时拒绝执行文档替换", async () => {
		const state: FakeState = {
			documents: [],
			mutations: [],
			transactions: 0,
			locked: true,
		};
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
			embedding: {
				createEmbedding: async () => Array.from({ length: 1024 }, () => 0.1),
			},
		});

		await expect(service.sync({ dryRun: false })).rejects.toThrow(
			"transaction",
		);
		expect(state.mutations).toEqual([]);
	});

	test("embedding 输入包含标题上下文但排除图片 URL，并写入 parent/profile/search 字段", async () => {
		const state: FakeState = {
			documents: [],
			mutations: [],
			mutationParameters: [],
			transactions: 0,
			locked: true,
		};
		const embeddingInputs: string[] = [];
		const service = createKnowledgeSyncService({
			executor: makeExecutor(state),
			profileVersion: "markdown-structure-v2",
			embeddingModel: "text-embedding-test",
			scanner: async () => [
				{
					sourcePath: "docs/docx/title.md",
					content: "# 标题\n\n正文 ![](./diagram.png)",
				},
			],
			chunker: () => [
				{
					content: "正文",
					sourcePath: "docs/docx/title.md",
					headingPath: ["标题", "小节"],
					headingIndex: 1,
					headingAnchor: "rag-heading-title",
					parentId: "rag-parent-title",
					chunkIndex: 0,
					chunkKind: "prose",
					imageUrls: ["./diagram.png"],
				},
			],
			embedding: {
				createEmbeddings: async (contents) => {
					embeddingInputs.push(...contents);
					return contents.map(() => Array.from({ length: 1024 }, () => 0.1));
				},
				createEmbedding: async () => Array.from({ length: 1024 }, () => 0.1),
			},
		});

		await service.sync({ dryRun: false });

		expect(embeddingInputs[0]).toContain("文档：docs/docx/title.md");
		expect(embeddingInputs[0]).toContain("章节：标题 > 小节");
		expect(embeddingInputs[0]).not.toContain("diagram.png");
		const chunkInsert = state.mutations.find((statement) =>
			statement.includes("INSERT INTO chunks"),
		);
		expect(chunkInsert).toContain("parent_id");
		expect(chunkInsert).toContain("preprocessing_version");
		expect(chunkInsert).toContain("search_text");
		expect(
			state.mutationParameters?.some((parameters) =>
				parameters.includes("rag-parent-title"),
			),
		).toBe(true);
	});
});
