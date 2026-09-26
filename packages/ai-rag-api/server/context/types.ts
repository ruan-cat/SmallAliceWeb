import type { PageContext } from "@ruan-cat-drill-doc/ai-rag-core";

/** 单轮聊天的动态上下文容器：任一来源可选，缺失仅降级不阻断。 */
export interface ChatContext {
	/** 客户端页面上下文（FC-1 透传）。 */
	page?: PageContext;
	/** 静态站点信息。 */
	site: { name: string };
}

/**
 * 服务端拉取式上下文定义（v2 预留，v1 不实现执行器）。
 * 对齐 inkeep fetchDefinition 形状：url + zod 校验 + timeout + requiredToFetch 跳过语义。
 * 第一个真实拉取场景出现时实现，接口不变。
 */
export interface ServerFetchDefinition {
	url: string;
	schema: import("zod").ZodTypeAny;
	timeoutMs?: number;
	requiredToFetch?: boolean;
}
