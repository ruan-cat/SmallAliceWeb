import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test, vi } from "vitest";

type DrizzleConfigModule = typeof import("../drizzle.config") & {
	drizzleDevelopmentEnvPath?: string;
	loadDevelopmentDrizzleEnv?: (envFilePath: string) => boolean;
	resolveNonPooledMigrationUrl?: (environment: NodeJS.ProcessEnv) => string;
};

async function importDrizzleConfig(url = "postgres://test-migration.example/rag"): Promise<DrizzleConfigModule> {
	vi.resetModules();
	vi.stubEnv("POSTGRES_URL_NON_POOLING", url);
	return (await import("../drizzle.config")) as DrizzleConfigModule;
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("RAG Drizzle migration configuration", () => {
	test("does not require a migration URL or read local env files while running under Vitest", async () => {
		vi.stubEnv("NODE_ENV", "test");
		vi.stubEnv("VITEST", "true");
		vi.stubEnv("POSTGRES_URL_NON_POOLING", "");

		vi.resetModules();
		await expect(import("../drizzle.config")).resolves.toBeDefined();
	});

	test("probes the repository root .env.local by default", async () => {
		const drizzleConfig = await importDrizzleConfig();
		const packageRoot = dirname(fileURLToPath(import.meta.url));

		expect(drizzleConfig.drizzleDevelopmentEnvPath).toBe(join(packageRoot, "..", "..", "..", ".env.local"));
	});

	test("rejects pooled and generic URLs when the non-pooled migration URL is absent", async () => {
		const drizzleConfig = await importDrizzleConfig();

		expect(drizzleConfig.resolveNonPooledMigrationUrl).toBeTypeOf("function");
		expect(() =>
			drizzleConfig.resolveNonPooledMigrationUrl?.({
				POSTGRES_URL: "postgres://pooled.example/rag",
			}),
		).toThrow("POSTGRES_URL_NON_POOLING");
	});

	test("returns only the non-pooled migration URL after trimming whitespace", async () => {
		const drizzleConfig = await importDrizzleConfig();

		expect(drizzleConfig.resolveNonPooledMigrationUrl).toBeTypeOf("function");
		expect(
			drizzleConfig.resolveNonPooledMigrationUrl?.({
				POSTGRES_URL: "postgres://pooled.example/rag",
				POSTGRES_URL_NON_POOLING: "  postgres://migration.example/rag  ",
			}),
		).toBe("postgres://migration.example/rag");
	});

	test("skips a supplied local env file in a test environment", async () => {
		const drizzleConfig = await importDrizzleConfig();
		expect(drizzleConfig.loadDevelopmentDrizzleEnv).toBeTypeOf("function");
		const directory = await mkdtemp(join(tmpdir(), "ai-rag-drizzle-"));
		const envFilePath = join(directory, ".env.local");

		try {
			vi.stubEnv("NODE_ENV", "test");
			vi.stubEnv("POSTGRES_URL_NON_POOLING", "test-sentinel");
			await writeFile(envFilePath, "POSTGRES_URL_NON_POOLING=postgres://migration.example/rag\n", "utf8");

			expect(drizzleConfig.loadDevelopmentDrizzleEnv?.(envFilePath)).toBe(false);
			expect(process.env.POSTGRES_URL_NON_POOLING).toBe("test-sentinel");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
