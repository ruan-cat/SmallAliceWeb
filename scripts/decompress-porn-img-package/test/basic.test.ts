import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	deleteDirtyRecursive,
	isArchiveCandidate,
	moveFilesToRoot,
} from "../src/index.js";

async function createTempDir(): Promise<string> {
	return fs.mkdtemp(path.join(os.tmpdir(), "decompress-test-"));
}

describe("archive candidate selection", () => {
	it("accepts纯数字命名压缩包", () => {
		expect(isArchiveCandidate("031.gz", false)).toBe(true);
		expect(isArchiveCandidate("125.zip", false)).toBe(true);
	});

	it("拒绝混合命名除非允许", () => {
		expect(isArchiveCandidate("022咬.gz", false)).toBe(false);
		expect(isArchiveCandidate("022咬.gz", true)).toBe(true);
	});
});

describe("dirty file cleanup", () => {
	it("删除脏文件并保留正常文件", async () => {
		const dir = await createTempDir();
		const dirty = path.join(dir, "孔雀海");
		const clean = path.join(dir, "keep.txt");
		await fs.writeFile(dirty, "bad");
		await fs.writeFile(clean, "good");

		await deleteDirtyRecursive(dir, ["孔雀海"]);

		await expect(fs.access(dirty)).rejects.toBeTruthy();
		await expect(fs.readFile(clean, "utf-8")).resolves.toBe("good");
	});
});

describe("move files to root", () => {
	it("将深层文件上移并清理空目录", async () => {
		const dir = await createTempDir();
		const deepDir = path.join(dir, "031", "nested");
		await fs.mkdir(deepDir, { recursive: true });
		const deepFile = path.join(deepDir, "a.jpg");
		await fs.writeFile(deepFile, "x");

		await moveFilesToRoot(path.join(dir, "031"));

		const rootFile = path.join(dir, "031", "a.jpg");
		await expect(fs.readFile(rootFile, "utf-8")).resolves.toBe("x");
		// 确认深层目录被清理
		await expect(fs.readdir(deepDir)).rejects.toBeTruthy();
	});
});

