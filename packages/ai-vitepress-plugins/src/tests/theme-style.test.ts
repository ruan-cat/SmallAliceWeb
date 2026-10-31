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

describe("Teek 主题变量桥接", () => {
	test("桥接 --tk-theme-color 到 --ai-chat-primary-color", () => {
		expect(styleSource).toContain("var(--tk-theme-color");
	});

	test("桥接 Teek primary 色阶别名到 hover/soft/focus 变量", () => {
		expect(styleSource).toContain("var(--tk-color-primary-light-3");
		expect(styleSource).toContain("var(--tk-color-primary-light-9");
	});

	test("桥接 --tk-bg-color 到 --ai-chat-surface-color", () => {
		expect(styleSource).toContain("var(--tk-bg-color");
	});

	test("桥接 --tk-text-color 到 --ai-chat-text-color", () => {
		expect(styleSource).toContain("var(--tk-text-color");
	});

	test("Teek 变量优先于 VitePress 变量（嵌套 var）", () => {
		const primaryLine = styleSource.match(/--ai-chat-primary-color:[^;]+;/);
		expect(primaryLine).not.toBeNull();
		const text = primaryLine![0];
		const tkIndex = text.indexOf("--tk-theme-color");
		const vpIndex = text.indexOf("--vp-c-brand-1");
		expect(tkIndex).toBeGreaterThanOrEqual(0);
		expect(vpIndex).toBeGreaterThanOrEqual(0);
		expect(tkIndex).toBeLessThan(vpIndex);
	});

	test("暗色模式覆盖存在", () => {
		expect(styleSource).toContain("html.dark");
		expect(styleSource).toMatch(/html\.dark[\s\S]*--ai-chat-surface-color/);
	});
});
