export interface SourceReference {
	sourcePath: string;
	headingIndex: number;
	headingAnchor: string;
}

/** 将仓库内的 Markdown 来源路径映射到 VitePress 静态页面 URL。 */
export function createSourceUrl(sourcePath: string): string {
	const relativePath = sourcePath.replace(/^docs\//, "").replace(/\.md$/i, ".html");
	return `/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

/** 仅为有标题的块追加稳定锚点；无标题根块始终打开文档顶部。 */
export function resolveSourceHref(source: SourceReference): string {
	const sourceUrl = createSourceUrl(source.sourcePath);
	return source.headingIndex === -1 ? sourceUrl : `${sourceUrl}#${source.headingAnchor}`;
}
