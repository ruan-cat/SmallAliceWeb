import type { AiChatMessage, ChatEvent, ChatEventHandler, FeedbackType } from "../components/ai-chat/types";

/**
 * useChatEvents 返回结构 */
export interface UseChatEventsReturn {
	/** 通用事件分发 */
	emitEvent: (event: ChatEvent) => void;
	/** 用户消息提交事件 */
	emitUserMessage: (message: AiChatMessage) => void;
	/** 助手回复展示事件 */
	emitAssistantDisplayed: (message: AiChatMessage) => void;
	/** 反馈提交事件（FC-4 接入：可选 conversationId 供后端 qa_records 关联） */
	emitFeedback: (type: FeedbackType, messageId: string, details?: string, conversationId?: string) => void;
	/** 消息操作触发事件 */
	emitMessageAction: (messageId: string, actionLabel: string) => void;
	/** 示例问题选中事件 */
	emitExampleQuestionSelected: (question: string) => void;
	/** 清除点击事件 */
	emitClearClicked: () => void;
	/** 响应元数据事件（FC-3）：首 chunk 延迟 + provider/model；旧消费方忽略即可 */
	emitResponseMetadata: (input: {
		ttftMs: number;
		provider?: string;
		model?: string;
		conversationId?: string;
	}) => void;
}

/**
 * 聚合聊天事件：把组件内部的事件统一通过 onChatEvent 回调输出。
 *
 * 设计要点：
 * 1. onChatEvent 缺省时所有 emit 调用为 no-op，不抛错。
 * 2. emit* 辅助函数封装事件类型与 tags，便于组件层 1 行调用。
 */
export function useChatEvents(onChatEvent?: ChatEventHandler): UseChatEventsReturn {
	function emitEvent(event: ChatEvent) {
		onChatEvent?.(event);
	}

	return {
		emitEvent,
		emitUserMessage(message) {
			emitEvent({
				type: "user_message_submitted",
				messageId: message.id,
				tags: ["chat", "user"],
				properties: { contentLength: message.content.length },
			});
		},
		emitAssistantDisplayed(message) {
			emitEvent({
				type: "assistant_answer_displayed",
				messageId: message.id,
				tags: ["chat", "assistant"],
				properties: {
					sourceCount: message.sources?.length ?? 0,
					hasCustomComponent: Boolean(message.component),
				},
			});
		},
		emitFeedback(type, messageId, details, conversationId) {
			emitEvent({
				type: "feedback_submitted",
				...(conversationId !== undefined ? { conversationId } : {}),
				messageId,
				tags: ["chat", "feedback"],
				properties: {
					feedbackType: type,
					hasDetails: Boolean(details),
				},
			});
		},
		emitMessageAction(messageId, actionLabel) {
			emitEvent({
				type: "message_action_clicked",
				messageId,
				tags: ["chat", "message-action"],
				properties: { actionLabel },
			});
		},
		emitExampleQuestionSelected(question) {
			emitEvent({
				type: "example_question_selected",
				tags: ["chat", "example"],
				properties: { questionLength: question.length },
			});
		},
		emitClearClicked() {
			emitEvent({
				type: "chat_clear_clicked",
				tags: ["chat", "lifecycle"],
			});
		},
		emitResponseMetadata({ ttftMs, provider, model, conversationId }) {
			emitEvent({
				type: "response-metadata",
				conversationId,
				tags: ["chat", "response", "metadata"],
				properties: {
					ttftMs,
					...(provider !== undefined ? { provider } : {}),
					...(model !== undefined ? { model } : {}),
				},
			});
		},
	};
}
