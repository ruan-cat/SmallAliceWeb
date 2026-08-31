import {
	fuseRankings,
	type RankingItem,
} from "@ruan-cat-drill-doc/ai-rag-core";

export interface HybridSearchItem extends RankingItem {
	content: string;
	sourcePath: string;
	headingPath: string[];
	headingIndex: number;
	headingAnchor: string;
	chunkIndex: number;
	imageUrls: string[];
	parentId?: string;
	strategy?: string;
}

export interface HybridSearchOptions {
	limit?: number;
	candidateLimit?: number;
	finalLimit?: number;
	k?: number;
}

export interface HybridSearchProviders {
	createEmbedding: (query: string) => Promise<number[]>;
	lexicalSearch: (query: string, limit: number) => Promise<HybridSearchItem[]>;
	vectorSearch: (
		embedding: number[],
		limit: number,
	) => Promise<HybridSearchItem[]>;
}

/** 并行执行词法与向量 provider，并按实际榜单名次做 RRF 融合。 */
export async function hybridSearch(
	query: string,
	providers: HybridSearchProviders,
	options: HybridSearchOptions = {},
): Promise<Array<HybridSearchItem & { score: number }>> {
	const finalLimit = options.finalLimit ?? options.limit ?? 10;
	const candidateLimit =
		options.candidateLimit ?? Math.max(finalLimit, options.limit ?? finalLimit);
	const k = options.k ?? 60;
	if (!Number.isInteger(finalLimit) || finalLimit < 1)
		throw new RangeError("Hybrid Search 的 limit/finalLimit 必须是正整数。");
	if (!Number.isInteger(candidateLimit) || candidateLimit < finalLimit) {
		throw new RangeError(
			"Hybrid Search 的 candidateLimit 必须是不小于 finalLimit 的正整数。",
		);
	}
	if (!Number.isInteger(k) || k < 1)
		throw new RangeError("Hybrid Search 的 k 必须是正整数。");

	const [embedding, lexicalResults] = await Promise.all([
		providers.createEmbedding(query),
		providers.lexicalSearch(query, candidateLimit),
	]);
	const vectorResults = await providers.vectorSearch(embedding, candidateLimit);

	const fused = fuseRankings([lexicalResults, vectorResults], k);
	const seenGroups = new Set<string>();
	const deduped = fused.filter((item) => {
		const group = item.parentId
			? `parent:${item.parentId}`
			: `chunk:${item.id}`;
		if (seenGroups.has(group)) return false;
		seenGroups.add(group);
		return true;
	});
	return deduped.slice(0, finalLimit);
}
