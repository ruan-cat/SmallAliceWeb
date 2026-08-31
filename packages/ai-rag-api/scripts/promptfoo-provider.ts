import {
	hybridSearch,
	type HybridSearchItem,
	type HybridSearchProviders,
} from "../server/search/hybrid-search";

export type PromptfooAdapterConfig = {
	mode: "lexical" | "vector" | "hybrid";
	chunkProfile: string;
	reranker: "noop" | "llm";
	candidateLimit: number;
	finalLimit: number;
	rrfK: number;
};

export type PromptfooProviderContext = {
	config?: Partial<PromptfooAdapterConfig>;
};

export type PromptfooAdapterResult = {
	status: "completed" | "skipped" | "failed";
	output: string;
	metadata: {
		mode: PromptfooAdapterConfig["mode"];
		chunkProfile: string;
		reranker: PromptfooAdapterConfig["reranker"];
		candidateLimit: number;
		finalLimit: number;
		rrfK: number;
		candidateIds: string[];
		finalIds: string[];
		reason?: string;
	};
};

/** 复用检索 provider 的 Promptfoo 适配器；没有显式注入 provider 时只返回 skipped。 */
export async function runPromptfooAdapter(
	query: string,
	config: Partial<PromptfooAdapterConfig> = {},
	providers?: HybridSearchProviders,
): Promise<PromptfooAdapterResult> {
	const normalized = normalizeConfig(config);
	if (!providers)
		return makeResult("skipped", normalized, [], [], "未注入检索 provider");

	try {
		const candidates = await searchCandidates(query, normalized, providers);
		const candidateIds = candidates.map((item) => item.id);
		const finalIds = candidateIds.slice(0, normalized.finalLimit);
		return makeResult("completed", normalized, candidateIds, finalIds);
	} catch {
		return makeResult("failed", normalized, [], [], "检索 provider 失败");
	}
}

/** Promptfoo file provider 默认不创建网络客户端，生产运行需由命令行注入 provider。 */
export default async function promptfooProvider(
	prompt: string,
	context: PromptfooProviderContext = {},
) {
	const result = await runPromptfooAdapter(prompt, context.config);
	return { output: result.output, metadata: result.metadata };
}

async function searchCandidates(
	query: string,
	config: PromptfooAdapterConfig,
	providers: HybridSearchProviders,
): Promise<HybridSearchItem[]> {
	if (config.mode === "lexical")
		return providers.lexicalSearch(query, config.candidateLimit);
	if (config.mode === "vector") {
		const embedding = await providers.createEmbedding(query);
		return providers.vectorSearch(embedding, config.candidateLimit);
	}
	return hybridSearch(query, providers, {
		limit: config.candidateLimit,
		k: config.rrfK,
	});
}

function normalizeConfig(
	config: Partial<PromptfooAdapterConfig>,
): PromptfooAdapterConfig {
	const mode = config.mode ?? "hybrid";
	const reranker = config.reranker ?? "noop";
	const candidateLimit = config.candidateLimit ?? 20;
	const finalLimit = config.finalLimit ?? 5;
	const rrfK = config.rrfK ?? 60;
	if (!isMode(mode)) throw new Error("Promptfoo mode 无效");
	if (!isReranker(reranker)) throw new Error("Promptfoo reranker 无效");
	if (!Number.isInteger(candidateLimit) || candidateLimit < 1)
		throw new Error("Promptfoo candidateLimit 无效");
	if (
		!Number.isInteger(finalLimit) ||
		finalLimit < 1 ||
		finalLimit > candidateLimit
	)
		throw new Error("Promptfoo finalLimit 无效");
	if (!Number.isInteger(rrfK) || rrfK < 1)
		throw new Error("Promptfoo rrfK 无效");
	return {
		mode,
		chunkProfile: config.chunkProfile?.trim() || "500/50",
		reranker,
		candidateLimit,
		finalLimit,
		rrfK,
	};
}

function makeResult(
	status: PromptfooAdapterResult["status"],
	config: PromptfooAdapterConfig,
	candidateIds: string[],
	finalIds: string[],
	reason?: string,
): PromptfooAdapterResult {
	const metadata = {
		mode: config.mode,
		chunkProfile: config.chunkProfile,
		reranker: config.reranker,
		candidateLimit: config.candidateLimit,
		finalLimit: config.finalLimit,
		rrfK: config.rrfK,
		candidateIds,
		finalIds,
		reason,
	};
	return { status, output: JSON.stringify({ ...metadata, status }), metadata };
}

function isMode(value: string): value is PromptfooAdapterConfig["mode"] {
	return value === "lexical" || value === "vector" || value === "hybrid";
}

function isReranker(
	value: string,
): value is PromptfooAdapterConfig["reranker"] {
	return value === "noop" || value === "llm";
}
