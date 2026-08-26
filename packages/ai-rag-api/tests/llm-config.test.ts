import { describe, expect, test } from "vitest";
import { getActiveRagLlmConfig, ragLlmConfig, resolveActiveRagLlmConfig } from "../src/llm-config";

describe("RAG LLM 公开注册表", () => {
	test("默认激活 Anthropic Messages 并保存两个 provider 的公开配置", () => {
		expect(ragLlmConfig.activeProvider).toBe("anthropic");
		expect(ragLlmConfig.providers.openai).toEqual({
			protocol: "openai-responses",
			baseUrl: "https://api.code-tab.com/v1",
			model: "gpt-5.6-luna",
		});
		expect(ragLlmConfig.providers.anthropic).toEqual({
			protocol: "anthropic-messages",
			baseUrl: "https://api.code-tab.com/v1",
			model: "claude-sonnet-5[1m]",
		});
	});

	test("公开注册表不包含任何密钥字段", () => {
		expect(JSON.stringify(ragLlmConfig)).not.toMatch(/api.?key|token|secret|password/i);
	});

	test("激活 Anthropic 时只解析 Anthropic key", () => {
		expect(resolveActiveRagLlmConfig({ openaiApiKey: "openai-key", anthropicApiKey: "anthropic-key" })).toEqual({
			...getActiveRagLlmConfig(),
			apiKey: "anthropic-key",
		});
	});

	test("激活 provider 缺少 key 时拒绝解析", () => {
		expect(() => resolveActiveRagLlmConfig({ openaiApiKey: "openai-key", anthropicApiKey: "" })).toThrow(
			"RAG chat provider is not configured",
		);
	});
});
