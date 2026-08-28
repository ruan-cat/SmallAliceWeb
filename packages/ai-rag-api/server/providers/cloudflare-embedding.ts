export const CLOUDFLARE_EMBEDDING_DIMENSIONS = 1024;
export const CLOUDFLARE_EMBEDDING_MODEL = "@cf/baai/bge-m3";
export const CLOUDFLARE_EMBEDDING_BATCH_SIZE = 100;

export type CloudflareEmbeddingProvider = {
	createEmbedding: (content: string) => Promise<readonly number[]>;
	createEmbeddings: (contents: readonly string[]) => Promise<readonly (readonly number[])[]>;
};

export type CloudflareEmbeddingConfig = {
	accountId: string;
	apiToken: string;
	model?: string;
	endpoint?: string;
	fetch?: typeof fetch;
};

export class CloudflareEmbeddingError extends Error {
	readonly status?: number;
	readonly providerCode?: number;
	readonly providerMessage?: string;

	constructor(message: string, details: { status?: number; providerCode?: number; providerMessage?: string } = {}) {
		super(message);
		this.name = "CloudflareEmbeddingError";
		this.status = details.status;
		this.providerCode = details.providerCode;
		this.providerMessage = details.providerMessage;
	}
}

type EmbeddingResponse = {
	data?: Array<{
		index?: number;
		embedding?: unknown;
	}>;
};

/** 创建 Cloudflare Workers AI OpenAI-compatible embedding provider。 */
export function createCloudflareEmbeddingProvider(config: CloudflareEmbeddingConfig): CloudflareEmbeddingProvider {
	const model = config.model?.trim() || CLOUDFLARE_EMBEDDING_MODEL;
	const endpoint =
		config.endpoint?.trim() ||
		`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/ai/v1/embeddings`;
	const requestFetch = config.fetch ?? globalThis.fetch;

	return {
		createEmbedding: async (content) => {
			const embeddings = await createEmbeddings(requestFetch, endpoint, config.apiToken, model, [content]);
			return embeddings[0];
		},
		createEmbeddings: (contents) => createEmbeddings(requestFetch, endpoint, config.apiToken, model, contents),
	};
}

async function createEmbeddings(
	requestFetch: typeof fetch,
	endpoint: string,
	apiToken: string,
	model: string,
	contents: readonly string[],
) {
	if (contents.length > CLOUDFLARE_EMBEDDING_BATCH_SIZE) {
		throw new CloudflareEmbeddingError(`Cloudflare embedding 单批文本不得超过 ${CLOUDFLARE_EMBEDDING_BATCH_SIZE} 条。`);
	}
	if (contents.some((content) => !content.trim())) {
		throw new CloudflareEmbeddingError("Cloudflare embedding 输入文本不能为空。");
	}
	if (contents.length === 0) return [];

	const response = await requestFetch(endpoint, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ model, input: contents }),
	});
	if (!response.ok) {
		const error = await readProviderError(response);
		const suffix =
			error.providerCode || error.providerMessage
				? ` ${error.providerCode ? `code=${error.providerCode}` : ""}${error.providerMessage ? ` message=${error.providerMessage}` : ""}`
				: "";
		throw new CloudflareEmbeddingError(`Cloudflare embedding 请求失败（HTTP ${response.status}）。${suffix}`, {
			status: response.status,
			...error,
		});
	}

	let payload: EmbeddingResponse;
	try {
		payload = (await response.json()) as EmbeddingResponse;
	} catch {
		throw new CloudflareEmbeddingError("Cloudflare embedding 响应不是有效 JSON。");
	}

	const data = orderEmbeddingData(payload.data, contents.length);
	return data.map((item, index) => validateEmbedding(item.embedding, index));
}

async function readProviderError(response: Response) {
	try {
		const payload = (await response.json()) as { errors?: Array<{ code?: unknown; message?: unknown }> };
		const first = payload.errors?.[0];
		return {
			providerCode: typeof first?.code === "number" ? first.code : undefined,
			providerMessage: typeof first?.message === "string" ? sanitizeProviderMessage(first.message) : undefined,
		};
	} catch {
		return {};
	}
}

function sanitizeProviderMessage(message: string) {
	return message
		.replace(/[\u0000-\u001f\u007f]/g, " ")
		.trim()
		.slice(0, 240);
}

function orderEmbeddingData(data: EmbeddingResponse["data"], expected: number) {
	if (!Array.isArray(data) || data.length !== expected) {
		throw new CloudflareEmbeddingError("Cloudflare embedding 返回数量与输入数量不一致。");
	}
	const indexed = data.every((item) => Number.isInteger(item.index));
	if (!indexed) return data;
	const ordered = [...data].sort((left, right) => Number(left.index) - Number(right.index));
	if (ordered.some((item, index) => item.index !== index)) {
		throw new CloudflareEmbeddingError("Cloudflare embedding 返回 index 不连续。");
	}
	return ordered;
}

function validateEmbedding(value: unknown, index: number) {
	if (
		!Array.isArray(value) ||
		value.length !== CLOUDFLARE_EMBEDDING_DIMENSIONS ||
		value.some((item) => typeof item !== "number" || !Number.isFinite(item))
	) {
		throw new CloudflareEmbeddingError(`Cloudflare embedding 第 ${index} 条向量必须是 1024 维有限数值。`);
	}
	return value as number[];
}
