import { createHash } from "node:crypto";

/** 为带标题的 chunk 生成不依赖渲染器 slug 的稳定 DOM 锚点。 */
export function createHeadingAnchor(sourcePath: string, headingPath: string[], headingIndex: number): string {
	return `rag-heading-${digest([sourcePath, headingPath.join("\u0000"), String(headingIndex)].join("\u0000"))}`;
}

/** 为无标题根块生成打开文档顶部时使用的稳定标识。 */
export function createDocumentAnchor(sourcePath: string): string {
	return `rag-document-${digest(sourcePath)}`;
}

/** 以完整 SHA-256 的 base64url 形式生成确定性摘要。 */
function digest(input: string): string {
	return createHash("sha256").update(input).digest("base64url");
}
