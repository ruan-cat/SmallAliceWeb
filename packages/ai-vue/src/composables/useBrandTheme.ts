import { computed, type ComputedRef, type Ref } from "vue";
import { colorSchemeToCssVars, deriveColorScheme } from "../theme/color-utils";
import { DEFAULT_BRAND_COLOR, defaultTheme } from "../theme/default-theme";
import type { BrandThemeConfig, ColorScheme, IkpTheme } from "../theme/types";
import { useThemeColor } from "./useThemeColor";

/** useBrandTheme 的返回结构 */
export interface UseBrandThemeReturn {
	/** 种子品牌色（运行时获取的 Teek/VitePress 主题色优先；未就绪时回退到用户传入或默认色） */
	seedColor: ComputedRef<string>;
	/** 完整色板（种子色派生结果叠加用户精细覆盖） */
	colorScheme: ComputedRef<ColorScheme>;
	/** 主题令牌（默认令牌按类目合并用户覆盖） */
	theme: ComputedRef<IkpTheme>;
	/** CSS 变量对象，可直接绑定到 style 属性 */
	cssVars: ComputedRef<Record<string, string>>;
	/** CSS 变量前缀 */
	prefix: ComputedRef<string>;
	/** 当前是否为暗色模式（来自 html.dark class，未就绪时为 false） */
	isDark: Ref<boolean>;
	/** 运行时主题色是否就绪（false 时手动 primaryBrandColor 仍可生效） */
	isReady: Ref<boolean>;
}

/**
 * 从品牌色配置派生主题系统。
 *
 * 种子色优先级（**P1.5 新增运行时通道**）：
 * **有效运行时 Teek/VitePress 色 → 用户 `primaryBrandColor` → `DEFAULT_BRAND_COLOR`**。
 * 当运行时主题色就绪（isReady=true）时，使用 useThemeColor 的 primary；否则回退到
 * 用户手动传入或默认品牌色。SSR / 非 Vue setup 调用场景下 isReady 恒为 false，
 * 此时行为与 P1 完全一致。
 *
 * @param config 品牌主题配置（可选）
 * @returns 响应式主题上下文
 * @throws 当最终种子色无法解析时抛出错误（由 deriveColorScheme 决定）
 *
 * @example
 * ```ts
 * const { cssVars, isDark } = useBrandTheme({
 *   primaryBrandColor: '#3784ff',
 *   organizationDisplayName: '钻头文档',
 * });
 * // 在 template 中：<div :style="cssVars">
 * ```
 */
export function useBrandTheme(config?: BrandThemeConfig): UseBrandThemeReturn {
	const prefix = computed(() => config?.prefix ?? "ai-chat");

	// P1.5：从运行时获取 Teek/VitePress 主题色与暗色状态。
	const { primary: runtimePrimary, isDark, isReady } = useThemeColor();

	const seedColor = computed(() => {
		// 优先级：有效运行时色 > 手动传入 > 默认品牌色
		if (isReady.value && runtimePrimary.value) {
			return runtimePrimary.value;
		}
		return config?.primaryBrandColor ?? DEFAULT_BRAND_COLOR;
	});

	const colorScheme = computed<ColorScheme>(() => {
		const derived = deriveColorScheme(seedColor.value);
		// 用户精细覆盖优先，未覆盖的色阶保留派生结果
		return { ...derived, ...config?.colorSchemeOverrides };
	});

	const theme = computed<IkpTheme>(() => {
		const override = config?.theme;
		// 按类目合并：用户只覆盖个别令牌时不丢失默认令牌中的其余项
		return {
			colors: { ...defaultTheme.colors, ...override?.colors },
			fontFamily: { ...defaultTheme.fontFamily, ...override?.fontFamily },
			fontSize: { ...defaultTheme.fontSize, ...override?.fontSize },
			zIndex: { ...defaultTheme.zIndex, ...override?.zIndex },
		};
	});

	const cssVars = computed<Record<string, string>>(() => {
		const schemeVars = colorSchemeToCssVars(colorScheme.value, prefix.value);
		const themeVars = flattenThemeToCssVars(theme.value, prefix.value);
		return { ...schemeVars, ...themeVars };
	});

	return { seedColor, colorScheme, theme, cssVars, prefix, isDark, isReady };
}

/** 将主题令牌展平为 CSS 变量，变量名为 `--{prefix}-{类目}-{令牌名}` */
function flattenThemeToCssVars(theme: IkpTheme, prefix: string): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const [category, tokens] of Object.entries(theme)) {
		for (const [tokenName, value] of Object.entries(tokens)) {
			vars[`--${prefix}-${category}-${tokenName}`] = String(value);
		}
	}
	return vars;
}
