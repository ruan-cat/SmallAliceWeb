import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { chunks, documents, knowledgeSyncRuns } from "../server/db/schema";

describe("RAG Drizzle schema", () => {
	test("defines the document, chunk, and sync-run tables", () => {
		expect(documents).toBeDefined();
		expect(chunks).toBeDefined();
		expect(knowledgeSyncRuns).toBeDefined();
	});

	test("keeps the embedding dimension and source metadata columns explicit", () => {
		expect(chunks.embedding).toBeDefined();
		expect(chunks.sourcePath).toBeDefined();
		expect(chunks.headingAnchor).toBeDefined();
		expect(chunks.chunkIndex).toBeDefined();
		expect(chunks.parentId).toBeDefined();
		expect(chunks.preprocessingVersion).toBeDefined();
		expect(chunks.searchText).toBeDefined();
		expect(documents.preprocessingVersion).toBeDefined();
	});

	test("Drizzle journal tracks every canonical migration SQL on disk", async () => {
		const testDirectory = dirname(fileURLToPath(import.meta.url));
		const migrationDirectory = join(testDirectory, "..", "drizzle");
		const journalPath = join(migrationDirectory, "meta", "_journal.json");
		const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
			entries: Array<{ tag: string }>;
		};
		const sqlTags = (await readdir(migrationDirectory))
			.filter((fileName) => fileName.endsWith(".sql"))
			.map((fileName) => fileName.slice(0, -".sql".length))
			.sort();
		const journalTags = journal.entries.map((entry) => entry.tag).sort();

		expect(journalTags).toEqual(sqlTags);
		expect(journalTags).toEqual(sqlTags);
	});

	test("1024 维 Cloudflare migration 在重建索引前拒绝已有向量", async () => {
		const testDirectory = dirname(fileURLToPath(import.meta.url));
		const migration = await readFile(
			join(
				testDirectory,
				"..",
				"drizzle",
				"0002_switch_embedding_to_bge_m3_1024.sql",
			),
			"utf8",
		);
		expect(migration).toContain("vector(1024)");
		expect(migration).toContain(
			"DROP INDEX IF EXISTS chunks_embedding_hnsw_cosine_idx",
		);
		expect(migration).toContain(
			"CREATE INDEX chunks_embedding_hnsw_cosine_idx",
		);
		expect(migration).toContain("chunks contains existing vectors");
	});

	test("phase3 chunk profile migration 保留旧数据并提供 parent/search 字段回滚", async () => {
		const testDirectory = dirname(fileURLToPath(import.meta.url));
		const migration = await readFile(
			join(
				testDirectory,
				"..",
				"drizzle",
				"0003_ai_rag_phase3_chunk_profile.sql",
			),
			"utf8",
		);
		expect(migration).toContain("ADD COLUMN IF NOT EXISTS parent_id");
		expect(migration).toContain("ADD COLUMN IF NOT EXISTS search_text");
		expect(migration).toContain(
			"CREATE INDEX IF NOT EXISTS chunks_parent_id_idx",
		);
		expect(migration).toContain("DROP COLUMN IF EXISTS parent_id");
	});

	test("pg_trgm migration 只创建可回滚的 Neon GIN 索引", async () => {
		const testDirectory = dirname(fileURLToPath(import.meta.url));
		const migration = await readFile(
			join(testDirectory, "..", "drizzle", "0004_add_pg_trgm_search.sql"),
			"utf8",
		);
		expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm");
		expect(migration).toContain("gin_trgm_ops");
		expect(migration).toContain(
			"DROP INDEX IF EXISTS chunks_search_text_trgm_idx",
		);
		expect(migration).toContain("DROP EXTENSION IF EXISTS pg_trgm");
		expect(migration).not.toContain("PGroonga");
	});
});
