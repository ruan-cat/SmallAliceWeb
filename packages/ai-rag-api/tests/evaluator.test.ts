import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { parseEvalQuestions, runRetrievalEvaluation, type EvalQuestion } from "../server/evaluation/evaluator";
import type { HybridSearchItem } from "../server/search/hybrid-search";

function item(id: string, content: string): HybridSearchItem {
	return {
		id,
		content,
		sourcePath: `docs/docx/${id}.md`,
		headingPath: [id],
		headingIndex: 0,
		headingAnchor: `rag-heading-${id}`,
		chunkIndex: 0,
		imageUrls: [],
	};
}

const questions: EvalQuestion[] = [
	{
		id: "q-rag",
		question: "什么是 RAG？",
		expected_keywords: ["检索", "生成"],
		category: "概念理解",
	},
	{
		id: "q-empty",
		question: "没有命中的问题",
		expected_keywords: ["不存在"],
		category: "边界",
	},
];

describe("RAG 离线评估器", () => {
	test("通过既有 provider 注入边界生成可重复且 JSON 可序列化的三策略报告", async () => {
		const calls: string[] = [];
		const report = await runRetrievalEvaluation(
			questions,
			{
				async createEmbedding(query) {
					calls.push(`embedding:${query}`);
					return [query.length];
				},
				async lexicalSearch(query) {
					calls.push(`lexical:${query}`);
					return query === "什么是 RAG？"
						? [item("lexical", "RAG 是检索增强技术。")]
						: [item("empty", "没有相关结果。")];
				},
				async vectorSearch(embedding) {
					calls.push(`vector:${embedding[0]}`);
					return embedding[0] === "什么是 RAG？".length
						? [item("vector", "RAG 可以辅助生成答案。")]
						: [item("empty-vector", "没有相关结果。")];
				},
			},
			{ limit: 2, k: 60 },
		);

		expect(calls).toEqual([
			"lexical:什么是 RAG？",
			"embedding:什么是 RAG？",
			"vector:8",
			"lexical:没有命中的问题",
			"embedding:没有命中的问题",
			"vector:7",
		]);
		expect(report).toMatchObject({ schemaVersion: 1, questionCount: 2 });
		expect(report.results).toEqual([
			expect.objectContaining({
				questionId: "q-rag",
				strategy: "lexical",
				retrievedIds: ["lexical"],
				matchedKeywords: ["检索"],
				missingKeywords: ["生成"],
				expectedKeywordCoverage: 0.5,
			}),
			expect.objectContaining({
				questionId: "q-rag",
				strategy: "vector",
				retrievedIds: ["vector"],
				matchedKeywords: ["生成"],
				missingKeywords: ["检索"],
				expectedKeywordCoverage: 0.5,
			}),
			expect.objectContaining({
				questionId: "q-rag",
				strategy: "hybrid",
				retrievedIds: ["lexical", "vector"],
				matchedKeywords: ["检索", "生成"],
				missingKeywords: [],
				expectedKeywordCoverage: 1,
			}),
			expect.objectContaining({
				questionId: "q-empty",
				strategy: "lexical",
				hasExpectedKeyword: false,
				expectedKeywordCoverage: 0,
			}),
			expect.objectContaining({
				questionId: "q-empty",
				strategy: "vector",
				hasExpectedKeyword: false,
				expectedKeywordCoverage: 0,
			}),
			expect.objectContaining({
				questionId: "q-empty",
				strategy: "hybrid",
				hasExpectedKeyword: false,
				expectedKeywordCoverage: 0,
			}),
		]);
		expect(report.summaries).toEqual([
			{
				strategy: "lexical",
				questionCount: 2,
				questionHitCount: 1,
				questionHitRate: 0.5,
				meanExpectedKeywordCoverage: 0.25,
			},
			{
				strategy: "vector",
				questionCount: 2,
				questionHitCount: 1,
				questionHitRate: 0.5,
				meanExpectedKeywordCoverage: 0.25,
			},
			{
				strategy: "hybrid",
				questionCount: 2,
				questionHitCount: 1,
				questionHitRate: 0.5,
				meanExpectedKeywordCoverage: 0.5,
			},
		]);
		expect(JSON.parse(JSON.stringify(report))).toEqual(report);
	});

	test("拒绝破坏基线可解释性的无效题集", () => {
		expect(() =>
			parseEvalQuestions([
				{ id: "q1", question: "问题", category: "分类", expected_keywords: ["关键词"] },
				{ id: "q1", question: "问题 2", category: "分类", expected_keywords: ["关键词"] },
			]),
		).toThrow("重复");
		expect(() => parseEvalQuestions([{ id: "q1", question: "问题", category: "分类", expected_keywords: [] }])).toThrow(
			"至少一个关键词",
		);
	});

	test("固定评估题集可被解析，并维持 10 题离线基线", async () => {
		const source = await readFile(new URL("../data/eval-questions.json", import.meta.url), "utf8");
		const fixedQuestions = parseEvalQuestions(JSON.parse(source));

		expect(fixedQuestions).toHaveLength(10);
		expect(fixedQuestions.map((question) => question.id)).toEqual([
			"q1",
			"q2",
			"q3",
			"q4",
			"q5",
			"q6",
			"q7",
			"q8",
			"q9",
			"q10",
		]);
	});
});
