import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, SvgExportFlag } from "@napi-rs/canvas";
import sharp from "sharp";
import { convertEmfToPng, convertEmfToSvg } from "../emf/convert";
import { fontFamilyMap } from "../emf/fonts";

/** fixtures 目录绝对路径（基于当前模块位置解析，不依赖 cwd） */
const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

/** 读取 fixture 文件为 Buffer */
function readFixture(name: string): Buffer {
	return readFileSync(path.join(fixturesDir, name));
}

/** 将 EMF+ comment 改为无副作用的 EMR_SETICMMODE，用于验证 Dual 文件仅回放 GDI 回退层。 */
function asGdiFallback(buffer: Buffer): Buffer {
	const fallback = Buffer.from(buffer);
	for (let offset = 0; offset + 8 <= fallback.length; ) {
		const recordType = fallback.readUInt32LE(offset);
		const recordSize = fallback.readUInt32LE(offset + 4);
		if (recordSize < 8 || offset + recordSize > fallback.length) {
			break;
		}
		if (recordType === 70) {
			fallback.writeUInt32LE(98, offset);
		}
		offset += recordSize;
	}
	return fallback;
}

/** 从 PNG Buffer 读取 IHDR 中的像素宽高（PNG 宽高字段为网络字节序/大端） */
function pngDimensions(png: Buffer): { width: number; height: number } {
	expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
	const width = png.readUInt32BE(16);
	const height = png.readUInt32BE(20);
	return { width, height };
}

/** 读取 SVG 根元素，缺少根元素时直接使测试失败 */
function svgRoot(svg: Buffer): string {
	const root = svg.toString("utf8").match(/<svg\b[^>]*>/)?.[0];
	expect(root).toBeDefined();
	return root as string;
}

/** 捕获 SVG Canvas 上游回放真正提交给 fillText 的文本与坐标 */
async function captureSvgFillText(action: () => Promise<void>): Promise<Array<{ text: string; x: number; y: number }>> {
	const prototype = Object.getPrototypeOf(createCanvas(1, 1, SvgExportFlag.ConvertTextToPaths).getContext("2d")) as {
		fillText: (text: string, ...args: unknown[]) => unknown;
	};
	const originalFillText = prototype.fillText;
	const calls: Array<{ text: string; x: number; y: number }> = [];
	prototype.fillText = function (this: unknown, text: string, ...args: unknown[]) {
		calls.push({ text, x: Number(args[0]), y: Number(args[1]) });
		return originalFillText.call(this, text, ...args);
	};

	try {
		await action();
	} finally {
		prototype.fillText = originalFillText;
	}

	return calls;
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

	test("EMF+ dual 样本导出带 viewBox 的真实矢量 SVG，而不是整图 PNG 外壳", async () => {
		const svg = await convertEmfToSvg(readFixture("emfplus-dual.emf"), { fontFamilyMap });
		const root = svgRoot(svg);

		expect(root).toContain('xmlns="http://www.w3.org/2000/svg"');
		expect(root).toMatch(/viewBox="0 0 806 397"/);
		expect(svg.toString("utf8")).toContain("<path");
	});

	test("SVG POC 保留 mapping-mode frame 与首字坐标", async () => {
		const calls = await captureSvgFillText(async () => {
			const svg = await convertEmfToSvg(readFixture("title-mapping-origin.emf"), { fontFamilyMap });
			expect(svgRoot(svg)).toMatch(/viewBox="0 0 841 335"/);
		});

		expect(calls[0]).toMatchObject({ text: "D" });
		expect(calls[0].x).toBeCloseTo(339.018, 3);
		expect(calls[0].y).toBeCloseTo(211.648, 3);
	});

	test("SVG POC 逐字符保留 offDx 定位", async () => {
		const calls = await captureSvgFillText(async () => {
			await convertEmfToSvg(readFixture("skill-window-offdx.emf"), { fontFamilyMap });
		});

		expect(calls).toHaveLength(17);
		expect(calls.every((call) => call.text.length === 1)).toBe(true);
	});

	test("SVG POC 在文字轮廓化前消费 ETO_GLYPH_INDEX 映射", async () => {
		const calls = await captureSvgFillText(async () => {
			await convertEmfToSvg(readFixture("asset-library-glyph-index.emf"), {
				fontFamilyMap,
				glyphIndexMap: { 黑体: { 266: "…" } },
			});
		});

		expect(calls.filter((call) => call.text === "…")).toHaveLength(2);
		expect(calls.map((call) => call.text)).not.toContain("Ċ");
	});

	test("高级角色肖像关系图保持与 GDI+ 一致的不透明白色画布", async () => {
		const png = await convertEmfToPng(readFixture("portrait-high-contrast.emf"), { fontFamilyMap });
		const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

		for (let index = 3; index < data.length; index += 4) {
			expect(data[index]).toBe(255);
		}
	});

	test("EMF+ Dual 关系图只回放 GDI 回退层，避免与 EMF+ 图元双重错位", async () => {
		const dual = readFixture("portrait-high-contrast.emf");
		const gdiFallback = asGdiFallback(dual);
		const dualPng = await convertEmfToPng(dual, { fontFamilyMap });
		const fallbackPng = await convertEmfToPng(gdiFallback, { fontFamilyMap });

		expect(createHash("sha256").update(dualPng).digest("hex")).toBe(
			createHash("sha256").update(fallbackPng).digest("hex"),
		);
	});

	test("ROP3 DIB 掩膜不导出为地图活动镜头 SVG 的点阵 use 图元", async () => {
		const svg = await convertEmfToSvg(readFixture("map-camera-rop3.emf"), { fontFamilyMap });
		const content = svg.toString("utf8");

		expect(svgRoot(svg)).toMatch(/viewBox="0 0 1024 241"/);
		expect(content).toContain('fill="#4F88BB"');
		expect(content.match(/<image\b/g) ?? []).toHaveLength(0);
		expect(content.match(/<use\b/g) ?? []).toHaveLength(0);
	});
});
