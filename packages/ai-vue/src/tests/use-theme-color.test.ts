import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { effectScope, nextTick, type EffectScope } from "vue";
import { useThemeColor } from "../composables/useThemeColor";

/** 构造 getComputedStyle 的替身返回值：仅支持 getPropertyValue 查询，未声明变量返回空串。 */
function mockComputedStyle(props: Record<string, string>) {
	return { getPropertyValue: (name: string) => props[name] ?? "" };
}

/** 注入 getComputedStyle mock；返回 props 引用，便于用例内动态修改计算值。 */
function spyComputedStyle(initial: Record<string, string> = {}) {
	const props: Record<string, string> = { ...initial };
	const spy = vi
		.spyOn(window, "getComputedStyle")
		.mockReturnValue(mockComputedStyle(props) as unknown as CSSStyleDeclaration);
	return { props, spy };
}

/** 已创建待清理的 effectScope 集合，afterEach 统一 stop 以断开 observer。 */
const activeScopes: EffectScope[] = [];

/** 在活动 effectScope 内调用 useThemeColor，模拟组件 setup 场景；observer 会随 scope.stop() 断开。 */
function useInScope(initial?: Record<string, string>) {
	const { props } = spyComputedStyle(initial);
	const scope = effectScope();
	activeScopes.push(scope);
	let state!: ReturnType<typeof useThemeColor>;
	scope.run(() => {
		state = useThemeColor();
	});
	return { props, state, scope };
}

/** 清空 documentElement 上可能影响读取的 class 与主题属性，避免用例间污染。 */
function cleanDocumentElement() {
	document.documentElement.className = "";
	document.documentElement.removeAttribute("theme-color");
	document.documentElement.removeAttribute("data-theme");
}

beforeEach(() => {
	cleanDocumentElement();
});

afterEach(() => {
	for (const scope of activeScopes.splice(0)) scope.stop();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	cleanDocumentElement();
});

describe("useThemeColor 主题色读取", () => {
	test("Teek 色优先于 VitePress 色", () => {
		const { state } = useInScope({ "--tk-theme-color": "#3784ff", "--vp-c-brand-1": "#16a34a" });

		expect(state.primary.value).toBe("#3784ff");
		expect(state.isReady.value).toBe(true);
	});

	test("Teek 缺失时降级 --vp-c-brand-1", () => {
		const { state } = useInScope({ "--vp-c-brand-1": "#16a34a" });

		expect(state.primary.value).toBe("#16a34a");
		expect(state.isReady.value).toBe(true);
	});

	test("两者缺失时 primary 保持默认且 isReady=false", () => {
		const { state } = useInScope();

		expect(state.primary.value).toBe("#3b82f6");
		expect(state.isReady.value).toBe(false);
	});

	test("值为未解析 var(...) token 时被忽略并降级到下一来源", () => {
		const { state } = useInScope({ "--tk-theme-color": "var(--x)", "--vp-c-brand-1": "#16a34a" });

		expect(state.primary.value).toBe("#16a34a");
		expect(state.isReady.value).toBe(true);
	});

	test("html.dark 初始检测 isDark=true", () => {
		document.documentElement.classList.add("dark");
		const { state } = useInScope();

		expect(state.isDark.value).toBe(true);
	});
});

describe("useThemeColor 作用域内响应式同步", () => {
	test("theme-color 属性变化后 primary 响应式更新", async () => {
		const { props, state } = useInScope();
		expect(state.isReady.value).toBe(false);

		props["--tk-theme-color"] = "#0ea5e9";
		document.documentElement.setAttribute("theme-color", "#0ea5e9");
		await nextTick();

		expect(state.primary.value).toBe("#0ea5e9");
		expect(state.isReady.value).toBe(true);
	});

	test("class 属性变化后 isDark 响应式更新", async () => {
		const { state } = useInScope();
		expect(state.isDark.value).toBe(false);

		document.documentElement.classList.add("dark");
		await nextTick();
		expect(state.isDark.value).toBe(true);

		document.documentElement.classList.remove("dark");
		await nextTick();
		expect(state.isDark.value).toBe(false);
	});

	test("scope.stop() 之后 mutation 不再更新（observer 已断开）", async () => {
		const { props, state, scope } = useInScope();
		scope.stop();

		props["--tk-theme-color"] = "#22c55e";
		document.documentElement.setAttribute("theme-color", "#22c55e");
		await nextTick();

		expect(state.primary.value).toBe("#3b82f6");
		expect(state.isReady.value).toBe(false);
	});
});

describe("useThemeColor 作用域外与 SSR 环境", () => {
	test("无活动作用域时返回默认值且不创建 observer", () => {
		const state = useThemeColor();

		expect(state.primary.value).toBe("#3b82f6");
		expect(state.isDark.value).toBe(false);
		expect(state.isReady.value).toBe(false);
	});

	test("多次调用不触发 Vue 警告（不注册无效生命周期钩子）", () => {
		const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		useThemeColor();
		useThemeColor();

		expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining("[Vue warn]"));
	});

	test("SSR：document 不存在时直接返回默认值且不抛错", () => {
		vi.stubGlobal("document", undefined);

		expect(() => useThemeColor()).not.toThrow();
		const state = useThemeColor();
		expect(state.primary.value).toBe("#3b82f6");
		expect(state.isReady.value).toBe(false);
	});
});
