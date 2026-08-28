import { CloudflareEmbeddingError, createCloudflareEmbeddingProvider } from "../server/providers/cloudflare-embedding";

const accountId = process.env.NITRO_CLOUDFLARE_ACCOUNT_ID?.trim();
const apiToken = process.env.NITRO_CLOUDFLARE_API_TOKEN?.trim();
const model = process.env.NITRO_EMBEDDING_MODEL?.trim() || "@cf/baai/bge-m3";

if (!accountId || !apiToken) {
	console.error(JSON.stringify({ ok: false, error: "缺少 Cloudflare embedding 环境变量" }));
	process.exitCode = 2;
} else {
	const provider = createCloudflareEmbeddingProvider({ accountId, apiToken, model });
	try {
		const embedding = await provider.createEmbedding("小样本诊断：中文 embedding 请求。 ");
		console.log(JSON.stringify({ ok: true, model, dimensions: embedding.length }));
	} catch (error) {
		if (error instanceof CloudflareEmbeddingError) {
			console.error(
				JSON.stringify({
					ok: false,
					model,
					status: error.status,
					providerCode: error.providerCode,
					providerMessage: error.providerMessage,
					message: error.message,
				}),
			);
		} else {
			console.error(JSON.stringify({ ok: false, error: "未知 embedding 错误" }));
		}
		process.exitCode = 1;
	}
}
