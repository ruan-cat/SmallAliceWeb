import { createHash, randomUUID } from "node:crypto";
import { ApiHttpError } from "../contracts/errors";

/**
 * EV-2：评估运行写入/查询数据访问（learn-agents-ui plan 17.3）。
 *
 * 与 knowledge-sync 服务同构：SQL 执行器显式注入，本模块不创建任何连接。
 * CLI 场景经 `recordEvaluationRunFromEnv` 自建一次性连接，落库失败不阻断评估
 * （stdout 与 JSON 证据文件仍是事实源，入库失败仅记 warn）。
 */

/** 与 SyncSqlExecutor 同构的 SQL 执行器。 */
export type EvaluationSqlExecutor = {
	execute: (statement: string, parameters?: readonly unknown[]) => Promise<readonly Record<string, unknown>[]>;
};

/** 评估运行种类（plan 17.2 注释枚举）。 */
export type EvaluationRunKind = "retrieval" | "parameter" | "real" | "promptfoo";

/** 一条待写入的评估运行记录（id/createdAt 缺省时由仓储生成）。 */
export type EvaluationRunInsert = {
	id?: string;
	datasetVersion: string;
	kind: EvaluationRunKind;
	params?: unknown;
	metrics: unknown;
	corpusIsolation?: string | null;
};

/** 查询返回的评估运行记录（字段名与 API 输出一致）。 */
export type EvaluationRunRecord = {
	id: string;
	datasetVersion: string;
	kind: EvaluationRunKind;
	params: unknown;
	metrics: unknown;
	corpusIsolation: string | null;
	createdAt: string;
};

/** gold-set 内容哈希锚定题集版本：sha256 前 12 位（plan 17.2）。 */
export function computeDatasetVersion(content: string): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

const SELECT_COLUMNS =
	'id, dataset_version AS "datasetVersion", kind, params, metrics, corpus_isolation AS "corpusIsolation", created_at AS "createdAt"';

export type EvaluationRunsRepository = {
	insertEvaluationRun: (record: EvaluationRunInsert) => Promise<EvaluationRunRecord>;
	listEvaluationRuns: (options: { limit: number; cursor?: string }) => Promise<EvaluationRunRecord[]>;
	getEvaluationRunById: (id: string) => Promise<EvaluationRunRecord | undefined>;
};

/** 解码 keyset 游标：`${createdAt.toISOString()}|${id}`。 */
function decodeCursor(cursor: string): { createdAt: Date; id: string } {
	const separatorIndex = cursor.indexOf("|");
	const createdAtText = separatorIndex >= 0 ? cursor.slice(0, separatorIndex) : "";
	const id = separatorIndex >= 0 ? cursor.slice(separatorIndex + 1) : "";
	const createdAt = new Date(createdAtText);
	if (!createdAtText || !id || Number.isNaN(createdAt.getTime())) {
		throw new ApiHttpError(400, "INVALID_CURSOR", "cursor 非法，应为上次响应最后一行的 createdAt|id。");
	}
	return { createdAt, id };
}

/** 创建评估运行仓储；所有外部连接通过 executor 注入。 */
export function createEvaluationRunsRepository(options: {
	executor: EvaluationSqlExecutor;
	idFactory?: () => string;
	clock?: () => Date;
}): EvaluationRunsRepository {
	const idFactory = options.idFactory ?? (() => `evalrun-${randomUUID()}`);
	const clock = options.clock ?? (() => new Date());

	return {
		insertEvaluationRun: async (record) => {
			const kind = record.kind;
			if (!["retrieval", "parameter", "real", "promptfoo"].includes(kind)) {
				throw new ApiHttpError(400, "INVALID_KIND", `kind 非法: ${String(kind)}`);
			}
			if (!record.datasetVersion.trim()) {
				throw new ApiHttpError(400, "INVALID_DATASET_VERSION", "datasetVersion 必须非空。");
			}
			const id = record.id ?? idFactory();
			const rows = await options.executor.execute(
				`INSERT INTO evaluation_runs (id, dataset_version, kind, params, metrics, corpus_isolation, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)
				 RETURNING ${SELECT_COLUMNS}`,
				[
					id,
					record.datasetVersion,
					kind,
					record.params === undefined ? null : JSON.stringify(record.params),
					JSON.stringify(record.metrics),
					record.corpusIsolation ?? null,
					clock(),
				],
			);
			return rows[0] as unknown as EvaluationRunRecord;
		},

		listEvaluationRuns: async ({ limit, cursor }) => {
			if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
				throw new ApiHttpError(400, "INVALID_LIMIT", "limit 必须是 1-100 的整数。");
			}
			if (cursor === undefined) {
				return (await options.executor.execute(
					`SELECT ${SELECT_COLUMNS} FROM evaluation_runs ORDER BY created_at DESC, id DESC LIMIT $1`,
					[limit],
				)) as unknown as EvaluationRunRecord[];
			}
			const decoded = decodeCursor(cursor);
			return (await options.executor.execute(
				`SELECT ${SELECT_COLUMNS} FROM evaluation_runs WHERE (created_at, id) < ($2, $3) ORDER BY created_at DESC, id DESC LIMIT $1`,
				[limit, decoded.createdAt, decoded.id],
			)) as unknown as EvaluationRunRecord[];
		},

		getEvaluationRunById: async (id) => {
			if (!id.trim()) {
				throw new ApiHttpError(400, "INVALID_ID", "id 必须非空。");
			}
			const rows = await options.executor.execute(`SELECT ${SELECT_COLUMNS} FROM evaluation_runs WHERE id = $1`, [id]);
			return rows[0] as unknown as EvaluationRunRecord | undefined;
		},
	};
}

/** CLI 落库最佳努力辅助：从环境变量自建连接写入一行，失败仅 warn 不抛出。 */
export async function recordEvaluationRunFromEnv(
	record: EvaluationRunInsert,
	injectables: {
		databaseUrl?: string;
		createClient?: (databaseUrl: string) => {
			unsafe: (statement: string, parameters?: readonly unknown[]) => Promise<readonly Record<string, unknown>[]>;
			end: (options?: { timeout?: number }) => Promise<void>;
		};
		log?: (message: string) => void;
	} = {},
): Promise<{ written: boolean; id?: string; reason?: string }> {
	const databaseUrl = injectables.databaseUrl ?? process.env.NITRO_DATABASE_URL;
	const log = injectables.log ?? ((message) => console.warn(message));
	if (!databaseUrl?.trim()) {
		log("[evaluation-runs] 未配置 NITRO_DATABASE_URL，跳过评估运行落库（证据文件与 stdout 不受影响）。");
		return { written: false, reason: "missing-database-url" };
	}
	let client: ReturnType<NonNullable<typeof injectables.createClient>> | undefined;
	try {
		client = injectables.createClient
			? injectables.createClient(databaseUrl)
			: await (async () => {
					const { default: postgres } = await import("postgres");
					return postgres(databaseUrl) as unknown as NonNullable<
						ReturnType<NonNullable<typeof injectables.createClient>>
					>;
				})();
		const repository = createEvaluationRunsRepository({
			executor: { execute: (statement, parameters) => client!.unsafe(statement, parameters) },
		});
		const inserted = await repository.insertEvaluationRun(record);
		return { written: true, id: inserted.id };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log(`[evaluation-runs] 评估运行落库失败（不阻断评估输出）: ${message}`);
		return { written: false, reason: message };
	} finally {
		if (client) {
			try {
				await client.end({ timeout: 5 });
			} catch {}
		}
	}
}
