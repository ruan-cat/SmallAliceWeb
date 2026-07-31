import { describe, expect, test } from "vitest";
import { chunkMarkdown } from "../src/markdown-chunk";

describe("chunkMarkdown", () => {
	test("保留标题路径，并把图片 URL 限制在元数据中", () => {
		const [chunk] = chunkMarkdown("# 手册\n\n## 安装\n\n说明 ![](./images/a.png)", "docs/docx/手册.md");

		expect(chunk).toMatchObject({
			sourcePath: "docs/docx/手册.md",
			headingPath: ["手册", "安装"],
			headingIndex: 1,
			headingAnchor: expect.stringMatching(/^rag-heading-/),
			imageUrls: ["./images/a.png"],
			chunkKind: "prose",
		});
		expect(chunk.content).not.toContain("a.png");
	});

	test("按连续表格行组切分并重复表头", () => {
		const chunks = chunkMarkdown(
			"# FAQ\n\n| 问题 | 解决方案 |\n| --- | --- |\n| 一 | A |\n| 二 | B |\n| 三 | C |",
			"docs/docx/FAQ.md",
			{ tableRowsPerChunk: 2 },
		);

		expect(chunks).toHaveLength(2);
		expect(chunks.every((chunk) => chunk.content.includes("| 问题 | 解决方案 |"))).toBe(true);
		expect(chunks.map((chunk) => chunk.chunkKind)).toEqual(["table", "table"]);
		expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual([0, 1]);
		expect(chunks.map((chunk) => chunk.tableRowStart)).toEqual([0, 2]);
	});

	test("为同一路径下的同名标题生成不同锚点", () => {
		const chunks = chunkMarkdown("# 手册\n\n## 配置\n\n第一段\n\n## 配置\n\n第二段", "docs/docx/手册.md");

		expect(chunks.map((chunk) => chunk.headingPath)).toEqual([
			["手册", "配置"],
			["手册", "配置"],
		]);
		expect(new Set(chunks.map((chunk) => chunk.headingAnchor)).size).toBe(2);
	});

	test("为无标题根块创建文档锚点并维持连续的块序号", () => {
		const chunks = chunkMarkdown("第一段\n\n第二段", "docs/docx/根块.md", { targetTokens: 1, overlapTokens: 0 });

		expect(chunks[0]).toMatchObject({
			headingPath: [],
			headingIndex: -1,
			headingAnchor: expect.stringMatching(/^rag-document-/),
		});
		expect(chunks.map((chunk) => chunk.chunkIndex)).toEqual(chunks.map((_, index) => index));
	});

	test("保留仅含表头的表格", () => {
		const [chunk] = chunkMarkdown("# 术语\n\n| 名称 | 含义 |\n| --- | --- |", "docs/docx/术语.md");

		expect(chunk).toMatchObject({
			chunkKind: "table",
			content: "| 名称 | 含义 |\n| --- | --- |",
			tableRowStart: 0,
			tableRowEnd: -1,
		});
	});

	test("把连续中文按近似 token 边界切分并保留重叠", () => {
		const chunks = chunkMarkdown("# 标题\n\n甲乙丙丁", "docs/docx/中文.md", { targetTokens: 2, overlapTokens: 1 });

		expect(chunks.map((chunk) => chunk.content)).toEqual(["甲乙", "乙丙", "丙丁"]);
	});

	test("多个未超限段落只按段落边界分块，不跨段落制造 overlap", () => {
		const chunks = chunkMarkdown("甲乙\n\n丙丁", "docs/docx/段落.md", { targetTokens: 3, overlapTokens: 1 });

		expect(chunks.map((chunk) => chunk.content)).toEqual(["甲乙", "丙丁"]);
	});

	test("表格行组超过 token 上限时递归二分并保持连续行范围", () => {
		const chunks = chunkMarkdown(
			"| 键 | 值 |\n| --- | --- |\n| 一 | 甲乙丙丁 |\n| 二 | 甲乙丙丁 |\n| 三 | 甲乙丙丁 |\n| 四 | 甲乙丙丁 |",
			"docs/docx/长表格.md",
			{ tableRowsPerChunk: 4, targetTokens: 28 },
		);

		expect(chunks).toHaveLength(2);
		expect(chunks.map((chunk) => chunk.tableRowStart)).toEqual([0, 2]);
		expect(chunks.map((chunk) => chunk.tableRowEnd)).toEqual([1, 3]);
		expect(chunks.every((chunk) => chunk.content.startsWith("| 键 | 值 |"))).toBe(true);
	});

	test("跳级标题路径不包含稀疏占位", () => {
		const [chunk] = chunkMarkdown("### 深层标题\n\n正文", "docs/docx/跳级.md");

		expect(chunk.headingPath).toEqual(["深层标题"]);
	});
});
