import { defineUserConfig } from "vuepress";
import theme from "./theme.js";

export default defineUserConfig({
	base: "/",

	lang: "zh-CN",
	title: "文档演示",
	description: "vuepress-theme-hope 的文档演示",

	theme,

	markdown: {
		headers: {
			level: [2, 3, 4, 5],
		},
	},

	// Enable it with pwa
	// shouldPrefetch: false,
});
