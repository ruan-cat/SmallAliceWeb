import { z } from "zod";

/** 客户端页面上下文契约：ai-vitepress-plugins 采集、ai-rag-api 校验共用同一份 schema。 */
export const pageContextSchema = z.object({
	/** 用户当前浏览的文档页路径，如 /guide/install。 */
	pagePath: z.string().min(1).max(512),
	/** 页面标题（可选）。 */
	title: z.string().max(256).optional(),
});

export type PageContext = z.infer<typeof pageContextSchema>;
