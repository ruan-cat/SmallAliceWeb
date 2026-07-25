import vue from "@vitejs/plugin-vue";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [vue()],
	resolve: {
		alias: {
			"@ruan-cat-drill-doc/ai-vue/styles": fileURLToPath(new URL("../ai-vue/src/styles/index.scss", import.meta.url)),
			"@ruan-cat-drill-doc/ai-vue": fileURLToPath(new URL("../ai-vue/src/index.ts", import.meta.url)),
		},
	},
	test: {
		environment: "jsdom",
		include: ["src/tests/**/*.test.ts"],
	},
});
