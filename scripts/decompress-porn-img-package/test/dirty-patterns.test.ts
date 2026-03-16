import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { DEFAULT_CONFIG, type ResolvedConfig, deleteDirtyRecursive, organizeFolder } from "../src/index.js";

async function createTempDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), "decompress-dirty-patterns-"));
}

function createConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
	return {
		...DEFAULT_CONFIG,
		dirtyFiles: [],
		dirtyFilePatterns: ["*.mp4"],
		...overrides,
	};
}

describe("dirty file pattern cleanup", () => {
	test("deletes files matched by suffix patterns", async () => {
		const dir = await createTempDir();
		const nestedDir = path.join(dir, "nested");
		const keptFile = path.join(dir, "cover.jpg");
		const removedFile = path.join(dir, "clip.mp4");
		const removedNestedFile = path.join(nestedDir, "trailer.MP4");

		await fs.mkdir(nestedDir, { recursive: true });
		await fs.writeFile(keptFile, "image");
		await fs.writeFile(removedFile, "video");
		await fs.writeFile(removedNestedFile, "video");

		await deleteDirtyRecursive(dir, [], ["*.mp4"]);

		await expect(fs.readFile(keptFile, "utf-8")).resolves.toBe("image");
		await expect(fs.access(removedFile)).rejects.toBeTruthy();
		await expect(fs.access(removedNestedFile)).rejects.toBeTruthy();
	});

	test("removes the product root when only dirty pattern files remain", async () => {
		const dir = await createTempDir();
		const productDir = path.join(dir, "228");
		const nestedDir = path.join(productDir, "only-video");
		const removedFile = path.join(nestedDir, "clip.mp4");

		await fs.mkdir(nestedDir, { recursive: true });
		await fs.writeFile(removedFile, "video");

		await organizeFolder(productDir, createConfig());

		await expect(fs.access(productDir)).rejects.toBeTruthy();
	});
});
