import { describe, expect, test, vi } from "vitest";
import { useChatEvents } from "../composables/useChatEvents";
import type { AiChatMessage, ChatEvent, ChatEventHandler } from "../components/ai-chat/types";

function makeMessage(overrides: Partial<AiChatMessage> = {}): AiChatMessage {
	return {
		id: "msg-1",
		role: "assistant",
		content: "hi",
		...overrides,
	};
}

describe("useChatEvents", () => {
	test("无 onChatEvent 时所有 emit* 调用为 no-op 不抛错", () => {
		const api = useChatEvents();
		expect(() => {
			api.emitEvent({ type: "chat_clear_clicked", tags: ["chat"] });
			api.emitUserMessage(makeMessage({ role: "user", id: "u1", content: "hello" }));
			api.emitAssistantDisplayed(makeMessage());
			api.emitFeedback("positive", "m1");
			api.emitFeedback("negative", "m1", "no");
			api.emitMessageAction("m1", "copy");
			api.emitExampleQuestionSelected("how?");
			api.emitClearClicked();
		}).not.toThrow();
	});

	test("emitUserMessage 携带 contentLength 与 user tag", () => {
		const handler = vi.fn<ChatEventHandler>();
		const { emitUserMessage } = useChatEvents(handler);
		const message = makeMessage({ role: "user", id: "u9", content: "abcdef" });
		emitUserMessage(message);
		expect(handler).toHaveBeenCalledOnce();
		const event: ChatEvent = handler.mock.calls[0][0];
		expect(event.type).toBe("user_message_submitted");
		expect(event.messageId).toBe("u9");
		expect(event.tags).toEqual(["chat", "user"]);
		expect(event.properties).toMatchObject({ contentLength: 6 });
	});

	test("emitAssistantDisplayed 携带 sourceCount 与 hasCustomComponent", () => {
		const handler = vi.fn<ChatEventHandler>();
		const { emitAssistantDisplayed } = useChatEvents(handler);
		emitAssistantDisplayed(
			makeMessage({
				sources: [
					{ id: "s1", label: "l1", sourceHref: "#" },
					{ id: "s2", label: "l2", sourceHref: "#" },
				],
				component: { name: "ticket-card" },
			}),
		);
		const event = handler.mock.calls[0][0];
		expect(event.type).toBe("assistant_answer_displayed");
		expect(event.properties).toMatchObject({ sourceCount: 2, hasCustomComponent: true });
	});

	test("emitFeedback 区分正/负与 hasDetails", () => {
		const handler = vi.fn<ChatEventHandler>();
		const { emitFeedback } = useChatEvents(handler);
		emitFeedback("positive", "m1");
		emitFeedback("negative", "m1", "nope");
		expect(handler.mock.calls[0][0].properties).toMatchObject({ feedbackType: "positive", hasDetails: false });
		expect(handler.mock.calls[1][0].properties).toMatchObject({ feedbackType: "negative", hasDetails: true });
	});

	test("emitMessageAction / emitExampleQuestionSelected / emitClearClicked 类型正确", () => {
		const handler = vi.fn<ChatEventHandler>();
		const api = useChatEvents(handler);
		api.emitMessageAction("m1", "copy");
		api.emitExampleQuestionSelected("how?");
		api.emitClearClicked();
		expect(handler.mock.calls[0][0].type).toBe("message_action_clicked");
		expect(handler.mock.calls[1][0].type).toBe("example_question_selected");
		expect(handler.mock.calls[2][0].type).toBe("chat_clear_clicked");
		expect(handler.mock.calls[0][0].properties).toMatchObject({ actionLabel: "copy" });
		expect(handler.mock.calls[1][0].properties).toMatchObject({ questionLength: 4 });
	});

	test("emitEvent 直接派发任意 ChatEvent", () => {
		const handler = vi.fn<ChatEventHandler>();
		const { emitEvent } = useChatEvents(handler);
		const payload: ChatEvent = { type: "chat_clear_clicked", tags: ["manual"], properties: { foo: 1 } };
		emitEvent(payload);
		expect(handler).toHaveBeenCalledWith(payload);
	});
});
