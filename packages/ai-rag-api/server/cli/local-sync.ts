import { createRagRuntime, resolveRagRuntimeConfig } from "../runtime/rag-runtime";
import { watch as watchFileSystem, type FSWatcher } from "node:fs";

type LocalSyncRuntime = {
	sync: (input: { dryRun: boolean }) => Promise<unknown>;
	close?: () => Promise<void>;
};

type LocalSyncOptions = {
	createRuntime: () => Promise<LocalSyncRuntime>;
	write: (output: string) => void;
};

type LocalSyncWatchOptions = {
	debounceMs?: number;
	run: () => Promise<void>;
	sourceRoot: string;
	watch?: (path: string, options: { recursive: boolean }, listener: () => void) => Pick<FSWatcher, "close">;
};

/** 监听知识源变更并去抖调用同一同步执行器。 */
export function createLocalKnowledgeWatch(options: LocalSyncWatchOptions) {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let closed = false;
	const watcher = (options.watch ?? ((path, watchOptions, listener) => watchFileSystem(path, watchOptions, listener)))(
		options.sourceRoot,
		{ recursive: true },
		() => {
			if (closed) return;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = undefined;
				void options.run();
			}, options.debounceMs ?? 500);
		},
	);
	return {
		close() {
			closed = true;
			if (timer) clearTimeout(timer);
			watcher.close();
		},
	};
}

/** 从本机 Nitro 环境变量构建与 HTTP plugin 相同的 RAG runtime。 */
export function createLocalRagRuntime(environment: NodeJS.ProcessEnv = process.env) {
	return createRagRuntime(
		resolveRagRuntimeConfig({
			databaseUrl: environment.NITRO_DATABASE_URL,
			syncDatabaseUrl: environment.NITRO_SYNC_DATABASE_URL,
			embeddingModel: environment.NITRO_EMBEDDING_MODEL,
			cloudflareAccountId: environment.NITRO_CLOUDFLARE_ACCOUNT_ID,
			cloudflareApiToken: environment.NITRO_CLOUDFLARE_API_TOKEN,
			openaiApiKey: environment.NITRO_OPENAI_API_KEY,
			baseUrl: environment.NITRO_BASE_URL,
			chatModel: environment.NITRO_CHAT_MODEL,
			knowledgeSyncToken: environment.NITRO_KNOWLEDGE_SYNC_TOKEN,
			cronSecret: environment.NITRO_CRON_SECRET,
			knowledgeSourceRoot: environment.NITRO_KNOWLEDGE_SOURCE_ROOT,
			repositoryRoot: environment.NITRO_REPOSITORY_ROOT,
			public: { apiBase: "/v1" },
		}),
	);
}

/** 执行本地 RAG runtime 的统一同步服务，不经过 HTTP 或 token 鉴权。 */
export async function executeLocalKnowledgeSync(argumentsList: string[], options: LocalSyncOptions): Promise<number> {
	try {
		const argumentsWithoutSeparator = argumentsList[0] === "--" ? argumentsList.slice(1) : argumentsList;
		if (argumentsWithoutSeparator.some((argument) => argument !== "--dry-run"))
			throw new Error("仅支持 --dry-run 参数。");
		if (argumentsWithoutSeparator.filter((argument) => argument === "--dry-run").length > 1) {
			throw new Error("参数 --dry-run 只能出现一次。");
		}

		const runtime = await options.createRuntime();
		try {
			options.write(JSON.stringify(await runtime.sync({ dryRun: argumentsWithoutSeparator.includes("--dry-run") })));
		} finally {
			await runtime.close?.();
		}
		return 0;
	} catch (error) {
		options.write(JSON.stringify({ error: { message: error instanceof Error ? error.message : "本地知识同步失败" } }));
		return 1;
	}
}
