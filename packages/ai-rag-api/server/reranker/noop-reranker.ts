import type { RerankerProvider } from "./types";

/** 返回原 RRF 顺序的线上默认 reranker，不宣称产生重排收益。 */
export function createNoopReranker(reason = "disabled"): RerankerProvider {
	return {
		rerank: async ({ candidates }) => ({
			items: [...candidates],
			status: "skipped",
			provider: "noop",
			model: undefined,
			version: "v1",
			latencyMs: 0,
			failureReason: reason,
		}),
	};
}
