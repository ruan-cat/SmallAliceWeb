<script setup lang="ts">
import { useMockAiChat } from "../../composables/useMockAiChat";
import type { AiChatEmits, AiChatMessage, AiChatProps } from "./types";

const props = withDefaults(defineProps<AiChatProps>(), {
	placeholder: "请输入消息",
});
const emit = defineEmits<AiChatEmits>();

const { messages, input, isResponding, canSend, sendMessage } = useMockAiChat({
	initialMessages: props.initialMessages,
	mockDelay: props.mockDelay,
});

/** 发送用户输入，并通知组件使用方。 */
function handleSend() {
	if (!canSend.value) return;

	const message: AiChatMessage = {
		id: `user-${messages.value.length + 1}`,
		role: "user",
		content: input.value.trim(),
	};

	sendMessage();
	emit("send", message);
}
</script>

<template>
	<section class="ai-chat" aria-label="AI 对话">
		<div class="ai-chat__messages" aria-live="polite">
			<p
				v-for="message in messages"
				:key="message.id"
				class="ai-chat__message"
				:class="`ai-chat__message--${message.role}`"
			>
				{{ message.content }}
			</p>
			<p v-if="isResponding" class="ai-chat__responding" role="status">正在回复...</p>
		</div>

		<div class="ai-chat__composer">
			<el-input
				v-model="input"
				class="ai-chat__input"
				:placeholder="placeholder"
				:disabled="isResponding"
				@keyup.enter="handleSend"
			/>
			<el-button class="ai-chat__send" type="primary" :disabled="isResponding || !canSend" @click="handleSend">
				发送
			</el-button>
		</div>
	</section>
</template>
