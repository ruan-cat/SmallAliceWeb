import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createApp, defineComponent, h, nextTick, type App } from "vue";
import AiChatFeedback from "../components/ai-chat/parts/AiChatFeedback.vue";
import type { FeedbackPayload } from "../components/ai-chat/types";

const mountedApps: App[] = [];
const emitted: FeedbackPayload[] = [];

function mountFeedback(props: Record<string, unknown>) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({
		setup() {
			const onSubmit = (payload: FeedbackPayload) => emitted.push(payload);
			return () => h(AiChatFeedback, { ...props, onSubmit: onSubmit });
		},
	});
	app.mount(host);
	mountedApps.push(app);
	return host;
}

beforeEach(() => {
	emitted.length = 0;
});

afterEach(() => {
	for (const app of mountedApps.splice(0)) app.unmount();
	document.body.innerHTML = "";
});

describe("AiChatFeedback", () => {
	test("默认展示 👍 / 👎 两个按钮", async () => {
		const host = mountFeedback({ messageId: "m1" });
		await nextTick();
		const buttons = host.querySelectorAll(".ai-chat__feedback-btn");
		expect(buttons).toHaveLength(2);
	});

	test("点击 👍 立即 emit 正向反馈，无详情输入框", async () => {
		const host = mountFeedback({ messageId: "m1" });
		await nextTick();
		host.querySelectorAll<HTMLButtonElement>(".ai-chat__feedback-btn")[0].click();
		await nextTick();
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toEqual({ type: "positive", messageId: "m1" });
		expect(host.querySelector(".ai-chat__feedback-detail")).toBeNull();
	});

	test("点击 👎 弹详情输入框，提交时携带 details", async () => {
		const host = mountFeedback({ messageId: "m2" });
		await nextTick();
		host.querySelectorAll<HTMLButtonElement>(".ai-chat__feedback-btn")[1].click();
		await nextTick();
		const detail = host.querySelector<HTMLTextAreaElement>(".ai-chat__feedback-detail-input");
		expect(detail).not.toBeNull();
		detail.value = "再详细一点";
		detail.dispatchEvent(new Event("input"));
		await nextTick();
		host.querySelector<HTMLButtonElement>(".ai-chat__feedback-detail-submit")!.click();
		await nextTick();
		expect(emitted).toHaveLength(1);
		expect(emitted[0]).toEqual({ type: "negative", messageId: "m2", details: "再详细一点" });
	});

	test("反馈已提交后切换为只读提示，再次点击不再触发 emit", async () => {
		const host = mountFeedback({ messageId: "m3" });
		await nextTick();
		host.querySelectorAll<HTMLButtonElement>(".ai-chat__feedback-btn")[0].click();
		await nextTick();
		expect(host.querySelector(".ai-chat__feedback-done")).not.toBeNull();
		expect(host.querySelectorAll(".ai-chat__feedback-btn")).toHaveLength(0);
		// 已反馈：组件没有再次点击的入口，emit 不会再增
		expect(emitted).toHaveLength(1);
	});

	test("取消详情回到未选状态", async () => {
		const host = mountFeedback({ messageId: "m4" });
		await nextTick();
		host.querySelectorAll<HTMLButtonElement>(".ai-chat__feedback-btn")[1].click();
		await nextTick();
		host.querySelector<HTMLButtonElement>(".ai-chat__feedback-detail-cancel")!.click();
		await nextTick();
		expect(emitted).toHaveLength(0);
		expect(host.querySelectorAll(".ai-chat__feedback-btn")).toHaveLength(2);
	});
});
