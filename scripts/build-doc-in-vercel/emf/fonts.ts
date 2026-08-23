/**
 * EMF 转换所需的字体注册模块。
 *
 * Vercel AL2023 构建容器内没有任何中文字体，EMF 内嵌中文文本必须依赖随包携带的
 * OFL 字体（assets/fonts/）经 GlobalFonts.registerFromPath 注册后才能正确渲染。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { consola } from "consola";
import { GlobalFonts } from "@napi-rs/canvas";

/**
 * 字体注册的别名。emf-converter 的 fontFamilyMap 通过该别名把 EMF 内部
 * 声明的字体名映射到实际注册的字体。
 */
const REGISTERED_FONT_ALIAS = "NotoSansSC";

/**
 * 字体资产目录（emf/assets/fonts/），基于当前模块位置解析，避免依赖 cwd。
 */
const fontsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "assets", "fonts");

/**
 * EMF 内部字体名 → 注册字体别名的映射表。
 *
 * emf-converter 契约要求键全部小写（内部以 `face.toLowerCase().trim()` 查表），
 * 因此中文键「宋体」等不做小写变换（无大小写概念），英文键必须小写。
 */
const explicitFontFamilyMap: Record<string, string> = {
	simsun: REGISTERED_FONT_ALIAS,
	宋体: REGISTERED_FONT_ALIAS,
	nsimsun: REGISTERED_FONT_ALIAS,
	新宋体: REGISTERED_FONT_ALIAS,
	黑体: REGISTERED_FONT_ALIAS,
	calibri: REGISTERED_FONT_ALIAS,
	cambria: REGISTERED_FONT_ALIAS,
	"courier new": REGISTERED_FONT_ALIAS,
	arial: REGISTERED_FONT_ALIAS,
	tahoma: REGISTERED_FONT_ALIAS,
	"franklin gothic book": REGISTERED_FONT_ALIAS,
	"segoe ui": REGISTERED_FONT_ALIAS,
	"microsoft yahei": REGISTERED_FONT_ALIAS,
	微软雅黑: REGISTERED_FONT_ALIAS,
	kaiti: REGISTERED_FONT_ALIAS,
	楷体: REGISTERED_FONT_ALIAS,
};

/**
 * EMF 内部字体名 → 注册字体别名的映射表。
 *
 * 除了保留实测字体名的显式条目，未知的字符串键也会解析到随包中文字体，
 * 避免 Vercel 容器把未映射的 faceName 交给缺少 CJK 字形的系统回退字体。
 */
export const fontFamilyMap: Record<string, string> = new Proxy(explicitFontFamilyMap, {
	get(target, property, receiver) {
		if (typeof property === "string" && !(property in target)) {
			return REGISTERED_FONT_ALIAS;
		}
		return Reflect.get(target, property, receiver);
	},
});

/**
 * ETO_GLYPH_INDEX 记录使用的源字体 glyph id 到 Unicode 字符映射。
 *
 * EMF 仅保存 glyph id，Canvas 无法直接按 glyph id 绘制。此表由当前文档集内
 * 使用的 Windows 原字体 cmap 反查得出，键必须与 EMF faceName 归一化结果一致。
 */
export const glyphIndexMap: Record<string, Record<number, string>> = {
	黑体: {
		263: "“",
		264: "”",
		266: "…",
		319: "∧",
		320: "∨",
		333: "≠",
	},
	calibri: {
		858: "‘",
		859: "’",
	},
};

/**
 * 注册随包携带的中文字体。
 *
 * 注册失败（文件缺失、字体损坏等）仅 consola.warn 不中断——字体缺失只影响
 * EMF 图片内文字渲染质量，不构成构建失败。
 */
export function registerEmfFonts(): void {
	const fontPath = path.join(fontsDir, "NotoSansSC-Regular.ttf");

	if (!existsSync(fontPath)) {
		consola.warn(`EMF 字体资产缺失: ${fontPath}，EMF 内嵌中文可能渲染为豆腐块`);
		return;
	}

	try {
		const result = GlobalFonts.registerFromPath(fontPath, REGISTERED_FONT_ALIAS);
		if (result === undefined || result === null) {
			consola.warn(`EMF 字体注册返回空结果: ${fontPath}`);
		}
	} catch (error) {
		consola.warn(`EMF 字体注册失败: ${(error as Error).message}`);
	}
}

/** 模块加载时自动注册一次 */
registerEmfFonts();
