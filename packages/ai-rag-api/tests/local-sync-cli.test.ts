import { describe, expect, test, vi } from "vitest";
import { createLocalKnowledgeWatch, executeLocalKnowledgeSync } from "../server/cli/local-sync";

describe("本地知识同步 CLI", () => {
	test("默认执行真实同步，并将同一 runtime sync 结果输出为 JSON", async () => {
		const sync = vi.fn(async (input: { dryRun: boolean }) => ({ status: "succeeded", dryRun: input.dryRun }));
		const write = vi.fn();

		const exitCode = await executeLocalKnowledgeSync([], {
			createRuntime: async () => ({ sync }),
			write,
		});

		expect(exitCode).toBe(0);
		expect(sync).toHaveBeenCalledWith({ dryRun: false });
		expect(JSON.parse(write.mock.calls[0]?.[0] ?? "")).toEqual({ status: "succeeded", dryRun: false });
	});

	test("--dry-run 只透传给同一 runtime 同步服务", async () => {
		const sync = vi.fn(async (input: { dryRun: boolean }) => ({ dryRun: input.dryRun }));

		await executeLocalKnowledgeSync(["--dry-run"], {
			createRuntime: async () => ({ sync }),
			write: vi.fn(),
		});

		expect(sync).toHaveBeenCalledWith({ dryRun: true });
	});

	test("接受 pnpm 透传的 -- 分隔符", async () => {
		const sync = vi.fn(async (input: { dryRun: boolean }) => ({ dryRun: input.dryRun }));

		await executeLocalKnowledgeSync(["--", "--dry-run"], {
			createRuntime: async () => ({ sync }),
			write: vi.fn(),
		});

		expect(sync).toHaveBeenCalledWith({ dryRun: true });
	});

	test("文件变更去抖后只调用一次同一同步执行器，并可关闭 watcher", async () => {
		let onChange!: () => void;
		const close = vi.fn();
		const run = vi.fn(async () => undefined);
		const watcher = createLocalKnowledgeWatch({
			debounceMs: 1,
			run,
			sourceRoot: "docs/docx",
			watch: (_path, _options, listener) => {
				onChange = listener;
				return { close };
			},
		});

		onChange();
		onChange();
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(run).toHaveBeenCalledTimes(1);
		watcher.close();
		expect(close).toHaveBeenCalledTimes(1);
	});
});
