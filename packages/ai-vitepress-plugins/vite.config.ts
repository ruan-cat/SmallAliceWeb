import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	build: {
		lib: {
			entry: {
				index: "src/index.ts",
				"client/index": "src/client/index.ts",
			},
			formats: ["es", "cjs"],
			fileName: (format, entryName) => `${entryName}.${format === "es" ? "js" : "cjs"}`,
			cssFileName: "style",
		},
		rollupOptions: {
			external: ["vue", "@ruan-cat-drill-doc/ai-vue"],
			output: {
				assetFileNames: (assetInfo) =>
					assetInfo.name === "style.css" ? "client/style.css" : "assets/[name]-[hash][extname]",
			},
		},
	},
	plugins: [vue(), dts()],
});
