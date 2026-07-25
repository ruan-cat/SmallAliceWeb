import { computed, ref } from "vue";
import type { AiChatMessage } from "../components/ai-chat/types";

export interface UseMockAiChatOptions {
	initialMessages?: AiChatMessage[];
	mockDelay?: number;
}

/** 管理不依赖网络服务的本地模拟对话状态 */
export function useMockAiChat(options: UseMockAiChatOptions = {}) {
	const messages = ref<AiChatMessage[]>([...(options.initialMessages ?? [])]);
	const input = ref("");
	const isResponding = ref(false);
	const canSend = computed(() => input.value.trim().length > 0 && !isResponding.value);
	const mockDelay = options.mockDelay ?? 300;

	/** 发送当前输入，并在固定延迟后添加本地模拟回复 */
	function sendMessage() {
		if (!canSend.value) return;

		const content = input.value.trim();
		messages.value.push({
			id: `user-${messages.value.length + 1}`,
			role: "user",
			content,
		});
		input.value = "";
		isResponding.value = true;

		setTimeout(() => {
			messages.value.push({
				id: `assistant-${messages.value.length + 1}`,
				role: "assistant",
				content: `这是本地 mock 回复：${content}`,
			});
			isResponding.value = false;
		}, mockDelay);
	}

	return {
		messages,
		input,
		isResponding,
		canSend,
		sendMessage,
	};
}
