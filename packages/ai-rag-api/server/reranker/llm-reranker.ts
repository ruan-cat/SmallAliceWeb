import type {
	LlmRerankerClient,
	RerankerCandidate,
	RerankerProvider,
	RerankerResult,
} from "./types";

export type LlmRerankerOptions = {
	client: LlmRerankerClient;
	provider: string;
	model: string;
	version: string;
	candidateLimit: number;
	maxInputTokens: number;
	timeoutMs: number;
	maxRetries?: number;
	maxCostUsd?: number;
	costPer1kTokens?: number;
};

/** 创建受候选数、token、超时、成本、缓存与回退门禁约束的通用 LLM reranker。 */
export function createLlmReranker(
	options: LlmRerankerOptions,
): RerankerProvider {
	const cache = new Map<string, RerankerResult>();
	const maxRetries = options.maxRetries ?? 0;

	return {
		rerank: async ({ query, candidates, signal }) => {
			const startedAt = Date.now();
			const fallback = [...candidates];
			if (candidates.length > options.candidateLimit) {
				return makeResult(
					options,
					fallback,
					"skipped",
					"candidate-limit",
					startedAt,
				);
			}

			const prompt = buildPrompt(query, candidates);
			const estimatedTokens = estimateTokens(prompt);
			if (estimatedTokens > options.maxInputTokens) {
				return makeResult(
					options,
					fallback,
					"skipped",
					"token-budget",
					startedAt,
					estimatedTokens,
				);
			}
			if (
				options.maxCostUsd !== undefined &&
				(options.costPer1kTokens ?? 0) > 0 &&
				(estimatedTokens / 1000) * (options.costPer1kTokens ?? 0) >
					options.maxCostUsd
			) {
				return makeResult(
					options,
					fallback,
					"skipped",
					"cost-budget",
					startedAt,
					estimatedTokens,
				);
			}

			const cacheKey = JSON.stringify({
				query,
				candidateIds: candidates.map((candidate) => candidate.id),
				model: options.model,
				version: options.version,
			});
			const cached = cache.get(cacheKey);
			if (cached) return cached;

			let lastFailure = "provider-error";
			for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
				try {
					const response = await completeWithTimeout(options, prompt, signal);
					const items = parseRankedItems(response.text, candidates);
					const result: RerankerResult = {
						items,
						status: "applied",
						provider: options.provider,
						model: options.model,
						version: options.version,
						latencyMs: Date.now() - startedAt,
						tokenCount: response.usage?.totalTokens,
					};
					cache.set(cacheKey, result);
					return result;
				} catch (error) {
					lastFailure =
						error instanceof RerankerFailure ? error.reason : "provider-error";
				}
			}
			return makeResult(
				options,
				fallback,
				"failed",
				lastFailure,
				startedAt,
				undefined,
			);
		},
	};
}

function buildPrompt(
	query: string,
	candidates: readonly RerankerCandidate[],
): string {
	return [
		`Query: ${query}`,
		"Candidates:",
		...candidates.map(
			(candidate, index) =>
				`${index + 1}. id=${candidate.id}\nheading=${candidate.headingPath.join(" > ")}\ncontent=${candidate.content}`,
		),
		'Return JSON: {"rankedIds":[{"id":"...","score":0}]}.',
	].join("\n");
}

function estimateTokens(text: string): number {
	return Math.max(1, Math.ceil(text.length / 4));
}

async function completeWithTimeout(
	options: LlmRerankerOptions,
	prompt: string,
	parentSignal?: AbortSignal,
) {
	const controller = new AbortController();
	const abort = () => controller.abort(parentSignal?.reason);
	if (parentSignal?.aborted) abort();
	else parentSignal?.addEventListener("abort", abort, { once: true });
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		const completion = options.client.complete({
			prompt,
			maxTokens: options.maxInputTokens,
			signal: controller.signal,
		});
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				controller.abort();
				reject(new RerankerFailure("timeout"));
			}, options.timeoutMs);
		});
		return await Promise.race([completion, timeout]);
	} finally {
		if (timer) clearTimeout(timer);
		parentSignal?.removeEventListener("abort", abort);
	}
}

function parseRankedItems(
	text: string,
	candidates: readonly RerankerCandidate[],
): RerankerCandidate[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		throw new RerankerFailure("invalid-json");
	}
	if (
		!isRecord(parsed) ||
		!Array.isArray(parsed.rankedIds) ||
		parsed.rankedIds.length === 0
	) {
		throw new RerankerFailure("invalid-output");
	}
	const byId = new Map(
		candidates.map((candidate) => [candidate.id, candidate]),
	);
	const seen = new Set<string>();
	return parsed.rankedIds.map((entry) => {
		if (
			!isRecord(entry) ||
			typeof entry.id !== "string" ||
			typeof entry.score !== "number" ||
			!Number.isFinite(entry.score)
		) {
			throw new RerankerFailure("invalid-output");
		}
		if (seen.has(entry.id)) throw new RerankerFailure("duplicate-id");
		const candidate = byId.get(entry.id);
		if (!candidate) throw new RerankerFailure("unknown-id");
		seen.add(entry.id);
		return { ...candidate, score: entry.score };
	});
}

function makeResult(
	options: LlmRerankerOptions,
	items: RerankerCandidate[],
	status: "skipped" | "failed",
	failureReason: string,
	startedAt: number,
	tokenCount?: number,
): RerankerResult {
	return {
		items,
		status,
		provider: options.provider,
		model: options.model,
		version: options.version,
		latencyMs: Date.now() - startedAt,
		tokenCount,
		failureReason,
		fallback: status === "failed" ? "noop" : undefined,
	};
}

class RerankerFailure extends Error {
	constructor(readonly reason: string) {
		super(reason);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
