import { describe, expect, test } from "vitest";
import {
	EMBEDDING_DIMENSIONS,
	PostgresSearchError,
	createPostgresSearchProvider,
	lexicalSearchStatement,
	vectorSearchStatement,
} from "../server/search/postgres-search";

const row = {
	id: "chunk-1",
	content: "RAG 先检索再生成",
	sourcePath: "docs/docx/guide.md",
	headingPath: ["指南"],
	headingIndex: 0,
	headingAnchor: "rag-heading-guide",
	chunkIndex: 0,
	imageUrls: ["./diagram.png"],
	score: 0.8,
};

describe("createPostgresSearchProvider", () => {
	test("词法检索使用参数化 simple/websearch SQL，并映射来源字段", async () => {
		const calls: Array<{ parameters: readonly unknown[]; statement: string }> = [];
		const provider = createPostgresSearchProvider({
			async execute(statement, parameters) {
				calls.push({ statement, parameters });
				return [row];
			},
		});

		await expect(provider.lexicalSearch("RAG' OR true --", 5)).resolves.toEqual([row]);
		expect(calls).toEqual([{ statement: lexicalSearchStatement, parameters: ["RAG' OR true --", 5] }]);
		expect(lexicalSearchStatement).toContain("websearch_to_tsquery('simple', $1)");
		expect(lexicalSearchStatement).not.toContain("RAG' OR true --");
	});

	test("向量检索固定余弦距离、验证 1024 维度，并按参数传递 pgvector 文本", async () => {
		const calls: Array<{ parameters: readonly unknown[]; statement: string }> = [];
		const provider = createPostgresSearchProvider({
			async execute(statement, parameters) {
				calls.push({ statement, parameters });
				return [row];
			},
		});
		const embedding = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => index / 100);

		await expect(provider.vectorSearch(embedding, 3)).resolves.toEqual([row]);
		expect(vectorSearchStatement).toContain("embedding <=> CAST($1 AS vector)");
		expect(calls[0]).toMatchObject({ statement: vectorSearchStatement, parameters: [expect.stringMatching(/^\[/), 3] });
		expect((calls[0].parameters[0] as string).split(",")).toHaveLength(EMBEDDING_DIMENSIONS);
		await expect(provider.vectorSearch([0.1], 3)).rejects.toBeInstanceOf(PostgresSearchError);
		await expect(provider.vectorSearch([...embedding.slice(0, -1), Number.NaN], 3)).rejects.toThrow("有限数值");
	});

	test("拒绝无效查询、分页参数和无法映射的数据库行", async () => {
		const provider = createPostgresSearchProvider({
			async execute() {
				return [{ ...row, headingPath: "不是数组" }];
			},
		});

		await expect(provider.lexicalSearch("  ", 1)).rejects.toThrow("不能为空");
		await expect(provider.lexicalSearch("RAG", 0)).rejects.toThrow("limit");
		await expect(provider.lexicalSearch("RAG", 1)).rejects.toThrow("headingPath");
	});
});
