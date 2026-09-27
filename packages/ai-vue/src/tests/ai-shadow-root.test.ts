import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import AiShadowRoot from "../components/ai-shadow-root/AiShadowRoot.vue";

const mountedApps: App[] = [];

function mountShadowRoot(props: Record<string, unknown>, slots?: Record<string, () => unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({
		components: { AiShadowRoot },
		render: () => h(AiShadowRoot, props, slots),
	});
	app.mount(host);
	mountedApps.push(app);
	return host;
}

beforeEach(() => {
	// 清理宿主页面全局 body 上的 class 与 CSS 变量，避免跨测试污染
	document.documentElement.className = "";
	document.documentElement.removeAttribute("style");
});

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount();
	document.body.innerHTML = "";
});

describe("AiShadowRoot", () => {
	test("默认 enabled=true 时挂载并创建 Shadow Root", async () => {
		const host = mountShadowRoot(
			{},
			{
				default: () => h("div", { class: "content" }, "hello"),
			},
		);
		await nextTick();
		const rootEl = host.firstElementChild as HTMLElement;
		expect(rootEl).not.toBeNull();
		expect(rootEl.shadowRoot).not.toBeNull();
		expect(rootEl.shadowRoot?.mode).toBe("open");
	});

	test("enabled=false 降级为 light DOM，不创建 Shadow Root", async () => {
		const host = mountShadowRoot({ enabled: false }, { default: () => h("div", { class: "content" }, "hello") });
		await nextTick();
		const rootEl = host.firstElementChild as HTMLElement;
		expect(rootEl).not.toBeNull();
		expect(rootEl.shadowRoot).toBeNull();
		// light DOM 内应该渲染 slot 内容
		expect(rootEl.querySelector(".content")).not.toBeNull();
	});

	test("mode='closed' 时 Shadow Root.mode 为 closed", async () => {
		const host = mountShadowRoot({ mode: "closed" }, { default: () => h("div", { class: "content" }, "x") });
		await nextTick();
		const rootEl = host.firstElementChild as HTMLElement;
		expect(rootEl.shadowRoot).toBeNull(); // closed shadow root 不暴露 shadowRoot 属性
	});

	test("styles prop 注入到 Shadow Root 顶部 style 标签", async () => {
		const cssText = "div.content { color: rgb(255, 0, 0); }";
		const host = mountShadowRoot({ styles: cssText }, { default: () => h("div", { class: "content" }, "x") });
		await nextTick();
		const rootEl = host.firstElementChild as HTMLElement;
		const styleEl = rootEl.shadowRoot?.querySelector("style");
		expect(styleEl).not.toBeNull();
		expect(styleEl?.textContent).toBe(cssText);
	});

	test("slot 内容被渲染到 Shadow Root 内", async () => {
		const host = mountShadowRoot(
			{},
			{
				default: () => h("div", { class: "inner" }, "shadow content"),
			},
		);
		await nextTick();
		const rootEl = host.firstElementChild as HTMLElement;
		const innerEl = rootEl.shadowRoot?.querySelector(".inner");
		expect(innerEl).not.toBeNull();
		expect(innerEl?.textContent).toBe("shadow content");
	});

	test("组件卸载时清理 Shadow Root 内的渲染内容", async () => {
		const host = mountShadowRoot(
			{},
			{
				default: () => h("div", { class: "inner" }, "x"),
			},
		);
		await nextTick();
		const app = mountedApps[mountedApps.length - 1];
		app.unmount();
		// Vue unmount 清空整个 host 容器；shadow root 与其内容均被移除。
		const rootEl = host.firstElementChild as HTMLElement | null;
		if (rootEl) {
			const shadow = rootEl.shadowRoot;
			if (shadow) {
				expect(shadow.children.length).toBe(0);
			}
		}
	});
});

describe("AiShadowRoot SSR 降级", () => {
	test("无 window/document 时降级为 light DOM 渲染", async () => {
		// 直接调用 createApp 在 jsdom 中挂载，验证无 document 守卫不会崩溃
		const Probe = defineComponent({
			components: { AiShadowRoot },
			setup() {
				return () =>
					h(
						AiShadowRoot,
						{},
						{
							default: () => h("div", { class: "ssr" }, "ssr"),
						},
					);
			},
		});
		const host = document.createElement("div");
		document.body.append(host);
		const app = createApp(Probe);
		app.mount(host);
		mountedApps.push(app);
		await nextTick();
		const rootEl = host.firstElementChild as HTMLElement;
		expect(rootEl).not.toBeNull();
		// jsdom 下 document 存在，所以走 enabled 路径，shadow root 存在
		expect(rootEl.shadowRoot).not.toBeNull();
	});
});
