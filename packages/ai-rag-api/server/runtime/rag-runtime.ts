import { resolve } from "node:path";
import postgres from "postgres";
import { resolveActiveRagLlmConfig } from "../../src/llm-config";
import { createCloudflareEmbeddingProvider } from "../providers/cloudflare-embedding";
import { createPostgresSearchProvider } from "../search/postgres-search";
import {
	createKnowledgeSyncService,
	type SyncSqlExecutor,
} from "../services/knowledge-sync";
import { scanKnowledgeSources } from "../services/knowledge-source";
import { createAnthropicChatStream } from "../services/anthropic-chat";
import { createOpenAiChatStream } from "../services/openai-chat";
import {
	createRagRuntimeContext,
	type RagRuntimeContext,
	type RagRuntimeProviderFactories,
} from "./rag-assembly";

const requiredConfigFields = [
	"databaseUrl",
	"syncDatabaseUrl",
	"embeddingModel",
	"cloudflareAccountId",
	"cloudflareApiToken",
	"knowledgeSyncToken",
	"cronSecret",
] as const;

/** Nitro 与本地 CLI 共享的已解析 RAG 私有配置。 */
export type ResolvedRagConfig = {
	databaseUrl: string;
	syncDatabaseUrl: string;
	embeddingModel: string;
	rerankerMode: "disabled" | "noop" | "llm";
	rerankerProvider: string;
	rerankerModel: string;
	rerankerVersion: string;
	rerankerCandidateLimit: number;
	rerankerMaxInputTokens: number;
	rerankerTimeoutMs: number;
	rerankerMaxCostUsd: number;
	cloudflareAccountId: string;
	cloudflareApiToken: string;
	openaiApiKey: string;
	anthropicApiKey: string;
	knowledgeSyncToken: string;
	cronSecret: string;
	knowledgeSourceRoot: string;
	repositoryRoot: string;
	public: { apiBase: string };
};

type SyncSqlClient = {
	unsafe: (
		statement: string,
		parameters?: readonly unknown[],
	) => Promise<readonly Record<string, unknown>[]>;
	begin?: <T>(
		callback: (transaction: SyncSqlClient) => Promise<T>,
	) => Promise<T>;
};

type ReservableSyncSqlClient = {
	reserve: () => Promise<
		SyncSqlClient & { release: () => void | Promise<void> }
	>;
	end: (options?: { timeout?: number }) => Promise<void>;
};

/** 将任意 Nitro/plain-object 配置映射为统一 RAG 配置形状。 */
export function resolveRagRuntimeConfig(
	raw: Record<string, unknown>,
): ResolvedRagConfig {
	return {
		databaseUrl: String(raw.databaseUrl ?? ""),
		syncDatabaseUrl: String(raw.syncDatabaseUrl ?? ""),
		embeddingModel: String(raw.embeddingModel ?? ""),
		rerankerMode:
			raw.rerankerMode === "llm" || raw.rerankerMode === "noop"
				? raw.rerankerMode
				: "disabled",
		rerankerProvider: String(raw.rerankerProvider ?? ""),
		rerankerModel: String(raw.rerankerModel ?? ""),
		rerankerVersion: String(raw.rerankerVersion ?? ""),
		rerankerCandidateLimit: toPositiveInteger(raw.rerankerCandidateLimit, 20),
		rerankerMaxInputTokens: toPositiveInteger(raw.rerankerMaxInputTokens, 2000),
		rerankerTimeoutMs: toPositiveInteger(raw.rerankerTimeoutMs, 800),
		rerankerMaxCostUsd: toNonNegativeNumber(raw.rerankerMaxCostUsd, 0),
		cloudflareAccountId: String(raw.cloudflareAccountId ?? ""),
		cloudflareApiToken: String(raw.cloudflareApiToken ?? ""),
		openaiApiKey: String(raw.openaiApiKey ?? ""),
		anthropicApiKey: String(raw.anthropicApiKey ?? ""),
		knowledgeSyncToken: String(raw.knowledgeSyncToken ?? ""),
		cronSecret: String(raw.cronSecret ?? ""),
		knowledgeSourceRoot: String(raw.knowledgeSourceRoot ?? ""),
		repositoryRoot: String(raw.repositoryRoot ?? ""),
		public: (raw.public as ResolvedRagConfig["public"]) ?? { apiBase: "/v1" },
	};
}

function toPositiveInteger(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function toNonNegativeNumber(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** 适配保留数据库连接的事务接口。 */
export function createSyncExecutor(client: SyncSqlClient): SyncSqlExecutor {
	const transactionExecutor = (
		transaction: SyncSqlClient,
	): SyncSqlExecutor => ({
		execute: (statement, parameters) =>
			transaction.unsafe(statement, parameters),
		transaction: async () => {
			throw new Error("nested sync transaction is not supported");
		},
	});
	return {
		execute: (statement, parameters) => client.unsafe(statement, parameters),
		transaction: async (callback) => {
			if (client.begin)
				return client.begin(async (transaction) =>
					callback(transactionExecutor(transaction)),
				);
			await client.unsafe("BEGIN");
			try {
				const result = await callback(transactionExecutor(client));
				await client.unsafe("COMMIT");
				return result;
			} catch (error) {
				try {
					await client.unsafe("ROLLBACK");
				} catch {}
				throw error;
			}
		},
	};
}

/** 为每轮同步创建独立 non-pooled session，保持 advisory lock 真实互斥。 */
export function createReservedSyncExecutor(
	createClient: () => ReservableSyncSqlClient,
): SyncSqlExecutor {
	return {
		execute: async () => {
			throw new Error("同步执行器必须先保留数据库会话。");
		},
		transaction: async () => {
			throw new Error("同步执行器必须先保留数据库会话。");
		},
		reserve: async () => {
			const client = createClient();
			const reserved = await client.reserve();
			const executor = createSyncExecutor(reserved);
			return {
				...executor,
				release: async () => {
					try {
						await reserved.release();
					} finally {
						await client.end({ timeout: 5 });
					}
				},
			};
		},
	};
}

/** 创建 HTTP plugin 与本地 CLI 共用的真实 RAG runtime。 */
export async function createRagRuntime(
	config: ResolvedRagConfig,
): Promise<RagRuntimeContext & { close: () => Promise<void> }> {
	const missing = requiredConfigFields.filter((field) => !config[field].trim());
	if (missing.length)
		throw new Error(`RAG 运行时配置不完整，缺失字段: ${missing.join(", ")}`);
	resolveActiveRagLlmConfig(config);
	const repositoryRoot = resolve(config.repositoryRoot || process.cwd());
	const sourceRoot = resolve(
		config.knowledgeSourceRoot || resolve(repositoryRoot, "docs", "docx"),
	);
	if (sourceRoot !== resolve(repositoryRoot, "docs", "docx"))
		throw new Error(
			"NITRO_KNOWLEDGE_SOURCE_ROOT 必须指向 repositoryRoot/docs/docx。",
		);
	const sql = postgres(config.databaseUrl);
	const embedding = createCloudflareEmbeddingProvider({
		accountId: config.cloudflareAccountId,
		apiToken: config.cloudflareApiToken,
		model: config.embeddingModel,
	});
	const factories: RagRuntimeProviderFactories = {
		createDatabase: () =>
			createPostgresSearchProvider({
				execute: (statement, parameters) =>
					sql.unsafe(statement, [...parameters] as Parameters<
						typeof sql.unsafe
					>[1]),
			}),
		createEmbedding: () => ({
			createEmbedding: (query) =>
				embedding.createEmbedding(query).then((value) => [...value]),
		}),
		createModel: ({ apiKey, provider }) => ({
			stream:
				provider.id === "anthropic"
					? createAnthropicChatStream({ ...provider, apiKey })
					: createOpenAiChatStream({ ...provider, apiKey }),
		}),
		createSync: () =>
			createKnowledgeSyncService({
				executor: createReservedSyncExecutor(
					() =>
						postgres(
							config.syncDatabaseUrl,
						) as unknown as ReservableSyncSqlClient,
				),
				embedding: {
					createEmbedding: (query) =>
						embedding.createEmbedding(query).then((value) => [...value]),
					createEmbeddings: (contents) => embedding.createEmbeddings(contents),
				},
				scanner: () => scanKnowledgeSources({ repositoryRoot, sourceRoot }),
				profileVersion: "markdown-structure-v2",
				embeddingModel: config.embeddingModel,
			}),
	};
	const runtime = await createRagRuntimeContext(config, factories);
	return { ...runtime, close: () => sql.end({ timeout: 5 }) };
}
