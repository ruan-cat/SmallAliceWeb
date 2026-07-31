import { describe, expect, test } from "vitest";
import { createSourceUrl, resolveSourceHref } from "../src/source-url";

describe("source URL", () => {
	test("逐段编码 Markdown 来源路径", () => {
		expect(createSourceUrl("docs/docx/插件 手册/配置.md")).toBe(
			"/docx/%E6%8F%92%E4%BB%B6%20%E6%89%8B%E5%86%8C/%E9%85%8D%E7%BD%AE.html",
		);
	});

	test("仅对标题块追加稳定锚点", () => {
		expect(resolveSourceHref({ sourcePath: "docs/docx/a.md", headingIndex: 0, headingAnchor: "rag-heading-x" })).toBe(
			"/docx/a.html#rag-heading-x",
		);
		expect(resolveSourceHref({ sourcePath: "docs/docx/a.md", headingIndex: -1, headingAnchor: "rag-document-x" })).toBe(
			"/docx/a.html",
		);
	});
});
