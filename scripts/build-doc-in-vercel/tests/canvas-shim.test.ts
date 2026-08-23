import { describe, expect, test } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { installCanvasShim } from "../emf/canvas-shim";

/** 记录安装前的全局引用（幂等断言用） */
const documentBefore = globalThis.document;
const HTMLCanvasElementBefore = globalThis.HTMLCanvasElement;
const createImageBitmapBefore = globalThis.createImageBitmap;
const ImageDataBefore = globalThis.ImageData;

describe("canvas-shim 全局适配", () => {
	test("document.createElement('canvas') 返回可用 canvas", () => {
		const canvas = (
			globalThis.document as unknown as { createElement: () => ReturnType<typeof createCanvas> }
		).createElement("canvas");
		expect(canvas).toBeDefined();
		const ctx = canvas.getContext("2d");
		expect(ctx).not.toBeNull();
		expect(() => {
			canvas.width = 100;
			canvas.height = 50;
		}).not.toThrow();
		expect(canvas.width).toBe(100);
		expect(canvas.height).toBe(50);
	});

	test("重复安装幂等：二次执行不抛错、全局引用不漂移", () => {
		expect(() => installCanvasShim()).not.toThrow();
		expect(globalThis.document).toBe(documentBefore);
		expect(globalThis.HTMLCanvasElement).toBe(HTMLCanvasElementBefore);
		expect(globalThis.createImageBitmap).toBe(createImageBitmapBefore);
		expect(globalThis.ImageData).toBe(ImageDataBefore);
	});

	test("instanceof 分派成立：createCanvas 产物 instanceof HTMLCanvasElement 为 true", () => {
		const canvas = createCanvas(10, 10);
		const HTMLCanvasElement = globalThis.HTMLCanvasElement as unknown as new () => HTMLCanvasElement;
		expect(canvas instanceof HTMLCanvasElement).toBe(true);
	});

	test("createImageBitmap 消费 Blob 返回可 drawImage 且带 close() 的对象", async () => {
		const canvas = createCanvas(10, 10);
		const ctx = canvas.getContext("2d");
		// 构造 2x2 红色 PNG Blob
		const red = createCanvas(2, 2);
		const redCtx = red.getContext("2d");
		redCtx.fillStyle = "#ff0000";
		redCtx.fillRect(0, 0, 2, 2);
		const pngBuffer = red.toBuffer("image/png");
		const blob = new Blob([pngBuffer], { type: "image/png" });

		const bitmap = await (
			globalThis.createImageBitmap as unknown as (
				blob: Blob,
			) => Promise<{ width: number; height: number; close: () => void }>
		)(blob);
		expect(bitmap.width).toBeGreaterThan(0);
		expect(bitmap.height).toBeGreaterThan(0);
		// emf-converter 在 drawImage 后调用 bitmap.close()，必须为可调用 no-op
		expect(typeof bitmap.close).toBe("function");
		expect(() => bitmap.close()).not.toThrow();
		// 5 参数 drawImage 可消费
		expect(() =>
			ctx.drawImage(bitmap as unknown as Parameters<typeof ctx.drawImage>[0], 0, 0, 2, 2, 0, 0, 2, 2),
		).not.toThrow();
	});

	test("未注入 OffscreenCanvas 全局（保证走 HTML 分支）", () => {
		expect(typeof OffscreenCanvas).toBe("undefined");
	});

	test("canvas toDataURL('image/png') 输出 dataURL 前缀", () => {
		const canvas = createCanvas(4, 4);
		const dataUrl = canvas.toDataURL("image/png") as unknown as string;
		expect(dataUrl.startsWith("data:image/png")).toBe(true);
	});

	test("ImageData 全局存在且可构造", () => {
		const ImageDataGlobal = globalThis.ImageData as unknown as new (width: number, height: number) => unknown;
		expect(() => new ImageDataGlobal(1, 1)).not.toThrow();
	});
});
