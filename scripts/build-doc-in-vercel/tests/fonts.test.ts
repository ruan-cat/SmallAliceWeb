import { describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fontFamilyMap, registerEmfFonts } from "../emf/fonts";
import { GlobalFonts } from "@napi-rs/canvas";

/** 字体资产目录（与 fonts.ts 的解析规则保持一致） */
const fontsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "emf", "assets", "fonts");

describe("字体注册与映射", () => {
	test("fontFamilyMap 键全部小写", () => {
		for (const key of Object.keys(fontFamilyMap)) {
			// emf-converter 契约：键为小写 face-name；中文键（如「宋体」）无大小写概念，直接通过
			expect(key).toBe(key.toLowerCase());
		}
	});

	test("必备映射覆盖 simsun/宋体/calibri/cambria", () => {
		for (const required of ["simsun", "宋体", "calibri", "cambria"]) {
			expect(fontFamilyMap).toHaveProperty(required);
			expect(typeof fontFamilyMap[required]).toBe("string");
			expect(fontFamilyMap[required].length).toBeGreaterThan(0);
		}
	});

	test("字体文件存在且注册函数不抛错", () => {
		const fontPath = path.join(fontsDir, "NotoSansSC-Regular.ttf");
		expect(existsSync(fontPath)).toBe(true);
		// 注册函数内部 catch 所有错误（资产缺失时仅 warn），调用不抛错
		expect(() => registerEmfFonts()).not.toThrow();
		// 注册后字体族可被 GlobalFonts 查询（幂等注册的既有结果）
		expect(GlobalFonts.families.some((f) => f.family === "NotoSansSC")).toBe(true);
	});
});
