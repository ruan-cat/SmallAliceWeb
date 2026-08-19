import { createHash, randomUUID } from "node:crypto";
import { chunkMarkdown, type MarkdownChunk } from "@ruan-cat-drill-doc/ai-rag-core";
import { ApiHttpError } from "../contracts/errors";

/** 可由 SQL executor 返回的已同步文档索引行。 */
export type SyncDocumentRow = {
	id: string;
	sourcePath: string;
	contentHash: string;
	profileVersion: string;
	embeddingModel: string;
};

/** 同步服务需要的最小 PostgreSQL 执行边界；连接生命周期由调用方管理。 */
export type SyncSqlExecutor = {
	execute: (statement: string, parameters: readonly unknown[]) => Promise<readonly Record<string, unknown>[]>;
	transaction: <T>(callback: (transaction: SyncSqlExecutor) => Promise<T>) => Promise<T>;
	reserve?: () => Promise<SyncSqlSession>;
};

/** 绑定在同一 PostgreSQL 连接上的同步会话。 */
export type SyncSqlSession = SyncSqlExecutor & { release: () => Promise<void> };

/** embedding provider 的显式注入边界；批量能力是可选优化。 */
export type SyncEmbeddingProvider = {
	createEmbedding: (content: string) => Promise<readonly number[]>;
	createEmbeddings?: (contents: readonly string[]) => Promise<readonly (readonly number[])[]>;
};

/** 扫描器可以返回完整扫描，也可以明确报告部分失败。 */
export type SyncSourceDocument = { content: string; sourcePath: string };
export type SyncSourceScan =
	| readonly SyncSourceDocument[]
	| { documents: readonly SyncSourceDocument[]; complete: boolean; failedFiles?: readonly string[] };
export type SyncSourceScanner = () => Promise<SyncSourceScan>;
export type SyncChunker = (content: string, sourcePath: string) => MarkdownChunk[];

/** 同步调用的输入。 */
export type KnowledgeSyncInput = { dryRun: boolean };

/** 一轮同步写入的可审计统计。 */
export type KnowledgeSyncResult = {
	id: string;
	status: "succeeded" | "partial" | "failed";
	scannedFileCount: number;
	unchangedFileCount: number;
	createdFileCount: number;
	updatedFileCount: number;
	deletedFileCount: number;
	writtenChunkCount: number;
	failedFiles: string[];
	startedAt: string;
	finishedAt: string;
};

export type KnowledgeSyncService = {
	sync: (input: KnowledgeSyncInput) => Promise<KnowledgeSyncResult>;
	syncRuns: (options: { limit: number }) => Promise<Record<string, unknown>[]>;
};

type KnowledgeSyncOptions = {
	executor: SyncSqlExecutor;
	embedding: SyncEmbeddingProvider;
	scanner: SyncSourceScanner;
	chunker?: SyncChunker;
	profileVersion: string;
	embeddingModel: string;
	lockKey?: number;
	idFactory?: (kind: "run" | "document" | "chunk", sourcePath?: string, index?: number) => string;
	clock?: () => Date;
	maxEmbeddingTexts?: number;
};

const DEFAULT_LOCK_KEY = 2_026_081_902;

/** 创建真实同步服务；所有外部连接、扫描器和 embedding 均通过参数注入。 */
export function createKnowledgeSyncService(options: KnowledgeSyncOptions): KnowledgeSyncService {
	const chunker = options.chunker ?? ((content, sourcePath) => chunkMarkdown(content, sourcePath));
	const idFactory = options.idFactory ?? defaultIdFactory;
	const clock = options.clock ?? (() => new Date());
	const lockKey = options.lockKey ?? DEFAULT_LOCK_KEY;
	const maxEmbeddingTexts = options.maxEmbeddingTexts ?? 100;
	if (!Number.isInteger(maxEmbeddingTexts) || maxEmbeddingTexts < 1) {
		throw new Error("maxEmbeddingTexts 必须是正整数。");
	}

	return {
		sync: (input) => runSync(options, { ...input, chunker, idFactory, clock, lockKey, maxEmbeddingTexts }),
		syncRuns: async ({ limit }) => {
			if (!Number.isInteger(limit) || limit < 1) throw new ApiHttpError(400, "INVALID_LIMIT", "limit 必须是正整数。");
			return [
				...(await options.executor.execute(
					`SELECT id, status, scanned_file_count AS "scannedFileCount", unchanged_file_count AS "unchangedFileCount", created_file_count AS "createdFileCount", updated_file_count AS "updatedFileCount", deleted_file_count AS "deletedFileCount", written_chunk_count AS "writtenChunkCount", failed_files AS "failedFiles", started_at AS "startedAt", finished_at AS "finishedAt" FROM knowledge_sync_runs ORDER BY started_at DESC LIMIT $1`,
					[limit],
				)),
			];
		},
	};
}

type RunDependencies = {
	chunker: SyncChunker;
	idFactory: NonNullable<KnowledgeSyncOptions["idFactory"]>;
	clock: NonNullable<KnowledgeSyncOptions["clock"]>;
	lockKey: number;
	maxEmbeddingTexts: number;
};

async function runSync(
	options: KnowledgeSyncOptions,
	input: KnowledgeSyncInput & RunDependencies,
): Promise<KnowledgeSyncResult> {
	if (typeof options.executor.transaction !== "function") throw new Error("knowledge sync transaction 能力是必需的。");
	const session: SyncSqlSession = options.executor.reserve
		? await options.executor.reserve()
		: { ...options.executor, release: async () => undefined };
	let lockAcquired = false;

	const runId = input.idFactory("run");
	const startedAt = input.clock();
	let runInserted = false;
	try {
		const lock = await session.execute("SELECT pg_try_advisory_lock($1) AS acquired", [input.lockKey]);
		if (lock[0]?.acquired !== true) {
			throw new ApiHttpError(409, "KNOWLEDGE_SYNC_CONFLICT", "已有同步任务正在运行。");
		}
		lockAcquired = true;
		const scan = await safeScan(options.scanner);
		const documents = scan.documents;
		const failedFiles = [...scan.failedFiles];
		const stats = {
			scannedFileCount: documents.length,
			unchangedFileCount: 0,
			createdFileCount: 0,
			updatedFileCount: 0,
			deletedFileCount: 0,
			writtenChunkCount: 0,
		};

		if (input.dryRun) {
			let chunkCount = 0;
			for (const document of documents) {
				try {
					chunkCount += input.chunker(document.content, document.sourcePath).length;
				} catch {
					failedFiles.push(document.sourcePath);
				}
			}
			const status = failedFiles.length > 0 || !scan.complete ? "partial" : "succeeded";
			return makeResult(runId, status, stats, chunkCount, failedFiles, startedAt, input.clock());
		}

		await session.execute(
			`INSERT INTO knowledge_sync_runs (id, status, scanned_file_count, unchanged_file_count, created_file_count, updated_file_count, deleted_file_count, written_chunk_count, failed_files, started_at) VALUES ($1, 'running', 0, 0, 0, 0, 0, 0, $2, $3)`,
			[runId, JSON.stringify(failedFiles), startedAt],
		);
		runInserted = true;

		const existingRows = await session.execute(
			`SELECT id, source_path AS "sourcePath", content_hash AS "contentHash", profile_version AS "profileVersion", embedding_model AS "embeddingModel" FROM documents`,
			[],
		);
		const existing = new Map(existingRows.map((row) => [String(row.sourcePath), normalizeDocumentRow(row)]));
		const seenSourcePaths = new Set<string>();
		let embeddingTextCount = 0;

		for (let sourceIndex = 0; sourceIndex < documents.length; sourceIndex += 1) {
			const source = documents[sourceIndex];
			seenSourcePaths.add(source.sourcePath);
			const contentHash = hashContent(source.content);
			const previous = existing.get(source.sourcePath);
			if (
				previous?.contentHash === contentHash &&
				previous.profileVersion === options.profileVersion &&
				previous.embeddingModel === options.embeddingModel
			) {
				stats.unchangedFileCount += 1;
				continue;
			}

			let chunks: MarkdownChunk[];
			try {
				chunks = input.chunker(source.content, source.sourcePath);
			} catch {
				failedFiles.push(source.sourcePath);
				continue;
			}
			const remainingEmbeddingTexts = input.maxEmbeddingTexts - embeddingTextCount;
			const truncatedByLimit = chunks.length > remainingEmbeddingTexts;
			if (truncatedByLimit && remainingEmbeddingTexts <= 0) {
				failedFiles.push(source.sourcePath, ...documents.slice(sourceIndex + 1).map((item) => item.sourcePath));
				break;
			}
			if (truncatedByLimit) chunks = chunks.slice(0, remainingEmbeddingTexts);
			let embeddings: readonly (readonly number[])[];
			try {
				embeddingTextCount += chunks.length;
				embeddings = await createEmbeddings(
					options.embedding,
					chunks.map((chunk) => chunk.content),
				);
				assertEmbeddings(embeddings, chunks.length);
			} catch {
				failedFiles.push(
					source.sourcePath,
					...(truncatedByLimit ? documents.slice(sourceIndex + 1).map((item) => item.sourcePath) : []),
				);
				if (truncatedByLimit) break;
				continue;
			}

			const documentId = previous?.id ?? input.idFactory("document", source.sourcePath);
			try {
				await withTransaction(session, async (transaction) => {
					await transaction.execute("DELETE FROM chunks WHERE document_id = $1", [documentId]);
					await transaction.execute(
						`INSERT INTO documents (id, title, source_path, content_hash, profile_version, embedding_model, image_urls, last_synced_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (source_path) DO UPDATE SET title = EXCLUDED.title, content_hash = EXCLUDED.content_hash, profile_version = EXCLUDED.profile_version, embedding_model = EXCLUDED.embedding_model, image_urls = EXCLUDED.image_urls, last_synced_at = EXCLUDED.last_synced_at`,
						[
							documentId,
							titleFromSourcePath(source.sourcePath),
							source.sourcePath,
							contentHash,
							options.profileVersion,
							options.embeddingModel,
							JSON.stringify([...new Set(chunks.flatMap((chunk) => chunk.imageUrls))]),
							input.clock(),
						],
					);
					for (const [index, chunk] of chunks.entries()) {
						await transaction.execute(
							`INSERT INTO chunks (id, document_id, content, source_path, heading_path, heading_index, heading_anchor, chunk_index, chunk_kind, table_row_start, table_row_end, image_urls, content_hash, profile_version, embedding) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CAST($15 AS vector))`,
							[
								input.idFactory("chunk", source.sourcePath, index),
								documentId,
								chunk.content,
								chunk.sourcePath,
								JSON.stringify(chunk.headingPath),
								chunk.headingIndex,
								chunk.headingAnchor,
								chunk.chunkIndex,
								chunk.chunkKind,
								chunk.tableRowStart ?? null,
								chunk.tableRowEnd ?? null,
								JSON.stringify(chunk.imageUrls),
								sha256Hex(chunk.content),
								options.profileVersion,
								toVectorLiteral(embeddings[index]),
							],
						);
					}
				});
				if (previous) stats.updatedFileCount += 1;
				else stats.createdFileCount += 1;
				stats.writtenChunkCount += chunks.length;
			} catch {
				failedFiles.push(
					source.sourcePath,
					...(truncatedByLimit ? documents.slice(sourceIndex + 1).map((item) => item.sourcePath) : []),
				);
				if (truncatedByLimit) break;
				continue;
			}
			if (truncatedByLimit) {
				failedFiles.push(source.sourcePath, ...documents.slice(sourceIndex + 1).map((item) => item.sourcePath));
				break;
			}
		}

		if (scan.complete && failedFiles.length === 0) {
			for (const previous of existing.values()) {
				if (seenSourcePaths.has(previous.sourcePath)) continue;
				await withTransaction(session, async (transaction) => {
					await transaction.execute("DELETE FROM chunks WHERE document_id = $1", [previous.id]);
					await transaction.execute("DELETE FROM documents WHERE source_path = $1", [previous.sourcePath]);
				});
				stats.deletedFileCount += 1;
			}
		}

		const status = failedFiles.length > 0 || !scan.complete ? "partial" : "succeeded";
		const result = makeResult(runId, status, stats, stats.writtenChunkCount, failedFiles, startedAt, input.clock());
		await session.execute(
			`UPDATE knowledge_sync_runs SET status = $2, scanned_file_count = $3, unchanged_file_count = $4, created_file_count = $5, updated_file_count = $6, deleted_file_count = $7, written_chunk_count = $8, failed_files = $9, finished_at = $10 WHERE id = $1`,
			[
				runId,
				result.status,
				result.scannedFileCount,
				result.unchangedFileCount,
				result.createdFileCount,
				result.updatedFileCount,
				result.deletedFileCount,
				result.writtenChunkCount,
				JSON.stringify(result.failedFiles),
				result.finishedAt,
			],
		);
		return result;
	} catch (error) {
		if (runInserted) {
			try {
				await session.execute(`UPDATE knowledge_sync_runs SET status = 'failed', finished_at = $2 WHERE id = $1`, [
					runId,
					input.clock(),
				]);
			} catch {
				/** 原始异常优先保留，失败记录更新失败不应覆盖根因。 */
			}
		}
		throw error;
	} finally {
		try {
			if (lockAcquired) await session.execute("SELECT pg_advisory_unlock($1)", [input.lockKey]);
		} catch {
			/** 清理失败不能覆盖同步结果。 */
		} finally {
			try {
				await session.release();
			} catch {
				/** 连接释放失败不能覆盖同步结果。 */
			}
		}
	}
}

async function safeScan(
	scanner: SyncSourceScanner,
): Promise<{ documents: readonly SyncSourceDocument[]; complete: boolean; failedFiles: string[] }> {
	try {
		const result = await scanner();
		if (Array.isArray(result)) return { documents: result, complete: true, failedFiles: [] };
		if ("documents" in result)
			return { documents: result.documents, complete: result.complete, failedFiles: [...(result.failedFiles ?? [])] };
		return { documents: [], complete: false, failedFiles: [] };
	} catch {
		return { documents: [], complete: false, failedFiles: [] };
	}
}

async function createEmbeddings(provider: SyncEmbeddingProvider, contents: readonly string[]) {
	if (contents.length === 0) return [];
	const embeddings: (readonly number[])[] = [];
	for (let start = 0; start < contents.length; start += 100) {
		const batch = contents.slice(start, start + 100);
		const batchEmbeddings = provider.createEmbeddings
			? await provider.createEmbeddings(batch)
			: await Promise.all(batch.map((content) => provider.createEmbedding(content)));
		if (batchEmbeddings.length !== batch.length) throw new Error("embedding 数量与 chunk 数不一致。");
		embeddings.push(...batchEmbeddings);
	}
	return embeddings;
}

async function withTransaction<T>(executor: SyncSqlExecutor, callback: (transaction: SyncSqlExecutor) => Promise<T>) {
	return executor.transaction(callback);
}

function normalizeDocumentRow(row: Record<string, unknown>): SyncDocumentRow {
	return {
		id: String(row.id),
		sourcePath: String(row.sourcePath),
		contentHash: String(row.contentHash),
		profileVersion: String(row.profileVersion),
		embeddingModel: String(row.embeddingModel),
	};
}

function hashContent(content: string) {
	return sha256Hex(content);
}

function sha256Hex(content: string) {
	return createHash("sha256").update(content, "utf8").digest("hex");
}

function defaultIdFactory(kind: "run" | "document" | "chunk", sourcePath = "", index = 0) {
	if (kind === "run") return randomUUID();
	return createHash("sha256").update(`${kind}\u0000${sourcePath}\u0000${index}`).digest("hex");
}

function titleFromSourcePath(sourcePath: string) {
	const filename = sourcePath.split("/").pop() ?? sourcePath;
	return filename.replace(/\.md$/i, "");
}

function assertEmbeddings(embeddings: readonly (readonly number[])[], expected: number) {
	if (embeddings.length !== expected) throw new Error("embedding 数量与 chunk 数不一致。");
	for (const embedding of embeddings) {
		if (embedding.length !== 1536 || embedding.some((value) => !Number.isFinite(value))) {
			throw new Error("embedding 必须是 1536 维有限数值。");
		}
	}
}

function toVectorLiteral(embedding: readonly number[]) {
	return `[${embedding.join(",")}]`;
}

function makeResult(
	id: string,
	status: KnowledgeSyncResult["status"],
	stats: Omit<KnowledgeSyncResult, "id" | "status" | "failedFiles" | "startedAt" | "finishedAt" | "writtenChunkCount">,
	writtenChunkCount: number,
	failedFiles: readonly string[],
	startedAt: Date,
	finishedAt: Date,
): KnowledgeSyncResult {
	return {
		id,
		status,
		...stats,
		writtenChunkCount,
		failedFiles: [...new Set(failedFiles)].sort(),
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
	};
}
