import { chunkMarkdown, type MarkdownChunk, type MarkdownChunkOptions } from "@ruan-cat-drill-doc/ai-rag-core";
import { readKnowledgeSources, type KnowledgeSourceOptions } from "./knowledge-source";

export interface PreparedKnowledgeBase {
	chunkCount: number;
	chunks: MarkdownChunk[];
	documentCount: number;
}

export interface PrepareKnowledgeOptions extends KnowledgeSourceOptions {
	chunkOptions?: Partial<MarkdownChunkOptions>;
}

/** 从本地 Markdown 知识源生成同步和检索共用的结构化 chunk。 */
export async function prepareKnowledgeBase(options: PrepareKnowledgeOptions): Promise<PreparedKnowledgeBase> {
	const documents = await readKnowledgeSources(options);
	const chunks = documents.flatMap((document) =>
		chunkMarkdown(document.content, document.sourcePath, options.chunkOptions),
	);

	return {
		documentCount: documents.length,
		chunkCount: chunks.length,
		chunks,
	};
}
