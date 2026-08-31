import type { HybridSearchItem } from "../search/hybrid-search";

export type RerankerStatus = "applied" | "skipped" | "failed";

export type RerankerCandidate = HybridSearchItem & { score: number };

export type RerankerRequest = {
	query: string;
	candidates: readonly RerankerCandidate[];
	signal?: AbortSignal;
};

export type RerankerResult = {
	items: RerankerCandidate[];
	status: RerankerStatus;
	provider: string;
	model?: string;
	version?: string;
	latencyMs: number;
	tokenCount?: number;
	failureReason?: string;
	fallback?: "noop";
};

export type RerankerProvider = {
	rerank: (input: RerankerRequest) => Promise<RerankerResult>;
};

export type LlmRerankerClient = {
	complete: (input: {
		prompt: string;
		maxTokens: number;
		signal: AbortSignal;
	}) => Promise<{
		text: string;
		usage?: { totalTokens?: number };
	}>;
};
