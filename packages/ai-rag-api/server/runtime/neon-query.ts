import { neon } from "@neondatabase/serverless";

export type QuerySqlClient = {
	unsafe: (statement: string, parameters?: readonly unknown[]) => Promise<readonly Record<string, unknown>[]>;
	end: (options?: { timeout?: number }) => Promise<void>;
};

/** 把 Neon HTTP 查询包装成现有 postgres.js `unsafe` 调用形状。 */
export function createNeonQueryClient(databaseUrl: string): QuerySqlClient {
	const sql = neon(databaseUrl);
	return {
		async unsafe(statement, parameters = []) {
			const rows = await sql.query(statement, [...parameters]);
			return rows as readonly Record<string, unknown>[];
		},
		async end() {},
	};
}
