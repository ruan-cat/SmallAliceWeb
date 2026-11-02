import type { PageContext } from "@ruan-cat-drill-doc/ai-rag-core";
import { useData, useRoute } from "vitepress";

/**
 * 建立「当前文档页上下文」采集器，供 useKnowledgeChat 注入请求体。
 *
 * 必须在组件 setup 期间调用本 composable：useRoute / useData 依赖 Vue inject 取 VitePress
 * 的 RouterSymbol 与 SiteContext，只有 setup 调用栈里才拿得到。把调用推迟到 send() 触发的
 * 回调里会抛 `useRouter() is called without provider.`（vitepress/dist/client/app/router.js），
 * 因此这里在 setup 期一次性捕获响应式来源，返回的闭包只在调用时读取 route.path 与 ref.value。
 *
 * 采集时机语义保持不变：返回的函数每次 send 都会重新求值，因此 path / title / keywords
 * 始终反映当前页面，不是挂载时的快照。
 *
 * 字段裁剪：仅采集 pagePath（必填）/ title（可选）/ keywords（可选），不注入其他 frontmatter；
 * SSR 或无 route.path 时返回 undefined（请求照常发送，不阻断）；schema 校验失败或字段非法时
 * 由后端 pageContextSchema 拦截（spec 11.6 验证层纪律）。
 *
 * 设计原则：不引入硬依赖 ai-vue（采集层属于 plugins，与 spec 10.2「ai-vue 零改动」一致）。
 *
 * @returns 每次 send 时可调用的采集函数
 */
export function usePageContextCollector(): () => PageContext | undefined {
	const route = useRoute();
	const { frontmatter, title } = useData();

	/** 读取当前页面上下文；非客户端或缺 path 时返回 undefined */
	return function collectPageContext(): PageContext | undefined {
		if (typeof window === "undefined") return undefined;
		if (!route?.path) return undefined;

		const pageTitle = typeof title.value === "string" ? title.value : undefined;
		const keywordsRaw = frontmatter.value?.keywords;
		const keywords =
			Array.isArray(keywordsRaw) && keywordsRaw.every((item) => typeof item === "string")
				? (keywordsRaw as string[])
				: undefined;

		return {
			pagePath: route.path,
			...(pageTitle ? { title: pageTitle } : {}),
			...(keywords?.length ? { keywords } : {}),
		};
	};
}
