import { describe, expect, test } from "vitest";
import { hybridSearch, type HybridSearchItem } from "../server/search/hybrid-search";

const item = (id: string, content: string): HybridSearchItem => ({
	id,
	content,
	sourcePath: `docs/docx/${id}.md`,
	headingPath: ["标题"],
	headingIndex: 0,
	headingAnchor: `rag-heading-${id}`,
	chunkIndex: 0,
	imageUrls: [],
});

describe("hybridSearch", () => {
	test("并行调用两个 provider，按实际榜单名次融合并保留单侧 payload", async () => {
		const calls: string[] = [];
		const results = await hybridSearch(
			"RAG",
			{
				async createEmbedding(query) {
					calls.push(`embedding:${query}`);
					return [0.1, 0.2];
				},
				async lexicalSearch(query, limit) {
					calls.push(`lexical:${query}:${limit}`);
					return [item("lexical-only", "词法"), item("shared", "共享词法")];
				},
				async vectorSearch(embedding, limit) {
					calls.push(`vector:${embedding.join(",")}:${limit}`);
					return [item("shared", "共享向量"), item("vector-only", "向量")];
				},
			},
			{ limit: 3 },
		);

		expect(calls).toEqual(["embedding:RAG", "lexical:RAG:3", "vector:0.1,0.2:3"]);
		expect(results.map((result) => result.id)).toEqual(["shared", "lexical-only", "vector-only"]);
		expect(results[1]).toMatchObject({ content: "词法", score: 1 / 61 });
	});

	test("拒绝无效 limit，避免向 provider 传入不可解释的分页参数", async () => {
		await expect(
			hybridSearch(
				"RAG",
				{
					createEmbedding: async () => [],
					lexicalSearch: async () => [],
					vectorSearch: async () => [],
				},
				{ limit: 0 },
			),
		).rejects.toThrow("limit");
	});
});
