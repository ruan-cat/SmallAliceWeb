import {
	hybridSearch,
	type HybridSearchItem,
	type HybridSearchOptions,
	type HybridSearchProviders,
} from "../search/hybrid-search";

export type EvaluationStrategy = "lexical" | "vector" | "hybrid";

export interface EvalQuestion {
	id: string;
	question: string;
	expected_keywords: string[];
	category: string;
}

export interface EvalResult {
	questionId: string;
	category: string;
	strategy: EvaluationStrategy;
	retrievedIds: string[];
	matchedKeywords: string[];
	missingKeywords: string[];
	hasExpectedKeyword: boolean;
	expectedKeywordCoverage: number;
}

export interface EvalStrategySummary {
	strategy: EvaluationStrategy;
	questionCount: number;
	questionHitCount: number;
	questionHitRate: number;
	meanExpectedKeywordCoverage: number;
}

export interface EvalReport {
	schemaVersion: 1;
	questionCount: number;
	results: EvalResult[];
	summaries: EvalStrategySummary[];
}

export interface EvaluationProviders extends HybridSearchProviders {}

export interface EvaluationOptions extends HybridSearchOptions {}

const strategies: EvaluationStrategy[] = ["lexical", "vector", "hybrid"];

/** 解析固定评估题集，并拒绝会破坏横向对比的无效或重复题目。 */
export function parseEvalQuestions(input: unknown): EvalQuestion[] {
	if (!Array.isArray(input)) throw new TypeError("评估题集必须是数组。");

	const ids = new Set<string>();
	return input.map((value, index) => {
		if (!isRecord(value)) throw new TypeError(`评估题集第 ${index + 1} 项必须是对象。`);
		const id = requireText(value.id, `评估题集第 ${index + 1} 项 id`);
		const question = requireText(value.question, `评估题集第 ${index + 1} 项 question`);
		const category = requireText(value.category, `评估题集第 ${index + 1} 项 category`);
		const expected_keywords = requireKeywords(value.expected_keywords, `评估题集第 ${index + 1} 项 expected_keywords`);

		if (ids.has(id)) throw new TypeError(`评估题集 id 重复：${id}`);
		ids.add(id);
		return { id, question, expected_keywords, category };
	});
}

/** 对固定题集运行词法、向量和混合检索，并返回 JSON 可序列化的比较报告。 */
export async function runRetrievalEvaluation(
	questions: readonly EvalQuestion[],
	providers: EvaluationProviders,
	options: EvaluationOptions = {},
): Promise<EvalReport> {
	const limit = options.limit ?? 5;
	if (!Number.isInteger(limit) || limit < 1) throw new RangeError("评估检索的 limit 必须是正整数。");

	const results: EvalResult[] = [];
	for (const question of questions) {
		results.push(...(await evaluateQuestion(question, providers, { ...options, limit })));
	}

	return {
		schemaVersion: 1,
		questionCount: questions.length,
		results,
		summaries: strategies.map((strategy) => summarizeStrategy(results, strategy, questions.length)),
	};
}

async function evaluateQuestion(
	question: EvalQuestion,
	providers: EvaluationProviders,
	options: Required<Pick<EvaluationOptions, "limit">> & EvaluationOptions,
): Promise<EvalResult[]> {
	const lexicalResults = providers.lexicalSearch(question.question, options.limit);
	const embedding = providers.createEmbedding(question.question);
	const vectorResults = embedding.then((value) => providers.vectorSearch(value, options.limit));

	/** 缓存同一问题的 provider 响应，避免三种策略对比额外产生网络或数据库调用。 */
	const hybridProviders: HybridSearchProviders = {
		createEmbedding: async () => embedding,
		lexicalSearch: async () => lexicalResults,
		vectorSearch: async () => vectorResults,
	};
	const hybridResults = hybridSearch(question.question, hybridProviders, options);
	const [lexical, vector, hybrid] = await Promise.all([lexicalResults, vectorResults, hybridResults]);

	return [
		createEvalResult(question, "lexical", lexical),
		createEvalResult(question, "vector", vector),
		createEvalResult(question, "hybrid", hybrid),
	];
}

function createEvalResult(
	question: EvalQuestion,
	strategy: EvaluationStrategy,
	retrieved: readonly HybridSearchItem[],
): EvalResult {
	const text = retrieved
		.map((item) => item.content)
		.join("\n")
		.toLowerCase();
	const matchedKeywords = question.expected_keywords.filter((keyword) => text.includes(keyword.toLowerCase()));
	const missingKeywords = question.expected_keywords.filter((keyword) => !matchedKeywords.includes(keyword));

	return {
		questionId: question.id,
		category: question.category,
		strategy,
		retrievedIds: retrieved.map((item) => item.id),
		matchedKeywords,
		missingKeywords,
		hasExpectedKeyword: matchedKeywords.length > 0,
		expectedKeywordCoverage: matchedKeywords.length / question.expected_keywords.length,
	};
}

function summarizeStrategy(
	results: readonly EvalResult[],
	strategy: EvaluationStrategy,
	questionCount: number,
): EvalStrategySummary {
	const strategyResults = results.filter((result) => result.strategy === strategy);
	const questionHitCount = strategyResults.filter((result) => result.hasExpectedKeyword).length;
	const coverageTotal = strategyResults.reduce((total, result) => total + result.expectedKeywordCoverage, 0);

	return {
		strategy,
		questionCount,
		questionHitCount,
		questionHitRate: questionCount === 0 ? 0 : questionHitCount / questionCount,
		meanExpectedKeywordCoverage: questionCount === 0 ? 0 : coverageTotal / questionCount,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function requireText(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} 必须是非空字符串。`);
	return value.trim();
}

function requireKeywords(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} 必须包含至少一个关键词。`);
	const keywords = value.map((keyword, index) => requireText(keyword, `${label}[${index}]`));
	if (new Set(keywords).size !== keywords.length) throw new TypeError(`${label} 不能包含重复关键词。`);
	return keywords;
}
