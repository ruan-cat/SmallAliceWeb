import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import AiChatMessageActions from "../components/ai-chat/parts/AiChatMessageActions.vue";
import type { AiChatMessage, MessageAction } from "../components/ai-chat/types";

const mountedApps: App[] = [];

function mountActions(props: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({ render: () => h(AiChatMessageActions, props) });
	app.mount(host);
	mountedApps.push(app);
	return host;
}

const message: AiChatMessage = { id: "m1", role: "assistant", content: "hello" };
const actions: MessageAction[] = [
	{ label: "复制", handler: vi.fn() },
	{ label: "分享", handler: vi.fn() },
];

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount();
	document.body.innerHTML = "";
});

describe("AiChatMessageActions", () => {
	test("actions 为空时不渲染容器", async () => {
		const host = mountActions({ message, actions: [] });
		await nextTick();
		expect(host.querySelector(".ai-chat__message-actions")).toBeNull();
	});

	test("传入 N 个 actions 渲染 N 个按钮", async () => {
		const host = mountActions({ message, actions });
		await nextTick();
		const buttons = host.querySelectorAll<HTMLButtonElement>(".ai-chat__message-action");
		expect(buttons).toHaveLength(2);
		expect(buttons[0].textContent?.trim()).toBe("复制");
		expect(buttons[1].textContent?.trim()).toBe("分享");
	});

	test("点击按钮通过 emit('action') 通知父组件", async () => {
		const captured: { action?: MessageAction; msg?: AiChatMessage } = {};
		const host = document.createElement("div");
		document.body.append(host);
		const app = createApp({
			setup() {
				const onAction = (action: MessageAction, msg: AiChatMessage) => {
					captured.action = action;
					captured.msg = msg;
				};
				return () => h(AiChatMessageActions, { message, actions, onAction: onAction });
			},
		});
		app.mount(host);
		mountedApps.push(app);
		await nextTick();
		host.querySelectorAll<HTMLButtonElement>(".ai-chat__message-action")[0].click();
		await nextTick();
		expect(captured.action?.label).toBe("复制");
		expect(captured.msg?.id).toBe("m1");
	});
});
