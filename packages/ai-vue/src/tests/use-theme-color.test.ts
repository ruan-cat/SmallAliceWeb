import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp, defineComponent, nextTick, type App } from "vue";
import { useThemeColor } from "../composables/useThemeColor";

/** 通过 inline style 模拟 Teek / VitePress CSS 变量定义。jsdom 中 getComputedStyle 会读取 inline style。 */
function setThemeColorVariable(name: string, value: string) {
	document.documentElement.style.setProperty(name, value);
}

/** 清除全部已设置的 Teek / VitePress 变量，避免测试间相互污染。 */
function clearThemeColorVariables() {
	for (const name of ["--tk-theme-color", "--tk-color-primary", "--tk-el-color-primary", "--vp-c-brand-1"]) {
		document.documentElement.style.removeProperty(name);
	}
}

/** 捕获 setup 内 useThemeColor 返回的响应式状态；通过闭包读取真实引用。 */
function captureState() {
	const captured: { value: ReturnType<typeof useThemeColor> | null } = { value: null };
	const Probe = defineComponent({
		setup() {
			captured.value = useThemeColor();
			return () => null;
		},
	});
	return { Probe, captured };
}

const mountedApps: App[] = [];

function mountProbe(): ReturnType<typeof captureState> {
	const host = document.createElement("div");
	document.body.append(host);
	const { Probe, captured } = captureState();
	const app = createApp(Probe);
	app.mount(host);
	mountedApps.push(app);
	return { Probe, captured };
}

beforeEach(() => {
	clearThemeColorVariables();
	document.documentElement.classList.remove("dark");
	document.documentElement.removeAttribute("theme-color");
	document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount();
	document.body.innerHTML = "";
	clearThemeColorVariables();
	document.documentElement.classList.remove("dark");
});

describe("useThemeColor（setup 内调用）", () => {
	test("Teek 主色优先于 VitePress", async () => {
		setThemeColorVariable("--tk-theme-color", "#3784ff");
		setThemeColorVariable("--vp-c-brand-1", "#16a34a");
		const { captured } = mountProbe();
		await nextTick();

		expect(captured.value?.primary.value).toBe("#3784ff");
		expect(captured.value?.isReady.value).toBe(true);
	});

	test("Teek 缺失时降级到 VitePress brand-1", async () => {
		setThemeColorVariable("--vp-c-brand-1", "#16a34a");
		const { captured } = mountProbe();
		await nextTick();

		expect(captured.value?.primary.value).toBe("#16a34a");
		expect(captured.value?.isReady.value).toBe(true);
	});

	test("Teek 主色变量缺失但 --tk-color-primary 别名存在时使用别名", async () => {
		setThemeColorVariable("--tk-color-primary", "#abcdef");
		const { captured } = mountProbe();
		await nextTick();

		expect(captured.value?.primary.value).toBe("#abcdef");
		expect(captured.value?.isReady.value).toBe(true);
	});

	test("Teek 与 VitePress 均缺失时保留默认色且 isReady=false", async () => {
		const { captured } = mountProbe();
		await nextTick();

		expect(captured.value?.primary.value).toBe("#3b82f6");
		expect(captured.value?.isReady.value).toBe(false);
	});

	test("html.dark 初始检测为 true", async () => {
		document.documentElement.classList.add("dark");
		setThemeColorVariable("--vp-c-brand-1", "#16a34a");
		const { captured } = mountProbe();
		await nextTick();

		expect(captured.value?.isDark.value).toBe(true);
	});

	test("getComputedStyle 返回 var(...) token 时被过滤，降级到 VitePress", async () => {
		// inline 写入原始 var(...) 字符串模拟未解析的 token。
		setThemeColorVariable("--tk-theme-color", "var(--undefined)");
		setThemeColorVariable("--vp-c-brand-1", "#16a34a");
		const { captured } = mountProbe();
		await nextTick();

		expect(captured.value?.primary.value).toBe("#16a34a");
		expect(captured.value?.isReady.value).toBe(true);
	});

	test("组件卸载后 observer 已 disconnect，不再更新响应式状态", async () => {
		setThemeColorVariable("--vp-c-brand-1", "#16a34a");
		const { captured } = mountProbe();
		await nextTick();

		expect(captured.value?.primary.value).toBe("#16a34a");

		// 卸载：onBeforeUnmount 已 disconnect observer，后续修改 html 属性不应再读取。
		const lastApp = mountedApps[mountedApps.length - 1];
		lastApp.unmount();

		setThemeColorVariable("--vp-c-brand-1", "#22c55e");
		// captured 保留卸载时的快照值；不再随后续 DOM 变化更新。
		expect(captured.value?.primary.value).toBe("#16a34a");
	});
});

describe("useThemeColor（setup 外调用）", () => {
	test("无活动 Vue 实例时返回默认值且 isReady=false", () => {
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
		consoleWarnSpy.mockRestore();
	});

	test("SSR / 无 document 路径：直接调用不抛错", () => {
		expect(() => useThemeColor()).not.toThrow();
	});
});
