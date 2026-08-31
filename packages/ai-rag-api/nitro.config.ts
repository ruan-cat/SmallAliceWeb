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
	 * 显式开启 Vercel Node Function 的请求取消能力。
	 *
	 * 浏览器点击“停止生成”后，Vercel 才会把客户端断开传播到 Nitro
	 * response；`server/contracts/chat.ts` 再将该 AbortSignal 连接到上游
	 * Anthropic `/v1/messages` 请求，`server/services/anthropic-chat.ts`
	 * 才能记录真实的 `abort`/`AbortError` 事件。没有这个平台 opt-in 时，
	 * 本地可以停止而生产上游调用可能继续运行，不能删除或改回 false。
	 * @see https://vercel.com/docs/functions/configuring-functions#supports-cancellation
	 */
	vercel: {
		functions: {
			supportsCancellation: true,
		},
	},
});
