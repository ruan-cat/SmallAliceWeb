import { describe, expect, test } from "vitest";
import nitroConfig from "../nitro.config";

describe("RAG API runtime configuration", () => {
	test("uses Nitro v3 configuration with private RAG settings", () => {
		expect(nitroConfig.compatibilityDate).toBe("2024-09-19");
		expect(nitroConfig.serverDir).toBe("server");
		expect(nitroConfig.imports).toBe(false);
		expect(nitroConfig.runtimeConfig).toMatchObject({
			databaseUrl: "",
			syncDatabaseUrl: "",
			embeddingModel: "",
			cloudflareAccountId: "",
			cloudflareApiToken: "",
			openaiApiKey: "",
			anthropicApiKey: "",
			public: { apiBase: "/v1" },
		});
		expect(nitroConfig.rolldownConfig).toMatchObject({ output: { inlineDynamicImports: true } });
		expect(nitroConfig.routeRules).toMatchObject({ "/v1/**": { cors: true } });
	});

	test("does not embed a connection string or credential in the configuration", () => {
		const serializedConfig = JSON.stringify(nitroConfig);

		expect(serializedConfig).not.toMatch(/postgres(?:ql)?:\/\//i);
		expect(serializedConfig).not.toMatch(/sk-[a-z0-9]/i);
	});
});
