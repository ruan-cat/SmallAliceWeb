import { describe, expect, test } from "vitest";
import { useBrandTheme } from "../composables/useBrandTheme";
import { DEFAULT_BRAND_COLOR, defaultTheme } from "../theme/default-theme";

describe("useBrandTheme", () => {
	test("使用传入的 primaryBrandColor 作为种子色", () => {
		const { seedColor } = useBrandTheme({ primaryBrandColor: "#ff0000" });
		expect(seedColor.value).toBe("#ff0000");
	});

	test("未传入 primaryBrandColor 时使用默认值 #3b82f6", () => {
		const { seedColor } = useBrandTheme();
		expect(seedColor.value).toBe("#3b82f6");
	});

	test("默认种子色等于 DEFAULT_BRAND_COLOR 常量", () => {
		const { seedColor } = useBrandTheme();
		expect(seedColor.value).toBe(DEFAULT_BRAND_COLOR);
	});

	test("colorSchemeOverrides 能覆盖派生的色阶", () => {
		const { colorScheme } = useBrandTheme({
			primaryBrandColor: "#3b82f6",
			colorSchemeOverrides: { strong: "#ff0000" },
		});
		expect(colorScheme.value.strong).toBe("#ff0000");
		// 其他色阶不受影响
		expect(colorScheme.value.lighter).not.toBe("#ff0000");
	});

	test("cssVars 返回可直接绑定到 style 的对象", () => {
		const { cssVars } = useBrandTheme({ primaryBrandColor: "#3b82f6" });
		expect(cssVars.value).toHaveProperty("--ai-chat-primary");
		expect(cssVars.value["--ai-chat-primary"]).toMatch(/^#/);
	});

	test("cssVars 同时包含色板变量与主题令牌展平变量", () => {
		const { cssVars } = useBrandTheme({ primaryBrandColor: "#3b82f6" });
		// 色板派生变量
		expect(cssVars.value).toHaveProperty("--ai-chat-primary-contrast");
		// 主题令牌变量：--{prefix}-{类目键原样}-{令牌名}（类目键为 camelCase，CSS 自定义属性区分大小写）
		expect(cssVars.value["--ai-chat-colors-primary"]).toBe(defaultTheme.colors.primary);
		expect(cssVars.value["--ai-chat-fontSize-md"]).toBe(defaultTheme.fontSize.md);
		// 非字符串令牌会被 String() 序列化
		expect(cssVars.value["--ai-chat-zIndex-floating"]).toBe("1000");
	});

	test("自定义 prefix 改变所有 CSS 变量前缀", () => {
		const { cssVars, prefix } = useBrandTheme({ prefix: "my-brand" });
		expect(prefix.value).toBe("my-brand");
		expect(cssVars.value).toHaveProperty("--my-brand-primary");
		expect(cssVars.value).not.toHaveProperty("--ai-chat-primary");
	});

	test("theme 按类目合并：覆盖单个令牌不丢失其他默认令牌", () => {
		const { theme } = useBrandTheme({
			theme: { colors: { primary: "#ff0000" } },
		});
		expect(theme.value.colors.primary).toBe("#ff0000");
		// 同类目下未覆盖的令牌保留默认值
		expect(theme.value.colors.surface).toBe(defaultTheme.colors.surface);
		// 其他类目不受影响
		expect(theme.value.fontFamily).toEqual(defaultTheme.fontFamily);
		expect(theme.value.fontSize).toEqual(defaultTheme.fontSize);
		expect(theme.value.zIndex).toEqual(defaultTheme.zIndex);
	});

	test("无效种子色时调用不抛错，读取 colorScheme 时惰性抛错", () => {
		const context = useBrandTheme({ primaryBrandColor: "not-a-color" });
		// 种子色只是透传，派生尚未发生
		expect(context.seedColor.value).toBe("not-a-color");
		// 首次读取派生结果才触发解析并抛出错误
		expect(() => context.colorScheme.value).toThrow();
	});

	test("无效种子色时读取 cssVars 同样抛错", () => {
		const { cssVars } = useBrandTheme({ primaryBrandColor: "not-a-color" });
		expect(() => cssVars.value).toThrow();
	});
});
