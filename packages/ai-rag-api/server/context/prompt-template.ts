import type { PageContext } from "@ruan-cat-drill-doc/ai-rag-core";
import type { ChatContext } from "./types";

/** 角色设定段。 */
export const ROLE_SEGMENT = "你是知识库问答助手。根据以下参考资料回答问题。";

/** 检索引导段。 */
export const RETRIEVAL_GUIDE_SEGMENT = "回答必须依据参考资料；资料未覆盖的内容不要编造。";

/** 引用格式段。 */
export const CITATION_FORMAT_SEGMENT = "回答中每个观点标注来源 [来源N]，N 对应参考资料编号。";

/** 拒答策略段。 */
export const REFUSAL_POLICY_SEGMENT = "如果资料不足，说明「根据现有资料无法回答」。";

/** 页面上下文注入段：独立段落 + 防误引声明，防止模型把页面信息误标为 [来源N]。 */
export function buildPageContextSegment(page: PageContext): string {
	const lines = [
		"【页面上下文】以下信息仅作语境参考，不得作为来源引用，不计入 [来源N] 编号：",
		`- 用户当前浏览页面：${page.pagePath}`,
	];
	if (page.title) lines.push(`- 页面标题：${page.title}`);
	return lines.join("\n");
}

/**
 * 组装 system prompt：五段式，页面上下文存在时才渲染注入段。
 * 页面上下文缺失或装配失败时自动降级为基础模板，问答不因上下文来源问题失败。
 */
export function buildSystemPrompt(context: ChatContext, sources: string[]): string {
	const segments = [
		ROLE_SEGMENT,
		RETRIEVAL_GUIDE_SEGMENT,
		CITATION_FORMAT_SEGMENT,
		context.page ? buildPageContextSegment(context.page) : null,
		`参考资料：\n${sources.map((source, index) => `[${index + 1}] ${source}`).join("\n\n")}`,
		REFUSAL_POLICY_SEGMENT,
	].filter((segment): segment is string => segment !== null);
	return segments.join("\n\n");
}
