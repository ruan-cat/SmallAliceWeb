import type { PageContext } from "@ruan-cat-drill-doc/ai-rag-core";
import { useData, useRoute } from "vitepress";

/**
 * 采集当前 VitePress 文档页上下文，供 useKnowledgeChat 注入请求体。
 *
 * SSR 或非文档环境返回 undefined（请求照常发送，不阻断）；
 * schema 校验失败或字段非法时由后端 pageContextSchema 拦截（spec 11.6 验证层纪律）。
 *
 * 设计原则：
 * - 不引入硬依赖 ai-vue（采集层属于 plugins，与 spec 10.2「ai-vue 零改动」一致）
 * - 函数式而非 ref-based：每次 send 时调用一次，避免 watch 开销
 * - 字段裁剪：仅采集 pagePath（必填）/ title（可选）/ keywords（可选），不注入其他 frontmatter
 */
export function collectPageContext(): PageContext | undefined {
	if (typeof window === "undefined") return undefined;
	const route = useRoute();
	const { frontmatter, title } = useData();
	if (!route?.path) return undefined;

	const pageTitle = typeof title.value === "string" ? title.value : undefined;
	const keywordsRaw = frontmatter.value?.keywords;
	const keywords = Array.isArray(keywordsRaw) && keywordsRaw.every((item) => typeof item === "string")
		? (keywordsRaw as string[])
		: undefined;

	return {
		pagePath: route.path,
		...(pageTitle ? { title: pageTitle } : {}),
		...(keywords?.length ? { keywords } : {}),
	};
}