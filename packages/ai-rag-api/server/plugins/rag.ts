import { definePlugin } from "nitro";
import { useRuntimeConfig } from "nitro/runtime-config";
import type { RagRuntimeContext } from "../runtime/rag-assembly";
import { createRagRuntime, resolveRagRuntimeConfig } from "../runtime/rag-runtime";

export { createReservedSyncExecutor, createSyncExecutor, resolveRagRuntimeConfig } from "../runtime/rag-runtime";

let ragContext: RagRuntimeContext | null = null;
type EventWithContext = { context: Record<string, unknown> };

const envFieldMap = {
	databaseUrl: "NITRO_DATABASE_URL",
	syncDatabaseUrl: "NITRO_SYNC_DATABASE_URL",
	embeddingModel: "NITRO_EMBEDDING_MODEL",
	cloudflareAccountId: "NITRO_CLOUDFLARE_ACCOUNT_ID",
	cloudflareApiToken: "NITRO_CLOUDFLARE_API_TOKEN",
	openaiApiKey: "NITRO_OPENAI_API_KEY",
	anthropicApiKey: "NITRO_ANTHROPIC_API_KEY",
	knowledgeSyncToken: "NITRO_KNOWLEDGE_SYNC_TOKEN",
	cronSecret: "NITRO_CRON_SECRET",
	knowledgeSourceRoot: "NITRO_KNOWLEDGE_SOURCE_ROOT",
	repositoryRoot: "NITRO_REPOSITORY_ROOT",
} as const;

/** Worker 的变量在请求期才挂到 __env__，不能依赖启动时缓存的空 runtime config。 */
function readWorkerEnv(): Record<string, string> {
	const env = (globalThis as { __env__?: Record<string, unknown> }).__env__;
	if (!env) return {};
	return Object.fromEntries(
		Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
	);
}

/** 在请求时惰性装配 runtime；本地 CLI 直接导入 runtime 模块，不触发 Nitro hook。 */
async function tryInitialize() {
	const env = readWorkerEnv();
	try {
		const base = useRuntimeConfig() as Record<string, unknown>;
		const overlay = Object.fromEntries(
			Object.entries(envFieldMap)
				.map(([field, key]) => [field, env[key]?.trim() ?? ""])
				.filter(([, value]) => value),
		);
		ragContext = await createRagRuntime(resolveRagRuntimeConfig({ ...base, ...overlay }), {
			queryDriver:
				env.NITRO_DATABASE_DRIVER === "neon" || process.env.NITRO_DATABASE_DRIVER === "neon" ? "neon" : "postgres",
		});
	} catch (error) {
		console.warn("[rag-plugin] RAG 运行时未装配:", error instanceof Error ? error.message : error);
	}
}

export default definePlugin((nitro) => {
	nitro.hooks.hook("request", async (event) => {
		if (!ragContext) await tryInitialize();
		if (ragContext) (event as unknown as EventWithContext).context.rag = ragContext;
	});
});
