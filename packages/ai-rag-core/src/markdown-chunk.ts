import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { createDocumentAnchor, createHeadingAnchor } from "./heading-anchor";

export interface MarkdownChunk {
	content: string;
	sourcePath: string;
	headingPath: string[];
	headingIndex: number;
	headingAnchor: string;
	chunkIndex: number;
	imageUrls: string[];
	chunkKind: "prose" | "table";
	tableRowStart?: number;
	tableRowEnd?: number;
}

export interface MarkdownChunkOptions {
	targetTokens: number;
	overlapTokens: number;
	tableRowsPerChunk: number;
}

interface MdastNode {
	type: string;
	depth?: number;
	url?: string;
	value?: string;
	children?: MdastNode[];
	align?: Array<"left" | "right" | "center" | null>;
}

interface ProseBlock {
	content: string;
	imageUrls: string[];
}

const defaultOptions: MarkdownChunkOptions = {
	targetTokens: 500,
	overlapTokens: 50,
	tableRowsPerChunk: 12,
};

/** 将 Markdown AST 转成保持标题和表格结构的可检索文本块。 */
export function chunkMarkdown(
	markdown: string,
	sourcePath: string,
	options: Partial<MarkdownChunkOptions> = {},
): MarkdownChunk[] {
	const settings = { ...defaultOptions, ...options };
	const root = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdastNode;
	const chunks: Omit<MarkdownChunk, "chunkIndex">[] = [];
	const headingPath: string[] = [];
	let headingIndex = -1;
	let currentHeadingIndex = -1;
	let prose: ProseBlock[] = [];

	const flushProse = () => {
		if (prose.length === 0) return;
		let pending: ProseBlock[] = [];

		/** 输出不需要递归切分的连续短段落。 */
		const flushPending = () => {
			if (pending.length === 0) return;
			const content = pending
				.map((block) => block.content)
				.filter(Boolean)
				.join("\n\n");
			const urls = new Set(pending.flatMap((block) => block.imageUrls));
			chunks.push({
				...createMetadata(sourcePath, headingPath, currentHeadingIndex, urls),
				content,
				chunkKind: "prose",
			});
			pending = [];
		};

		for (const block of prose) {
			if (approximateTokenCount(block.content) > settings.targetTokens) {
				flushPending();
				const metadata = createMetadata(sourcePath, headingPath, currentHeadingIndex, new Set(block.imageUrls));
				for (const content of splitByTokens(block.content, settings.targetTokens, settings.overlapTokens)) {
					chunks.push({ ...metadata, content, chunkKind: "prose" });
				}
				continue;
			}

			const candidate = [...pending, block]
				.map((item) => item.content)
				.filter(Boolean)
				.join("\n\n");
			if (pending.length > 0 && approximateTokenCount(candidate) > settings.targetTokens) flushPending();
			pending.push(block);
		}
		flushPending();
		prose = [];
	};

	for (const node of root.children ?? []) {
		if (node.type === "heading" && node.depth && node.depth <= 3) {
			flushProse();
			headingIndex += 1;
			currentHeadingIndex = headingIndex;
			const parentPath = headingPath.slice(0, node.depth - 1).filter((heading) => heading !== undefined);
			headingPath.splice(0, headingPath.length, ...parentPath, nodeText(node).trim());
			continue;
		}

		if (node.type === "table") {
			flushProse();
			appendTableChunks(
				chunks,
				node,
				sourcePath,
				headingPath,
				currentHeadingIndex,
				settings.tableRowsPerChunk,
				settings.targetTokens,
			);
			continue;
		}

		if (node.type === "paragraph") {
			const text = nodeText(node).trim();
			const urls = imageUrls(node);
			if (text || urls.length > 0) prose.push({ content: text, imageUrls: urls });
		}
	}

	flushProse();
	return chunks.map((chunk, chunkIndex) => ({ ...chunk, chunkIndex }));
}

/** 构造标题或无标题根块共享的来源元数据。 */
function createMetadata(
	sourcePath: string,
	headingPath: string[],
	headingIndex: number,
	imageUrlSet: ReadonlySet<string>,
) {
	const hasHeading = headingIndex !== -1;
	return {
		sourcePath,
		headingPath: [...headingPath],
		headingIndex,
		headingAnchor: hasHeading
			? createHeadingAnchor(sourcePath, headingPath, headingIndex)
			: createDocumentAnchor(sourcePath),
		imageUrls: [...imageUrlSet],
	};
}

/** 将 GFM 表格以保留表头的连续行组转为 table chunk。 */
function appendTableChunks(
	chunks: Omit<MarkdownChunk, "chunkIndex">[],
	table: MdastNode,
	sourcePath: string,
	headingPath: string[],
	headingIndex: number,
	tableRowsPerChunk: number,
	targetTokens: number,
) {
	const rows = table.children ?? [];
	if (rows.length === 0) return;
	const header = renderTableRow(rows[0]);
	const divider = `| ${Array.from({ length: rows[0].children?.length ?? 1 }, () => "---").join(" | ")} |`;
	const body = rows.slice(1);
	const metadata = createMetadata(sourcePath, headingPath, headingIndex, new Set(imageUrls(table)));
	const groupSize = Math.max(1, tableRowsPerChunk);
	if (body.length === 0) {
		chunks.push({
			...metadata,
			content: [header, divider].join("\n"),
			chunkKind: "table",
			tableRowStart: 0,
			tableRowEnd: -1,
		});
		return;
	}

	for (let start = 0; start < body.length; start += groupSize) {
		const group = body.slice(start, start + groupSize);
		appendTableGroup(chunks, metadata, header, divider, group, start, targetTokens);
	}
}

/** 递归二分超过 token 上限的表格行组，并保持数据行原子性。 */
function appendTableGroup(
	chunks: Omit<MarkdownChunk, "chunkIndex">[],
	metadata: ReturnType<typeof createMetadata>,
	header: string,
	divider: string,
	rows: MdastNode[],
	rowStart: number,
	targetTokens: number,
) {
	const content = [header, divider, ...rows.map(renderTableRow)].join("\n");
	if (rows.length > 1 && approximateTokenCount(content) > targetTokens) {
		const middle = Math.ceil(rows.length / 2);
		appendTableGroup(chunks, metadata, header, divider, rows.slice(0, middle), rowStart, targetTokens);
		appendTableGroup(chunks, metadata, header, divider, rows.slice(middle), rowStart + middle, targetTokens);
		return;
	}

	chunks.push({
		...metadata,
		content,
		chunkKind: "table",
		tableRowStart: rowStart,
		tableRowEnd: rowStart + rows.length - 1,
	});
}

/** 将一个 MDAST 表格行格式化回 GFM 行。 */
function renderTableRow(row: MdastNode): string {
	return `| ${(row.children ?? []).map((cell) => nodeText(cell).trim().replaceAll("|", "\\|")).join(" | ")} |`;
}

/** 收集嵌套节点中图片链接，不将 URL 合入可检索正文。 */
function imageUrls(node: MdastNode): string[] {
	const result: string[] = [];
	const visit = (current: MdastNode) => {
		if (current.type === "image" && current.url) result.push(current.url);
		for (const child of current.children ?? []) visit(child);
	};
	visit(node);
	return result;
}

/** 提取 Markdown 节点的可见文本，跳过图片节点。 */
function nodeText(node: MdastNode): string {
	if (node.type === "image") return "";
	if (typeof node.value === "string") return node.value;
	return (node.children ?? []).map(nodeText).join("");
}

/** 仅在文本超过 token 目标时用词块切分，并在相邻块间保留重叠。 */
function splitByTokens(content: string, targetTokens: number, overlapTokens: number): string[] {
	const tokens = tokenize(content);
	if (tokens.length <= targetTokens) return [content.trim()];
	const result: string[] = [];
	const step = Math.max(1, targetTokens - overlapTokens);
	for (let start = 0; start < tokens.length; start += step) {
		const end = Math.min(start + targetTokens, tokens.length);
		const startOffset = tokens[start].index ?? 0;
		const endToken = tokens[end - 1];
		const endOffset = (endToken.index ?? 0) + endToken[0].length;
		result.push(content.slice(startOffset, endOffset).trim());
		if (start + targetTokens >= tokens.length) break;
	}
	return result;
}

/** 使用与切分相同的规则估算 token 数。 */
function approximateTokenCount(content: string): number {
	return tokenize(content).length;
}

/** 将连续中文字符和非空白词组转换为近似 token。 */
function tokenize(content: string): RegExpMatchArray[] {
	return [...content.matchAll(/[\p{Script=Han}]|[^\s\p{Script=Han}]+/gu)];
}
