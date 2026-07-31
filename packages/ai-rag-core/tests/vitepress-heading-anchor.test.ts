import MarkdownIt from "markdown-it";
import { describe, expect, test } from "vitest";
import { createHeadingAnchor } from "../src/heading-anchor";
import { installVitePressHeadingAnchors } from "../src/vitepress-heading-anchor";

describe("installVitePressHeadingAnchors", () => {
	test("为 H1/H2/H3 使用共享标题锚点算法，并保留 H4 默认行为", () => {
		const markdown = new MarkdownIt();
		installVitePressHeadingAnchors(markdown);

		const html = markdown.render("# 手册\n\n## 配置\n\n### 详情\n\n#### 其他", { relativePath: "docx/手册.md" });

		expect(html).toContain(`id=\"${createHeadingAnchor("docs/docx/手册.md", ["手册"], 0)}\"`);
		expect(html).toContain(`id=\"${createHeadingAnchor("docs/docx/手册.md", ["手册", "配置"], 1)}\"`);
		expect(html).toContain(`id=\"${createHeadingAnchor("docs/docx/手册.md", ["手册", "配置", "详情"], 2)}\"`);
		expect(html).toContain("<h4>其他</h4>");
	});

	test("同名标题根据出现序号得到不同锚点，并支持 Windows 相对路径", () => {
		const markdown = new MarkdownIt();
		installVitePressHeadingAnchors(markdown);

		const html = markdown.render("# 配置\n\n# 配置", { relativePath: "docx\\重复.md" });

		expect(html).toContain(`id=\"${createHeadingAnchor("docs/docx/重复.md", ["配置"], 0)}\"`);
		expect(html).toContain(`id=\"${createHeadingAnchor("docs/docx/重复.md", ["配置"], 1)}\"`);
	});
});
