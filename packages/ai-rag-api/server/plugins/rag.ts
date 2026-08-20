import { definePlugin } from "nitro";
import { useRuntimeConfig } from "nitro/runtime-config";
import postgres from "postgres";
import { resolve } from "node:path";
import {
	createRagRuntimeContext,
	type RagRuntimeContext,
	type RagRuntimeProviderFactories,
} from "../runtime/rag-assembly";
import { createPostgresSearchProvider } from "../search/postgres-search";
import { createCloudflareEmbeddingProvider } from "../providers/cloudflare-embedding";
import { createOpenAiChatStream, normalizeOpenAIBaseUrl } from "../services/openai-chat";
import { createKnowledgeSyncService, type SyncSqlExecutor } from "../services/knowledge-sync";
import { scanKnowledgeSources } from "../services/knowledge-source";

/** 插件必须校验的六项私有配置字段；任一为空则不挂载运行时。 */
const REQUIRED_CONFIG_FIELDS = [
	"databaseUrl",
	"openaiApiKey",
	"chatModel",
	"embeddingModel",
	"cloudflareAccountId",
	"cloudflareApiToken",
	"knowledgeSyncToken",
	"cronSecret",
] as const;

/** 只允许扫描仓库根目录下固定的 docs/docx 知识源。 */
function resolveKnowledgeSourceRoot(config: ResolvedRagConfig) {
	const repositoryRoot = resolve(config.repositoryRoot || process.cwd());
	const expectedRoot = resolve(repositoryRoot, "docs", "docx");
	const configuredRoot = resolve(config.knowledgeSourceRoot || expectedRoot);
	if (configuredRoot !== expectedRoot) {
		throw new Error("NITRO_KNOWLEDGE_SOURCE_ROOT 必须指向 repositoryRoot/docs/docx。");
	}
	return { repositoryRoot, sourceRoot: expectedRoot };
}

/** 插件内部使用的已解析运行时配置形状。 */
type ResolvedRagConfig = {
	databaseUrl: string;
	embeddingModel: string;
	cloudflareAccountId: string;
	cloudflareApiToken: string;
	openaiApiKey: string;
	baseUrl: string;
	chatModel: string;
	knowledgeSyncToken: string;
	cronSecret: string;
	knowledgeSourceRoot: string;
	repositoryRoot: string;
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
		cloudflareAccountId: String(raw.cloudflareAccountId ?? ""),
		cloudflareApiToken: String(raw.cloudflareApiToken ?? ""),
		openaiApiKey: String(raw.openaiApiKey ?? ""),
		baseUrl: String(raw.baseUrl ?? ""),
		chatModel: String(raw.chatModel ?? ""),
		knowledgeSyncToken: String(raw.knowledgeSyncToken ?? ""),
		cronSecret: String(raw.cronSecret ?? ""),
		knowledgeSourceRoot: String(raw.knowledgeSourceRoot ?? ""),
		repositoryRoot: String(raw.repositoryRoot ?? ""),
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
	const createSyncExecutor = (client: typeof sql): SyncSqlExecutor => ({
		execute: (statement, parameters) =>
			client.unsafe(statement, [...parameters] as Parameters<typeof client.unsafe>[1]),
		transaction: async <T>(callback: (transaction: SyncSqlExecutor) => Promise<T>) => {
			const result = await client.begin(async (transaction) =>
				callback({
					execute: (statement, parameters) =>
						transaction.unsafe(statement, [...parameters] as Parameters<typeof transaction.unsafe>[1]),
					transaction: async (nestedCallback) =>
						nestedCallback({
							execute: (statement, parameters) =>
								transaction.unsafe(statement, [...parameters] as Parameters<typeof transaction.unsafe>[1]),
							transaction: async () => {
								throw new Error("nested sync transaction is not supported");
							},
						}),
				}),
			);
			return result as T;
		},
	});
	const syncExecutor = createSyncExecutor(sql);
	syncExecutor.reserve = async () => {
		const reserved = await sql.reserve();
		const executor = createSyncExecutor(reserved);
		return {
			...executor,
			release: async () => {
				reserved.release();
			},
		};
	};
	const embeddingProvider = createCloudflareEmbeddingProvider({
		accountId: config.cloudflareAccountId,
		apiToken: config.cloudflareApiToken,
		model: config.embeddingModel,
	});
	const sourcePaths = resolveKnowledgeSourceRoot(config);
	const syncEmbedding = {
		createEmbedding: (query: string) => embeddingProvider.createEmbedding(query).then((embedding) => [...embedding]),
		createEmbeddings: (contents: readonly string[]) => embeddingProvider.createEmbeddings(contents),
	};

	const factories: RagRuntimeProviderFactories = {
		createDatabase: () =>
			createPostgresSearchProvider({
				execute: (statement, parameters) => sql.unsafe(statement, [...parameters] as Parameters<typeof sql.unsafe>[1]),
			}),
		createEmbedding: ({ model }) => {
			return {
				createEmbedding: (query) => embeddingProvider.createEmbedding(query).then((embedding) => [...embedding]),
			};
		},
		createModel: () => ({ stream: createOpenAiChatStream(config) }),
		createSync: () =>
			createKnowledgeSyncService({
				executor: syncExecutor,
				embedding: syncEmbedding,
				scanner: () =>
					scanKnowledgeSources({
						repositoryRoot: sourcePaths.repositoryRoot,
						sourceRoot: sourcePaths.sourceRoot,
					}),
				profileVersion: "markdown-structure-v1",
				embeddingModel: config.embeddingModel,
				maxEmbeddingTexts: 100,
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
