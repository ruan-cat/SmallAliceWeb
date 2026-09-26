/**
 * 默认主题令牌。
 *
 * 令牌按 `IkpTheme` 四类目组织（colors/fontFamily/fontSize/zIndex），
 * 经 `flattenThemeToCssVars` 展平为 `--{prefix}-{类目}-{令牌名}` 形式的 CSS 变量，
 * 因此所有令牌名统一使用 kebab-case，保证拼接后的变量名合法且可读。
 *
 * 默认值与 `styles/index.scss` 中组件当前的 fallback 保持一致：
 * 在品牌化主题接入前，默认令牌不会改变组件的现有视觉表现。
 */

import type { IkpTheme } from "./types";

/** 默认品牌色（与 AiChat 当前 fallback 一致） */
export const DEFAULT_BRAND_COLOR = "#3b82f6";

/** 默认主题令牌 */
export const defaultTheme: IkpTheme = {
	colors: {
		// 品牌主色系
		primary: "#3b82f6",
		"primary-hover": "#60a5fa",
		"primary-contrast": "#ffffff",
		"primary-soft": "rgb(59 130 246 / 12%)",
		// 表面层
		surface: "#111318",
		"surface-muted": "#171a21",
		"surface-elevated": "#1d222b",
		// 文字层
		text: "#f4f7fb",
		"text-muted": "#9aa4b2",
		// 边框层
		border: "rgb(255 255 255 / 10%)",
		"border-strong": "rgb(255 255 255 / 16%)",
		// 反馈层
		focus: "rgb(96 165 250 / 40%)",
		shadow: "rgb(0 0 0 / 34%)",
		success: "#22c55e",
		danger: "#ef4444",
	},
	fontFamily: {
		// 默认继承宿主页面字体，与组件当前 `font: inherit` 行为一致
		base: "inherit",
		// Markdown 代码块等等宽场景使用
		mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
	},
	fontSize: {
		xs: "0.75rem",
		sm: "0.8125rem",
		md: "0.875rem",
		base: "0.9375rem",
		lg: "1.25rem",
	},
	zIndex: {
		// 悬浮按钮触发器与停靠面板的层级
		floating: 1000,
	},
};
