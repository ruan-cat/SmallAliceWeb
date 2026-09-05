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
		optimizeDeps: {
			// element-plus 由 .client 插件引入，不在 Nuxt optimizeDeps 扫描入口内，
			// 其整棵依赖树（含 dayjs、@braintree/sanitize-url 等 CJS 包）会以原始产物直出，
			// 缺少 CJS->ESM interop 导致客户端 entry 执行失败、整站无法水合。
			// 整包纳入预构建后 esbuild 会递归打包全部传递依赖。
			// shadcn-docs-nuxt 的 mermaid.client 插件动态导入 mermaid（其 chunk 裸导入 dayjs），
			// 不在扫描入口内，须用嵌套语法显式纳入预构建获得 CJS->ESM interop。
			include: ["element-plus", "shadcn-docs-nuxt > mermaid"],
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
		...(process.platform === "win32"
			? {
					// win32 禁用 Nitro externals 全量追踪是 #11 OOM 修复的有意决策，勿回退。
					// 已知副作用：@nuxt/image 构建后会告警 sharp 二进制未打进产物（trace 关闭必然为空）。
					// 本地 preview 不受影响：Node 会从工作区 node_modules 向上解析到 sharp。
					externals: {
						trace: false,
					},
				}
			: {
					// Linux/macOS（CI/Vercel）构建保留追踪，并显式纳入 sharp。
					// IPX 对 sharp 的 require 是变量拼接的动态路径，nft 静态分析可能漏追平台二进制。
					externals: {
						traceInclude: ["sharp"],
					},
				}),
	},
});
