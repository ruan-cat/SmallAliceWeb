import { describe, expect, test } from "vitest";
import { buildEmbeddingText } from "../src/embedding-text";

describe("embedding 检索文本", () => {
	test("按固定标签拼接来源、完整标题路径和正文", () => {
		expect(
			buildEmbeddingText({
				sourcePath: "docs/docx/guide.md",
				headingPath: ["指南", "安装"],
				content: "先安装依赖。",
			}),
		).toBe("文档：docs/docx/guide.md\n章节：指南 > 安装\n正文：先安装依赖。");
	});

	test("无标题时保留空章节字段且结果确定", () => {
		const input = {
			sourcePath: "docs/docx/root.md",
			headingPath: [],
			content: "根正文",
		};

		expect(buildEmbeddingText(input)).toBe(
			"文档：docs/docx/root.md\n章节：\n正文：根正文",
		);
		expect(buildEmbeddingText(input)).toBe(buildEmbeddingText(input));
	});

	test("支持中文多级标题与小爱丽丝上下文", () => {
		const text = buildEmbeddingText({
			sourcePath: "docs/docx/插件详细手册/99.小爱丽丝设定/小爱丽丝设定介绍.md",
			headingPath: ["小爱丽丝设定介绍", "小爱丽丝", "1）特征设定"],
			content: "实体蝴蝶结是小爱丽丝的标识。",
		});

		expect(text).toContain("章节：小爱丽丝设定介绍 > 小爱丽丝 > 1）特征设定");
		expect(text).toContain("正文：实体蝴蝶结是小爱丽丝的标识。");
	});

	test("移除 Markdown/HTML 图片 URL 但保留表格与正文文本", () => {
		const text = buildEmbeddingText({
			sourcePath: "docs/docx/table.md",
			headingPath: ["表格"],
			content:
				'说明 ![架构图](./images/架构.png)\n\n| 名称 | 值 |\n| --- | --- |\n| A | B |\n\n<img src="https://example.test/a.png">',
		});

		expect(text).toContain("说明");
		expect(text).toContain("| 名称 | 值 |");
		expect(text).toContain("| A | B |");
		expect(text).not.toContain("架构.png");
		expect(text).not.toContain("https://example.test/a.png");
	});

	test("按显式 imageUrls 列表移除不带 Markdown 包装的图片地址", () => {
		const text = buildEmbeddingText({
			sourcePath: "docs/docx/images.md",
			headingPath: ["图片"],
			content: "正文 https://example.test/diagram.webp 结束。",
			imageUrls: ["https://example.test/diagram.webp"],
		});

		expect(text).toContain("正文  结束。");
		expect(text).not.toContain("diagram.webp");
	});
});
