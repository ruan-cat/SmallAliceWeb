import { defineRuanCatVuepressConfig } from "@ruan-cat/vuepress-preset-config";

export default defineRuanCatVuepressConfig({
	title: "小爱丽丝官网",
	base: "/",
	lang: "zh-CN",
	description: "天才小爱丽丝，冲鸭！",
	markdown: {
		headers: {
			level: [2, 3, 4, 5],
		},
	},

	// theme: {
	// 	hostname: "https://www.ruan-cat.com",

	// 	author: {
	// 		name: "Mr.Hope",
	// 		url: "https://mister-hope.com",
	// 	},

	// 	iconAssets: "fontawesome-with-brands",

	// 	logo: "/logo.svg",

	// 	repo: "vuepress-theme-hope/vuepress-theme-hope",

	// 	docsDir: "docs",

	// 	sidebar: "structure",
	// 	headerDepth: 5,

	// 	footer: "默认页脚",

	// 	displayFooter: true,

	// 	encrypt: {
	// 		config: {
	// 			"/demo/encrypt.html": ["1234"],
	// 		},
	// 	},

	// 	// page meta
	// 	metaLocales: {
	// 		editLink: "在 GitHub 上编辑此页",
	// 	},

	// 	// TODO: TypeError: (themeObject.plugins ?? []) is not iterable
	// 	// plugins: {
	// 	// 	// You should generate and use your own comment service
	// 	// 	comment: {
	// 	// 		provider: "Giscus",
	// 	// 		repo: "vuepress-theme-hope/giscus-discussions",
	// 	// 		repoId: "R_kgDOG_Pt2A",
	// 	// 		category: "Announcements",
	// 	// 		categoryId: "DIC_kwDOG_Pt2M4COD69",
	// 	// 	},
	// 	// 	// All features are enabled for demo, only preserve features you need here
	// 	// 	mdEnhance: {
	// 	// 		align: true,
	// 	// 		attrs: true,
	// 	// 		// install chart.js before enabling it
	// 	// 		// chart: true,
	// 	// 		codetabs: true,
	// 	// 		// insert component easily
	// 	// 		// component: true,
	// 	// 		demo: true,
	// 	// 		// install echarts before enabling it
	// 	// 		// echarts: true,
	// 	// 		figure: true,
	// 	// 		// install flowchart.ts before enabling it
	// 	// 		// flowchart: true,
	// 	// 		// gfm requires mathjax-full to provide tex support
	// 	// 		// gfm: true,
	// 	// 		imgLazyload: true,
	// 	// 		imgSize: true,
	// 	// 		include: true,
	// 	// 		// install katex before enabling it
	// 	// 		// katex: true,
	// 	// 		// install mathjax-full before enabling it
	// 	// 		// mathjax: true,
	// 	// 		mark: true,
	// 	// 		// install mermaid before enabling it
	// 	// 		// mermaid: true,
	// 	// 		playground: {
	// 	// 			presets: ["ts", "vue"],
	// 	// 		},
	// 	// 		// install reveal.js before enabling it
	// 	// 		// revealJs: {
	// 	// 		//   plugins: ["highlight", "math", "search", "notes", "zoom"],
	// 	// 		// },
	// 	// 		stylize: [
	// 	// 			{
	// 	// 				matcher: "Recommended",
	// 	// 				replacer: ({ tag }) => {
	// 	// 					if (tag === "em")
	// 	// 						return {
	// 	// 							tag: "Badge",
	// 	// 							attrs: { type: "tip" },
	// 	// 							content: "Recommended",
	// 	// 						};
	// 	// 				},
	// 	// 			},
	// 	// 		],
	// 	// 		sub: true,
	// 	// 		sup: true,
	// 	// 		tabs: true,
	// 	// 		vPre: true,
	// 	// 		// install @vue/repl before enabling it
	// 	// 		// vuePlayground: true,
	// 	// 	},
	// 	// },
	// },
});
