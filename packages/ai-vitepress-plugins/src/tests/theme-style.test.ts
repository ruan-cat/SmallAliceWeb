import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const styleSource = readFileSync(resolve(__dirname, "../client/style.css"), "utf8");

describe("VitePress AI 主题变量桥接", () => {
	test("映射完整的 VitePress 语义色彩变量", () => {
		for (const variable of [
			"--ai-chat-surface-color",
			"--ai-chat-surface-muted-color",
			"--ai-chat-surface-elevated-color",
			"--ai-chat-text-color",
			"--ai-chat-text-muted-color",
			"--ai-chat-border-color",
			"--ai-chat-border-strong-color",
			"--ai-chat-primary-color",
			"--ai-chat-primary-hover-color",
			"--ai-chat-primary-soft-color",
			"--ai-chat-primary-contrast-color",
			"--ai-chat-focus-color",
			"--ai-chat-shadow-color",
			"--ai-chat-success-color",
			"--ai-chat-danger-color",
		]) {
			expect(styleSource, variable).toContain(variable);
		}
	});

	test("主题桥接使用 VitePress 变量而不是固定深色面板色", () => {
		expect(styleSource).toContain("var(--vp-c-bg-elv");
		expect(styleSource).toContain("var(--vp-c-bg-soft");
		expect(styleSource).toContain("var(--vp-c-text-1");
		expect(styleSource).toContain("var(--vp-c-divider");
		expect(styleSource).toContain("var(--vp-c-brand-1");
		expect(styleSource).not.toContain("--ai-chat-surface-color: #111318");
	});
});

describe("Teek 主题色桥接（P1.5）", () => {
	test("主色 / hover / soft 桥接 Teek 优先于 VitePress", () => {
		expect(styleSource).toContain("--tk-theme-color");
		expect(styleSource).toContain("--tk-color-primary-light-3");
		expect(styleSource).toContain("--tk-color-primary-light-9");
	});

	test("同一声明中 Teek 出现在 VitePress fallback 之前", () => {
		// 抽取 --ai-chat-primary-color 的整条声明，断言 Teek 字符串位置先于 VitePress 字符串。
		const primaryLine = styleSource.match(/--ai-chat-primary-color:[^;]+;/);
		expect(primaryLine).not.toBeNull();
		const text = primaryLine![0];
		const tkIndex = text.indexOf("--tk-theme-color");
		const vpIndex = text.indexOf("--vp-c-brand-1");
		expect(tkIndex).toBeGreaterThanOrEqual(0);
		expect(vpIndex).toBeGreaterThan(tkIndex);
	});

	test("hover 色声明中 Teek light-3 出现在 VitePress brand-2 之前", () => {
		const hoverLine = styleSource.match(/--ai-chat-primary-hover-color:[^;]+;/);
		expect(hoverLine).not.toBeNull();
		const text = hoverLine![0];
		const tkIndex = text.indexOf("--tk-color-primary-light-3");
		const vpIndex = text.indexOf("--vp-c-brand-2");
		expect(tkIndex).toBeGreaterThanOrEqual(0);
		expect(vpIndex).toBeGreaterThan(tkIndex);
	});

	test("surface 与 text 桥接 Teek 变量", () => {
		expect(styleSource).toContain("var(--tk-bg-color");
		expect(styleSource).toContain("var(--tk-text-color");
	});

	test("html.dark 覆盖存在：暗色 surface / text fallback 与浅色分离", () => {
		expect(styleSource).toContain("html.dark .ai-chat-vitepress-shell");
		// 暗色覆盖块中应包含独立的 surface / text fallback
		const darkBlock = styleSource.match(/html\.dark\s+\.ai-chat-vitepress-shell\s*\{[^}]+\}/);
		expect(darkBlock).not.toBeNull();
		expect(darkBlock![0]).toContain("--ai-chat-surface-color");
		expect(darkBlock![0]).toContain("--ai-chat-text-color");
	});
});
