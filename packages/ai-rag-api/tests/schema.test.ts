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
});
