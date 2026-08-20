import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { effectScope, nextTick } from "vue";

const vueUse = vi.hoisted(() => ({ useTitle: vi.fn() }));

vi.mock("@vueuse/core", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@vueuse/core")>();
	vueUse.useTitle.mockImplementation(actual.useTitle);
	return { ...actual, useTitle: vueUse.useTitle };
});

import { useChatCompletionAttention } from "../client/composables/useChatCompletionAttention";

type NotificationInstance = {
	title: string;
	options?: NotificationOptions;
	onclick: (() => void) | null;
	close: ReturnType<typeof vi.fn>;
};

const originalNotification = globalThis.Notification;
const originalHasFocus = document.hasFocus;
const originalWindowFocus = window.focus;
const originalTitle = document.title;

function installNotification(permission: NotificationPermission) {
	const instances: NotificationInstance[] = [];
	class MockNotification {
		static permission = permission;
		static requestPermission = vi.fn(async () => MockNotification.permission);
		title: string;
		options?: NotificationOptions;
		onclick: (() => void) | null = null;
		close = vi.fn();

		constructor(title: string, options?: NotificationOptions) {
			this.title = title;
			this.options = options;
			instances.push(this);
		}
	}

	Object.defineProperty(globalThis, "Notification", { configurable: true, value: MockNotification });
	return { instances, MockNotification };
}

beforeEach(() => {
	vi.clearAllMocks();
	document.title = "原始页面标题";
	document.hasFocus = () => true;
	window.focus = originalWindowFocus;
	Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

afterEach(() => {
	Object.defineProperty(globalThis, "Notification", { configurable: true, value: originalNotification });
	document.hasFocus = originalHasFocus;
	document.title = originalTitle;
	window.focus = originalWindowFocus;
	Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
});

describe("useChatCompletionAttention", () => {
	test("通过真实 VueUse useTitle 初始化并禁用卸载时标题恢复", () => {
		installNotification("granted");
		useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		expect(vueUse.useTitle).toHaveBeenCalledWith(undefined, {
			observe: true,
			restoreOnUnmount: false,
		});
	});

	test("自然完成时切换标题，聚焦页面不发送系统通知", async () => {
		const { instances } = installNotification("granted");
		document.hasFocus = () => true;
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();
		await nextTick();

		expect(document.title).toBe("AI 回复已完成｜小爱丽丝官网");
		expect(instances).toHaveLength(0);
	});

	test("页面不可见且窗口聚焦时发送 favicon 通知", () => {
		const { instances } = installNotification("granted");
		document.hasFocus = () => true;
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();

		expect(instances).toHaveLength(1);
		expect(instances[0].options).toEqual({
			body: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});
	});

	test("页面可见但窗口失焦时发送系统通知", () => {
		const { instances } = installNotification("granted");
		document.hasFocus = () => false;
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();

		expect(instances).toHaveLength(1);
	});

	test("点击通知时关闭通知、聚焦窗口并恢复标题", () => {
		const { instances } = installNotification("granted");
		const focus = vi.fn();
		document.hasFocus = () => false;
		window.focus = focus;
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();
		instances[0].onclick?.();

		expect(instances[0].close).toHaveBeenCalledOnce();
		expect(focus).toHaveBeenCalledOnce();
		expect(document.title).toBe("原始页面标题");
	});

	test("默认权限在拒绝后不重复申请，但仍可切换标题", async () => {
		const { MockNotification } = installNotification("default");
		MockNotification.requestPermission.mockImplementation(async () => {
			MockNotification.permission = "denied";
			return "denied";
		});
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		const permission = await attention.requestPermission();
		const repeatedPermission = await attention.requestPermission();

		expect(permission).toBe("denied");
		expect(repeatedPermission).toBe("denied");
		expect(MockNotification.requestPermission).toHaveBeenCalledOnce();
		attention.markCompleted();
		expect(document.title).toBe("AI 回复已完成｜小爱丽丝官网");
	});

	test("窗口重新聚焦时自动恢复仍处于提醒状态的标题", () => {
		installNotification("granted");
		document.hasFocus = () => false;
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();
		window.dispatchEvent(new Event("focus"));

		expect(document.title).toBe("原始页面标题");
	});

	test("页面重新可见时自动恢复仍处于提醒状态的标题", () => {
		installNotification("granted");
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();
		Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
		document.dispatchEvent(new Event("visibilitychange"));

		expect(document.title).toBe("原始页面标题");
	});

	test("每次完成均保存当前标题，且清理不覆盖后续页面标题", () => {
		installNotification("granted");
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();
		document.title = "新页面标题";
		attention.clear();
		expect(document.title).toBe("新页面标题");

		attention.markCompleted();
		attention.clear();
		expect(document.title).toBe("新页面标题");
	});

	test("重复完成时保留首次提醒前的标题基线", () => {
		installNotification("granted");
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();
		attention.markCompleted();
		attention.clear();

		expect(document.title).toBe("原始页面标题");
	});

	test("不支持通知 API 时安全降级，但仍可切换和恢复标题", () => {
		Object.defineProperty(globalThis, "Notification", { configurable: true, value: undefined });
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();

		expect(attention.permission.value).toBe("unsupported");
		expect(document.title).toBe("AI 回复已完成｜小爱丽丝官网");
		attention.clear();
		expect(document.title).toBe("原始页面标题");
	});

	test("停止 effect scope 时不覆盖导航后的标题", () => {
		installNotification("granted");
		const scope = effectScope();
		const attention = scope.run(() =>
			useChatCompletionAttention({
				title: "AI 回复已完成｜小爱丽丝官网",
				notificationTitle: "小爱丽丝官网",
				notificationBody: "AI 已完成回复，点击返回继续查看。",
				icon: "/favicon.svg",
			}),
		);

		attention?.markCompleted();
		document.title = "导航后的标题";
		scope.stop();

		expect(document.title).toBe("导航后的标题");
	});

	test("通知构造器抛错时不阻断标题提醒", () => {
		class ThrowingNotification {
			static permission: NotificationPermission = "granted";

			constructor() {
				throw new Error("通知不可用");
			}
		}

		Object.defineProperty(globalThis, "Notification", { configurable: true, value: ThrowingNotification });
		document.hasFocus = () => false;
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		expect(() => attention.markCompleted()).not.toThrow();
		expect(document.title).toBe("AI 回复已完成｜小爱丽丝官网");
	});

	test("权限请求被拒绝时不抛异常，标题提醒仍可工作", async () => {
		const { MockNotification } = installNotification("default");
		MockNotification.requestPermission.mockRejectedValueOnce(new Error("权限请求失败"));
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		await expect(attention.requestPermission()).resolves.toBe("default");
		attention.markCompleted();
		expect(document.title).toBe("AI 回复已完成｜小爱丽丝官网");
	});

	test("通知关闭或窗口聚焦抛错时不阻断标题恢复", () => {
		const { instances } = installNotification("granted");
		const focus = vi.fn(() => {
			throw new Error("无法聚焦窗口");
		});
		document.hasFocus = () => false;
		window.focus = focus;
		const attention = useChatCompletionAttention({
			title: "AI 回复已完成｜小爱丽丝官网",
			notificationTitle: "小爱丽丝官网",
			notificationBody: "AI 已完成回复，点击返回继续查看。",
			icon: "/favicon.svg",
		});

		attention.markCompleted();
		instances[0].close.mockImplementationOnce(() => {
			throw new Error("无法关闭通知");
		});

		expect(() => instances[0].onclick?.()).not.toThrow();
		expect(focus).toHaveBeenCalledOnce();
		expect(document.title).toBe("原始页面标题");
	});
});
