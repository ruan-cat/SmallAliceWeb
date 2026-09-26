import { pageContextSchema } from "@ruan-cat-drill-doc/ai-rag-core";
import type { PageContext } from "@ruan-cat-drill-doc/ai-rag-core";
import type { ChatContext } from "./types";

/**
 * 归一化客户端页面上下文：合法返回值，非法或缺失返回 undefined（永不抛错）。
 * 结构非法的拦截在 contracts 入站 schema 校验（400），本函数是其之下的纵深防御层。
 */
export function normalizeClientContext(input: unknown): PageContext | undefined {
	const parsed = pageContextSchema.safeParse(input);
	return parsed.success ? parsed.data : undefined;
}

/** 装配单轮聊天上下文：来源逐个归一化，失败跳过。 */
export function assembleChatContext(rawPageContext: unknown, siteName: string): ChatContext {
	const context: ChatContext = { site: { name: siteName } };
	const page = normalizeClientContext(rawPageContext);
	if (page) context.page = page;
	return context;
}
