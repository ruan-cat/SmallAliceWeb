import { getCurrentScope, onScopeDispose, ref, type Ref } from "vue";

/** useThemeColor 的返回结构 */
export interface ThemeColorState {
	/** 当前主色调（运行时获取的 Teek/VitePress 主题色，未就绪时为默认色） */
	primary: Ref<string>;
	/** 当前是否为暗色模式（来自 html.dark class） */
	isDark: Ref<boolean>;
	/** 运行时主题色是否就绪（已成功读取到有效值；false 时手动 primaryBrandColor 仍可生效） */
	isReady: Ref<boolean>;
}

/** 默认品牌色：与 useBrandTheme 的 DEFAULT_BRAND_COLOR 对齐 */
const DEFAULT_PRIMARY = "#3b82f6";

/**
 * 运行时获取 Teek/VitePress 宿主主题色。
 *
 * 通过 getComputedStyle 读取 CSS 变量的实际计算值，并通过 MutationObserver
 * 监听 html 元素的 class / theme-color / data-theme 属性变化，
 * 实现宿主主题色与暗色模式切换时自动同步。
 *
 * 种子色优先级：**Teek `--tk-theme-color` → VitePress `--vp-c-brand-1` → 默认 `#3b82f6`**。
 *
 * SSR 安全：服务端渲染时不访问 document / MutationObserver，
 * 所有响应式 ref 保持初始默认值，`isReady` 保持 false，使消费者可通过该标志
 * 决定是否使用运行时主题色或回退到手动 primaryBrandColor。
 *
 * observer 仅在存在活动 Vue effect 作用域（组件 setup / effectScope）时创建，
 * 并经 onScopeDispose 挂靠作用域清理；无活动作用域时不创建，避免泄漏。
 *
 * @example
 * ```ts
 * // 在 Vue 组件 setup 内：
 * const { primary, isDark, isReady } = useThemeColor();
 * watchEffect(() => {
 *   if (isReady.value) console.log('当前主题色:', primary.value);
 * });
 * ```
 */
export function useThemeColor(): ThemeColorState {
	const primary = ref(DEFAULT_PRIMARY);
	const isDark = ref(false);
	const isReady = ref(false);

	/**
	 * 从 DOM 读取当前主题色与暗色状态。
	 *
	 * @returns 是否解析到有效主题色（Teek / VitePress 任一来源命中即为 true）
	 */
	function readThemeColor(): boolean {
		if (typeof document === "undefined") return false;

		const root = document.documentElement;
		const computed = getComputedStyle(root);
		const tkColor = computed.getPropertyValue("--tk-theme-color").trim();
		const vpColor = computed.getPropertyValue("--vp-c-brand-1").trim();

		// 每个来源独立校验：空值与未解析的 var(...) token 视为无效，
		// 继续尝试下一来源，避免把垃圾值传给下游色板派生。
		const candidate = [tkColor, vpColor].find((value) => value && !value.startsWith("var("));
		if (candidate) {
			primary.value = candidate;
			isReady.value = true;
		}

		// 无论颜色是否解析成功，只要 document 存在就同步暗色状态。
		isDark.value = root.classList.contains("dark");
		return candidate !== undefined;
	}

	// 调用时立即读取一次；SSR 下有 document 守卫，直接跳过。
	readThemeColor();

	// 仅在活动 effect 作用域内创建 observer，并经 onScopeDispose 挂靠清理；
	// 无活动作用域（模块顶层、普通测试等）时不创建，避免 observer 泄漏。
	if (typeof document !== "undefined" && typeof MutationObserver === "function" && getCurrentScope()) {
		let observer: MutationObserver | null = new MutationObserver(() => readThemeColor());
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "theme-color", "data-theme"],
		});
		onScopeDispose(() => {
			observer?.disconnect();
			observer = null;
		});
	}

	return { primary, isDark, isReady };
}
