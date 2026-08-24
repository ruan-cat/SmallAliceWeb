import { describe, expect, test } from "vitest";
import { createReservedSyncExecutor, createSyncExecutor } from "../server/plugins/rag";

describe("createSyncExecutor", () => {
	test("保留连接缺少 begin() 时，在同一连接上提交事务", async () => {
		const statements: string[] = [];
		const executor = createSyncExecutor({
			unsafe: async (statement: string) => {
				statements.push(statement);
				return [];
			},
		});

		await executor.transaction(async (transaction) => {
			await transaction.execute("SELECT 1", []);
		});

		expect(statements).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
	});

	test("保留连接内的操作失败时回滚并重新抛出原始错误", async () => {
		const statements: string[] = [];
		const executor = createSyncExecutor({
			unsafe: async (statement: string) => {
				statements.push(statement);
				return [];
			},
		});

		await expect(
			executor.transaction(async () => {
				throw new Error("transaction failure");
			}),
		).rejects.toThrow("transaction failure");

		expect(statements).toEqual(["BEGIN", "ROLLBACK"]);
	});
});

describe("createReservedSyncExecutor", () => {
	test("每次保留同步会话时创建独立 client，并在释放后关闭它", async () => {
		const created: number[] = [];
		const released: number[] = [];
		const ended: number[] = [];
		const executor = createReservedSyncExecutor(() => {
			const id = created.length + 1;
			created.push(id);
			return {
				reserve: async () => ({
					unsafe: async () => [],
					release: () => {
						released.push(id);
					},
				}),
				end: async () => {
					ended.push(id);
				},
			};
		});

		const first = await executor.reserve?.();
		const second = await executor.reserve?.();
		await first?.release();
		await second?.release();

		expect(created).toEqual([1, 2]);
		expect(released).toEqual([1, 2]);
		expect(ended).toEqual([1, 2]);
	});
});
