import { fuseRankings, type RankingItem } from "@ruan-cat-drill-doc/ai-rag-core";

export interface HybridSearchItem extends RankingItem {
	content: string;
	sourcePath: string;
	headingPath: string[];
	headingIndex: number;
	headingAnchor: string;
	chunkIndex: number;
	imageUrls: string[];
}

export interface HybridSearchOptions {
	limit?: number;
	k?: number;
}

export interface HybridSearchProviders {
	createEmbedding: (query: string) => Promise<number[]>;
	lexicalSearch: (query: string, limit: number) => Promise<HybridSearchItem[]>;
	vectorSearch: (embedding: number[], limit: number) => Promise<HybridSearchItem[]>;
}

/** 并行执行词法与向量 provider，并按实际榜单名次做 RRF 融合。 */
export async function hybridSearch(
	query: string,
	providers: HybridSearchProviders,
	options: HybridSearchOptions = {},
): Promise<Array<HybridSearchItem & { score: number }>> {
	const limit = options.limit ?? 10;
	const k = options.k ?? 60;
	if (!Number.isInteger(limit) || limit < 1) throw new RangeError("Hybrid Search 的 limit 必须是正整数。");

	const [embedding, lexicalResults] = await Promise.all([
		providers.createEmbedding(query),
		providers.lexicalSearch(query, limit),
	]);
	const vectorResults = await providers.vectorSearch(embedding, limit);

	return fuseRankings([lexicalResults, vectorResults], k).slice(0, limit);
}
