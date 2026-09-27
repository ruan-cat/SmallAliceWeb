import { getCurrentScope, onBeforeUnmount, onMounted, ref, type Ref } from "vue";

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
 * 从 getComputedStyle 读取 CSS 变量值，trim 后过滤空字符串与未解析的 `var(...)` token。
 *
 * @param root document.documentElement
 * @param variableName 形如 `--tk-theme-color` 的 CSS 变量名
 * @returns 已 trim 的有效值，或 null
 */
function readCssVariable(root: HTMLElement, variableName: string): string | null {
	const raw = getComputedStyle(root).getPropertyValue(variableName).trim();
	if (!raw) return null;
	// getComputedStyle 可能返回原始声明中的 `var(...)` 字符串（当变量未定义时），
	// 这种值无法用于色板派生，需过滤掉避免把垃圾值传给下游。
	if (raw.startsWith("var(")) return null;
	return raw;
}

/**
 * 运行时获取 Teek/VitePress 主题色。
 *
 * 通过 getComputedStyle 读取 CSS 变量的实际计算值，并通过 MutationObserver
 * 监听 html 元素的 class 和 attribute 变化，实现主题色切换时自动更新。
 *
 * 种子色优先级：**Teek `--tk-theme-color` → VitePress `--vp-c-brand-1` → 默认 `#3b82f6`**。
 *
 * SSR 安全：服务端渲染时不访问 window / document / MutationObserver，
 * 所有响应式 ref 保持初始默认值，`isReady` 保持 false，使消费者可通过该标志
 * 决定是否使用运行时主题色或回退到手动 primaryBrandColor。
 *
 * 应在 Vue 组件 setup 内调用；observer 生命周期与当前组件一致。
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

	let observer: MutationObserver | null = null;

	/** 从 DOM 读取当前主题色。SSR 下空操作。 */
	function readThemeColor() {
		if (typeof document === "undefined") return;

		const root = document.documentElement;
		const tkColor =
			readCssVariable(root, "--tk-theme-color") ??
			readCssVariable(root, "--tk-color-primary") ??
			readCssVariable(root, "--tk-el-color-primary");
		const vpColor = readCssVariable(root, "--vp-c-brand-1");

		const next = tkColor ?? vpColor;
		if (next) {
			primary.value = next;
			isReady.value = true;
		}

		isDark.value = root.classList.contains("dark");
	}

	/** 注册 MutationObserver 监听主题色/暗色模式切换。 */
	function installObserver() {
		if (typeof document === "undefined" || observer) return;

		observer = new MutationObserver((mutations) => {
			for (const mutation of mutations) {
				if (
					mutation.type === "attributes" &&
					(mutation.attributeName === "class" ||
						mutation.attributeName === "theme-color" ||
						mutation.attributeName === "data-theme")
				) {
					readThemeColor();
					break;
				}
			}
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class", "theme-color", "data-theme"],
		});
	}

	// 仅在 Vue effect 作用域内（组件 setup）注册生命周期钩子；
	// 在 setup 外调用时 onMounted/onBeforeUnmount 会触发 Vue 警告，
	// 此处跳过注册并直接一次性读取主题色，isReady 保持 false 使手动色仍可生效。
	if (getCurrentScope()) {
		onMounted(() => {
			readThemeColor();
			installObserver();
		});

		onBeforeUnmount(() => {
			observer?.disconnect();
			observer = null;
		});
	} else {
		readThemeColor();
	}

	return { primary, isDark, isReady };
}
