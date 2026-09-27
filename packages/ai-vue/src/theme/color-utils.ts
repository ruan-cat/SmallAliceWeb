/**
 * 品牌色派生工具：零依赖的纯 TypeScript 颜色处理。
 *
 * 设计目标（对应 plan 第二章 2.3 节）：
 * - 输入一个品牌色（hex/rgb/hsl），派生出完整 11 色阶色板；
 * - 所有派生输出统一为 `#rrggbb` hex 字符串，便于 CSS 变量与 vepx themeOverrides 消费；
 * - 无效颜色输入直接抛错（不静默兜底），避免主题异常被掩盖。
 *
 * 算法核心：RGB ↔ HSL 空间互转，通过调整明度（Lightness）生成不同色阶。
 */

import type { ColorScheme } from "./types";

/** RGB 分量 */
interface Rgb {
	/** 红 0-255 */
	r: number;
	/** 绿 0-255 */
	g: number;
	/** 蓝 0-255 */
	b: number;
}

/** HSL 分量（h 取值 0-360，s/l 取值 0-100，保留小数精度） */
interface Hsl {
	/** 色相 0-360 */
	h: number;
	/** 饱和度 0-100 */
	s: number;
	/** 明度 0-100 */
	l: number;
}

/** 无效颜色输入的错误信息模板 */
const INVALID_COLOR_MESSAGE = `无法解析颜色值：`;

/** 解析 3/6/8 位 hex 颜色（#abc、#aabbcc、#aabbccdd），失败返回 null */
function parseHex(hex: string): Rgb | null {
	const match = hex.match(/^#([a-f\d]{3}|[a-f\d]{6}|[a-f\d]{8})$/i);
	if (!match) return null;

	const raw = match[1];
	// 3 位简写展开为 6 位
	const normalized =
		raw.length === 3
			? raw
					.split("")
					.map((char) => char + char)
					.join("")
			: raw.slice(0, 6);
	return {
		r: parseInt(normalized.slice(0, 2), 16),
		g: parseInt(normalized.slice(2, 4), 16),
		b: parseInt(normalized.slice(4, 6), 16),
	};
}

/** 解析 rgb()/rgba() 颜色（逗号或空格分隔均可），失败返回 null；分量超范围时钳制到 0-255 */
function parseRgbFunction(color: string): Rgb | null {
	const match = color.match(/^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/i);
	if (!match) return null;
	const clampChannel = (value: string) => Math.min(parseInt(value, 10), 255);
	return {
		r: clampChannel(match[1]),
		g: clampChannel(match[2]),
		b: clampChannel(match[3]),
	};
}

/** 解析 hsl()/hsla() 颜色（逗号或空格分隔均可），失败返回 null */
function parseHslFunction(color: string): Hsl | null {
	const match = color.match(/^hsla?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)%?\s*[,/ ]\s*([\d.]+)%?/i);
	if (!match) return null;
	return {
		h: parseFloat(match[1]),
		s: parseFloat(match[2]),
		l: parseFloat(match[3]),
	};
}

/** HSL 转 RGB（输入 h 0-360，s/l 0-100，输出 0-255） */
function hslToRgb(h: number, s: number, l: number): Rgb {
	const hNorm = (((h % 360) + 360) % 360) / 60;
	const sNorm = Math.min(Math.max(s, 0), 100) / 100;
	const lNorm = Math.min(Math.max(l, 0), 100) / 100;
	const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
	const x = c * (1 - Math.abs((hNorm % 2) - 1));
	const m = lNorm - c / 2;

	let rPrime = 0;
	let gPrime = 0;
	let bPrime = 0;
	if (hNorm < 1) {
		rPrime = c;
		gPrime = x;
	} else if (hNorm < 2) {
		rPrime = x;
		gPrime = c;
	} else if (hNorm < 3) {
		gPrime = c;
		bPrime = x;
	} else if (hNorm < 4) {
		gPrime = x;
		bPrime = c;
	} else if (hNorm < 5) {
		rPrime = x;
		bPrime = c;
	} else {
		rPrime = c;
		bPrime = x;
	}
	return {
		r: Math.round((rPrime + m) * 255),
		g: Math.round((gPrime + m) * 255),
		b: Math.round((bPrime + m) * 255),
	};
}

/** RGB 转 HSL（输出 h 0-360，s/l 0-100，保留小数精度不做取整） */
function rgbToHsl(r: number, g: number, b: number): Hsl {
	const rNorm = r / 255;
	const gNorm = g / 255;
	const bNorm = b / 255;
	const max = Math.max(rNorm, gNorm, bNorm);
	const min = Math.min(rNorm, gNorm, bNorm);
	const delta = max - min;
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;
	if (delta !== 0) {
		s = delta / (1 - Math.abs(2 * l - 1));
		if (max === rNorm) h = ((gNorm - bNorm) / delta) % 6;
		else if (max === gNorm) h = (bNorm - rNorm) / delta + 2;
		else h = (rNorm - gNorm) / delta + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	return { h, s: s * 100, l: l * 100 };
}

/** RGB 序列化为 #rrggbb hex 字符串 */
function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (value: number) =>
		Math.round(Math.min(Math.max(value, 0), 255))
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 将 hex/rgb/hsl 颜色解析为 RGB 分量。
 * @param color 任意 CSS 颜色字符串（hex 3/6/8 位、rgb()/rgba()、hsl()/hsla()）
 * @returns RGB 分量
 * @throws 当颜色无法识别时抛出错误（不做静默兜底）
 */
function parseToRgb(color: string): Rgb {
	const trimmed = color.trim();
	const fromHex = parseHex(trimmed);
	if (fromHex) return fromHex;
	const fromRgb = parseRgbFunction(trimmed);
	if (fromRgb) return fromRgb;
	const fromHsl = parseHslFunction(trimmed);
	if (fromHsl) return hslToRgb(fromHsl.h, fromHsl.s, fromHsl.l);
	throw new Error(`${INVALID_COLOR_MESSAGE}"${color}"，支持的格式：hex（#abc/#aabbcc）、rgb()/rgba()、hsl()/hsla()`);
}

/**
 * 计算 WCAG 相对亮度（relative luminance）。
 * HSL 明度对黄/蓝的感知不一致（同明度的黄色显著更亮），
 * 判断"主色上该配黑字还是白字"必须使用感知亮度而非 HSL l。
 */
function relativeLuminance(r: number, g: number, b: number): number {
	const linearize = (value: number) => {
		const c = value / 255;
		return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** 判断颜色是否为浅色（感知亮度阈值 0.4，超过则主色上配黑字） */
function isLightColor(r: number, g: number, b: number): boolean {
	return relativeLuminance(r, g, b) > 0.4;
}

/**
 * hex 转 HSL。
 * 输出保留小数精度（不取整），保证 `hexToHsl` → `hslToHex` 往返一致。
 * @param hex hex 颜色（#abc、#aabbcc、#aabbccdd）
 * @returns HSL 分量
 * @throws 当颜色无法识别时抛出错误
 */
export function hexToHsl(hex: string): Hsl {
	const rgb = parseHex(hex.trim());
	if (!rgb) throw new Error(`${INVALID_COLOR_MESSAGE}"${hex}"，hexToHsl 仅支持 hex 格式`);
	return rgbToHsl(rgb.r, rgb.g, rgb.b);
}

/**
 * HSL 转 hex。
 * @param h 色相 0-360（支持小数，超出范围自动取模）
 * @param s 饱和度 0-100（支持小数，超出范围自动钳制）
 * @param l 明度 0-100（支持小数，超出范围自动钳制）
 * @returns #rrggbb hex 字符串（小写）
 */
export function hslToHex(h: number, s: number, l: number): string {
	const rgb = hslToRgb(h, s, l);
	return rgbToHex(rgb.r, rgb.g, rgb.b);
}

/**
 * 从单一品牌色派生完整色板。
 * 算法：将品牌色转为 HSL，通过调整明度生成 11 个色阶；
 * 主色上配黑字还是白字由 WCAG 相对亮度决定。
 * @param primaryBrandColor 品牌色（hex/rgb/hsl 均可，alpha 分量会被忽略）
 * @returns 完整色板（所有色阶均为 #rrggbb hex 字符串）
 * @throws 当品牌色无法解析时抛出错误
 */
export function deriveColorScheme(primaryBrandColor: string): ColorScheme {
	const { r, g, b } = parseToRgb(primaryBrandColor);
	const { h, s, l } = rgbToHsl(r, g, b);

	// 根据品牌色的感知亮度决定派生方向：浅色品牌色配黑字，深色品牌色配白字
	const isLight = isLightColor(r, g, b);

	return {
		lighter: hslToHex(h, Math.max(s - 5, 10), isLight ? 97 : 95),
		light: hslToHex(h, s, isLight ? 92 : 88),
		lightSubtle: hslToHex(h, s, isLight ? 88 : 82),
		medium: hslToHex(h, s, isLight ? 80 : 72),
		mediumSubtle: hslToHex(h, s, isLight ? 72 : 65),
		strongerLight: hslToHex(h, s, isLight ? 65 : 58),
		strong: hslToHex(h, s, l),
		stronger: hslToHex(h, s, Math.max(l - 8, 20)),
		textBold: hslToHex(h, Math.min(s + 10, 100), Math.max(Math.min(l - 35, 15), 0)),
		textSubtle: hslToHex(h, s, isLight ? 45 : 60),
		textColorOnPrimary: isLight ? "#000000" : "#ffffff",
	};
}

/**
 * 将色板转换为 CSS 变量对象。
 * 变量名为 `--{prefix}-{语义键}` 形式（语义键为 kebab-case），
 * 可直接通过 :style 绑定到组件根元素。
 *
 * 色板只负责 surface / primary 族变量。面板正文变量 `--{prefix}-text` 与
 * `--{prefix}-text-muted` 归组件样式（index.scss）所有（默认浅色文字配暗色面板），
 * 色阶 textBold / textSubtle 刻意不映射产出，避免默认无参使用时派生的深色文字
 * 内联覆盖暗色面板正文导致不可读。
 *
 * @param scheme 色板
 * @param prefix CSS 变量前缀，默认 'ai-chat'
 * @returns CSS 变量对象，如 { "--ai-chat-primary": "#3b82f6" }
 */
export function colorSchemeToCssVars(scheme: ColorScheme, prefix = "ai-chat"): Record<string, string> {
	const vars: Record<string, string> = {};
	const keyMap: Partial<Record<keyof ColorScheme, string>> = {
		lighter: "surface-lighter",
		light: "surface-light",
		lightSubtle: "surface-light-subtle",
		medium: "surface-medium",
		mediumSubtle: "surface-medium-subtle",
		strongerLight: "surface-stronger-light",
		strong: "primary",
		stronger: "primary-hover",
		textColorOnPrimary: "primary-contrast",
	};
	for (const [key, cssKey] of Object.entries(keyMap)) {
		vars[`--${prefix}-${cssKey}`] = scheme[key as keyof ColorScheme];
	}
	return vars;
}
