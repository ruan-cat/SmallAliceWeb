import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [vue()],
	test: {
		environment: "jsdom",
		include: ["src/tests/**/*.test.ts"],
		server: {
			deps: {
				/**
				 * MS-4: 把 vue-element-plus-x 及其样式文件 inline 进 Vite 依赖预构建，
				 * 让 vitest 在 jsdom 下走 Vite 的资源管道解析 .css 而非直接抛 "Unknown file extension"。
				 */
				inline: [/vue-element-plus-x/, /element-plus/],
			},
		},
	},
});