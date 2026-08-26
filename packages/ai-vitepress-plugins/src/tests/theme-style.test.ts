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
