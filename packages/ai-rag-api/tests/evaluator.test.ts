import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
	parseEvalQuestions,
	runRetrievalEvaluation,
	type EvalQuestion,
} from "../server/evaluation/evaluator";
import type { HybridSearchItem } from "../server/search/hybrid-search";
import type { CorpusPreflightResult } from "../server/evaluation/corpus-preflight";

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
				{
					id: "q1",
					question: "问题",
					category: "分类",
					expected_keywords: ["关键词"],
				},
				{
					id: "q1",
					question: "问题 2",
					category: "分类",
					expected_keywords: ["关键词"],
				},
			]),
		).toThrow("重复");
		expect(() =>
			parseEvalQuestions([
				{ id: "q1", question: "问题", category: "分类", expected_keywords: [] },
			]),
		).toThrow("至少一个关键词");
	});

	test("固定评估题集可被解析，并维持 10 题离线基线", async () => {
		const source = await readFile(
			new URL("../data/eval-questions.json", import.meta.url),
			"utf8",
		);
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

	test("输出 candidate/final ID 与 gold 指标，并隔离 corpus 非 ready 题", async () => {
		const titleQuestion: EvalQuestion = {
			id: "q-title",
			question: "小爱丽丝是谁？",
			expected_keywords: ["小爱丽丝"],
			category: "标题型实体",
			gold: [{ chunkId: "target", grade: 3 }],
		};
		const staleQuestion: EvalQuestion = {
			...titleQuestion,
			id: "q-stale",
			question: "语料尚未同步的题",
		};
		const preflight = async (
			question: EvalQuestion,
		): Promise<CorpusPreflightResult> => ({
			sourcePath: "docs/docx/guide.md",
			status: question.id === "q-title" ? "ready" : "corpus-stale",
			eligibleForMetrics: question.id === "q-title",
			chunkCount: question.id === "q-title" ? 2 : 0,
			embeddingCount: question.id === "q-title" ? 2 : 0,
			headingPathMatched: question.id === "q-title",
			chunkIdsMatched: question.id === "q-title",
			reason: question.id === "q-title" ? undefined : "同步状态不可证明",
		});
		const report = await runRetrievalEvaluation(
			[titleQuestion, staleQuestion],
			{
				createEmbedding: async () => [1],
				lexicalSearch: async () => [
					item("target", "小爱丽丝"),
					item("noise", "小爱丽丝"),
				],
				vectorSearch: async () => [
					item("noise", "小爱丽丝"),
					item("target", "小爱丽丝"),
				],
			},
			{
				limit: 1,
				candidateLimit: 2,
				finalLimit: 1,
				configVersion: "phase3-test",
				corpusPreflight: preflight,
			},
		);

		const titleResult = report.results.find(
			(result) =>
				result.questionId === "q-title" && result.strategy === "lexical",
		);
		const staleResult = report.results.find(
			(result) =>
				result.questionId === "q-stale" && result.strategy === "lexical",
		);
		expect(report.configVersion).toBe("phase3-test");
		expect(titleResult).toMatchObject({
			candidateIds: ["target", "noise"],
			finalIds: ["target"],
			retrievedIds: ["target"],
			goldMetrics: {
				candidate: { recallAtK: { 5: 1 } },
				final: { recallAtK: { 5: 1 } },
			},
		});
		expect(staleResult).toMatchObject({
			candidateIds: ["target", "noise"],
			finalIds: ["target"],
			goldMetrics: null,
			isolationReason: "corpus-stale",
		});
	});

	test("将数据库 hash chunk id 映射为 gold-set 的 sourcePath/chunkIndex 标识", async () => {
		const report = await runRetrievalEvaluation(
			[
				{
					id: "q-hash-id",
					question: "标题题",
					expected_keywords: ["标题"],
					category: "标题型实体",
					gold: [{ chunkId: "docs/docx/title.md#23", grade: 3 }],
				},
			],
			{
				createEmbedding: async () => [1],
				lexicalSearch: async () => [
					{
						...item("hash-target", "标题"),
						sourcePath: "docs/docx/title.md",
						chunkIndex: 23,
					},
				],
				vectorSearch: async () => [],
			},
			{ limit: 1, candidateLimit: 1, finalLimit: 1 },
		);

		expect(report.results[0]?.goldMetrics?.final.recallAtK[5]).toBe(1);
	});
});
