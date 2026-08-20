import ElementPlus from "element-plus";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp, nextTick, type App } from "vue";

const chatMocks = vi.hoisted(() => ({
	onResponseComplete: undefined as undefined | (() => void),
}));
const vitepressMocks = vi.hoisted(() => ({
	withBase: vi.fn((path: string) => `/docs${path}`),
}));

vi.mock("@ruan-cat-drill-doc/ai-vue", async () => {
	const { defineComponent, h } = await import("vue");

	return {
		AiChatFloatingButton: defineComponent({
			name: "AiChatFloatingButton",
			setup(_props, { slots }) {
				return () => h("section", { class: "ai-chat-floating-button" }, slots["notification-control"]?.());
			},
		}),
	};
});

vi.mock("vitepress", () => ({ withBase: vitepressMocks.withBase }));

vi.mock("../client/composables/useKnowledgeChat", async () => {
	const { ref } = await import("vue");

	return {
		useKnowledgeChat(_conversationId = "knowledge-chat", options: { onResponseComplete?: () => void } = {}) {
			chatMocks.onResponseComplete = options.onResponseComplete;
			return {
				messages: ref([]),
				isResponding: ref(false),
				errorMessage: ref(),
				send: vi.fn(),
				stop: vi.fn(),
				clearError: vi.fn(),
			};
		},
	};
});

import plugin, { AiChatVitePressShell, install } from "../client";

const mountedApps: App[] = [];
const originalNotificationDescriptor = Object.getOwnPropertyDescriptor(window, "Notification");
const originalHasFocusDescriptor = Object.getOwnPropertyDescriptor(document, "hasFocus");

function installNotification(permission: NotificationPermission, requestPermissionResult = permission) {
	class NotificationMock {
		static permission = permission;
		static requestPermission = vi.fn(async (): Promise<NotificationPermission> => {
			NotificationMock.permission = requestPermissionResult;
			return requestPermissionResult;
		});
		static calls: Array<{ title: string; options: NotificationOptions }> = [];
		onclick: (() => void) | null = null;

		constructor(title: string, options: NotificationOptions) {
			NotificationMock.calls.push({ title, options });
		}

		close() {}
	}

	Object.defineProperty(window, "Notification", { configurable: true, value: NotificationMock });
	return NotificationMock;
}

function mountShell() {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp(AiChatVitePressShell);
	app.mount(host);
	mountedApps.push(app);
	return { app, host };
}

function createAppMock() {
	const componentCalls: [string, unknown][] = [];
	const useCalls: unknown[] = [];
	const app = {
		component(name: string, component: unknown) {
			componentCalls.push([name, component]);
			return app;
		},
		use(plugin: unknown) {
			useCalls.push(plugin);
			return app;
		},
	};

	return { app: app as App, componentCalls, useCalls };
}

describe("ai-vitepress client plugin", () => {
	beforeEach(() => {
		chatMocks.onResponseComplete = undefined;
		vitepressMocks.withBase.mockClear();
		document.title = "当前文档｜小爱丽丝官网";
	});

	afterEach(() => {
		for (const app of mountedApps.splice(0)) app.unmount();
		document.body.innerHTML = "";
		if (originalNotificationDescriptor) Object.defineProperty(window, "Notification", originalNotificationDescriptor);
		else Reflect.deleteProperty(window, "Notification");
		if (originalHasFocusDescriptor) Object.defineProperty(document, "hasFocus", originalHasFocusDescriptor);
	});

	test("the named install function installs Element Plus and registers the VitePress shell component", () => {
		const { app, componentCalls, useCalls } = createAppMock();

		install(app);

		expect(useCalls).toEqual([ElementPlus]);
		expect(componentCalls).toEqual([["AiChatVitePressShell", AiChatVitePressShell]]);
	});

	test("the default plugin installs Element Plus and registers the VitePress shell component", () => {
		const { app, componentCalls, useCalls } = createAppMock();

		(plugin as { install: typeof install }).install(app);

		expect(useCalls).toEqual([ElementPlus]);
		expect(componentCalls).toEqual([["AiChatVitePressShell", AiChatVitePressShell]]);
	});

	test("the install function skips registration when disabled", () => {
		const { app, componentCalls, useCalls } = createAppMock();

		install(app, { enabled: false });

		expect(useCalls).toEqual([]);
		expect(componentCalls).toEqual([]);
	});

	test("用户授权成功后将回复通知入口更新为已开启状态", async () => {
		const NotificationMock = installNotification("default", "granted");
		const { host } = mountShell();
		await nextTick();

		const enableButton = host.querySelector<HTMLButtonElement>(".ai-chat-vitepress-shell__notification-control");
		expect(enableButton?.textContent?.trim()).toBe("开启回复通知");
		enableButton?.click();
		await Promise.resolve();
		await nextTick();

		expect(NotificationMock.requestPermission).toHaveBeenCalledOnce();
		expect(host.querySelector(".ai-chat-vitepress-shell__notification-status")?.textContent?.trim()).toBe(
			"已开启回复通知",
		);
	});

	test("用户拒绝授权后显示浏览器站点设置说明", async () => {
		const NotificationMock = installNotification("default", "denied");
		const { host } = mountShell();
		await nextTick();

		host.querySelector<HTMLButtonElement>(".ai-chat-vitepress-shell__notification-control")?.click();
		await Promise.resolve();
		await nextTick();

		expect(NotificationMock.requestPermission).toHaveBeenCalledOnce();
		expect(host.querySelector(".ai-chat-vitepress-shell__notification-status")?.textContent?.trim()).toContain(
			"请在浏览器站点设置中手动开启",
		);
	});

	test("自然完成会触发提醒，并在卸载后清理焦点恢复监听", async () => {
		const NotificationMock = installNotification("granted");
		Object.defineProperty(document, "hasFocus", { configurable: true, value: () => false });
		const { app } = mountShell();
		await nextTick();

		chatMocks.onResponseComplete?.();

		expect(document.title).toBe("AI 回复已完成｜小爱丽丝官网");
		expect(vitepressMocks.withBase).toHaveBeenCalledWith("/favicon.svg");
		expect(NotificationMock.calls).toEqual([
			{
				title: "小爱丽丝官网",
				options: {
					body: "AI 已完成回复，点击返回继续查看。",
					icon: "/docs/favicon.svg",
				},
			},
		]);

		app.unmount();
		window.dispatchEvent(new Event("focus"));
		document.dispatchEvent(new Event("visibilitychange"));
		expect(document.title).toBe("AI 回复已完成｜小爱丽丝官网");
	});
});
