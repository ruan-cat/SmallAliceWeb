/**
 * 品牌化主题系统的类型定义。
 *
 * 本文件只承载类型契约，不包含运行时逻辑；
 * 颜色派生见 `color-utils.ts`，默认主题令牌见 `default-theme.ts`。
 */

/** 使用者提供的品牌色配置 */
export interface BrandThemeConfig {
	/** 主品牌色，任意 CSS 颜色值（hex/rgb/hsl） */
	primaryBrandColor: string;
	/** 组织展示名称，显示在头部等位置 */
	organizationDisplayName?: string;
	/** 精细覆盖特定色阶 */
	customColorScheme?: Partial<ColorScheme>;
	/** 主题令牌覆盖 */
	theme?: Partial<IkpTheme>;
	/** CSS 变量前缀，默认 'ai-chat' */
	prefix?: string;
	/** 颜色模式 */
	colorMode?: "light" | "dark" | "system";
}

/** 从品牌色派生的色板 */
export interface ColorScheme {
	/** 最浅背景色 */
	lighter: string;
	/** 浅色背景 */
	light: string;
	/** 浅色微妙 */
	lightSubtle: string;
	/** 中等背景 */
	medium: string;
	/** 中等微妙 */
	mediumSubtle: string;
	/** 较强浅色 */
	strongerLight: string;
	/** 强调色（按钮、链接） */
	strong: string;
	/** 最强强调色（悬停态） */
	stronger: string;
	/** 主文字色 */
	textBold: string;
	/** 次要文字色 */
	textSubtle: string;
	/** 主色上的文字色 */
	textColorOnPrimary: string;
}

/** 主题令牌系统 */
export interface IkpTheme {
	colors: Record<string, string>;
	fontFamily: Record<string, string>;
	fontSize: Record<string, string>;
	zIndex: Record<string, string | number>;
}
