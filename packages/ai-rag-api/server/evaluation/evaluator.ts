import {
	hybridSearch,
	type HybridSearchItem,
	type HybridSearchOptions,
	type HybridSearchProviders,
} from "../search/hybrid-search";
import type { CorpusPreflightResult } from "./corpus-preflight";
import {
	calculateRetrievalMetrics,
	dedupeResultIds,
	type GoldRelevance,
	type RetrievalMetrics,
} from "./retrieval-metrics";

export type EvaluationStrategy = "lexical" | "vector" | "hybrid";

export interface EvalQuestion {
	id: string;
	question: string;
	expected_keywords: string[];
	category: string;
	gold?: readonly GoldRelevance[];
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
	candidateIds: string[];
	finalIds: string[];
	goldMetrics: RetrievalMetrics | null;
	corpusPreflight?: CorpusPreflightResult;
	isolationReason?: string;
	configVersion?: string;
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
	configVersion?: string;
}

export interface EvaluationProviders extends HybridSearchProviders {}

export interface EvaluationOptions extends HybridSearchOptions {
	candidateLimit?: number;
	finalLimit?: number;
	configVersion?: string;
	corpusPreflight?: (question: EvalQuestion) => Promise<CorpusPreflightResult>;
}

const strategies: EvaluationStrategy[] = ["lexical", "vector", "hybrid"];

/** 解析固定评估题集，并拒绝会破坏横向对比的无效或重复题目。 */
export function parseEvalQuestions(input: unknown): EvalQuestion[] {
	if (!Array.isArray(input)) throw new TypeError("评估题集必须是数组。");

	const ids = new Set<string>();
	return input.map((value, index) => {
		if (!isRecord(value))
			throw new TypeError(`评估题集第 ${index + 1} 项必须是对象。`);
		const id = requireText(value.id, `评估题集第 ${index + 1} 项 id`);
		const question = requireText(
			value.question,
			`评估题集第 ${index + 1} 项 question`,
		);
		const category = requireText(
			value.category,
			`评估题集第 ${index + 1} 项 category`,
		);
		const expected_keywords = requireKeywords(
			value.expected_keywords,
			`评估题集第 ${index + 1} 项 expected_keywords`,
		);

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
	const finalLimit = options.finalLimit ?? options.limit ?? 5;
	const candidateLimit =
		options.candidateLimit ?? Math.max(finalLimit, options.limit ?? finalLimit);
	if (!Number.isInteger(finalLimit) || finalLimit < 1)
		throw new RangeError("评估检索的 finalLimit 必须是正整数。");
	if (!Number.isInteger(candidateLimit) || candidateLimit < finalLimit) {
		throw new RangeError(
			"评估检索的 candidateLimit 必须是不小于 finalLimit 的正整数。",
		);
	}

	const results: EvalResult[] = [];
	for (const question of questions) {
		results.push(
			...(await evaluateQuestion(question, providers, {
				...options,
				limit: finalLimit,
				candidateLimit,
				finalLimit,
			})),
		);
	}

	return {
		schemaVersion: 1,
		questionCount: questions.length,
		results,
		summaries: strategies.map((strategy) =>
			summarizeStrategy(results, strategy, questions.length),
		),
		configVersion: options.configVersion,
	};
}

async function evaluateQuestion(
	question: EvalQuestion,
	providers: EvaluationProviders,
	options: Required<
		Pick<EvaluationOptions, "limit" | "candidateLimit" | "finalLimit">
	> &
		EvaluationOptions,
): Promise<EvalResult[]> {
	const lexicalResults = providers.lexicalSearch(
		question.question,
		options.candidateLimit,
	);
	const embedding = providers.createEmbedding(question.question);
	const vectorResults = embedding.then((value) =>
		providers.vectorSearch(value, options.candidateLimit),
	);

	/** 缓存同一问题的 provider 响应，避免三种策略对比额外产生网络或数据库调用。 */
	const hybridProviders: HybridSearchProviders = {
		createEmbedding: async () => embedding,
		lexicalSearch: async () => lexicalResults,
		vectorSearch: async () => vectorResults,
	};
	const hybridResults = hybridSearch(question.question, hybridProviders, {
		limit: options.candidateLimit,
		k: options.k,
	});
	const [lexical, vector, hybrid] = await Promise.all([
		lexicalResults,
		vectorResults,
		hybridResults,
	]);
	const corpusPreflight = options.corpusPreflight
		? await options.corpusPreflight(question)
		: undefined;

	return [
		createEvalResult(
			question,
			"lexical",
			lexical,
			options.finalLimit,
			corpusPreflight,
			options.configVersion,
		),
		createEvalResult(
			question,
			"vector",
			vector,
			options.finalLimit,
			corpusPreflight,
			options.configVersion,
		),
		createEvalResult(
			question,
			"hybrid",
			hybrid,
			options.finalLimit,
			corpusPreflight,
			options.configVersion,
		),
	];
}

function createEvalResult(
	question: EvalQuestion,
	strategy: EvaluationStrategy,
	candidates: readonly HybridSearchItem[],
	finalLimit: number,
	corpusPreflight: CorpusPreflightResult | undefined,
	configVersion: string | undefined,
): EvalResult {
	const candidateIds = dedupeResultIds(candidates.map((item) => item.id));
	const finalIds = candidateIds.slice(0, finalLimit);
	const retrieved = candidates.filter(
		(item, index) =>
			finalIds.includes(item.id) &&
			candidates.findIndex((candidate) => candidate.id === item.id) === index,
	);
	const text = retrieved
		.map((item) => item.content)
		.join("\n")
		.toLowerCase();
	const matchedKeywords = question.expected_keywords.filter((keyword) =>
		text.includes(keyword.toLowerCase()),
	);
	const missingKeywords = question.expected_keywords.filter(
		(keyword) => !matchedKeywords.includes(keyword),
	);

	const metricCandidateIds = resolveMetricIds(candidates, question.gold);
	const metricFinalIds = metricCandidateIds.slice(0, finalLimit);
	const goldMetrics =
		question.gold &&
		question.gold.length > 0 &&
		(!corpusPreflight || corpusPreflight.status === "ready")
			? calculateRetrievalMetrics({
					candidateIds: metricCandidateIds,
					finalIds: metricFinalIds,
					gold: question.gold,
				})
			: null;
	const isolationReason =
		corpusPreflight && corpusPreflight.status !== "ready"
			? corpusPreflight.status
			: !question.gold || question.gold.length === 0
				? "gold-missing"
				: undefined;

	return {
		questionId: question.id,
		category: question.category,
		strategy,
		retrievedIds: finalIds,
		matchedKeywords,
		missingKeywords,
		hasExpectedKeyword: matchedKeywords.length > 0,
		expectedKeywordCoverage:
			matchedKeywords.length / question.expected_keywords.length,
		candidateIds,
		finalIds,
		goldMetrics,
		corpusPreflight,
		isolationReason,
		configVersion,
	};
}

/** 兼容数据库内部 hash id 与 gold-set 的 sourcePath#chunkIndex 稳定标识。 */
function resolveMetricIds(
	candidates: readonly HybridSearchItem[],
	gold: readonly GoldRelevance[] | undefined,
): string[] {
	const rawIds = dedupeResultIds(candidates.map((item) => item.id));
	if (!gold || gold.length === 0) return rawIds;
	const goldIds = new Set(gold.map((item) => item.chunkId));
	if (rawIds.some((id) => goldIds.has(id))) return rawIds;
	return dedupeResultIds(
		candidates.map((item) => `${item.sourcePath}#${item.chunkIndex}`),
	);
}

function summarizeStrategy(
	results: readonly EvalResult[],
	strategy: EvaluationStrategy,
	questionCount: number,
): EvalStrategySummary {
	const strategyResults = results.filter(
		(result) => result.strategy === strategy,
	);
	const questionHitCount = strategyResults.filter(
		(result) => result.hasExpectedKeyword,
	).length;
	const coverageTotal = strategyResults.reduce(
		(total, result) => total + result.expectedKeywordCoverage,
		0,
	);

	return {
		strategy,
		questionCount,
		questionHitCount,
		questionHitRate: questionCount === 0 ? 0 : questionHitCount / questionCount,
		meanExpectedKeywordCoverage:
			questionCount === 0 ? 0 : coverageTotal / questionCount,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function requireText(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim())
		throw new TypeError(`${label} 必须是非空字符串。`);
	return value.trim();
}

function requireKeywords(value: unknown, label: string): string[] {
	if (!Array.isArray(value) || value.length === 0)
		throw new TypeError(`${label} 必须包含至少一个关键词。`);
	const keywords = value.map((keyword, index) =>
		requireText(keyword, `${label}[${index}]`),
	);
	if (new Set(keywords).size !== keywords.length)
		throw new TypeError(`${label} 不能包含重复关键词。`);
	return keywords;
}
