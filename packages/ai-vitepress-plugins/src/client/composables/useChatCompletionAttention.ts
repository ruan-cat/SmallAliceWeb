import { useDocumentVisibility, useEventListener, useTitle, useWindowFocus } from "@vueuse/core";
import { computed, ref } from "vue";

export type ChatCompletionAttentionOptions = {
	title: string;
	notificationTitle: string;
	notificationBody: string;
	icon: string;
};

/** 执行可能被浏览器权限、实现或生命周期限制的操作，并在失败时安全降级。 */
function safelyRun(action: () => void) {
	try {
		action();
	} catch {}
}

/** 在回复自然完成时更新标题，并在用户离开页面后发送系统通知。 */
export function useChatCompletionAttention(options: ChatCompletionAttentionOptions) {
	const documentVisibility = useDocumentVisibility();
	const windowFocused = useWindowFocus();
	const title = useTitle(undefined, { observe: true, restoreOnUnmount: false });
	const permission = ref<NotificationPermission | "unsupported">("unsupported");
	let previousTitle: string | undefined;

	/** 在客户端读取浏览器通知构造器；服务端和不支持的环境均安全降级。 */
	function getNotification() {
		try {
			if (typeof window === "undefined" || typeof window.Notification === "undefined") return;
			return window.Notification;
		} catch {
			return;
		}
	}

	/** 同步当前通知权限，使用户可控的授权入口保持最新状态。 */
	function refreshPermission() {
		const NotificationConstructor = getNotification();
		try {
			permission.value = NotificationConstructor?.permission ?? "unsupported";
		} catch {
			permission.value = "unsupported";
			return;
		}
		return NotificationConstructor;
	}

	refreshPermission();

	const canRequestPermission = computed(() => permission.value === "default");

	/** 仅在浏览器仍允许请求时调用系统权限弹窗。 */
	async function requestPermission() {
		const NotificationConstructor = refreshPermission();
		if (!NotificationConstructor || permission.value !== "default") return permission.value;

		try {
			permission.value = await NotificationConstructor.requestPermission();
		} catch {
			refreshPermission();
		}
		return permission.value;
	}

	/** 将标题还原为本次提醒开始前页面正在使用的标题。 */
	function clear() {
		if (previousTitle === undefined) return;
		const titleToRestore = previousTitle;
		previousTitle = undefined;
		if (typeof document === "undefined") return;
		let isAttentionTitle = false;
		safelyRun(() => {
			isAttentionTitle = title.value === options.title && document.title === options.title;
		});
		if (!isAttentionTitle) return;
		safelyRun(() => {
			title.value = titleToRestore;
			document.title = titleToRestore;
		});
	}

	/** 在本轮回复自然完成后提醒用户；只有离开页面时才发送系统通知。 */
	function markCompleted() {
		if (typeof document === "undefined") return;
		let currentTitle: string | undefined;
		safelyRun(() => {
			currentTitle = document.title || title.value || undefined;
		});
		if (currentTitle === undefined) return;
		if (previousTitle === undefined && currentTitle !== options.title) {
			previousTitle = currentTitle;
		}
		safelyRun(() => {
			title.value = options.title;
			document.title = options.title;
		});

		const NotificationConstructor = refreshPermission();
		if (!NotificationConstructor || permission.value !== "granted") return;

		let documentHidden = documentVisibility.value === "hidden";
		let windowUnfocused = !windowFocused.value;
		safelyRun(() => {
			documentHidden ||= document.visibilityState === "hidden";
			windowUnfocused ||= typeof document.hasFocus === "function" && !document.hasFocus();
		});
		if (!documentHidden && !windowUnfocused) return;

		safelyRun(() => {
			const notification = new NotificationConstructor(options.notificationTitle, {
				body: options.notificationBody,
				icon: options.icon,
			});
			notification.onclick = () => {
				safelyRun(() => notification.close());
				safelyRun(() => window.focus());
				clear();
			};
		});
	}

	if (typeof window !== "undefined" && typeof document !== "undefined") {
		safelyRun(() => {
			useEventListener(window, "focus", clear);
			useEventListener(document, "visibilitychange", () => {
				if (document.visibilityState === "visible") clear();
			});
		});
	}

	return { permission, canRequestPermission, requestPermission, markCompleted, clear };
}
