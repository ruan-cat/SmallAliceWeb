import { afterEach, describe, expect, test, vi } from "vitest";
import { createApp, h, nextTick, type App } from "vue";

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
		XSender: defineComponent({
			name: "XSender",
			props: {
				placeholder: { type: String, default: "" },
				loading: Boolean,
			},
			emits: ["submit", "cancel"],
			setup(props, { emit, expose }) {
				let value = "";
				expose({
					getModelValue: () => ({ html: "", text: value }),
					clear: () => {
						value = "";
					},
				});
				return () =>
					h("div", { "data-library-component": "XSender" }, [
						h("input", {
							class: "sender-input",
							placeholder: props.placeholder,
							onInput: (event: Event) => {
								value = (event.target as HTMLInputElement).value;
							},
						}),
						h("button", { class: "sender-submit", onClick: () => emit("submit") }, "提交"),
						props.loading ? h("button", { class: "sender-cancel", onClick: () => emit("cancel") }, "取消") : null,
					]);
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
				return () =>
					h(
						"div",
						{
							"data-library-component": "ConfigProvider",
							"data-apply-to": props.applyTo,
							"data-theme": props.theme,
							"data-theme-overrides": JSON.stringify(props.themeOverrides),
						},
						slots.default?.(),
					);
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
import AiChatFloatingButton from "../components/ai-chat/AiChatFloatingButton.vue";

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

function mountAiChatWithNotificationControl(props: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({
		render: () =>
			h(AiChat, props, {
				"notification-control": () => h("button", { class: "notification-control", type: "button" }, "启用文档提醒"),
			}),
	});
	app.mount(host);
	mountedApps.push(app);
	return host;
}

function mountFloatingButtonWithNotificationControl(props: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({
		render: () =>
			h(AiChatFloatingButton, props, {
				"notification-control": () => h("button", { class: "notification-control", type: "button" }, "启用文档提醒"),
			}),
	});
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
	// 清理宿主 html 元素上的暗色 class 与主题属性，避免跨用例污染 useThemeColor 的运行时读取。
	document.documentElement.className = "";
	document.documentElement.removeAttribute("theme-color");
	document.documentElement.removeAttribute("data-theme");
	if (originalMatchMediaDescriptor) Object.defineProperty(window, "matchMedia", originalMatchMediaDescriptor);
	else Reflect.deleteProperty(window, "matchMedia");
});

describe("AiChat library adapters", () => {
	test("在 external 模式渲染 notification-control 插槽", () => {
		const host = mountAiChatWithNotificationControl({ mode: "external", messages: [] });

		expect(host.querySelector(".notification-control")?.textContent).toBe("启用文档提醒");
	});

	test("在 mock 模式渲染 notification-control 插槽", () => {
		const host = mountAiChatWithNotificationControl({ mode: "mock" });

		expect(host.querySelector(".notification-control")?.textContent).toBe("启用文档提醒");
	});

	test("未提供 notification-control 插槽时不渲染额外控件", () => {
		const host = mountAiChat({ mode: "external", messages: [] });

		expect(host.querySelector(".notification-control")).toBeNull();
	});

	test("AiChatFloatingButton 将 notification-control 插槽透传给 AiChat", async () => {
		const host = mountFloatingButtonWithNotificationControl({ messages: [] });
		await nextTick();
		host.querySelector<HTMLButtonElement>(".ai-chat-floating-button__trigger")?.click();
		await nextTick();

		expect(host.querySelector(".notification-control")?.textContent).toBe("启用文档提醒");
	});

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

	test("maps XSender submit to send", async () => {
		const onSend = vi.fn();
		const sendHost = mountAiChat({ mode: "external", messages: [], isResponding: false, onSend });
		const input = sendHost.querySelector<HTMLInputElement>(".sender-input");
		expect(sendHost.querySelector('[data-library-component="XSender"]')).not.toBeNull();
		expect(sendHost.querySelector<HTMLElement>('[data-library-component="Bubble"]')?.dataset.noStyle).toBe("false");
		expect(input).not.toBeNull();

		if (!input) throw new Error("XSender input stub was not rendered");
		input.value = "  项目问题  ";
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await nextTick();
		sendHost.querySelector<HTMLButtonElement>(".sender-submit")?.click();

		expect(onSend).toHaveBeenCalledWith({ id: "user-1", role: "user", content: "项目问题" });
	});

	test("AiChat 根部经 ConfigProvider 注入主题与品牌色覆盖", () => {
		const host = mountAiChat({ mode: "external", messages: [] });
		const provider = host.querySelector<HTMLElement>('[data-library-component="ConfigProvider"]');

		expect(provider).not.toBeNull();
		expect(provider?.dataset.theme).toBe("light");
		expect(provider?.dataset.themeOverrides).toContain("color-primary");
		expect(provider?.querySelector(".ai-chat")).not.toBeNull();
	});

	test("mock 模式下 send 负载 id 与 composable 推送的消息对齐且随发送递增", () => {
		const onSend = vi.fn();
		const host = mountAiChat({ mode: "mock", isResponding: false, mockDelay: 0, onSend });
		const input = host.querySelector<HTMLInputElement>(".sender-input");
		if (!input) throw new Error("XSender input stub was not rendered");

		function typeAndSubmit(text: string) {
			input.value = text;
			input.dispatchEvent(new Event("input", { bubbles: true }));
			host.querySelector<HTMLButtonElement>(".sender-submit")?.click();
		}

		typeAndSubmit("第一问");
		expect(onSend).toHaveBeenLastCalledWith({ id: "user-1", role: "user", content: "第一问" });

		typeAndSubmit("第二问");
		expect(onSend).toHaveBeenLastCalledWith({ id: "user-2", role: "user", content: "第二问" });
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

	describe("错误处理增强：模型加载失败条与 header 状态位", () => {
		const sampleModelsError = { message: "模型列表加载失败（HTTP 405）", statusCode: 405 };

		test("light 分支：传 modelsError 时渲染 role=alert 错误条且含 message 与「重试」", () => {
			const host = mountAiChat({ mode: "external", messages: [], modelsError: sampleModelsError });
			const banner = host.querySelector<HTMLElement>(".ai-chat__models-error");

			expect(banner?.getAttribute("role")).toBe("alert");
			expect(banner?.textContent).toContain("模型列表加载失败（HTTP 405）");
			expect(banner?.textContent).toContain("重试");
		});

		test("shadow 分支：传 modelsError 时 Shadow Root 内同样渲染错误条（双分支纪律）", () => {
			const host = mountAiChat({
				mode: "external",
				messages: [],
				modelsError: sampleModelsError,
				variant: "container-with-shadow",
			});
			const shadowBanner = host
				.querySelector<HTMLElement>(".ai-shadow-root")
				?.shadowRoot?.querySelector<HTMLElement>(".ai-chat__models-error");

			expect(shadowBanner?.getAttribute("role")).toBe("alert");
			expect(shadowBanner?.textContent).toContain("模型列表加载失败（HTTP 405）");
			expect(shadowBanner?.textContent).toContain("重试");
		});

		test("点击「重试」emit retry-models", async () => {
			const onRetryModels = vi.fn();
			const host = mountAiChat({
				mode: "external",
				messages: [],
				modelsError: sampleModelsError,
				onRetryModels,
			});
			host.querySelector<HTMLButtonElement>(".ai-chat__models-error-retry")?.click();
			await nextTick();

			expect(onRetryModels).toHaveBeenCalledOnce();
		});

		test("modelsError 存在且 models 为空时不得出现「无可用模型」类文案（降级不冒充）", () => {
			const host = mountAiChat({ mode: "external", messages: [], modelsError: sampleModelsError });

			expect(host.textContent).not.toContain("无可用模型");
			expect(host.textContent).not.toContain("暂无模型");
			// 无 modelsError 且无 models 时维持现状：不渲染任何模型区域
		});

		test("不传 modelsError 且无 models 时维持现状（不渲染错误条）", () => {
			const host = mountAiChat({ mode: "external", messages: [] });

			expect(host.querySelector(".ai-chat__models-error")).toBeNull();
		});

		test("FloatingButton 不传 headerTitle/headerStatus 时文案为「AI 对话/本地助手」（向后兼容）", async () => {
			const host = mountFloatingButtonWithNotificationControl({ messages: [] });
			await nextTick();
			host.querySelector<HTMLButtonElement>(".ai-chat-floating-button__trigger")?.click();
			await nextTick();

			expect(host.querySelector<HTMLElement>(".ai-chat-floating-button__title")?.textContent?.trim()).toBe("AI 对话");
			expect(host.querySelector<HTMLElement>(".ai-chat-floating-button__status")?.textContent?.trim()).toContain(
				"本地助手",
			);
		});

		test("FloatingButton 传 headerTitle/headerStatus 时显示注入文案（错误状态位）", async () => {
			const host = mountFloatingButtonWithNotificationControl({
				messages: [],
				headerTitle: "知识问答",
				headerStatus: "连接异常",
			});
			await nextTick();
			host.querySelector<HTMLButtonElement>(".ai-chat-floating-button__trigger")?.click();
			await nextTick();

			expect(host.querySelector<HTMLElement>(".ai-chat-floating-button__title")?.textContent?.trim()).toBe("知识问答");
			expect(host.querySelector<HTMLElement>(".ai-chat-floating-button__status")?.textContent?.trim()).toContain(
				"连接异常",
			);
		});
	});

	describe("品牌主题接入", () => {
		test("AiChat 根部绑定派生品牌 CSS 变量，缺省主色为默认品牌色", () => {
			const host = mountAiChat({ mode: "external", messages: [] });
			const section = host.querySelector<HTMLElement>(".ai-chat");

			expect(section?.style.getPropertyValue("--ai-chat-primary")).toBe("#3b82f6");
		});

		test("brandTheme prop 驱动 --ai-chat-* 变量派生与 ConfigProvider 品牌色覆盖", () => {
			const host = mountAiChat({
				mode: "external",
				messages: [],
				brandTheme: { primaryBrandColor: "#e11d48" },
			});
			const section = host.querySelector<HTMLElement>(".ai-chat");
			const provider = host.querySelector<HTMLElement>('[data-library-component="ConfigProvider"]');

			expect(section?.style.getPropertyValue("--ai-chat-primary")).toBe("#e11d48");
			expect(provider?.dataset.themeOverrides).toContain("#e11d48");
		});

		test("html.dark 时 ConfigProvider 切换为 dark 主题并响应式同步", async () => {
			document.documentElement.classList.add("dark");
			const host = mountAiChat({ mode: "external", messages: [] });
			const provider = host.querySelector<HTMLElement>('[data-library-component="ConfigProvider"]');

			expect(provider?.dataset.theme).toBe("dark");

			document.documentElement.classList.remove("dark");
			await nextTick();
			expect(provider?.dataset.theme).toBe("light");
		});

		test("AiChatFloatingButton 根部绑定品牌变量作用域并透传 brandTheme 给 AiChat", async () => {
			const host = mountFloatingButtonWithNotificationControl({
				messages: [],
				brandTheme: { primaryBrandColor: "#e11d48" },
			});
			await nextTick();
			host.querySelector<HTMLButtonElement>(".ai-chat-floating-button__trigger")?.click();
			await nextTick();

			const floatingRoot = host.querySelector<HTMLElement>(".ai-chat-floating-button");
			const innerSection = host.querySelector<HTMLElement>(".ai-chat");

			expect(floatingRoot?.style.getPropertyValue("--ai-chat-primary")).toBe("#e11d48");
			expect(innerSection?.style.getPropertyValue("--ai-chat-primary")).toBe("#e11d48");
		});

		test("AiChatFloatingButton 可关闭已打开的对话 dock", async () => {
			const host = mountFloatingButtonWithNotificationControl({ messages: [] });
			await nextTick();

			const trigger = host.querySelector<HTMLButtonElement>(".ai-chat-floating-button__trigger");
			trigger?.click();
			await nextTick();
			expect(host.querySelector(".ai-chat-floating-button__dock")).not.toBeNull();

			host.querySelector<HTMLButtonElement>(".ai-chat-floating-button__close")?.click();
			await nextTick();

			expect(host.querySelector(".ai-chat-floating-button__dock")).toBeNull();
			expect(trigger?.getAttribute("aria-expanded")).toBe("false");
		});
	});
});
