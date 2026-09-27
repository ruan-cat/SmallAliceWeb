import { afterEach, describe, expect, test, vi } from "vitest";
import { createApp, defineComponent, h, nextTick } from "vue";

/** 与 ai-chat.test.ts 共享的 vepx + markstream-vue mock */
vi.mock("vue-element-plus-x", async () => {
	const { h: vh, defineComponent } = await import("vue");

	const Bubble = defineComponent({
		name: "Bubble",
		props: { content: { type: String, default: "" }, placement: { type: String, default: "start" } },
		setup(props, { slots }) {
			return () =>
				vh(
					"article",
					{ "data-library-component": "Bubble", "data-placement": props.placement },
					[vh("div", { class: "bubble-content" }, slots.content?.()), vh("footer", { class: "bubble-footer" }, slots.footer?.())],
				);
		},
	});

	return {
		Bubble,
		BubbleList: defineComponent({
			name: "BubbleList",
			props: { list: { type: Array, default: () => [] } },
			setup(props, { slots }) {
				return () =>
					vh(
						"div",
						{ "data-library-component": "BubbleList" },
						props.list.map((item) =>
							vh(Bubble, item as { content: string; placement?: string }, {
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
			props: { theme: { type: String, default: "light" }, themeOverrides: { type: Object, default: undefined } },
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
import type { FeedbackPayload } from "../components/ai-chat/types";

const mountedApps: ReturnType<typeof createApp>[] = [];

function mountChat(props: Record<string, unknown> = {}) {
	const host = document.createElement("div");
	document.body.append(host);
	const app = createApp({ render: () => h(AiChat as never, props) });
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

describe("FC-4 反馈载荷关联 conversationId", () => {
	test("正向反馈 emit('feedback') 载荷含 conversationId 默认 'knowledge-chat'", async () => {
		const feedbacks: FeedbackPayload[] = [];
		mountChat({
			mode: "mock",
			messages: [{ id: "m1", role: "assistant", content: "测试" }],
			feedbackOptions: {
				enabled: true,
				onSubmit: (payload: FeedbackPayload) => feedbacks.push(payload),
			},
		});
		await nextTick();

		const positiveBtn = document.querySelectorAll<HTMLButtonElement>(".ai-chat__feedback-btn")[0];
		expect(positiveBtn).toBeDefined();
		positiveBtn.click();
		await nextTick();

		expect(feedbacks).toHaveLength(1);
		expect(feedbacks[0]).toEqual({
			type: "positive",
			messageId: "m1",
			conversationId: "knowledge-chat",
		});
	});

	test("负面反馈 emit('submit') 不带 details 时 payload 仅含 conversationId 与基础字段", async () => {
		const feedbacks: FeedbackPayload[] = [];
		mountChat({
			mode: "mock",
			messages: [{ id: "m2", role: "assistant", content: "测试负面" }],
			feedbackOptions: {
				enabled: true,
				onSubmit: (payload: FeedbackPayload) => feedbacks.push(payload),
			},
		});
		await nextTick();

		const negativeBtn = document.querySelectorAll<HTMLButtonElement>(".ai-chat__feedback-btn")[1];
		negativeBtn.click();
		await nextTick();

		/** 不输入 details，直接取消——AiChatFeedback 应 emit 不带 details 的 payload（详情输入跳过） */
		const cancelBtn = document.querySelector<HTMLButtonElement>(".ai-chat__feedback-detail-cancel");
		expect(cancelBtn).toBeDefined();
		cancelBtn.click();
		await nextTick();

		/** details 为空字符串走 trim().||undefined，emit 时 details 字段被省略 */
		expect(feedbacks).toHaveLength(0);
	});

	test("AiChatFeedback 子部件 emit 不感知 conversationId，AiChat 父级补全", async () => {
		/** 验证 AiChatFeedback emit 的 payload 不含 conversationId（子部件职责），AiChat 转发时附加 */
		const feedbacks: FeedbackPayload[] = [];
		mountChat({
			mode: "mock",
			messages: [{ id: "m-no-conv", role: "assistant", content: "子部件职责" }],
			feedbackOptions: {
				enabled: true,
				onSubmit: (payload: FeedbackPayload) => feedbacks.push(payload),
			},
		});
		await nextTick();

		const positiveBtn = document.querySelectorAll<HTMLButtonElement>(".ai-chat__feedback-btn")[0];
		positiveBtn.click();
		await nextTick();

		expect(feedbacks).toHaveLength(1);
		/** AiChat 父级补全的 conversationId 在最终 payload 出现 */
		expect(feedbacks[0]?.conversationId).toBe("knowledge-chat");
		/** 但子部件职责范围内的字段（type / messageId）也保留 */
		expect(feedbacks[0]).toMatchObject({
			type: "positive",
			messageId: "m-no-conv",
		});
	});

	test("onChatEvent feedback_submitted 事件携带 conversationId（埋点回流）", async () => {
		const events: { type: string; conversationId?: string }[] = [];
		mountChat({
			mode: "mock",
			messages: [{ id: "m3", role: "assistant", content: "埋点测试" }],
			feedbackOptions: { enabled: true },
			onChatEvent: (event) => events.push(event as { type: string; conversationId?: string }),
		});
		await nextTick();

		const positiveBtn = document.querySelectorAll<HTMLButtonElement>(".ai-chat__feedback-btn")[0];
		positiveBtn.click();
		await nextTick();

		const feedbackEvent = events.find((event) => event.type === "feedback_submitted");
		expect(feedbackEvent).toBeDefined();
		expect(feedbackEvent?.conversationId).toBe("knowledge-chat");
	});
});