/** RAG 聊天上游协议标识。 */
export type RagLlmProtocol = "openai-responses" | "anthropic-messages";

/** RAG 聊天 provider 标识。 */
export type RagLlmProviderId = "openai" | "anthropic";

/** 公开的聊天 provider 配置，不包含任何凭据。 */
export type RagLlmProviderConfig = Readonly<{
	protocol: RagLlmProtocol;
	baseUrl: string;
	model: string;
}>;

/**
 * 公开聊天 provider 注册表。
 *
 * API key 只能通过 Nitro runtime config 注入，禁止加入此对象。
 */
export const ragLlmConfig = {
	activeProvider: "anthropic",
	providers: {
		openai: {
			protocol: "openai-responses",
			baseUrl: "https://api.code-tab.com/v1",
			model: "gpt-5.6-luna",
		},
		anthropic: {
			protocol: "anthropic-messages",
			baseUrl: "https://api.code-tab.com/v1",
			model: "claude-sonnet-5[1m]",
		},
	},
} as const satisfies Readonly<{
	activeProvider: RagLlmProviderId;
	providers: Record<RagLlmProviderId, RagLlmProviderConfig>;
}>;

/** 获取当前激活的公开 provider 配置。 */
export function getActiveRagLlmConfig(): RagLlmProviderConfig & { id: RagLlmProviderId } {
	const id = ragLlmConfig.activeProvider;
	return { id, ...ragLlmConfig.providers[id] };
}

/**
 * 将私有 key 与当前公开 provider 配置组合，供 runtime 显式注入 adapter。
 */
export function resolveActiveRagLlmConfig(keys: Readonly<Record<`${RagLlmProviderId}ApiKey`, string>>) {
	const provider = getActiveRagLlmConfig();
	const apiKey = keys[`${provider.id}ApiKey`];
	if (!apiKey?.trim()) throw new Error("RAG chat provider is not configured");
	return { ...provider, apiKey };
}
