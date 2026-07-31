/** RRF 榜单条目至少需要可用于去重的稳定标识。 */
export type RankingItem = { id: string } & Record<string, unknown>;

/** RRF 融合后保留原始条目字段，并附加累计分数。 */
export type FusedRankingItem<T extends RankingItem> = T & { score: number };

interface AccumulatedRanking<T extends RankingItem> {
	firstSeenIndex: number;
	payload: T;
	score: number;
}

/**
 * 以 Reciprocal Rank Fusion 合并多个已排序的检索榜单。
 *
 * 每个榜单内的名次从 1 开始；某一结果未出现在该榜单时不会获得该榜单的分数。
 * 同一榜单中重复的 id 只按首次出现的实际名次贡献一次，避免异常输入重复加分。
 */
export function fuseRankings<T extends RankingItem>(
	rankings: readonly (readonly T[])[],
	k = 60,
): FusedRankingItem<T>[] {
	if (!Number.isFinite(k) || k < 0) {
		throw new RangeError("RRF 参数 k 必须是大于或等于 0 的有限数字。");
	}

	const accumulated = new Map<string, AccumulatedRanking<T>>();
	let nextFirstSeenIndex = 0;

	for (const ranking of rankings) {
		const seenInRanking = new Set<string>();

		for (const [index, item] of ranking.entries()) {
			if (seenInRanking.has(item.id)) {
				continue;
			}
			seenInRanking.add(item.id);

			const score = 1 / (k + index + 1);
			const existing = accumulated.get(item.id);
			if (existing) {
				existing.score += score;
				existing.payload = { ...existing.payload, ...item };
				continue;
			}

			accumulated.set(item.id, {
				firstSeenIndex: nextFirstSeenIndex,
				payload: { ...item },
				score,
			});
			nextFirstSeenIndex += 1;
		}
	}

	return [...accumulated.values()]
		.sort((left, right) => right.score - left.score || left.firstSeenIndex - right.firstSeenIndex)
		.map(({ payload, score }) => ({ ...payload, score }));
}
