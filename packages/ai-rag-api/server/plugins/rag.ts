import { definePlugin } from "nitro";
import { useRuntimeConfig } from "nitro/runtime-config";
import postgres from "postgres";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import {
	createRagRuntimeContext,
	type RagRuntimeContext,
	type RagRuntimeProviderFactories,
} from "../runtime/rag-assembly";
import { createPostgresSearchProvider } from "../search/postgres-search";
import { createOpenAiChatStream } from "../services/openai-chat";

/** 插件必须校验的六项私有配置字段；任一为空则不挂载运行时。 */
const REQUIRED_CONFIG_FIELDS = [
	"databaseUrl",
	"openaiApiKey",
	"chatModel",
	"embeddingModel",
	"knowledgeSyncToken",
	"cronSecret",
] as const;

/** 插件内部使用的已解析运行时配置形状。 */
type ResolvedRagConfig = {
	databaseUrl: string;
	embeddingModel: string;
	openaiApiKey: string;
	baseUrl: string;
	chatModel: string;
	knowledgeSyncToken: string;
	cronSecret: string;
	public: { apiBase: string };
};

/** 模块级单例；首次请求时惰性初始化，配置不完整或初始化失败时保持 null。 */
let ragContext: RagRuntimeContext | null = null;
let initializationAttempted = false;

/** 将 Nitro request 钩子的 event 安全视为带有 context 的事件对象。 */
type EventWithContext = { context: Record<string, unknown> };

/** 从 useRuntimeConfig() 返回值中提取并断言为已解析配置。 */
function resolveRuntimeConfig(): ResolvedRagConfig {
	const raw = useRuntimeConfig() as Record<string, unknown>;
	return {
		databaseUrl: String(raw.databaseUrl ?? ""),
		embeddingModel: String(raw.embeddingModel ?? ""),
		openaiApiKey: String(raw.openaiApiKey ?? ""),
		baseUrl: String(raw.baseUrl ?? ""),
		chatModel: String(raw.chatModel ?? ""),
		knowledgeSyncToken: String(raw.knowledgeSyncToken ?? ""),
		cronSecret: String(raw.cronSecret ?? ""),
		public: (raw.public as ResolvedRagConfig["public"]) ?? { apiBase: "/v1" },
	};
}

/** 检查配置完整性，返回缺失字段名称列表。 */
function findMissingFields(config: ResolvedRagConfig): string[] {
	return REQUIRED_CONFIG_FIELDS.filter((field) => {
		const value = config[field];
		return typeof value !== "string" || !value.trim();
	});
}

/** 创建全部 provider factory 并初始化 RAG 运行时上下文。 */
async function buildRagContext(config: ResolvedRagConfig): Promise<RagRuntimeContext> {
	const sql = postgres(config.databaseUrl);

	const factories: RagRuntimeProviderFactories = {
		createDatabase: () =>
			createPostgresSearchProvider({
				execute: (statement, parameters) => sql.unsafe(statement, [...parameters] as Parameters<typeof sql.unsafe>[1]),
			}),
		createEmbedding: ({ model }) => {
			const provider = createOpenAI({
				apiKey: config.openaiApiKey,
				...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
			});
			return {
				createEmbedding: async (query) => {
					const { embedding } = await embed({ model: provider.embedding(model), value: query });
					return embedding;
				},
			};
		},
		createModel: () => ({ stream: createOpenAiChatStream(config) }),
		createSync: () => ({
			sync: async ({ dryRun }) => ({ accepted: true, dryRun }),
			syncRuns: async () => [],
		}),
	};

	return createRagRuntimeContext(config, factories);
}

/** 惰性初始化 RAG 运行时；配置不完整时输出警告并保持 null。 */
async function tryInitialize(): Promise<void> {
	const config = resolveRuntimeConfig();
	const missing = findMissingFields(config);

	if (missing.length > 0) {
		console.warn(`[rag-plugin] RAG 运行时配置不完整，缺失字段: ${missing.join(", ")}`);
		return;
	}

	try {
		ragContext = await buildRagContext(config);
	} catch (error) {
		console.error("[rag-plugin] RAG 运行时初始化失败:", error instanceof Error ? error.message : error);
	}
}

export default definePlugin((nitro) => {
	nitro.hooks.hook("request", async (event) => {
		if (!initializationAttempted) {
			initializationAttempted = true;
			await tryInitialize();
		}
		if (ragContext) {
			(event as unknown as EventWithContext).context.rag = ragContext;
		}
	});
});
