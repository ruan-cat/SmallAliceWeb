import { CloudflareEmbeddingError, type CloudflareEmbeddingProvider } from "../server/providers/cloudflare-embedding";

export const DEFAULT_EMBEDDING_BATCH_SIZE = 25;

export async function createAdaptiveEmbeddings(
	provider: Pick<CloudflareEmbeddingProvider, "createEmbeddings">,
	contents: readonly string[],
	options: { batchSize?: number; onSplit?: (details: { size: number; status?: number }) => void } = {},
) {
	const batchSize = options.batchSize ?? DEFAULT_EMBEDDING_BATCH_SIZE;
	if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError("embedding batchSize 必须是正整数。");

	const vectors: number[][] = [];
	for (let offset = 0; offset < contents.length; offset += batchSize) {
		const batch = contents.slice(offset, offset + batchSize);
		vectors.push(...(await embedBatch(provider, batch, options.onSplit)));
	}
	return vectors;
}

async function embedBatch(
	provider: Pick<CloudflareEmbeddingProvider, "createEmbeddings">,
	batch: readonly string[],
	onSplit?: (details: { size: number; status?: number }) => void,
): Promise<readonly number[][]> {
	try {
		const vectors = await provider.createEmbeddings(batch);
		if (vectors.length !== batch.length) throw new Error(`embedding 返回数量不一致：${vectors.length}/${batch.length}`);
		return vectors.map((vector) => [...vector]);
	} catch (error) {
		if (!(error instanceof CloudflareEmbeddingError) || ![400, 413].includes(error.status ?? 0) || batch.length < 2) {
			throw error;
		}
		onSplit?.({ size: batch.length, status: error.status });
		const midpoint = Math.ceil(batch.length / 2);
		const left = await embedBatch(provider, batch.slice(0, midpoint), onSplit);
		const right = await embedBatch(provider, batch.slice(midpoint), onSplit);
		return [...left, ...right];
	}
}
