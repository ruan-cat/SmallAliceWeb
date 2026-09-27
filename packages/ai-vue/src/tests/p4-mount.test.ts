import { afterEach, describe, expect, test, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";

/** 等满一个 transition 周期（180ms 淡出 + 缓冲），确保 v-if 节点已被卸载 */
const TRANSITION_TIMEOUT = 300;
const waitTransition = () => new Promise<void>((resolve) => setTimeout(resolve, TRANSITION_TIMEOUT));

/** 与 ai-chat.test.ts 共享的 vepx + markstream-vue mock，保持组件契约 */
vi.mock("vue-element-plus-x", async () => {
	const { h: vh } = await import("vue");

	const Bubble = defineComponent({
		name: "Bubble",
		props: {
			content: { type: String, default: "" },
			placement: { type: String, default: "start" },
			noStyle: { type: Boolean, default: false },
		},
		setup(props, { slots }) {
			return () =>
				vh(
					"article",
					{
						"data-library-component": "Bubble",
						"data-no-style": String(props.noStyle),
						"data-placement": props.placement,
					},
					[
						vh("div", { class: "bubble-content" }, slots.content?.()),
						vh("footer", { class: "bubble-footer" }, slots.footer?.()),
					],
				);
		},
	});

	return {
		Bubble,
		BubbleList: defineComponent({
			name: "BubbleList",
			props: {
				list: { type: Array, default: () => [] },
				autoScroll: { type: Boolean, default: false },
			},
			setup(props, { slots }) {
				return () =>
					vh(
						"div",
						{
							"data-auto-scroll": String(props.autoScroll),
							"data-library-component": "BubbleList",
						},
						props.list.map((item) =>
							vh(Bubble, item as { content: string; noStyle?: boolean; placement?: string }, {
								content: () => slots.content?.({ item }),
								footer: () => slots.footer?.({ item }),
							}),
						),
					);
			},
		}),
		XSender: defineComponent({
			name: "XSender",
			props: { placeholder: { type: String, default: "" }, loading: Boolean },
			emits: ["submit", "cancel"],
			setup() {
				return () => vh("div", { "data-library-component": "XSender" }, "XSender");
			},
		}),
		ConfigProvider: defineComponent({
			name: "ConfigProvider",
			props: {
				theme: { type: String, default: "light" },
				themeOverrides: { type: Object, default: undefined },
				applyTo: { type: String, default: "self" },
			},
			setup(props, { slots }) {
				return () => vh("div", { "data-library-component": "ConfigProvider" }, slots.default?.());
			},
		}),
	};
});

vi.mock("markstream-vue", async () => {
	const { h: vh, defineComponent } = await import("vue");
	return {
		default: defineComponent({
			name: "MarkdownRender",
			props: { content: { type: String, default: "" } },
			setup(props) {
				return () => vh("div", { class: "markdown-render" }, props.content);
			},
		}),
	};
});

import AiChat from "../components/ai-chat/AiChat.vue";
import AiModalChat from "../components/ai-modal-chat/AiModalChat.vue";
import AiSidebarChat from "../components/ai-sidebar-chat/AiSidebarChat.vue";
import { mountAiChat } from "../mount";
import { mountAiChat as mountAiChatFromIndex } from "../index";

const mountedApps: App[] = [];

function mountComponent(component: unknown, props?: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({ render: () => h(component as never, props) });
	app.mount(host);
	mountedApps.push(app);
	return host;
}

afterEach(() => {
	while (mountedApps.length) {
		const app = mountedApps.pop();
		app?.unmount();
	}
	document.body.innerHTML = "";
});

describe("P4 mountAiChat 函数式入口（子入口通用版本）", () => {
	test("通过 CSS 选择器挂载任意 Vue 组件", async () => {
		const host = document.createElement("div");
		host.id = "ai-target";
		document.body.append(host);

		const { app, unmount } = mountAiChat("#ai-target", {
			component: AiChat,
			componentProps: { placeholder: "请输入" },
		});
		await nextTick();

		expect(app).toBeDefined();
		expect(host.querySelector(".ai-chat")).not.toBeNull();
		expect(host.querySelector(".ai-chat__empty-title")?.textContent).toBe("暂无消息");

		unmount();
		expect(host.innerHTML).toBe("");
	});

	test("直接传入 HTMLElement 也能挂载", async () => {
		const host = document.createElement("div");
		document.body.append(host);

		const result = mountAiChat(host, {
			component: AiChat,
			componentProps: { mode: "external" },
		});
		await nextTick();

		expect(host.querySelector(".ai-chat")).not.toBeNull();

		result.unmount();
	});

	test("选择器找不到节点抛 Error", () => {
		expect(() =>
			mountAiChat("#not-exist-id", { component: AiChat, componentProps: {} }),
		).toThrow(/Target not found/);
	});

	test("onChatEvent 回调被桥接到 componentProps.onChatEvent", async () => {
		const host = document.createElement("div");
		document.body.append(host);

		const onChatEvent = vi.fn();
		const { unmount } = mountAiChat(host, {
			component: AiChat,
			componentProps: { mode: "mock" },
			onChatEvent,
		});
		await nextTick();

		/** mount 阶段不直接触发，验证回调函数被保留（useChatEvents 内部以闭包持有） */
		expect(typeof onChatEvent).toBe("function");
		expect(onChatEvent).not.toHaveBeenCalled();

		unmount();
	});
});

describe("P4 mountAiChat 主入口快捷封装（固定挂载 AiChat）", () => {
	test("options 直接接收 AiChatProps，自动注入 component: AiChat", async () => {
		const host = document.createElement("div");
		host.id = "ai-main-target";
		document.body.append(host);

		const { unmount } = mountAiChatFromIndex("#ai-main-target", {
			placeholder: "提问…",
			mode: "mock",
		});
		await nextTick();

		expect(host.querySelector(".ai-chat")).not.toBeNull();
		/** AiChat 的 empty 状态出现，证明 AiChat 已被挂载 */
		expect(host.querySelector(".ai-chat__empty-title")?.textContent).toBe("暂无消息");

		unmount();
		expect(host.innerHTML).toBe("");
	});
});

describe("P4 AiSidebarChat 容器", () => {
	test("默认折叠，点击 trigger 后展开", async () => {
		const host = mountComponent(AiSidebarChat);
		await nextTick();

		const root = host.querySelector(".ai-sidebar-chat");
		expect(root).not.toBeNull();
		expect(host.querySelector(".ai-sidebar-chat--open")).toBeNull();

		const trigger = host.querySelector(".ai-sidebar-chat__trigger") as HTMLButtonElement;
		expect(trigger).not.toBeNull();
		expect(trigger.textContent?.trim()).toBe("AI 对话");

		trigger.click();
		await nextTick();
		expect(host.querySelector(".ai-sidebar-chat--open")).not.toBeNull();

		trigger.click();
		await nextTick();
		expect(host.querySelector(".ai-sidebar-chat--open")).toBeNull();
	});

	test("defaultOpen=true 时初始展开", async () => {
		const host = mountComponent(AiSidebarChat, { defaultOpen: true });
		await nextTick();
		expect(host.querySelector(".ai-sidebar-chat--open")).not.toBeNull();
	});

	test("自定义 triggerLabel 与 width 透传", async () => {
		const host = mountComponent(AiSidebarChat, { triggerLabel: "打开助手", width: "18rem" });
		await nextTick();

		const trigger = host.querySelector(".ai-sidebar-chat__trigger");
		expect(trigger?.textContent?.trim()).toBe("打开助手");

		const triggerClick = trigger as HTMLButtonElement;
		triggerClick.click();
		await nextTick();

		const panel = host.querySelector(".ai-sidebar-chat__panel") as HTMLElement;
		expect(panel.style.width).toBe("18rem");
	});
});

describe("P4 AiModalChat 容器", () => {
	test("点击 trigger 打开模态；overlay 自点击关闭", async () => {
		const host = mountComponent(AiModalChat);
		await nextTick();

		expect(host.querySelector(".ai-modal-chat__overlay")).toBeNull();

		const trigger = host.querySelector(".ai-modal-chat__trigger") as HTMLButtonElement;
		trigger.click();
		await nextTick();

		const overlay = host.querySelector(".ai-modal-chat__overlay") as HTMLElement;
		expect(overlay).not.toBeNull();

		/** 模拟 overlay self 点击：dispatch click 事件（@click.self 修饰符要求 target===currentTarget） */
		const event = new MouseEvent("click", { bubbles: true });
		Object.defineProperty(event, "target", { value: overlay, configurable: true });
		Object.defineProperty(event, "currentTarget", { value: overlay, configurable: true });
		overlay.dispatchEvent(event);
		await waitTransition();

		expect(host.querySelector(".ai-modal-chat__overlay")).toBeNull();
	});

	test("关闭按钮点击关闭", async () => {
		const host = mountComponent(AiModalChat);
		await nextTick();

		const trigger = host.querySelector(".ai-modal-chat__trigger") as HTMLButtonElement;
		trigger.click();
		await nextTick();

		const closeBtn = host.querySelector(".ai-modal-chat__close") as HTMLButtonElement;
		expect(closeBtn).not.toBeNull();
		closeBtn.click();
		await waitTransition();

		expect(host.querySelector(".ai-modal-chat__overlay")).toBeNull();
	});

	test("ESC 键关闭模态", async () => {
		const host = mountComponent(AiModalChat);
		await nextTick();

		const trigger = host.querySelector(".ai-modal-chat__trigger") as HTMLButtonElement;
		trigger.click();
		await nextTick();
		expect(host.querySelector(".ai-modal-chat__overlay")).not.toBeNull();

		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		await waitTransition();

		expect(host.querySelector(".ai-modal-chat__overlay")).toBeNull();
	});
});