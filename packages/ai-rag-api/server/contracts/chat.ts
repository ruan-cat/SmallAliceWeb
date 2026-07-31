import { createSourceUrl, resolveSourceHref } from "@ruan-cat-drill-doc/ai-rag-core";
import { z } from "zod";

export const chatRequestSchema = z.object({
	message: z.string().trim().min(1).max(4_000),
	conversationId: z.string().trim().min(1).max(128).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatSource = {
	id: string;
	content: string;
	score: number;
	sourcePath: string;
	headingPath: string[];
	headingIndex: number;
	headingAnchor: string;
	chunkIndex: number;
	imageUrls: string[];
};

export type ChatSourceDto = ChatSource & {
	sourceUrl: string;
	sourceHref: string;
};

export type ChatStreamRequest = ChatRequest & {
	sources: ChatSourceDto[];
	system: string;
};

export type ChatDependencies = {
	retrieve: (message: string, options: { limit: number }) => Promise<ChatSource[]>;
	stream: (request: ChatStreamRequest) => Promise<Response> | Response;
};

type ChatErrorResponse = {
	status: number;
	body: { success: false; code: number; message: string; data: null };
};

/** 接收可替换的检索与流式模型边界，并直接交还 AI SDK 的原生流响应。 */
export async function handleChatRequest(input: unknown, deps: ChatDependencies): Promise<Response | ChatErrorResponse> {
	const parsed = chatRequestSchema.safeParse(input);
	if (!parsed.success) {
		return {
			status: 400,
			body: { success: false, code: 400, message: "对话请求无效", data: null },
		};
	}

	try {
		const sources = (await deps.retrieve(parsed.data.message, { limit: 5 })).map((source) => ({
			...source,
			sourceUrl: createSourceUrl(source.sourcePath),
			sourceHref: resolveSourceHref(source),
		}));
		const system = `你是知识库问答助手。根据以下参考资料回答问题。\n如果资料不足，说明「根据现有资料无法回答」。\n\n参考资料：\n${sources.map((source, index) => `[${index + 1}] ${source.content}`).join("\n\n")}`;

		return await deps.stream({ ...parsed.data, sources, system });
	} catch {
		return {
			status: 500,
			body: { success: false, code: 500, message: "对话请求失败", data: null },
		};
	}
}
