export type EmbeddingTextInput = {
	sourcePath: string;
	headingPath: readonly string[];
	content: string;
	imageUrls?: readonly string[];
};

export const MARKDOWN_PREPROCESSING_VERSION = "markdown-structure-v2";

/** 生成确定性的检索/embedding 文本，加入标题上下文并排除图片地址。 */
export function buildEmbeddingText(input: EmbeddingTextInput): string {
	if (!input.sourcePath.trim())
		throw new Error("embedding text 的 sourcePath 不能为空。");
	if (!Array.isArray(input.headingPath))
		throw new Error("embedding text 的 headingPath 必须是数组。");
	if (typeof input.content !== "string")
		throw new Error("embedding text 的 content 必须是字符串。");

	const content = stripImageUrls(input.content, input.imageUrls ?? []);
	return [
		`文档：${input.sourcePath}`,
		`章节：${input.headingPath.join(" > ")}`,
		`正文：${content}`,
	].join("\n");
}

/** 与 buildEmbeddingText 同义的语义化别名，便于同步服务表达调用意图。 */
export const createEmbeddingText = buildEmbeddingText;

function stripImageUrls(content: string, imageUrls: readonly string[]): string {
	let result = content
		.replace(
			/!\[[^\]]*\]\(\s*(?:<[^>]*>|[^)\s]+)(?:\s+["'][^"']*["'])?\s*\)/g,
			"",
		)
		.replace(/<img\b[^>]*\bsrc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)[^>]*>/gi, "");
	for (const url of imageUrls) {
		if (!url) continue;
		result = result.replaceAll(url, "");
	}
	return result.trim();
}
