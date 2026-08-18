import { resolve } from "node:path";

import { getAiVueAliases } from "./workspace-aliases";

const debugShimEntry = resolve(__dirname, "shims/debug.ts");

export default defineNuxtConfig({
	extends: ["shadcn-docs-nuxt"],

	app: {
		head: {
			link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
		},
	},

	alias: getAiVueAliases(),

	vite: {
		resolve: {
			alias: [
				{
					find: /^debug$/,
					replacement: debugShimEntry,
				},
			],
		},
	},

	i18n: {
		defaultLocale: "zh-CN",
		locales: [
			{
				code: "zh-CN",
				name: "简体中文",
			},
		],
	},

	icon: {
		serverBundle: {
			collections: ["lucide"],
		},
		clientBundle: {
			scan: true,
			sizeLimitKb: 512,
		},
	},

	nitro: {
		externals: {
			trace: false,
		},
	},
});
