import { afterEach, describe, expect, test, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";

vi.mock("vue-element-plus-x", async () => {
	const { defineComponent, h } = await import("vue");

	const Bubble = defineComponent({
		name: "Bubble",
		props: {
			content: { type: String, default: "" },
			placement: { type: String, default: "start" },
			noStyle: { type: Boolean, default: false },
		},
		setup(props, { slots }) {
			return () =>
				h(
					"article",
					{
						"data-library-component": "Bubble",
						"data-no-style": String(props.noStyle),
						"data-placement": props.placement,
					},
					[
						h("div", { class: "bubble-content" }, slots.content?.()),
						h("footer", { class: "bubble-footer" }, slots.footer?.()),
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
					h(
						"div",
						{
							"data-auto-scroll": String(props.autoScroll),
							"data-library-component": "BubbleList",
						},
						props.list.map((item) =>
							h(Bubble, item as { content: string; noStyle?: boolean; placement?: string }, {
								content: () => slots.content?.({ item }),
								footer: () => slots.footer?.({ item }),
							}),
						),
					);
			},
		}),
		Sender: defineComponent({
			name: "Sender",
			props: {
				modelValue: { type: String, default: "" },
				placeholder: { type: String, default: "" },
				loading: Boolean,
				submitBtnDisabled: Boolean,
			},
			emits: ["update:modelValue", "submit", "cancel"],
			setup(props, { emit }) {
				return () =>
					h("div", { "data-library-component": "Sender" }, [
						h("input", {
							class: "sender-input",
							value: props.modelValue,
							placeholder: props.placeholder,
							onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
						}),
						h(
							"button",
							{
								class: "sender-submit",
								disabled: props.submitBtnDisabled,
								onClick: () => emit("submit", props.modelValue),
							},
							"提交",
						),
						props.loading
							? h("button", { class: "sender-cancel", onClick: () => emit("cancel", props.modelValue) }, "取消")
							: null,
					]);
			},
		}),
	};
});

vi.mock("markstream-vue", async () => {
	const { defineComponent, h } = await import("vue");

	return {
		default: defineComponent({
			name: "MarkdownRender",
			props: {
				content: { type: String, default: "" },
				final: Boolean,
				mode: { type: String, default: "chat" },
				htmlPolicy: { type: String, default: "allow" },
				smoothStreaming: { type: [Boolean, String], default: false },
				typewriter: Boolean,
				fade: Boolean,
			},
			setup(props) {
				return () =>
					h(
						"div",
						{
							class: "markdown-render",
							"data-final": String(props.final),
							"data-html-policy": props.htmlPolicy,
							"data-library-component": "MarkdownRender",
							"data-mode": props.mode,
							"data-smooth-streaming": String(props.smoothStreaming),
							"data-typewriter": String(props.typewriter),
							"data-fade": String(props.fade),
						},
						props.content,
					);
			},
		}),
	};
});

import AiChat from "../components/ai-chat/AiChat.vue";

const mountedApps: App[] = [];
const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");

function mountAiChat(props: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp(AiChat, props);
	app.mount(host);
	mountedApps.push(app);
	return host;
}

function mockReducedMotionPreference(initialMatches: boolean) {
	const listeners = new Set<(event: MediaQueryListEvent) => void>();
	Object.defineProperty(window, "matchMedia", {
		configurable: true,
		value: vi.fn(() => ({
			matches: initialMatches,
			media: "(prefers-reduced-motion: reduce)",
			addEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
			removeEventListener: (_event: string, listener: (event: MediaQueryListEvent) => void) =>
				listeners.delete(listener),
		})),
	});

	return (matches: boolean) => {
		for (const listener of listeners) listener({ matches } as MediaQueryListEvent);
	};
}

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount();
	document.body.innerHTML = "";
	if (originalMatchMediaDescriptor) Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
	else Reflect.deleteProperty(window, "matchMedia");
});

describe("AiChat library adapters", () => {
	test("renders BubbleList-managed Bubble content/footer slots and maps assistant final state to MarkdownRender", () => {
		const host = mountAiChat({
			mode: "external",
			isResponding: true,
			messages: [
				{ id: "user-1", role: "user", content: "纯文本问题" },
				{ id: "assistant-1", role: "assistant", content: "已结束回答" },
				{
					id: "assistant-2",
					role: "assistant",
					content: "流式回答",
					sources: [{ id: "source-1", label: "来源一", sourceHref: "/guide#source-1" }],
				},
			],
		});

		expect(host.querySelector('[data-library-component="BubbleList"]')).not.toBeNull();
		expect(host.querySelector<HTMLElement>('[data-library-component="BubbleList"]')?.dataset.autoScroll).toBe("false");
		const bubbles = host.querySelectorAll<HTMLElement>('[data-library-component="Bubble"]');
		expect(bubbles).toHaveLength(3);
		expect(bubbles[0].dataset.placement).toBe("end");
		expect(bubbles[0].dataset.noStyle).toBe("false");
		expect(bubbles[1].dataset.placement).toBe("start");
		expect(bubbles[0].querySelector(".bubble-content")?.textContent).toBe("纯文本问题");
		expect(bubbles[0].querySelector(".markdown-render")).toBeNull();

		const markdownRenderers = host.querySelectorAll<HTMLElement>(".markdown-render");
		expect(markdownRenderers).toHaveLength(2);
		expect(markdownRenderers[0].dataset.final).toBe("true");
		expect(markdownRenderers[1].dataset.final).toBe("false");
		expect(markdownRenderers[1].dataset.mode).toBe("chat");
		expect(markdownRenderers[1].dataset.htmlPolicy).toBe("escape");
		expect(host.querySelector(".bubble-footer .ai-chat__source")?.getAttribute("href")).toBe("/guide#source-1");

		const completedHost = mountAiChat({
			mode: "external",
			isResponding: false,
			messages: [{ id: "assistant-3", role: "assistant", content: "完整回答" }],
		});
		expect(completedHost.querySelector<HTMLElement>(".markdown-render")?.dataset.final).toBe("true");
	});

	describe("Markdown 动态策略", () => {
		test("默认启用 auto 平滑流式和打字机，并关闭淡入", () => {
			mockReducedMotionPreference(false);
			const host = mountAiChat({
				mode: "external",
				messages: [{ id: "assistant-1", role: "assistant", content: "默认动态效果" }],
			});
			const renderer = host.querySelector<HTMLElement>(".markdown-render");

			expect(renderer?.dataset.smoothStreaming).toBe("auto");
			expect(renderer?.dataset.typewriter).toBe("true");
			expect(renderer?.dataset.fade).toBe("false");
			expect(renderer?.dataset.final).toBe("true");
		});

		test("减少动态效果时关闭动画并保留内容和流结束状态", async () => {
			const setReducedMotion = mockReducedMotionPreference(true);
			const host = mountAiChat({
				mode: "external",
				isResponding: true,
				messages: [{ id: "assistant-1", role: "assistant", content: "持续流式内容" }],
			});
			const renderer = host.querySelector<HTMLElement>(".markdown-render");
			await nextTick();

			expect(renderer?.dataset.smoothStreaming).toBe("false");
			expect(renderer?.dataset.typewriter).toBe("false");
			expect(renderer?.dataset.fade).toBe("false");
			expect(renderer?.dataset.final).toBe("false");
			expect(renderer?.textContent).toBe("持续流式内容");

			setReducedMotion(false);
			await nextTick();
			expect(renderer?.dataset.smoothStreaming).toBe("auto");
			expect(renderer?.dataset.typewriter).toBe("true");
			expect(renderer?.dataset.fade).toBe("false");
		});
	});

	test("maps Sender submit to send", async () => {
		const onSend = vi.fn();
		const sendHost = mountAiChat({ mode: "external", messages: [], isResponding: false, onSend });
		const input = sendHost.querySelector<HTMLInputElement>(".sender-input");
		expect(sendHost.querySelector('[data-library-component="Sender"]')).not.toBeNull();
		expect(sendHost.querySelector<HTMLElement>('[data-library-component="Bubble"]')?.dataset.noStyle).toBe("false");
		expect(input).not.toBeNull();

		if (!input) throw new Error("Sender input stub was not rendered");
		input.value = "  项目问题  ";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await nextTick();
		sendHost.querySelector<HTMLButtonElement>(".sender-submit")?.click();

		expect(onSend).toHaveBeenCalledWith({ id: "user-1", role: "user", content: "项目问题" });
	});

	test("仅在生成中显示本地停止按钮，并由点击发出 stop", () => {
		const idleHost = mountAiChat({ mode: "external", messages: [], isResponding: false });
		expect(idleHost.querySelector(".ai-chat__stop")).toBeNull();
		const mockHost = mountAiChat({ mode: "mock", messages: [], isResponding: true });
		expect(mockHost.querySelector(".ai-chat__stop")).toBeNull();

		const onStop = vi.fn();
		const stopHost = mountAiChat({ mode: "external", messages: [], isResponding: true, onStop });
		const stopButton = stopHost.querySelector<HTMLButtonElement>(".ai-chat__stop");
		expect(stopButton).not.toBeNull();
		expect(stopButton?.getAttribute("aria-label")).toBe("停止生成");
		expect(stopButton?.textContent?.trim()).toBe("停止生成");
		stopButton?.click();

		expect(onStop).toHaveBeenCalledOnce();
	});

	test("显示并允许关闭外部 RAG 配置错误", async () => {
		const onClearError = vi.fn();
		const host = mountAiChat({
			mode: "external",
			messages: [],
			errorMessage: "知识库服务尚未配置，请稍后再试。",
			onClearError,
		});

		expect(host.querySelector<HTMLElement>(".ai-chat__error")?.textContent).toContain("知识库服务尚未配置");
		host.querySelector<HTMLButtonElement>(".ai-chat__error-dismiss")?.click();
		await nextTick();
		expect(onClearError).toHaveBeenCalledOnce();
	});
});
