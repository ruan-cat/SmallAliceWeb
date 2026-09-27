import { describe, expect, test } from "vitest";
import {
	getActiveRagLlmConfig,
	getRagLlmConfigById,
	ragLlmConfig,
	resolveActiveRagLlmConfig,
} from "../src/llm-config";

describe("RAG LLM 公开注册表", () => {
	test("默认激活 Anthropic Messages 并保存两个 provider 的公开配置（含 label）", () => {
		expect(ragLlmConfig.activeProvider).toBe("anthropic");
		expect(ragLlmConfig.providers.openai).toEqual({
			protocol: "openai-responses",
			baseUrl: "https://api.code-tab.com/v1",
			model: "gpt-5.6-luna",
			label: "GPT-5.6 Luna",
		});
		expect(ragLlmConfig.providers.anthropic).toEqual({
			protocol: "anthropic-messages",
			baseUrl: "https://api.code-tab.com/v1",
			model: "claude-sonnet-5[1m]",
			label: "Claude Sonnet 5",
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

describe("RAG LLM 公开注册表（按 id 查询）", () => {
	test("按注册表 key 解析公开 provider 配置（含 label 与 id）", () => {
		expect(getRagLlmConfigById("anthropic")).toEqual({
			id: "anthropic",
			protocol: "anthropic-messages",
			baseUrl: "https://api.code-tab.com/v1",
			model: "claude-sonnet-5[1m]",
			label: "Claude Sonnet 5",
		});
		expect(getRagLlmConfigById("openai")).toEqual({
			id: "openai",
			protocol: "openai-responses",
			baseUrl: "https://api.code-tab.com/v1",
			model: "gpt-5.6-luna",
			label: "GPT-5.6 Luna",
		});
	});

	test("未知 id 返回 undefined，不静默回退到任意 provider", () => {
		expect(getRagLlmConfigById("unknown")).toBeUndefined();
		expect(getRagLlmConfigById("")).toBeUndefined();
		// 空对象 / 数字等非字符串也走原型链检查路径：toString 后不在注册表，返回 undefined
		expect(getRagLlmConfigById("ANTHROPIC")).toBeUndefined();
	});
});