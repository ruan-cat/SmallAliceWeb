/** RAG 聊天上游协议标识。 */
export type RagLlmProtocol = "openai-responses" | "anthropic-messages";

/** RAG 聊天 provider 标识。 */
export type RagLlmProviderId = "openai" | "anthropic";

/** 公开的聊天 provider 配置，不包含任何凭据。 */
export type RagLlmProviderConfig = Readonly<{
	protocol: RagLlmProtocol;
	baseUrl: string;
	model: string;
	/** 展示名，供前端模型选择器使用；不参与请求路由。 */
	label: string;
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
			label: "GPT-5.6 Luna",
		},
		anthropic: {
			protocol: "anthropic-messages",
			baseUrl: "https://api.code-tab.com/v1",
			model: "claude-sonnet-5[1m]",
			label: "Claude Sonnet 5",
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
 * 按 id 解析公开 provider 配置（含 label）；未知 id 返回 undefined。
 *
 * 调用方应在白名单校验失败的回退路径上自行决定行为：
 * - chat 接口的非法 provider 字段由 zod enum 直接拒绝（返回 400，spec 12.2）
 * - 字段缺失则回退 activeProvider（spec 12.2）
 * - 该函数对未注册 id 一律返回 undefined，不静默回退到任何具体 provider
 */
export function getRagLlmConfigById(id: string): (RagLlmProviderConfig & { id: RagLlmProviderId }) | undefined {
	if (!(id in ragLlmConfig.providers)) return undefined;
	const key = id as RagLlmProviderId;
	return { id: key, ...ragLlmConfig.providers[key] };
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