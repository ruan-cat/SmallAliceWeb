/**
 * emf-converter 库在 Node 环境运行所需的浏览器全局适配层。
 *
 * emf-converter 获取 canvas 的优先级是全局 OffscreenCanvas → document.createElement("canvas")，
 * 输出导出用 instanceof 分派。本 shim 必须走 HTMLCanvasElement/document 路径，
 * 因此禁止注入 OffscreenCanvas 全局。
 *
 * 执行中实测修正（2026-08-23，详见 change 工件 design.md §3.1 与 agent-findings.md）：
 * 1. napi Canvas 原型不可变：`Object.setPrototypeOf(Canvas.prototype, ...)` 静默不生效
 *    （实例原型链固定为 CanvasElement → Object），instanceof 分派必须改用
 *    `Symbol.hasInstance` 自定义判定，否则 convertEmfToDataUrl 一律返回 null；
 * 2. napi drawImage 原生类型检查：仅接受 CanvasElement/SVGCanvas/Image，Proxy 包装的
 *    Image 会被类型检查拒绝抛 TypeError，且该错误会被 emf-converter 的 deferred image
 *    try/catch 静默吞掉导致位图不绘制——必须直接给 Image 实例挂 close 属性，禁止 Proxy。
 */
import { Canvas, createCanvas, ImageData, loadImage, SvgExportFlag } from "@napi-rs/canvas";

/**
 * 安装标记存放于 globalThis 上的键名。
 * 用于保证安装幂等：重复调用无副作用、引用不漂移。
 */
const SHIM_INSTALLED_FLAG = "__emfCanvasShimInstalled__";

/**
 * 安装 emf-converter 所需的浏览器全局适配层。
 *
 * 补齐四个全局（编号与「执行中实测修正」对应，见模块头注释）：
 * 1. document —— 提供 createElement 方法返回 napi canvas（emf-converter 拿到 canvas 后自行赋 width/height）
 * 2. HTMLCanvasElement —— 通过 Symbol.hasInstance 使 napi Canvas 实例通过 instanceof 分派
 * 3. createImageBitmap —— 用 napi loadImage 解码 Blob，并给实例直接挂 no-op 的 close()
 * 4. ImageData —— Node 22 无此原生全局，挂 @napi-rs/canvas 导出的 ImageData 类
 */
export function installCanvasShim(): void {
	const globalTarget = globalThis as typeof globalThis & {
		__emfCanvasShimInstalled__?: boolean;
		document?: unknown;
		HTMLCanvasElement?: unknown;
		createImageBitmap?: unknown;
		ImageData?: unknown;
		__emfCreateSvgCanvas?: unknown;
	};

	/** 已安装则直接返回，保证幂等 */
	if (globalTarget.__emfCanvasShimInstalled__) {
		return;
	}

	/**
	 * document 全局：若不存在则创建最小实现。
	 * emf-converter 拿到 canvas 后自行赋 width/height，这里返回 1x1 画布即可。
	 */
	if (typeof globalTarget.document === "undefined") {
		globalTarget.document = {
			/** 创建一个 napi canvas 画布元素 */
			createElement: () => createCanvas(1, 1),
		};
	}

	/**
	 * HTMLCanvasElement 全局：定义空类并通过 Symbol.hasInstance 使 instanceof 分派成立。
	 *
	 * 实测 @napi-rs/canvas 的 Canvas.prototype 是 napi 不可变内部原型：
	 * Object.setPrototypeOf(Canvas.prototype, HTMLCanvasElement.prototype) 会静默不生效
	 * （实例原型链仍为 CanvasElement → Object）。因此改在空类上定义 Symbol.hasInstance，
	 * 让 `canvas instanceof HTMLCanvasElement` 走自定义判定（candidate instanceof Canvas）。
	 */
	if (typeof globalTarget.HTMLCanvasElement === "undefined") {
		class HTMLCanvasElement {}
		Object.defineProperty(HTMLCanvasElement, Symbol.hasInstance, {
			/** 自定义 instanceof 判定：napi Canvas 实例即视为 HTMLCanvasElement */
			value: (candidate: unknown): boolean => candidate instanceof Canvas,
			configurable: true,
		});
		globalTarget.HTMLCanvasElement = HTMLCanvasElement;
	}

	/**
	 * createImageBitmap 全局：用 napi loadImage 解码 Blob 字节。
	 * emf-converter 在 drawImage 后调用 bitmap.close()，而 napi Image 类没有 close 方法，
	 * 因此用 Proxy 附加 no-op 的 close()。
	 */
	if (typeof globalTarget.createImageBitmap === "undefined") {
		globalTarget.createImageBitmap = async (blob: Blob) => {
			const img = await loadImage(Buffer.from(await blob.arrayBuffer()));
			/**
			 * 直接给实例挂 close 属性，不做 Proxy 包装：
			 * napi 的 drawImage 对参数做原生类型检查（仅接受 CanvasElement/SVGCanvas/Image），
			 * Proxy 包装的 Image 会被类型检查拒绝抛 TypeError；而 emf-converter 的 deferred
			 * image 绘制包在 try/catch 中，该错误会被静默吞掉导致位图不绘制。
			 * 实例挂属性不影响原生类型判定，close 调用方（emf-converter drawImage 后调用）
			 * 拿到 no-op 函数即可。
			 */
			(img as unknown as Record<string, unknown>).close = () => {};
			return img;
		};
	}

	/**
	 * ImageData 全局：Node 22 无此原生全局。
	 * emf-converter 的 DIB 位图解码主路径调用 new ImageData(...)，
	 * 挂 @napi-rs/canvas 导出的 ImageData 类。
	 */
	if (typeof globalTarget.ImageData === "undefined") {
		globalTarget.ImageData = ImageData;
	}

	/** SVG 主画布工厂仅供 patched emf-converter 的显式 SVG API 使用。 */
	if (typeof globalTarget.__emfCreateSvgCanvas === "undefined") {
		globalTarget.__emfCreateSvgCanvas = (width: number, height: number) =>
			createCanvas(width, height, SvgExportFlag.ConvertTextToPaths);
	}

	globalTarget.__emfCanvasShimInstalled__ = true;
}

/** 模块加载时自动安装一次 */
installCanvasShim();
