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
	parentId?: string;
	chunkIndex: number;
	imageUrls: string[];
	chunkKind: "prose" | "table" | "faq" | "code";
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
	lang?: string;
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
	const root = unified()
		.use(remarkParse)
		.use(remarkGfm)
		.parse(markdown) as MdastNode;
	const chunks: Omit<MarkdownChunk, "chunkIndex">[] = [];
	const headingPath: string[] = [];
	let headingIndex = -1;
	let currentHeadingIndex = -1;
	let prose: ProseBlock[] = [];

	const flushProse = () => {
		if (prose.length === 0) return;
		const blocks = prose;
		prose = [];
		let pending: ProseBlock[] = [];
		const flushPending = () => {
			if (pending.length === 0) return;
			appendProseChunks(
				chunks,
				pending,
				sourcePath,
				headingPath,
				currentHeadingIndex,
				settings,
			);
			pending = [];
		};

		for (let index = 0; index < blocks.length; ) {
			const block = blocks[index];
			const next = blocks[index + 1];
			if (next && isFaqPair(block.content, next.content)) {
				flushPending();
				const urls = new Set([...block.imageUrls, ...next.imageUrls]);
				chunks.push({
					...createMetadata(sourcePath, headingPath, currentHeadingIndex, urls),
					content: `${block.content}\n\n${next.content}`,
					chunkKind: "faq",
				});
				index += 2;
				continue;
			}
			pending.push(block);
			index += 1;
		}
		flushPending();
		prose = [];
	};

	for (const node of root.children ?? []) {
		if (node.type === "heading" && node.depth && node.depth <= 3) {
			flushProse();
			headingIndex += 1;
			currentHeadingIndex = headingIndex;
			const parentPath = headingPath
				.slice(0, node.depth - 1)
				.filter((heading) => heading !== undefined);
			headingPath.splice(
				0,
				headingPath.length,
				...parentPath,
				nodeText(node).trim(),
			);
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

		if (node.type === "code") {
			flushProse();
			const language = node.lang?.trim() ?? "";
			chunks.push({
				...createMetadata(
					sourcePath,
					headingPath,
					currentHeadingIndex,
					new Set(),
				),
				content: `\`\`\`${language}\n${node.value ?? ""}\n\`\`\``,
				chunkKind: "code",
			});
			continue;
		}

		if (node.type === "paragraph") {
			const text = nodeText(node).trim();
			const urls = imageUrls(node);
			if (text || urls.length > 0)
				prose.push({ content: text, imageUrls: urls });
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
		parentId: `rag-parent-${hasHeading ? createHeadingAnchor(sourcePath, headingPath, headingIndex) : createDocumentAnchor(sourcePath)}`,
		imageUrls: [...imageUrlSet],
	};
}

/** 将连续普通段落合并切分，并在句子边界保留跨块 overlap。 */
function appendProseChunks(
	chunks: Omit<MarkdownChunk, "chunkIndex">[],
	blocks: readonly ProseBlock[],
	sourcePath: string,
	headingPath: string[],
	headingIndex: number,
	settings: MarkdownChunkOptions,
) {
	const content = blocks
		.map((block) => block.content)
		.filter(Boolean)
		.join("\n\n");
	const urls = new Set(blocks.flatMap((block) => block.imageUrls));
	const metadata = createMetadata(sourcePath, headingPath, headingIndex, urls);
	for (const part of content
		? splitProseContent(content, settings.targetTokens, settings.overlapTokens)
		: [""]) {
		chunks.push({ ...metadata, content: part, chunkKind: "prose" });
	}
}

/** 判断相邻段落是否构成 FAQ 问答原子单元。 */
function isFaqPair(question: string, answer: string): boolean {
	return (
		/^(?:问题|question|q)\s*[:：]/i.test(question) &&
		/^(?:答案|answer|a)\s*[:：]/i.test(answer)
	);
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
	const metadata = createMetadata(
		sourcePath,
		headingPath,
		headingIndex,
		new Set(imageUrls(table)),
	);
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
		appendTableGroup(
			chunks,
			metadata,
			header,
			divider,
			group,
			start,
			targetTokens,
		);
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
		appendTableGroup(
			chunks,
			metadata,
			header,
			divider,
			rows.slice(0, middle),
			rowStart,
			targetTokens,
		);
		appendTableGroup(
			chunks,
			metadata,
			header,
			divider,
			rows.slice(middle),
			rowStart + middle,
			targetTokens,
		);
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

/** 仅在文本超过 token 目标时按句子边界切分，并在相邻块间保留重叠。 */
function splitProseContent(
	content: string,
	targetTokens: number,
	overlapTokens: number,
): string[] {
	const tokens = tokenize(content);
	if (tokens.length <= targetTokens) return [content.trim()];
	const result: string[] = [];
	for (let start = 0; start < tokens.length; ) {
		const maxEnd = Math.min(start + targetTokens, tokens.length);
		const end = chooseSentenceEnd(tokens, start, maxEnd);
		const startOffset = tokens[start].index ?? 0;
		const endToken = tokens[end - 1];
		const endOffset = (endToken.index ?? 0) + endToken[0].length;
		result.push(content.slice(startOffset, endOffset).trim());
		if (end >= tokens.length) break;
		const desiredStart = Math.max(start + 1, end - overlapTokens);
		start = chooseSentenceStart(tokens, desiredStart, end);
	}
	return result;
}

function chooseSentenceEnd(
	tokens: RegExpMatchArray[],
	start: number,
	maxEnd: number,
): number {
	if (maxEnd === tokens.length) return maxEnd;
	for (let index = maxEnd; index > start + 1; index -= 1) {
		if (isSentenceEnd(tokens[index - 1][0])) return index;
	}
	return maxEnd;
}

function chooseSentenceStart(
	tokens: RegExpMatchArray[],
	desiredStart: number,
	end: number,
): number {
	for (let index = desiredStart; index < end; index += 1) {
		if (isSentenceEnd(tokens[index - 1][0])) return index;
	}
	return desiredStart;
}

function isSentenceEnd(token: string): boolean {
	return /[。！？!?；;.!?]$/.test(token);
}

/** 使用与切分相同的规则估算 token 数。 */
function approximateTokenCount(content: string): number {
	return tokenize(content).length;
}

/** 将连续中文字符和非空白词组转换为近似 token。 */
function tokenize(content: string): RegExpMatchArray[] {
	return [...content.matchAll(/[\p{Script=Han}]|[^\s\p{Script=Han}]+/gu)];
}
