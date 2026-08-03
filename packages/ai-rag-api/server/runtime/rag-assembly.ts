import type { RagNitroConfig } from "../../src/runtime-config";
import type { ChatDependencies, ChatSource } from "../contracts/chat";
import { hybridSearch, type HybridSearchItem } from "../search/hybrid-search";

/** 允许 runtime assembly 接收已解析的 Nitro 私有配置，不读取裸环境变量。 */
export type RagRuntimeConfig = Readonly<RagNitroConfig["runtimeConfig"]> & {
	public: Readonly<RagNitroConfig["runtimeConfig"]["public"]>;
};

/** 数据库检索 provider；连接由调用方通过 factory 创建并注入。 */
export type RagDatabaseProvider = {
	lexicalSearch: (query: string, limit: number) => Promise<HybridSearchItem[]>;
	vectorSearch: (embedding: readonly number[], limit: number) => Promise<HybridSearchItem[]>;
};

/** embedding provider；模型连接由调用方通过 factory 创建并注入。 */
export type RagEmbeddingProvider = {
	createEmbedding: (query: string) => Promise<number[]>;
};

/** 聊天模型 provider；真实模型客户端不在本模块 import 时创建。 */
export type RagModelProvider = {
	stream: ChatDependencies["stream"];
};

/** 知识同步 provider；事务和持久化实现由调用方通过 factory 注入。 */
export type RagSyncProvider = {
	sync: (input: { dryRun: boolean }) => Promise<unknown>;
	syncRuns: (options: { limit: number }) => Promise<unknown[]>;
};

type RagSyncFactoryInput = {
	database: RagDatabaseProvider;
	config: RagRuntimeConfig;
};

/** 所有外部 provider 都必须通过显式 factory 注入。 */
export type RagRuntimeProviderFactories = {
	createDatabase: (input: { databaseUrl: string }) => RagDatabaseProvider | Promise<RagDatabaseProvider>;
	createEmbedding: (input: { model: string }) => RagEmbeddingProvider | Promise<RagEmbeddingProvider>;
	createModel: (input: { apiKey: string; model: string }) => RagModelProvider | Promise<RagModelProvider>;
	createSync: (input: RagSyncFactoryInput) => RagSyncProvider | Promise<RagSyncProvider>;
};

/** 同步路由需要的公开配置视图，不暴露数据库 URL、API key 或模型名。 */
export type RagRuntimeConfigView = Readonly<{
	apiBase: string;
	syncToken?: string;
	cronSecret?: string;
}>;

/** 可挂载到 event.context.rag 的完整能力集合。 */
export type RagRuntimeContext = Readonly<{
	retrieve: (message: string, options: { limit: number }) => Promise<ChatSource[]>;
	search: (query: string, options: { limit: number; k: number }) => Promise<HybridSearchItem[]>;
	stream: ChatDependencies["stream"];
	sync: RagSyncProvider["sync"];
	syncRuns: RagSyncProvider["syncRuns"];
	config: RagRuntimeConfigView;
}>;

export type RagRuntimeRequirement = "database" | "embedding" | "model";

/** 表示配置不完整，调用方应保持 event.context.rag 未装配以触发 503。 */
export class RagRuntimeNotConfiguredError extends Error {
	readonly code = "RAG_NOT_CONFIGURED" as const;
	readonly status = 503 as const;

	constructor(public readonly missing: readonly RagRuntimeRequirement[]) {
		super("RAG 运行时缺少必需配置：" + missing.join("、"));
		this.name = "RagRuntimeNotConfiguredError";
	}
}

/** 表示 provider factory 初始化失败，禁止被误报为成功响应。 */
export class RagRuntimeProviderError extends Error {
	readonly code = "RAG_PROVIDER_INIT_FAILED" as const;
	readonly status = 500 as const;

	constructor(
		public readonly provider: keyof RagRuntimeProviderFactories,
		cause: unknown,
	) {
		super("RAG provider 初始化失败：" + provider);
		this.cause = cause;
		this.name = "RagRuntimeProviderError";
	}

	readonly cause: unknown;
}

function requiredConfigMissing(config: RagRuntimeConfig): RagRuntimeRequirement[] {
	const missing: RagRuntimeRequirement[] = [];
	if (!config.databaseUrl.trim()) missing.push("database");
	if (!config.embeddingModel.trim()) missing.push("embedding");
	if (!config.openaiApiKey.trim() || !config.chatModel.trim()) missing.push("model");
	return missing;
}

function assertProviderFunction<T extends object>(
	provider: T,
	providerName: keyof RagRuntimeProviderFactories,
	methods: readonly (keyof T)[],
): T {
	if (!provider || typeof provider !== "object") {
		throw new RagRuntimeProviderError(providerName, new TypeError("factory 未返回 provider 对象"));
	}
	for (const method of methods) {
		if (typeof provider[method] !== "function") {
			throw new RagRuntimeProviderError(providerName, new TypeError("provider 缺少 " + String(method) + " 方法"));
		}
	}
	return provider;
}

async function initializeProvider<T>(
	providerName: keyof RagRuntimeProviderFactories,
	factory: () => T | Promise<T>,
): Promise<T> {
	try {
		return await factory();
	} catch (error) {
		if (error instanceof RagRuntimeProviderError) throw error;
		throw new RagRuntimeProviderError(providerName, error);
	}
}

/**
 * 创建可注入到 event.context.rag 的完整运行时能力。
 *
 * 该函数只消费调用方传入的配置和 provider factory：配置缺失时在任何
 * provider 初始化前抛出 503 合同错误，factory 失败时抛出 500 初始化错误，
 * 因而不会返回半成品 context，也不会生成假成功响应。
 */
export async function createRagRuntimeContext(
	config: RagRuntimeConfig,
	factories: RagRuntimeProviderFactories,
): Promise<RagRuntimeContext> {
	const missing = requiredConfigMissing(config);
	if (missing.length > 0) throw new RagRuntimeNotConfiguredError(missing);

	const database = assertProviderFunction(
		await initializeProvider("createDatabase", () => factories.createDatabase({ databaseUrl: config.databaseUrl })),
		"createDatabase",
		["lexicalSearch", "vectorSearch"],
	);
	const embedding = assertProviderFunction(
		await initializeProvider("createEmbedding", () => factories.createEmbedding({ model: config.embeddingModel })),
		"createEmbedding",
		["createEmbedding"],
	);
	const model = assertProviderFunction(
		await initializeProvider("createModel", () =>
			factories.createModel({ apiKey: config.openaiApiKey, model: config.chatModel }),
		),
		"createModel",
		["stream"],
	);
	const sync = assertProviderFunction(
		await initializeProvider("createSync", () => factories.createSync({ database, config })),
		"createSync",
		["sync", "syncRuns"],
	);

	const search = (query: string, options: { limit: number; k: number }) =>
		hybridSearch(
			query,
			{
				createEmbedding: (searchQuery) => embedding.createEmbedding(searchQuery),
				lexicalSearch: (searchQuery, limit) => database.lexicalSearch(searchQuery, limit),
				vectorSearch: (vector, limit) => database.vectorSearch(vector, limit),
			},
			options,
		);

	return {
		search,
		retrieve: (message, options) => search(message, { limit: options.limit, k: 60 }),
		stream: (request) => model.stream(request),
		sync: (input) => sync.sync(input),
		syncRuns: (options) => sync.syncRuns(options),
		config: Object.freeze({
			apiBase: config.public.apiBase,
			syncToken: config.knowledgeSyncToken || undefined,
			cronSecret: config.cronSecret || undefined,
		}),
	};
}
