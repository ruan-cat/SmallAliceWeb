import { defineConfig } from "nitro";
import type { RagNitroConfig } from "./src/runtime-config";

const runtimeConfig = {
	databaseUrl: "",
	syncDatabaseUrl: "",
	embeddingModel: "",
	rerankerMode: "disabled",
	rerankerProvider: "",
	rerankerModel: "",
	rerankerVersion: "",
	rerankerCandidateLimit: 20,
	rerankerMaxInputTokens: 2000,
	rerankerTimeoutMs: 800,
	rerankerMaxCostUsd: 0,
	cloudflareAccountId: "",
	cloudflareApiToken: "",
	openaiApiKey: "",
	anthropicApiKey: "",
	knowledgeSyncToken: "",
	cronSecret: "",
	knowledgeSourceRoot: "",
	repositoryRoot: "",
	public: {
		apiBase: "/v1",
	},
} satisfies RagNitroConfig["runtimeConfig"];

/** Nitro v3 的唯一配置入口；私有值由 Vercel 的 NITRO_* 环境变量覆盖。 */
export default defineConfig({
	compatibilityDate: "2024-09-19",
	serverDir: "server",
	imports: false,
	runtimeConfig,
	rolldownConfig: {
		output: {
			inlineDynamicImports: true,
		},
	},
	routeRules: {
		"/v1/**": {
			cors: true,
		},
	},
	/**
	 * 已退役，仅作参考，不要再依赖。
	 *
	 * 2026-11-11 起生产在 Cloudflare Workers，Vercel 项目
	 * `smallalice-docs-ai-nitro-api` 已删除。这个开关只对已不存在的
	 * Vercel Node Function 生效，Workers 上的停止生成不读它。
	 * 留在这里是为了对照旧的取消传播路径：浏览器停止后，Vercel 才会把
	 * 断开传到 Nitro，再连到上游 Anthropic 请求。
	 * @see https://vercel.com/docs/functions/configuring-functions#supports-cancellation
	 */
	vercel: {
		functions: {
			supportsCancellation: true,
		},
	},
	cloudflare: {
		wrangler: {
			name: "small-alice-web-api",
			vars: {
				NITRO_DATABASE_DRIVER: "neon",
			},
		},
	},
});
