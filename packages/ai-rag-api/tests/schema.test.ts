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
});
