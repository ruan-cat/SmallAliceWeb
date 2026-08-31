export type GoldRelevance = {
	chunkId: string;
	grade: number;
};

export type RetrievalMetricsInput = {
	candidateIds: readonly string[];
	finalIds: readonly string[];
	gold: readonly GoldRelevance[];
	ks?: readonly number[];
};

export type RetrievalMetricSet = {
	ids: string[];
	recallAtK: Record<number, number>;
	precisionAtK: Record<number, number>;
	mrrAtK: Record<number, number>;
	ndcgAtK: Record<number, number | null>;
};

export type RetrievalMetrics = {
	candidate: RetrievalMetricSet;
	final: RetrievalMetricSet;
};

const defaultKs = [5, 10, 30] as const;

/** 以首次出现顺序消除异常 provider 返回的重复检索 ID。 */
export function dedupeResultIds(ids: readonly string[]): string[] {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const id of ids) {
		if (typeof id !== "string" || id.trim().length === 0)
			throw new Error("检索结果 ID 必须是非空字符串。");
		if (seen.has(id)) continue;
		seen.add(id);
		result.push(id);
	}
	return result;
}

/** 同时计算候选池与最终榜单的确定性 IR 指标，不依赖 LLM judge。 */
export function calculateRetrievalMetrics(
	input: RetrievalMetricsInput,
): RetrievalMetrics {
	const ks = normalizeKs(input.ks ?? defaultKs);
	const relevance = normalizeRelevance(input.gold);
	return {
		candidate: calculateMetricSet(
			dedupeResultIds(input.candidateIds),
			relevance,
			ks,
		),
		final: calculateMetricSet(dedupeResultIds(input.finalIds), relevance, ks),
	};
}

function calculateMetricSet(
	ids: string[],
	relevance: ReadonlyMap<string, number>,
	ks: readonly number[],
): RetrievalMetricSet {
	const recallAtK: Record<number, number> = {};
	const precisionAtK: Record<number, number> = {};
	const mrrAtK: Record<number, number> = {};
	const ndcgAtK: Record<number, number | null> = {};
	const idealGrades = [...relevance.values()].sort(
		(left, right) => right - left,
	);

	for (const k of ks) {
		const ranked = ids.slice(0, k);
		const hitIds = new Set(ranked.filter((id) => relevance.has(id)));
		recallAtK[k] = relevance.size === 0 ? 0 : hitIds.size / relevance.size;
		precisionAtK[k] = ranked.length === 0 ? 0 : hitIds.size / ranked.length;
		mrrAtK[k] = reciprocalRank(ranked, relevance);
		ndcgAtK[k] =
			relevance.size === 0
				? null
				: normalizedDiscountedCumulativeGain(ranked, relevance, idealGrades, k);
	}

	return { ids, recallAtK, precisionAtK, mrrAtK, ndcgAtK };
}

function normalizeKs(ks: readonly number[]): number[] {
	if (ks.length === 0) throw new Error("至少需要一个评测 K 值。");
	const unique = new Set<number>();
	for (const k of ks) {
		if (!Number.isInteger(k) || k < 1)
			throw new Error("评测 K 值必须是正整数。");
		unique.add(k);
	}
	return [...unique].sort((left, right) => left - right);
}

function normalizeRelevance(
	gold: readonly GoldRelevance[],
): Map<string, number> {
	const relevance = new Map<string, number>();
	for (const item of gold) {
		if (typeof item.chunkId !== "string" || item.chunkId.trim().length === 0) {
			throw new Error("gold chunkId 必须是非空字符串。");
		}
		if (!Number.isInteger(item.grade) || item.grade < 1 || item.grade > 3) {
			throw new Error("gold grade 必须是 1 到 3 的整数。");
		}
		relevance.set(
			item.chunkId,
			Math.max(relevance.get(item.chunkId) ?? 0, item.grade),
		);
	}
	return relevance;
}

function reciprocalRank(
	ids: readonly string[],
	relevance: ReadonlyMap<string, number>,
): number {
	const firstRelevantIndex = ids.findIndex((id) => relevance.has(id));
	return firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);
}

function normalizedDiscountedCumulativeGain(
	ids: readonly string[],
	relevance: ReadonlyMap<string, number>,
	idealGrades: readonly number[],
	k: number,
): number {
	const dcg = discountedCumulativeGain(
		ids.slice(0, k).map((id) => relevance.get(id) ?? 0),
	);
	const ideal = discountedCumulativeGain(idealGrades.slice(0, k));
	return ideal === 0 ? 0 : dcg / ideal;
}

function discountedCumulativeGain(grades: readonly number[]): number {
	return grades.reduce(
		(total, grade, index) => total + (2 ** grade - 1) / Math.log2(index + 2),
		0,
	);
}
