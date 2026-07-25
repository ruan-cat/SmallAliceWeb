import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

export default defineConfig({
	build: {
		lib: {
			entry: "src/index.ts",
			formats: ["es", "cjs"],
			fileName: (format) => (format === "es" ? "index.js" : "index.cjs"),
			cssFileName: "style",
		},
		rollupOptions: {
			external: ["vue", "element-plus", "vue-element-plus-x"],
		},
	},
	plugins: [vue(), dts()],
});
