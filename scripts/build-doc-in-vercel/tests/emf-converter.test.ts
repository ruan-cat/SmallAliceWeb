import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "@napi-rs/canvas";
import { convertEmfToPng } from "../emf/convert";
import { fontFamilyMap } from "../emf/fonts";

/** fixtures 目录绝对路径（基于当前模块位置解析，不依赖 cwd） */
const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/** 读取 fixture 文件为 Buffer */
function readFixture(name: string): Buffer {
	return readFileSync(path.join(fixturesDir, name));
}

/** 从 PNG Buffer 读取 IHDR 中的像素宽高（PNG 宽高字段为网络字节序/大端） */
function pngDimensions(png: Buffer): { width: number; height: number } {
	expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
	const width = png.readUInt32BE(16);
	const height = png.readUInt32BE(20);
	return { width, height };
}

describe("convertEmfToPng 转换封装", () => {
	test("经典 EMF 样本转换为非空 PNG", async () => {
		const png = await convertEmfToPng(readFixture("classic.emf"));
		expect(png).not.toBeNull();
		expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		expect(png.length).toBeGreaterThan(500);
	});

	test("EMF+ dual 样本转换为非空 PNG", async () => {
		const png = await convertEmfToPng(readFixture("emfplus-dual.emf"));
		expect(png).not.toBeNull();
		expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		// 长度下限：含位图/图表记录的输出不应是空白小图
		expect(png.length).toBeGreaterThan(2000);
	});

	test("WMF 样本分流到 convertWmfToDataUrl 并输出 PNG", async () => {
		const png = await convertEmfToPng(readFixture("classic.wmf"));
		expect(png).not.toBeNull();
		expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	});

	test("截断的 EMF 输入不抛异常（emf-converter 对 record 流截断容错，输出残片 PNG）", async () => {
		await expect(convertEmfToPng(readFixture("broken-trunc.emf"))).resolves.toBeDefined();
		const png = await convertEmfToPng(readFixture("broken-trunc.emf"));
		expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	});

	test("随机字节输入抛出异常", async () => {
		await expect(convertEmfToPng(readFixture("garbage.bin"))).rejects.toThrow();
	});

	test("PNG 字节（非 EMF 魔数）输入抛出异常", async () => {
		await expect(convertEmfToPng(readFixture("not-emf.png"))).rejects.toThrow();
	});

	test("空 buffer 抛出异常", async () => {
		await expect(convertEmfToPng(Buffer.alloc(0))).rejects.toThrow();
		await expect(convertEmfToPng(Buffer.from([0x01, 0x00]))).rejects.toThrow();
	});

	test("超大尺寸样本（frame 头改写变体）被 maxCanvasDimension 钳制不崩溃", async () => {
		// 正常返回或抛出可控错误均可，进程不得崩溃
		await expect(convertEmfToPng(readFixture("oversize.emf"))).resolves.toBeDefined();
	});

	test("maxWidth/maxHeight 限制生效", async () => {
		const png = await convertEmfToPng(readFixture("classic.emf"), { maxWidth: 200, maxHeight: 200 });
		const { width, height } = pngDimensions(png);
		expect(width).toBeLessThanOrEqual(200);
		expect(height).toBeLessThanOrEqual(200);
	});

	test("fontFamilyMap 含中文字体映射时文字样本不抛错", async () => {
		const png = await convertEmfToPng(readFixture("text-sample.emf"), { fontFamilyMap });
		expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	});

	test("真实 offDx 文本记录按字符定位绘制", async () => {
		const prototype = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d")) as {
			fillText: (text: string, ...args: unknown[]) => unknown;
		};
		const originalFillText = prototype.fillText;
		const calls: string[] = [];
		prototype.fillText = function (this: unknown, text: string, ...args: unknown[]) {
			calls.push(text);
			return originalFillText.call(this, text, ...args);
		};

		try {
			await convertEmfToPng(readFixture("skill-window-offdx.emf"), { fontFamilyMap });
		} finally {
			prototype.fillText = originalFillText;
		}

		expect(calls).toHaveLength(17);
		expect(calls.every((text) => text.length === 1)).toBe(true);
	});

	test("mapping-mode 文本不重复扣减 header bounds", async () => {
		const prototype = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d")) as {
			fillText: (text: string, ...args: unknown[]) => unknown;
		};
		const originalFillText = prototype.fillText;
		const calls: Array<{ text: string; x: number; y: number }> = [];
		prototype.fillText = function (this: unknown, text: string, ...args: unknown[]) {
			calls.push({ text, x: Number(args[0]), y: Number(args[1]) });
			return originalFillText.call(this, text, ...args);
		};

		try {
			const png = await convertEmfToPng(readFixture("title-mapping-origin.emf"), { fontFamilyMap });
			expect(pngDimensions(png)).toEqual({ width: 841, height: 335 });
		} finally {
			prototype.fillText = originalFillText;
		}

		expect(calls[0]).toMatchObject({ text: "D" });
		expect(calls[0].x).toBeCloseTo(339.018, 3);
		expect(calls[0].y).toBeCloseTo(211.648, 3);
	});

	test("真实 ETO_GLYPH_INDEX 文本按源字体映射为 Unicode", async () => {
		const prototype = Object.getPrototypeOf(createCanvas(1, 1).getContext("2d")) as {
			fillText: (text: string, ...args: unknown[]) => unknown;
		};
		const originalFillText = prototype.fillText;
		const calls: string[] = [];
		prototype.fillText = function (this: unknown, text: string, ...args: unknown[]) {
			calls.push(text);
			return originalFillText.call(this, text, ...args);
		};

		try {
			await convertEmfToPng(readFixture("asset-library-glyph-index.emf"), {
				fontFamilyMap,
				glyphIndexMap: { 黑体: { 266: "…" } },
			} as Parameters<typeof convertEmfToPng>[1]);
		} finally {
			prototype.fillText = originalFillText;
		}

		expect(calls.filter((text) => text === "…")).toHaveLength(2);
		expect(calls).not.toContain("Ċ");
	});
});
