import { describe, expect, test } from "vitest";
import { colorSchemeToCssVars, deriveColorScheme, hexToHsl, hslToHex } from "../theme/color-utils";

describe("deriveColorScheme", () => {
	test("从 hex 颜色派生 11 个色阶", () => {
		const scheme = deriveColorScheme("#3b82f6");
		expect(scheme).toHaveProperty("lighter");
		expect(scheme).toHaveProperty("light");
		expect(scheme).toHaveProperty("lightSubtle");
		expect(scheme).toHaveProperty("medium");
		expect(scheme).toHaveProperty("mediumSubtle");
		expect(scheme).toHaveProperty("strongerLight");
		expect(scheme).toHaveProperty("strong");
		expect(scheme).toHaveProperty("stronger");
		expect(scheme).toHaveProperty("textBold");
		expect(scheme).toHaveProperty("textSubtle");
		expect(scheme).toHaveProperty("textColorOnPrimary");
		// 共 11 个字段
		expect(Object.keys(scheme)).toHaveLength(11);
		// 所有色阶统一为 #rrggbb hex 格式
		for (const value of Object.values(scheme)) {
			expect(value).toMatch(/^#[a-f\d]{6}$/);
		}
	});

	test("深色品牌色派生的 textColorOnPrimary 为白色", () => {
		const scheme = deriveColorScheme("#1a1a2e");
		expect(scheme.textColorOnPrimary).toBe("#ffffff");
	});

	test("浅色品牌色派生的 textColorOnPrimary 为黑色", () => {
		const scheme = deriveColorScheme("#fbbf24");
		expect(scheme.textColorOnPrimary).toBe("#000000");
	});

	test("3 位 hex 简写也能正确派生", () => {
		const scheme = deriveColorScheme("#abc");
		// #abc 等价于 #aabbcc
		expect(scheme.strong).toBe(deriveColorScheme("#aabbcc").strong);
	});

	test("8 位 hex（带 alpha）派生时忽略 alpha 分量", () => {
		const scheme = deriveColorScheme("#3b82f680");
		expect(scheme.strong).toBe(deriveColorScheme("#3b82f6").strong);
	});

	test("rgb 格式输入也能正确派生", () => {
		const scheme = deriveColorScheme("rgb(59, 130, 246)");
		expect(scheme.strong).toMatch(/^#/);
		// 与等价 hex 输入的派生结果一致
		expect(scheme.strong).toBe(deriveColorScheme("#3b82f6").strong);
	});

	test("rgb 分量超出 0-255 时钳制后派生", () => {
		const scheme = deriveColorScheme("rgb(300, 130, 246)");
		expect(scheme.strong).toMatch(/^#[a-f\d]{6}$/);
	});

	test("hsl 格式输入也能正确派生", () => {
		const scheme = deriveColorScheme("hsl(217, 91%, 60%)");
		expect(scheme.strong).toMatch(/^#[a-f\d]{6}$/);
	});

	test("无效颜色输入抛出错误", () => {
		expect(() => deriveColorScheme("not-a-color")).toThrow();
	});
});

describe("hexToHsl / hslToHex", () => {
	test("hex → hsl → hex 往返转换保持一致", () => {
		const original = "#3b82f6";
		const hsl = hexToHsl(original);
		const result = hslToHex(hsl.h, hsl.s, hsl.l);
		// 允许极小误差（实际精确还原）
		expect(result.toLowerCase()).toBe(original.toLowerCase());
	});

	test("hexToHsl 返回 0-360 / 0-100 范围内的分量", () => {
		const hsl = hexToHsl("#3b82f6");
		expect(hsl.h).toBeGreaterThanOrEqual(0);
		expect(hsl.h).toBeLessThanOrEqual(360);
		expect(hsl.s).toBeGreaterThan(0);
		expect(hsl.s).toBeLessThanOrEqual(100);
		expect(hsl.l).toBeGreaterThan(0);
		expect(hsl.l).toBeLessThanOrEqual(100);
	});

	test("灰色（delta 为 0）的色相与饱和度为 0", () => {
		const hsl = hexToHsl("#808080");
		expect(hsl.h).toBe(0);
		expect(hsl.s).toBe(0);
	});

	test("hslToHex 对超界 h 取模、超界 s/l 钳制", () => {
		// h=360 等价于 h=0；s 超界钳制到 100；l 超下界钳制到 0
		expect(hslToHex(360, 150, 50)).toBe(hslToHex(0, 100, 50));
		expect(hslToHex(-60, 150, -10)).toBe(hslToHex(300, 100, 0));
	});

	test("覆盖色相各区间段的基本色转换", () => {
		expect(hslToHex(0, 100, 50)).toBe("#ff0000");
		expect(hslToHex(60, 100, 50)).toBe("#ffff00");
		expect(hslToHex(120, 100, 50)).toBe("#00ff00");
		expect(hslToHex(180, 100, 50)).toBe("#00ffff");
		expect(hslToHex(240, 100, 50)).toBe("#0000ff");
		expect(hslToHex(300, 100, 50)).toBe("#ff00ff");
	});

	test("hexToHsl 对非 hex 输入抛出错误", () => {
		expect(() => hexToHsl("rgb(0, 0, 0)")).toThrow();
		expect(() => hexToHsl("not-a-color")).toThrow();
	});
});

describe("colorSchemeToCssVars", () => {
	test("默认前缀生成 --ai-chat-* 变量，且包含 --ai-chat-primary", () => {
		const scheme = deriveColorScheme("#3b82f6");
		const vars = colorSchemeToCssVars(scheme);
		expect(vars).toHaveProperty("--ai-chat-primary");
		expect(vars["--ai-chat-primary"]).toMatch(/^#/);
		// 11 个色阶全部映射为 CSS 变量
		expect(Object.keys(vars)).toHaveLength(11);
		// 语义键映射正确：strong→primary、stronger→primary-hover、light→surface-light
		expect(vars["--ai-chat-primary"]).toBe(scheme.strong);
		expect(vars["--ai-chat-primary-hover"]).toBe(scheme.stronger);
		expect(vars["--ai-chat-surface-light"]).toBe(scheme.light);
	});

	test("自定义前缀生效", () => {
		const vars = colorSchemeToCssVars(deriveColorScheme("#3b82f6"), "my-brand");
		expect(vars).toHaveProperty("--my-brand-primary");
		expect(vars).not.toHaveProperty("--ai-chat-primary");
	});
});
