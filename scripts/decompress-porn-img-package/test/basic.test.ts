import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deleteDirtyRecursive, isArchiveCandidate, moveFilesToRoot } from "../src/index.js";
import { generateNumberRange, detectPhase } from "../src/phase-detector.js";
import { findDeepestContentDir } from "../src/folder-organizer.js";
import { ProcessPhase } from "../src/types.js";

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
		await expect(fs.readdir(deepDir)).rejects.toBeTruthy();
	});
});

describe("generateNumberRange", () => {
	it("生成正确的范围数组", () => {
		expect(generateNumberRange({ start: 213, end: 215 })).toEqual([213, 214, 215]);
	});

	it("start 等于 end 时返回单元素数组", () => {
		expect(generateNumberRange({ start: 100, end: 100 })).toEqual([100]);
	});
});

describe("detectPhase - 智能阶段识别", () => {
	it("识别压缩包文件为 DECOMPRESS 阶段", async () => {
		const dir = await createTempDir();
		const archivePath = path.join(dir, "221.gz");
		await fs.writeFile(archivePath, "fake archive");

		const result = await detectPhase(dir, 221);

		expect(result).not.toBeNull();
		expect(result!.phase).toBe(ProcessPhase.DECOMPRESS);
		expect(result!.number).toBe(221);
		expect(result!.name).toBe("221.gz");
	});

	it("识别文件夹为 ORGANIZE 阶段", async () => {
		const dir = await createTempDir();
		const folderPath = path.join(dir, "213");
		await fs.mkdir(folderPath);

		const result = await detectPhase(dir, 213);

		expect(result).not.toBeNull();
		expect(result!.phase).toBe(ProcessPhase.ORGANIZE);
		expect(result!.number).toBe(213);
	});

	it("编号不存在时返回 null", async () => {
		const dir = await createTempDir();

		const result = await detectPhase(dir, 999);

		expect(result).toBeNull();
	});

	it("压缩包优先于文件夹被识别", async () => {
		const dir = await createTempDir();
		const archivePath = path.join(dir, "100.zip");
		await fs.writeFile(archivePath, "archive");
		const folderPath = path.join(dir, "100");
		await fs.mkdir(folderPath);

		const result = await detectPhase(dir, 100);

		expect(result).not.toBeNull();
		expect(result!.phase).toBe(ProcessPhase.DECOMPRESS);
	});
});

describe("findDeepestContentDir - 深层目录检测", () => {
	it("检测嵌套的单目录结构", async () => {
		const dir = await createTempDir();
		const root = path.join(dir, "213");
		const nested1 = path.join(root, "某某 - NO.213 xxx");
		const nested2 = path.join(nested1, "某某 - NO.213 xxx");
		await fs.mkdir(nested2, { recursive: true });
		await fs.writeFile(path.join(nested2, "01.jpg"), "img");
		await fs.writeFile(path.join(nested2, "02.jpg"), "img");

		const { deepestDir, detectedName } = await findDeepestContentDir(root);

		expect(deepestDir).toBe(nested2);
		expect(detectedName).toBe("某某 - NO.213 xxx");
	});

	it("扁平结构时返回自身", async () => {
		const dir = await createTempDir();
		const root = path.join(dir, "100");
		await fs.mkdir(root);
		await fs.writeFile(path.join(root, "01.jpg"), "img");
		await fs.writeFile(path.join(root, "02.jpg"), "img");

		const { deepestDir, detectedName } = await findDeepestContentDir(root);

		expect(deepestDir).toBe(root);
		expect(detectedName).toBeNull();
	});
});
