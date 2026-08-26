import { defineConfig } from "nitro";
import type { RagNitroConfig } from "./src/runtime-config";

const runtimeConfig = {
	databaseUrl: "",
	syncDatabaseUrl: "",
	embeddingModel: "",
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
	vercel: {
		functions: {
			supportsCancellation: true,
		},
	},
});
